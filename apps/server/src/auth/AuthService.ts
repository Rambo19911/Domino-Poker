import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  DEFAULT_AVATAR_ID,
  isValidAvatarId,
  titleForWins,
  type GameLanguage,
  type TitleId
} from "@domino-poker/shared";

import type { AuthStore, CustomAvatarRecord, UserRecord } from "./AuthStore.js";
import type { EmailLocale, EmailSender } from "./EmailSender.js";
import { hashPassword, verifyPassword } from "./passwords.js";

/** Tokena derīguma ilgums (30 dienas), ar sliding-extension pie lietošanas. */
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;
/** Paroles atjaunošanas tokena derīgums (1h) — vienreizējs, īss (drošība). */
const RESET_TTL_MS = 60 * 60 * 1000;

/** Pašam lietotājam atdotais profils (ietver `email`; NEKAD `passwordHash`). */
export interface SelfUser {
  readonly id: string;
  readonly username: string;
  /** Preset avatar id (`avatar-NN`) VAI `'custom'` (augšupielādēts; sk. `/auth/avatar/:id`). */
  readonly avatar: string;
  readonly email?: string | undefined;
  /** Avatara cache versija (= `user.updatedAt`); custom avatara cache-bustingam. */
  readonly avatarVersion: number;
}

/** Konta MP statistika klientam (Fāze 3). Uzvaru % aprēķina klients. */
export interface UserStats {
  readonly wins: number;
  readonly losses: number;
  readonly gamesPlayed: number;
}

/** Publiskā identitāte (citiem spēlētājiem; bez `email`). Lieto WS WELCOME + seat profils. */
export interface ResolvedAuth {
  readonly userId: string;
  readonly username: string;
  readonly avatar: string;
  /** MP tituls (Fāze 4), atvasināts no uzvaru skaita HELLO brīdī. */
  readonly title: TitleId;
}

export interface RegisterInput {
  readonly username: string;
  readonly password: string;
  /** Obligāts: vienīgais paroles atjaunošanas kanāls (Fāze 5). */
  readonly email: string;
}

export interface LoginInput {
  readonly username: string;
  readonly password: string;
}

export interface ProfileInput {
  readonly username: string;
  readonly avatar: string;
}

export type RegisterResult =
  | { readonly ok: true; readonly token: string; readonly user: SelfUser }
  | { readonly ok: false; readonly error: "username_taken" | "email_taken" };

export type LoginResult =
  | { readonly ok: true; readonly token: string; readonly user: SelfUser }
  | { readonly ok: false; readonly error: "invalid_credentials" };

export type UpdateProfileResult =
  | { readonly ok: true; readonly user: SelfUser }
  | { readonly ok: false; readonly error: "username_taken" | "invalid_avatar" | "not_found" };

export interface AuthServiceOptions {
  readonly store: AuthStore;
  readonly clock: () => number;
  /** Tokena TTL (testiem). Noklusējums 30 dienas. */
  readonly tokenTtlMs?: number;
  /** E-pasta senderis paroles atjaunošanai; ja `undefined` → reset funkcija ATSPĒJOTA. */
  readonly emailSender?: EmailSender | undefined;
  /** Web bāzes URL reset linkam (piem. `https://domino-poker.com`). */
  readonly appBaseUrl?: string | undefined;
  /** Reset tokena TTL (testiem). Noklusējums 1h. */
  readonly resetTtlMs?: number;
}

/**
 * Autentifikācijas loģika: reģistrācija, login, tokenu izsniegšana/atrisināšana,
 * logout, profila atjaunināšana. Ievades formātu validāciju (charset/garums/email)
 * veic HTTP maršrutu slānis (Zod) PIRMS izsaukuma; šeit notiek normalizācija,
 * paroļu hašošana un autoritatīvā loģika.
 */
export class AuthService {
  private readonly store: AuthStore;
  private readonly clock: () => number;
  private readonly tokenTtlMs: number;
  private readonly emailSender: EmailSender | undefined;
  private readonly appBaseUrl: string;
  private readonly resetTtlMs: number;
  /** Kešots dummy hašs login timing-uzbrukuma mazināšanai (lietotājs nav atrasts). */
  private dummyHash: Promise<string> | undefined;

  constructor(options: AuthServiceOptions) {
    this.store = options.store;
    this.clock = options.clock;
    this.tokenTtlMs = options.tokenTtlMs ?? TOKEN_TTL_MS;
    this.emailSender = options.emailSender;
    this.appBaseUrl = options.appBaseUrl ?? "";
    this.resetTtlMs = options.resetTtlMs ?? RESET_TTL_MS;
  }

  async register(input: RegisterInput): Promise<RegisterResult> {
    const usernameNorm = normalize(input.username);
    const emailNorm = normalize(input.email);

    // Pre-check skaidrām kļūdām; DB UNIQUE ir galīgais aizsargs pret sacensību.
    if (await this.store.getUserByUsernameNorm(usernameNorm)) {
      return { ok: false, error: "username_taken" };
    }
    if (await this.store.getUserByEmailNorm(emailNorm)) {
      return { ok: false, error: "email_taken" };
    }

    const now = this.clock();
    const record: UserRecord = {
      id: randomUUID(),
      username: input.username.trim(),
      usernameNorm,
      email: input.email.trim(),
      emailNorm,
      passwordHash: await hashPassword(input.password),
      avatar: DEFAULT_AVATAR_ID,
      createdAt: now,
      updatedAt: now
    };
    const created = await this.store.createUser(record);
    if (created === "conflict") {
      // Sacensība starp pre-check un insert: atkārtoti nosakām, kurš lauks.
      if (await this.store.getUserByUsernameNorm(usernameNorm)) {
        return { ok: false, error: "username_taken" };
      }
      return { ok: false, error: "email_taken" };
    }

    const token = await this.issueToken(record.id, now);
    return { ok: true, token, user: toSelfUser(record) };
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const usernameNorm = normalize(input.username);
    const user = await this.store.getUserByUsernameNorm(usernameNorm);
    if (!user) {
      // Timing-mazināšana: tērējam līdzīgu laiku kā īstai pārbaudei.
      await verifyPassword(input.password, await this.getDummyHash());
      return { ok: false, error: "invalid_credentials" };
    }
    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      return { ok: false, error: "invalid_credentials" };
    }
    const token = await this.issueToken(user.id, this.clock());
    return { ok: true, token, user: toSelfUser(user) };
  }

  /** Atrisina bearer tokenu → lietotājs (ar sliding-extension). `undefined`, ja nederīgs/beidzies. */
  async resolveToken(token: string): Promise<SelfUser | undefined> {
    const tokenHash = hashToken(token);
    const record = await this.store.getAuthToken(tokenHash);
    if (!record) {
      return undefined;
    }
    const now = this.clock();
    if (record.expiresAt <= now) {
      await this.store.deleteAuthToken(tokenHash);
      return undefined;
    }
    const user = await this.store.getUserById(record.userId);
    if (!user) {
      await this.store.deleteAuthToken(tokenHash);
      return undefined;
    }
    // Sliding expiry: pagarinām tikai pēc pusperioda, lai netērētu rakstus katrā pieprasījumā.
    if (record.expiresAt - now < this.tokenTtlMs / 2) {
      await this.store.touchAuthToken(tokenHash, now, now + this.tokenTtlMs);
    }
    return toSelfUser(user);
  }

  /** Publiskā identitāte WS WELCOME + seat profils (bez email); ar titulu (Fāze 4). */
  async resolvePublic(token: string): Promise<ResolvedAuth | undefined> {
    const self = await this.resolveToken(token);
    if (!self) {
      return undefined;
    }
    const stats = await this.store.getUserStats(self.id);
    return {
      userId: self.id,
      username: self.username,
      // Custom avataru iekodē ar userId+versiju, lai CITI MP spēlētāji to atrisina
      // uz `/auth/avatar/:id?v=` (klients nezina sveseta lietotāja id citādi).
      avatar: self.avatar === "custom" ? `custom:${self.id}:${self.avatarVersion}` : self.avatar,
      title: titleForWins(stats?.wins ?? 0)
    };
  }

  async logout(token: string): Promise<void> {
    await this.store.deleteAuthToken(hashToken(token));
  }

  /** Konta MP statistika attēlošanai (Fāze 3); `undefined`, ja vēl nav ieskaitītu spēļu. */
  async getStats(userId: string): Promise<UserStats | undefined> {
    const stats = await this.store.getUserStats(userId);
    if (!stats) {
      return undefined;
    }
    return { wins: stats.wins, losses: stats.losses, gamesPlayed: stats.gamesPlayed };
  }

  /** Konta saglabātā spēles valoda; noklusējums `'en'`, ja vēl nav preferences. */
  async getLanguage(userId: string): Promise<GameLanguage> {
    return (await this.store.getUserLanguage(userId)) ?? "en";
  }

  /** Upsert konta spēles valodu (Leaderboard fāze). Validāciju veic HTTP slānis (Zod). */
  async setLanguage(userId: string, language: GameLanguage): Promise<void> {
    await this.store.setUserLanguage(userId, language, this.clock());
  }

  async updateProfile(userId: string, input: ProfileInput): Promise<UpdateProfileResult> {
    // `'custom'` = patur esošo avataru (maina tikai username); glabātava NEPIESKARAS
    // avatar kolonnai šajā gadījumā, tāpēc tiešs/stale klients NEVAR iestatīt
    // avatar='custom' bez blob. Citādi jābūt derīgam preset id.
    const keepCustom = input.avatar === "custom";
    if (!keepCustom && !isValidAvatarId(input.avatar)) {
      return { ok: false, error: "invalid_avatar" };
    }
    const usernameNorm = normalize(input.username);
    const now = this.clock();
    const result = await this.store.updateUserProfile(userId, {
      username: input.username.trim(),
      usernameNorm,
      avatar: input.avatar,
      updatedAt: now
    });
    if (result !== "updated") {
      return { ok: false, error: result };
    }
    // Pārslēgšanos uz preset + custom blob dzēšanu glabātava veic ATOMISKI
    // (updateUserProfile), lai novērstu race ar paralēlu avatara augšupielādi.
    const user = await this.store.getUserById(userId);
    if (!user) {
      return { ok: false, error: "not_found" };
    }
    return { ok: true, user: toSelfUser(user) };
  }

  /**
   * Saglabā augšupielādēto (klienta pusē jau samazināto) profila avataru un iestata
   * `users.avatar='custom'`. Atgriež jauno cache versiju (updatedAt).
   */
  async setAvatarUpload(userId: string, contentType: string, bytes: Uint8Array): Promise<number> {
    const now = this.clock();
    await this.store.setUserAvatar({ userId, contentType, bytes, updatedAt: now });
    return now;
  }

  /** Augšupielādētā avatara baiti serve maršrutam; `undefined`, ja nav. */
  async getAvatarUpload(userId: string): Promise<CustomAvatarRecord | undefined> {
    return this.store.getUserAvatar(userId);
  }

  /** Vai paroles atjaunošana pa e-pastu ir konfigurēta (ir e-pasta senderis). */
  isPasswordResetEnabled(): boolean {
    return this.emailSender !== undefined;
  }

  /**
   * Pieprasa paroles atjaunošanu. Ja konts ar šo e-pastu eksistē, ģenerē vienreizēju
   * tokenu un nosūta reset linku. VIENMĒR pabeidzas klusi (enumeration novēršana) —
   * izsaucējs atgriež ģenerisku atbildi neatkarīgi no tā, vai konts pastāv. E-pasta
   * piegādes kļūdu ķeram un logojam (best-effort), lai neatklātu konta esamību.
   */
  async requestPasswordReset(email: string, locale: EmailLocale): Promise<void> {
    const sender = this.emailSender;
    if (!sender) {
      return; // funkcija atspējota (nav konfigurēta)
    }
    const user = await this.store.getUserByEmailNorm(normalize(email));
    if (!user || user.email === undefined) {
      return; // nav konta / nav e-pasta → klusi (enumeration novēršana)
    }
    const now = this.clock();
    // Invalidē iepriekšējos neizmantotos tokenus (samazina aktīvo tokenu skaitu).
    await this.store.deleteUnusedPasswordResetTokens(user.id);
    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    await this.store.createPasswordResetToken({
      tokenHash: hashToken(token),
      userId: user.id,
      createdAt: now,
      expiresAt: now + this.resetTtlMs
    });
    // Tokenu nododam URL hash daļā (#) — tas nenonāk servera/proxy logos un Referer.
    const resetUrl = `${this.appBaseUrl}/#reset=${token}`;
    try {
      await sender.sendPasswordReset(user.email, resetUrl, locale);
    } catch (error) {
      // NEKAD nelogojam raw tokenu; piegādes kļūme neatklāj konta esamību klientam.
      console.error("[auth] password reset email delivery failed:", error);
    }
  }

  /**
   * Pabeidz paroles atjaunošanu ar tokenu no e-pasta. Atomiski (glabātavā): validē
   * tokenu, nomaina paroli, atsauc visas sesijas. Atgriež `true`, ja izdevās;
   * `false`, ja tokens nederīgs/beidzies/jau lietots.
   */
  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    const newHash = await hashPassword(newPassword);
    const userId = await this.store.resetPasswordWithToken(
      hashToken(token),
      newHash,
      this.clock()
    );
    return userId !== undefined;
  }

  private async issueToken(userId: string, now: number): Promise<string> {
    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    await this.store.createAuthToken({
      tokenHash: hashToken(token),
      userId,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: now + this.tokenTtlMs
    });
    return token;
  }

  private getDummyHash(): Promise<string> {
    if (this.dummyHash === undefined) {
      this.dummyHash = hashPassword("invalid-credentials-placeholder");
    }
    return this.dummyHash;
  }
}

/** Normalizē identifikatoru salīdzināšanai (lowercase + trim). */
function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function toSelfUser(user: UserRecord): SelfUser {
  return {
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    email: user.email,
    avatarVersion: user.updatedAt
  };
}
