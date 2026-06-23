import { createHash, randomBytes, randomInt } from "node:crypto";

import { verifyPassword } from "../auth/passwords.js";
import type { EmailSender } from "../auth/EmailSender.js";
import type { AdminSessionRecord, AdminStore } from "./AdminStore.js";

/**
 * Admin autentifikācijas loģika (sk. `docs/TODO/admin-panel-plan.md`, Fāze 0). Pilnīgi
 * NODALĪTA no spēlētāju `AuthService`: viena admina parole (scrypt hash no `.env`) +
 * obligāts e-pasta OTP 2FA. Sesijas + OTP kodi glabājas TIKAI kā `sha256(...)` hash.
 *
 * Plūsma: `login(password)` → pareizs → ģenerē 6-ciparu OTP, sūta uz admin e-pastu;
 * `verify(code)` → patērē OTP (vienreizējs, attempts cap, TTL) → izsniedz sesijas tokenu
 * + CSRF tokenu (double-submit). HTTP slānis pievieno sīkdatnes un rate-limit.
 */

/** OTP derīgums (10 min) — īss, jo tiek izmantots uzreiz pēc paroles. */
const DEFAULT_OTP_TTL_MS = 10 * 60 * 1000;
/** OTP mēģinājumu griesti pirms izaicinājuma invalidācijas. */
const DEFAULT_OTP_MAX_ATTEMPTS = 5;
/** Sesijas derīgums (8h), ar sliding-extension pie lietošanas. */
const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SESSION_TOKEN_BYTES = 32;
const CSRF_TOKEN_BYTES = 32;
/** OTP ir 6 cipari (000000..999999). */
const OTP_MIN = 0;
const OTP_MAX = 1_000_000;

export interface AdminAuthOptions {
  readonly store: AdminStore;
  /** Admin paroles scrypt hash (no `config.admin.passwordHash`). */
  readonly passwordHash: string;
  /** OTP saņēmēja e-pasts (no `config.admin.email`). */
  readonly email: string;
  readonly emailSender: EmailSender;
  readonly clock: () => number;
  readonly otpTtlMs?: number;
  readonly otpMaxAttempts?: number;
  readonly sessionTtlMs?: number;
}

/** Izsniegtā sesija pēc veiksmīgas 2FA: raw tokens + CSRF (HTTP slānis liek sīkdatnēs). */
export interface IssuedAdminSession {
  readonly token: string;
  readonly csrf: string;
  readonly expiresAt: number;
}

export interface AdminSessionContext {
  readonly ip?: string | undefined;
  readonly userAgent?: string | undefined;
}

export class AdminAuthService {
  private readonly store: AdminStore;
  private readonly passwordHash: string;
  private readonly email: string;
  private readonly emailSender: EmailSender;
  private readonly clock: () => number;
  private readonly otpTtlMs: number;
  private readonly otpMaxAttempts: number;
  private readonly sessionTtlMs: number;

  constructor(options: AdminAuthOptions) {
    this.store = options.store;
    this.passwordHash = options.passwordHash;
    this.email = options.email;
    this.emailSender = options.emailSender;
    this.clock = options.clock;
    this.otpTtlMs = options.otpTtlMs ?? DEFAULT_OTP_TTL_MS;
    this.otpMaxAttempts = options.otpMaxAttempts ?? DEFAULT_OTP_MAX_ATTEMPTS;
    this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  }

  /**
   * 1. solis: pārbauda paroli. Ja pareiza, ģenerē OTP, glabā tā hash un nosūta kodu uz
   * admin e-pastu. **Bez paroles oracle (Codex):** abi ceļi vienmēr palaiž `verifyPassword`
   * (vienāds scrypt laiks), un e-pasta sūtīšana ir FIRE-AND-FORGET (nost no atbildes kritiskā
   * ceļa, lai tīkla latence neatklāj paroles pareizību). Piegādes kļūme tiek LOGOTA (ops), bet
   * NEKAD neatklāta klientam — HTTP slānis vienmēr atbild ar konstantu 200. Atgriež `void`.
   */
  async login(password: string): Promise<void> {
    const valid = await verifyPassword(password, this.passwordHash);
    if (!valid) {
      return;
    }
    const code = generateOtp();
    const now = this.clock();
    await this.store.createAdminLoginCode({
      codeHash: hashSecret(code),
      createdAt: now,
      expiresAt: now + this.otpTtlMs,
      attempts: 0
    });
    void this.emailSender.sendAdminLoginCode(this.email, code).catch((error: unknown) => {
      console.error("[admin] login code delivery failed:", error);
    });
  }

  /**
   * 2. solis: patērē OTP. Ja derīgs, izsniedz jaunu sesijas tokenu (glabā hash) + CSRF
   * tokenu. Atgriež `undefined`, ja kods nederīgs/beidzies/izsmelti mēģinājumi.
   */
  async verify(code: string, context: AdminSessionContext): Promise<IssuedAdminSession | undefined> {
    const now = this.clock();
    const result = await this.store.consumeAdminLoginCode(hashSecret(code), now, this.otpMaxAttempts);
    if (result.status !== "ok") {
      return undefined;
    }
    const token = randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
    const csrf = randomBytes(CSRF_TOKEN_BYTES).toString("base64url");
    const expiresAt = now + this.sessionTtlMs;
    await this.store.createAdminSession({
      tokenHash: hashSecret(token),
      createdAt: now,
      lastUsedAt: now,
      expiresAt,
      ip: context.ip,
      userAgent: context.userAgent
    });
    return { token, csrf, expiresAt };
  }

  /**
   * Atrisina sesijas tokenu → derīga sesija vai `undefined` (nederīgs/beidzies/atsaukts).
   * Sliding expiry: pagarina tikai pēc pusperioda (netērē rakstus katrā pieprasījumā).
   */
  async resolveSession(token: string): Promise<AdminSessionRecord | undefined> {
    const tokenHash = hashSecret(token);
    const record = await this.store.getAdminSession(tokenHash);
    if (!record) {
      return undefined;
    }
    const now = this.clock();
    if (record.revokedAt !== undefined || record.expiresAt <= now) {
      return undefined;
    }
    if (record.expiresAt - now < this.sessionTtlMs / 2) {
      await this.store.touchAdminSession(tokenHash, now, now + this.sessionTtlMs);
    }
    return record;
  }

  /** Atsauc sesiju (logout). Idempotents. */
  async logout(token: string): Promise<void> {
    await this.store.revokeAdminSession(hashSecret(token), this.clock());
  }

  /** Periodiska beigušos sesiju/kodu tīrīšana (izsauc index.ts sweep). */
  async cleanup(): Promise<void> {
    const now = this.clock();
    await this.store.deleteExpiredAdminSessions(now);
    await this.store.deleteExpiredAdminLoginCodes(now);
  }
}

/** 6-ciparu OTP ar vadošajām nullēm (kriptogrāfiski drošs `randomInt`). */
function generateOtp(): string {
  return String(randomInt(OTP_MIN, OTP_MAX)).padStart(6, "0");
}

/** `sha256(secret)` hex (tokeni/kodi glabājas tikai kā hash, kā `auth_tokens`). */
function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}
