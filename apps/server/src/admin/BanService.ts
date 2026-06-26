import { randomUUID } from "node:crypto";

import type { AuthStore } from "../auth/AuthStore.js";
import type { EmailLocale, EmailSender } from "../auth/EmailSender.js";
import type { AdminAuditService } from "./AdminAuditService.js";
import type { AdminStore, BanKind, BanRecord } from "./AdminStore.js";

/**
 * Banu serviss (Fāze 3.1, D1). Glabā banus, atbild uz "vai banots" jautājumiem (login + WS
 * izpildes ceļiem) un orķestrē izpildi: ban persistē PIRMS izpildes (lai vienlaicīga login/
 * handshake pārbaude redz banu), tad atsauc auth tokenus (HTTP piespiedu izlogošana) + atvieno
 * dzīvās WS sesijas (`onUserBanned` āķis) + nosūta e-pastu (best-effort). Katra mutācija → audit.
 *
 * **Izpildes modelis (Codex):** NAV per-WS-ziņas DB lookup. DB pārbaudes notiek TIKAI pie login,
 * WS HELLO auth atrisināšanas un WS upgrade IP-bana. Konta bans NEbloķē anonīmu spēli (D1(d)):
 * banots cilvēks var spēlēt anonīmi, ja vien nav arī IP bana.
 */

export type BanUserOutcome = "banned" | "already_banned" | "not_found";
export type BanIpOutcome = "banned" | "already_banned";
export type RevokeBanOutcome = "revoked" | "not_active" | "not_found";

/** Bana ievade (kopīga user/ip). `durationDays` obligāts, ja `kind="temporary"`. */
export interface BanInput {
  readonly reason: string;
  readonly kind: BanKind;
  readonly durationDays?: number | undefined;
}

/** Audit konteksts (admin IP no sesijas). */
export interface BanActorContext {
  readonly ip?: string | undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type BanStore = AdminStore & AuthStore;

export interface BanServiceOptions {
  readonly store: BanStore;
  readonly audit: AdminAuditService;
  readonly clock: () => number;
  readonly emailSender?: EmailSender | undefined;
  /** Aktīvo WS sesiju atvienošana pēc bana (gateway.disconnectUser); `undefined` = nav gateway. */
  readonly onUserBanned?: ((userId: string) => void) | undefined;
  readonly createId?: () => string;
}

export class BanService {
  private readonly store: BanStore;
  private readonly audit: AdminAuditService;
  private readonly clock: () => number;
  private readonly emailSender: EmailSender | undefined;
  private readonly onUserBanned: ((userId: string) => void) | undefined;
  private readonly createId: () => string;
  /**
   * Per-mērķa serializācijas ķēde (Codex P3): "aktīvs?" pārbaude + insert ir TOCTOU — bez tās
   * dubultklikšķis / paralēli pieprasījumi varētu radīt vairākus aktīvus banus vienam mērķim (tad
   * viena revoke neatbloķētu pilnībā). Aktīvuma temporālais nosacījums (`expires_at > now`) neder
   * statiskam DB unikālam indeksam, tāpēc serializējam in-memory (admin panelis = viena instance,
   * viens admins — A4). Atslēga = `user:<id>` / `ip:<ip>`.
   *
   * **Multi-instance LIMITS (Codex):** šī in-memory ķēde aizsargā TIKAI vienas instances ietvaros.
   * Horizontālas mērogošanas gadījumā divas instances joprojām varētu radīt dublētu aktīvu banu —
   * tad vajadzētu DB-līmeņa koordināciju (piem. advisory lock uz mērķi ap pārbaudi+insert, vai
   * aktīvā bana modeļa maiņa, kas atbalsta daļēju unikālu indeksu). Atbilst projekta esošajiem
   * viena-instance pieņēmumiem (SP dienas-griestu slēdzene, in-memory refund retry).
   */
  private readonly chain = new Map<string, Promise<unknown>>();

  constructor(options: BanServiceOptions) {
    this.store = options.store;
    this.audit = options.audit;
    this.clock = options.clock;
    this.emailSender = options.emailSender;
    this.onUserBanned = options.onUserBanned;
    this.createId = options.createId ?? (() => randomUUID());
  }

  /** Serializē uzdevumu pēc atslēgas (per-mērķa mutex; ķēde nekad nesabrūk pie kļūdas). */
  private serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.chain.get(key) ?? Promise.resolve();
    const run = prev.then(task, task);
    this.chain.set(
      key,
      run.then(
        () => undefined,
        () => undefined
      )
    );
    return run;
  }

  /** Aktīvs konta bans vai `undefined` (login + WS handshake izpildei). */
  async isUserBanned(userId: string): Promise<BanRecord | undefined> {
    return this.store.findActiveUserBan(userId, this.clock());
  }

  /** Aktīvs IP bans vai `undefined` (login + WS upgrade izpildei). */
  async isIpBanned(ip: string): Promise<BanRecord | undefined> {
    return this.store.findActiveIpBan(ip, this.clock());
  }

  /** Banu saraksts (jaunākie pirmie; aktīvie + atsauktie/beigušies). */
  async list(limit: number, offset: number): Promise<readonly BanRecord[]> {
    return this.store.listBans(limit, offset);
  }

  /**
   * Banot kontu (Fāze 3.1). Persistē → atsauc tokenus → atvieno WS → e-pasts → audit. "Aktīvs?"
   * pārbaude + insert serializēti per-userId (novērš dublētus aktīvus banus paralēlos pieprasījumos).
   * Piezīme: mutācija (createBan/deleteUserAuthTokens) un audit ir DIVI atsevišķi raksti (NE viena
   * transakcija pāri spējām) — ja audit raksts nokrīt, darbība var palikt bez audit rindas. Pieņemts
   * viena-admina panelim (tas pats reziduāls kā Fāzē 2), kur audit ir tajā pašā DB un kļūme reta.
   */
  banUser(userId: string, input: BanInput, ctx: BanActorContext): Promise<BanUserOutcome> {
    return this.serialize(`user:${userId}`, async () => {
      const user = await this.store.getUserById(userId);
      if (!user) {
        return "not_found";
      }
      const now = this.clock();
      if (await this.store.findActiveUserBan(userId, now)) {
        return "already_banned";
      }
      const record = this.buildRecord({ userId }, input, now);
      await this.store.createBan(record);
      // Izpilde PĒC persistēšanas: HTTP piespiedu izlogošana + dzīvo WS sesiju atvienošana.
      await this.store.deleteUserAuthTokens(userId);
      this.onUserBanned?.(userId);
      // E-pasts (best-effort; bana izpilde nedrīkst būt atkarīga no piegādes).
      if (this.emailSender && user.email !== undefined) {
        const locale = await this.userLocale(userId);
        try {
          await this.emailSender.sendBanNotice(user.email, record.reason, record.durationLabel, locale);
        } catch (error) {
          console.error("[ban] ban notice email failed:", error);
        }
      }
      await this.audit.record({
        action: "player.ban",
        targetType: "player",
        targetId: userId,
        summary: `Banned "${user.username}" (${record.durationLabel})`,
        diff: { reason: record.reason, kind: record.kind, durationLabel: record.durationLabel, expiresAt: record.expiresAt ?? null },
        ip: ctx.ip
      });
      return "banned";
    });
  }

  /** Banot IP (papildsignāls, D1(d)). Bloķē jaunus login + WS upgrade no šī IP. Serializēts per-IP. */
  banIp(ip: string, input: BanInput, ctx: BanActorContext): Promise<BanIpOutcome> {
    return this.serialize(`ip:${ip}`, async () => {
      const now = this.clock();
      if (await this.store.findActiveIpBan(ip, now)) {
        return "already_banned";
      }
      const record = this.buildRecord({ ip }, input, now);
      await this.store.createBan(record);
      await this.audit.record({
        action: "ip.ban",
        targetType: "ip",
        targetId: ip,
        summary: `Banned IP ${ip} (${record.durationLabel})`,
        diff: { reason: record.reason, kind: record.kind, durationLabel: record.durationLabel, expiresAt: record.expiresAt ?? null },
        ip: ctx.ip
      });
      return "banned";
    });
  }

  /** Atsaukt banu pēc id (Fāze 3.1). Idempotents: jau atsaukts/beidzies → `not_active`. */
  async revoke(banId: string, ctx: BanActorContext): Promise<RevokeBanOutcome> {
    const ban = await this.store.getBanById(banId);
    if (!ban) {
      return "not_found";
    }
    const revoked = await this.store.revokeBan(banId, this.clock());
    if (!revoked) {
      return "not_active";
    }
    await this.audit.record({
      action: "ban.revoke",
      targetType: ban.userId !== undefined ? "player" : "ip",
      targetId: ban.userId ?? ban.ip,
      summary: `Revoked ban ${banId}`,
      diff: { banId, userId: ban.userId ?? null, ip: ban.ip ?? null },
      ip: ctx.ip
    });
    return "revoked";
  }

  /** Saliek bana ierakstu (aprēķina `expiresAt` + `durationLabel` no `kind`/`durationDays`). */
  private buildRecord(
    target: { readonly userId?: string; readonly ip?: string },
    input: BanInput,
    now: number
  ): BanRecord {
    const temporary = input.kind === "temporary";
    const days = temporary ? Math.max(1, Math.floor(input.durationDays ?? 1)) : undefined;
    return {
      id: this.createId(),
      userId: target.userId,
      ip: target.ip,
      reason: input.reason,
      kind: input.kind,
      durationLabel: temporary ? `${days} day${days === 1 ? "" : "s"}` : "Permanent",
      expiresAt: temporary ? now + days! * DAY_MS : undefined,
      createdAt: now,
      createdBy: "admin"
    };
  }

  /** Lietotāja saglabātā valoda bana e-pastam (noklusējums `en`). */
  private async userLocale(userId: string): Promise<EmailLocale> {
    const lang = await this.store.getUserLanguage(userId);
    return lang === "lv" ? "lv" : "en";
  }
}
