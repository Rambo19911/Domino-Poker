import type {
  GameDifficulty,
  GameStatsAggregateRow,
  PlayerStatsStore
} from "../storage/PlayerStatsStore.js";

/**
 * Padziļinātās spēlētāja statistikas lietišķais serviss (sk.
 * `docs/TODO/player-stats-plan.md`). Pieder ierakstīšanas + (Fāze 5) agregātu
 * komponēšanas loģika; route slānis tikai orķestrē (token-validē, kreditē monētas),
 * NEturot statistikas biznesa loģiku auth/wallet servisos.
 *
 * SP spēli ieraksta klients (caur `/sp/complete`), serveris validē pret tokenu;
 * MP spēli (Fāze 4) ieraksta servera-autoritatīvais writer. Abi caur šo servisu.
 */
/** Vietu sadalījums (spēļu skaits katrā 1.–4. vietā). */
export interface PlacementDistribution {
  readonly p1: number;
  readonly p2: number;
  readonly p3: number;
  readonly p4: number;
}

/**
 * Komponēta spēlētāja statistika UI formā (lasīts pie "Statistika" taba). `bidAccuracy`
 * ir kopā pa SP+MP; `spByDifficulty` — vietu sadalījums pret botiem pa grūtībām;
 * `mpPlacement` — vietu sadalījums MP spēlēs (bez grūtības).
 */
export interface PlayerStats {
  readonly bidAccuracy: { readonly met: number; readonly exceeded: number; readonly missed: number };
  readonly spByDifficulty: Record<GameDifficulty, PlacementDistribution>;
  readonly mpPlacement: PlacementDistribution;
}

export interface RecordSpGameInput {
  readonly userId: string;
  /** Serverī uzticamais SP tokens (idempotences atslēga: `sp:{gameToken}`). */
  readonly gameToken: string;
  /** No tokena (NE klienta). */
  readonly difficulty: GameDifficulty;
  /** Gala vieta 1..4. */
  readonly placement: number;
  /** No tokena (NE klienta) — klienta ziņotie skaitītāji jāatbilst šim. */
  readonly roundCount: number;
  readonly bidMet: number;
  readonly bidExceeded: number;
  readonly bidMissed: number;
  readonly now: number;
}

export class PlayerStatsService {
  private readonly store: Pick<
    PlayerStatsStore,
    "recordGameResult" | "getPlayerGameStats" | "getGameResultOwner"
  >;

  constructor(options: {
    readonly store: Pick<
      PlayerStatsStore,
      "recordGameResult" | "getPlayerGameStats" | "getGameResultOwner"
    >;
  }) {
    this.store = options.store;
  }

  /**
   * Reģistrē pabeigtu SP spēli. Idempotents pēc `gameToken` (id = `sp:{gameToken}`):
   * atgriež `true`, ja rinda tikko ierakstīta; `false`, ja jau bija (dublikāts/retry).
   * Met kļūdu, ja ieraksts pārkāpj invariantus (sk. `assertValidGameResult`) — bet
   * route to validē jau iepriekš, tāpēc normālā plūsmā tas nenotiek.
   */
  async recordSpGame(input: RecordSpGameInput): Promise<boolean> {
    return this.store.recordGameResult({
      id: `sp:${input.gameToken}`,
      userId: input.userId,
      mode: "sp",
      difficulty: input.difficulty,
      placement: input.placement,
      roundCount: input.roundCount,
      bidMet: input.bidMet,
      bidExceeded: input.bidExceeded,
      bidMissed: input.bidMissed,
      completedAt: input.now
    });
  }

  /** Lietotāja per-spēli rezultātu agregāts (zemākā līmeņa; `getStats` to komponē). */
  getAggregate(userId: string): Promise<readonly GameStatsAggregateRow[]> {
    return this.store.getPlayerGameStats(userId);
  }

  /**
   * Komponē statistiku UI formā no agregātrindām (GROUP BY pēc mode/difficulty/placement):
   * solījumu precizitāte kopā (SP+MP), vietu sadalījums pa SP grūtībām un MP. Tukšam
   * lietotājam visi skaitļi ir 0.
   */
  async getStats(userId: string): Promise<PlayerStats> {
    const rows = await this.store.getPlayerGameStats(userId);
    const bidAccuracy = { met: 0, exceeded: 0, missed: 0 };
    const emptyDist = (): PlacementDistribution => ({ p1: 0, p2: 0, p3: 0, p4: 0 });
    const spByDifficulty: Record<GameDifficulty, PlacementDistribution> = {
      medium: emptyDist(),
      hard: emptyDist(),
      epic: emptyDist()
    };
    const mpPlacement = emptyDist();
    for (const row of rows) {
      bidAccuracy.met += row.bidMet;
      bidAccuracy.exceeded += row.bidExceeded;
      bidAccuracy.missed += row.bidMissed;
      if (row.placement < 1 || row.placement > 4) continue;
      const key = `p${row.placement}` as keyof PlacementDistribution;
      if (row.mode === "sp" && row.difficulty !== null) {
        (spByDifficulty[row.difficulty] as Record<keyof PlacementDistribution, number>)[key] += row.games;
      } else if (row.mode === "mp") {
        (mpPlacement as Record<keyof PlacementDistribution, number>)[key] += row.games;
      }
    }
    return { bidAccuracy, spByDifficulty, mpPlacement };
  }

  /**
   * SP spēles (id = `sp:{gameToken}`) īpašnieka `userId`, vai `undefined`. `/sp/complete`
   * to lieto, lai jau-patērēta tokena replay atgrieztu stabilu success (NE 409), kad
   * rinda jau eksistē šim lietotājam.
   */
  findSpGameOwner(gameToken: string): Promise<string | undefined> {
    return this.store.getGameResultOwner(`sp:${gameToken}`);
  }
}
