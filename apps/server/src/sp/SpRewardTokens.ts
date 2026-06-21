import type { CoinDifficulty } from "@domino-poker/shared";

import type { Clock } from "../timers/TurnTimerScheduler.js";

/** Viens izsniegts SP spēles tokens (in-memory; vienas instances anti-cheat). */
interface SpToken {
  readonly userId: string;
  /** Grūtība momentuzņemta SĀKUMĀ — balva tiek atvasināta no ŠĪS, ne no klienta. */
  readonly difficulty: CoinDifficulty;
  /**
   * Raundu skaits momentuzņemts SĀKUMĀ (Fāze: statistika). Bid-accuracy validācijai —
   * `/sp/complete` pārbauda, ka klienta ziņoto solījumu skaitītāju summa sakrīt ar ŠO
   * (nevis ar klienta apgalvojumu), tāpēc to nevar uzpūst.
   */
  readonly roundCount: number;
  readonly issuedAt: number;
}

/** Tokena momentuzņēmums (peek/consume rezultāts): serverī uzticamie spēles parametri. */
export interface SpTokenSnapshot {
  readonly difficulty: CoinDifficulty;
  readonly roundCount: number;
  readonly issuedAt: number;
}

export interface SpRewardTokensOptions {
  readonly clock: Clock;
  /** Tokena derīgums (ms); pēc tam balva netiek piešķirta (SP spēle pa to laiku beidzas). */
  readonly ttlMs: number;
  /** Maks. aktīvo tokenu uz lietotāju (novērš pirms-ģenerēšanu); pārsniedzot — vecākais izstumts. */
  readonly maxPerUser: number;
  readonly createId: () => string;
}

/**
 * SP balvas spēles tokeni (Fāze 2, D3 anti-cheat). Pie SP spēles SĀKUMA serveris
 * izsniedz vienreizēju tokenu, kas momentuzņem grūtību. Pie spēles beigām balvu
 * piešķir TIKAI pret derīgu, neizmantotu, neizbeigušos tokenu, kas pieder tam pašam
 * lietotājam. `consume` to dzēš (vienreizējs) — atkārtota izmantošana neizdodas.
 *
 * In-memory + vienas instances (SP notiek vienā pārlūkā pret vienu serveri; tokeniem
 * nav nepieciešama cross-instance koplietošana). DB-līmeņa idempotence (ledger ref =
 * gameToken) ir papildu sargs pret dubultu kreditēšanu.
 */
export class SpRewardTokens {
  private readonly tokens = new Map<string, SpToken>();
  private readonly clock: Clock;
  private readonly ttlMs: number;
  private readonly maxPerUser: number;
  private readonly createId: () => string;

  constructor(options: SpRewardTokensOptions) {
    this.clock = options.clock;
    this.ttlMs = options.ttlMs;
    this.maxPerUser = options.maxPerUser;
    this.createId = options.createId;
  }

  /** Izsniedz jaunu vienreizēju tokenu lietotājam, momentuzņemot grūtību + raundu skaitu. */
  issue(userId: string, difficulty: CoinDifficulty, roundCount: number): string {
    const now = this.clock();
    this.prune(now);
    this.enforcePerUserLimit(userId);
    const token = this.createId();
    this.tokens.set(token, { userId, difficulty, roundCount, issuedAt: now });
    return token;
  }

  /**
   * Apskata (NEpatērē) tokenu. Atgriež momentuzņēmumu, ja tokens derīgs, neizbeidzies
   * un pieder `userId`; citādi `null`. Lieto `/sp/complete`, lai DB kļūme PĒC peek
   * nepazaudētu tokenu (token patērē TIKAI pēc veiksmīgas ierakstīšanas — sk. plānu).
   */
  peek(token: string, userId: string): SpTokenSnapshot | null {
    const now = this.clock();
    this.prune(now);
    const entry = this.tokens.get(token);
    if (!entry || entry.userId !== userId) {
      return null;
    }
    return { difficulty: entry.difficulty, roundCount: entry.roundCount, issuedAt: entry.issuedAt };
  }

  /**
   * Patērē (vienreizēji) tokenu. Atgriež momentuzņēmumu, ja tokens derīgs, neizbeidzies
   * un pieder `userId`; citādi `null`. Dzēš tokenu.
   */
  consume(token: string, userId: string): SpTokenSnapshot | null {
    const now = this.clock();
    this.prune(now);
    const entry = this.tokens.get(token);
    if (!entry || entry.userId !== userId) {
      return null;
    }
    this.tokens.delete(token);
    return { difficulty: entry.difficulty, roundCount: entry.roundCount, issuedAt: entry.issuedAt };
  }

  /** Izstumj beigušos tokenus (slinki, pie katra issue/consume). */
  private prune(now: number): void {
    for (const [token, entry] of this.tokens) {
      if (now - entry.issuedAt >= this.ttlMs) {
        this.tokens.delete(token);
      }
    }
  }

  /** Ja lietotājam jau ir `maxPerUser` aktīvi tokeni, izstumj vecāko. */
  private enforcePerUserLimit(userId: string): void {
    const userTokens: Array<{ token: string; issuedAt: number }> = [];
    for (const [token, entry] of this.tokens) {
      if (entry.userId === userId) {
        userTokens.push({ token, issuedAt: entry.issuedAt });
      }
    }
    if (userTokens.length < this.maxPerUser) {
      return;
    }
    userTokens.sort((a, b) => a.issuedAt - b.issuedAt);
    const evict = userTokens.length - this.maxPerUser + 1;
    for (let i = 0; i < evict; i += 1) {
      this.tokens.delete(userTokens[i]!.token);
    }
  }
}
