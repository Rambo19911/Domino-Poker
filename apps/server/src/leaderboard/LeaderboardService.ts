import {
  rankToBadge,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type LeaderboardSelf,
  type RankBadgeId
} from "@domino-poker/shared";

import type { AuthStore, LeaderboardEntryRecord } from "../auth/AuthStore.js";

/**
 * Datu avots, ko `LeaderboardService` lasa — `AuthStore` apakškopa (interfeisa
 * segregācija: serviss neatkarīgs no pārējām auth metodēm, vieglāk testēt ar fake).
 */
export type LeaderboardDataSource = Pick<
  AuthStore,
  "getLeaderboard" | "getUserRank" | "getRankedSnapshot" | "getUserStats"
>;

export interface LeaderboardServiceOptions {
  readonly store: LeaderboardDataSource;
  readonly clock: () => number;
  /** Cik kontu kešot/atgriezt topā (`LEADERBOARD_SIZE`; ≥1). */
  readonly size: number;
  /** Minimālais nospēlēto spēļu skaits, lai būtu ranžēts (`LEADERBOARD_MIN_GAMES`; ≥1). */
  readonly minGames: number;
  /** Keša svaiguma TTL ms (`LEADERBOARD_REFRESH_MS`; 0 = vienmēr pārbūvē). */
  readonly refreshMs: number;
}

/**
 * Globālā Leaderboard serviss (Leaderboard fāze, lēmums B): tur KEŠOTU rangu
 * momentuzņēmumu, lai dārgā ranžēšana NEnotiktu seat-join karstajā ceļā.
 *
 * Svaiguma robeža F3/F4:
 * - **F3 (šis):** kešu atsvaidzina TTL (`refreshMs`). `notifyStatsChanged` metode
 *   eksistē un ir testēta, BET vēl nav pieslēgta game-over plūsmai.
 * - **F4:** `notifyStatsChanged` tiek pieslēgts game-over (kopā ar seat patēriņu),
 *   lai seat badge kešs atsvaidzinās uzreiz pēc spēles.
 *
 * - `getRankBadge` ir SINHRONS (lasa pašreizējo kešu) — to lieto seat profila
 *   būve (F4), kas nedrīkst gaidīt DB.
 * - `getResponse` ir async (nodrošina svaigumu pirms atbildes).
 *
 * Daudz-instanču: kešs ir procesā lokāls → eventual-consistent starp instancēm
 * (pieņemts šim mērogam; rangs jābūt "pietiekami svaigs", ne transakciju-precīzs).
 */
export class LeaderboardService {
  private readonly store: LeaderboardDataSource;
  private readonly clock: () => number;
  private readonly size: number;
  private readonly minGames: number;
  private readonly refreshMs: number;

  private entries: readonly LeaderboardEntry[] = [];
  private rankByUser = new Map<string, number>();
  private builtAt = 0;
  private hasBuilt = false;
  /**
   * Paaudžu skaitītājs invalidācijai. `notifyStatsChanged` to palielina; `rebuild`
   * NOTVER paaudzi SĀKUMĀ un ieraksta to `builtGeneration` BEIGĀS. Ja stats mainās
   * rebuild laikā (paaudze palielinās), `builtGeneration !== generation` → nākamā
   * lasīšana pārbūvē. Tā novērš "pazaudētu dirty atzīmi" race starp `await`-iem.
   */
  private generation = 0;
  private builtGeneration = -1;
  /** Notiekošā pārbūve (concurrent ensureFresh izsaukumi dalās ar šo). */
  private building: Promise<void> | undefined;

  constructor(options: LeaderboardServiceOptions) {
    this.store = options.store;
    this.clock = options.clock;
    this.size = options.size;
    this.minGames = options.minGames;
    this.refreshMs = options.refreshMs;
  }

  /**
   * Sēdvietas badge (SINHRONS, no pašreizējā keša). `null`, ja spēlētājs nav
   * ranžēts (spēles < minGames) vai ārpus badge-rangiem (71+). Lieto F4 seat būve.
   */
  getRankBadge(userId: string): RankBadgeId | null {
    const rank = this.rankByUser.get(userId);
    return rank === undefined ? null : rankToBadge(rank);
  }

  /**
   * Atzīmē, ka stats mainījušies (game-over). Palielina paaudzi (nākamā lasīšana
   * pārbūvēs) UN palaiž fona pārbūvi, lai seat badge (sinhronais kešs) atsvaidzinās
   * pēc spēles. **Pieslēgšana game-over plūsmai notiek F4** (kopā ar seat patēriņu);
   * F3 HTTP svaigumu nodrošina TTL (`refreshMs`).
   */
  notifyStatsChanged(): void {
    this.generation += 1;
    void this.ensureFresh().catch((error) => {
      // Fona pārbūves kļūda nedrīkst lauzt izsaucēju; paaudze paliek nesakritīga,
      // tāpēc nākamā lasīšana mēģinās vēlreiz. Logojam diagnostikai.
      console.error("[leaderboard] background rebuild failed:", error);
    });
  }

  /** Leaderboard atbilde: top `limit` (clamp uz `size`) + izsaucēja paša stāvoklis. */
  async getResponse(viewerUserId: string | null, limit: number): Promise<LeaderboardResponse> {
    await this.ensureFresh();
    const capped = Math.max(1, Math.min(this.size, Math.floor(limit)));
    return {
      entries: this.entries.slice(0, Number.isFinite(capped) ? capped : this.size),
      me: await this.buildSelf(viewerUserId)
    };
  }

  private async ensureFresh(): Promise<void> {
    // Cikls re-pārbūvē TIKAI uz paaudzes maiņu (dirty), nevis TTL — tā novēršam
    // bezgalīgu ciklu, kad refreshMs === 0 (TTL-stale vienmēr pēc svaigas pārbūves).
    for (;;) {
      const now = this.clock();
      const genStale = this.builtGeneration !== this.generation;
      const ttlStale = !this.hasBuilt || now - this.builtAt >= this.refreshMs;
      if (!genStale && !ttlStale) {
        return;
      }
      if (this.building) {
        await this.building;
        // Pēc kopīgas pārbūves turpinām TIKAI ja gaida JAUNA paaudze.
        if (this.builtGeneration === this.generation) {
          return;
        }
        continue;
      }
      this.building = this.rebuild().finally(() => {
        this.building = undefined;
      });
      await this.building;
      // Ja paaudze palielinājās MŪSU pārbūves laikā, vēlreiz (jaunajai paaudzei).
      if (this.builtGeneration === this.generation) {
        return;
      }
    }
  }

  private async rebuild(): Promise<void> {
    // Notver paaudzi PIRMS await: ja notify ienāk pārbūves laikā, builtGeneration
    // paliks vecāks par generation → nākamā ensureFresh pārbūvē (bez lost-update).
    const targetGeneration = this.generation;
    const [records, snapshot] = await Promise.all([
      this.store.getLeaderboard(this.size, this.minGames),
      this.store.getRankedSnapshot(this.minGames)
    ]);
    this.entries = records.map(toEntry);
    this.rankByUser = new Map(snapshot.map((row) => [row.userId, row.rank]));
    this.builtAt = this.clock();
    this.hasBuilt = true;
    this.builtGeneration = targetGeneration;
  }

  private async buildSelf(viewerUserId: string | null): Promise<LeaderboardSelf> {
    if (viewerUserId === null) {
      return { status: "anonymous" };
    }
    const rank = this.rankByUser.get(viewerUserId);
    if (rank === undefined) {
      return this.unranked(viewerUserId);
    }
    // Ranžēts: ja vieta ir top `size`, ņem no keša; citādi atsevišķs vaicājums.
    const cached = this.entries.find((entry) => entry.rank === rank);
    if (cached) {
      return { status: "ranked", entry: cached };
    }
    const record = await this.store.getUserRank(viewerUserId, this.minGames);
    if (!record) {
      // Rangs bija kešā, bet starplaikā pazuda (race) → unranked fallback.
      return this.unranked(viewerUserId);
    }
    return { status: "ranked", entry: toEntry(record) };
  }

  private async unranked(viewerUserId: string): Promise<LeaderboardSelf> {
    const stats = await this.store.getUserStats(viewerUserId);
    return { status: "unranked", minGames: this.minGames, gamesPlayed: stats?.gamesPlayed ?? 0 };
  }
}

/** Storage ieraksts → publiskā DTO (nomet `userId`; privātums). */
function toEntry(record: LeaderboardEntryRecord): LeaderboardEntry {
  return {
    rank: record.rank,
    username: record.username,
    avatar: record.avatar,
    wins: record.wins,
    losses: record.losses,
    gamesPlayed: record.gamesPlayed,
    winRate: record.winRate,
    language: record.language
  };
}
