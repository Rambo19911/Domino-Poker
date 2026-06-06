import type { MultiplayerEvent } from "@domino-poker/core/multiplayer";
import type { ChatMessage } from "@domino-poker/shared";

/**
 * Persistences slānis (Fāze 10). `StoragePort` ir **DB-agnostisks** līgums starp
 * servera loģiku un konkrēto glabātuvi: lokāli to implementē `SqliteStorage`
 * (Fāze 10.2), bet VPS/kopīgas DB vidē to pašu interfeisu izpilda
 * `PostgresStorage` (Fāze 12.3), nemainot servera izsaukuma vietas.
 *
 * **Kāpēc visas metodes ir `async` (`Promise`)?** `better-sqlite3` / `node:sqlite`
 * ir sinhroni, taču PostgreSQL draiveris ir asinhrons. Lai interfeiss derētu
 * abiem, līgums ir asinhrons; SQLite adapteris vienkārši ietin sinhronos
 * izsaukumus `async` metodēs. Tā servera loģika nekad nav piesieta konkrētam
 * draiverim.
 *
 * **Datu modeļa princips:** visi ieejas/izejas tipi ir vienkārši serializējami
 * DTO (JSON-droši) — nekādu dzīvu objektu, klašu vai funkciju. Spēles state šeit
 * netiek glabāts; glabājam tikai `seed` + append-only event log, no kā state ir
 * pilnībā atjaunojams (determinisms, sk. core replay).
 *
 * MP/SP nodalījums: šis ir tikai multiplayer servera persistences slānis.
 * Single-player nekādu DB neizmanto.
 */
export interface StoragePort {
  /** Reģistrē jaunas partijas sākumu (metadata + seed). Idempotents pēc `matchId`. */
  saveMatchStarted(match: MatchStartedRecord): Promise<void>;

  /**
   * Pievieno vienu partijas notikumu append-only žurnālam. Notikumi ir sakārtoti
   * pēc room-līmeņa `seq`; atkārtots `(matchId, seq)` tiek ignorēts (idempotents),
   * lai novēlota/atkārtota piegāde nedublētu žurnālu.
   */
  appendMatchEvent(matchId: string, event: MatchEventRecord): Promise<void>;

  /** Iezīmē partiju kā pabeigtu un saglabā rezultātu. Idempotents pēc `matchId`. */
  saveMatchFinished(result: MatchFinishedRecord): Promise<void>;

  /**
   * Ielādē nepabeigtu partiju (metadata + viss event log) atkārtotai izspēlei.
   * Atgriež `undefined`, ja partija nav atrasta vai jau pabeigta.
   */
  loadUnfinishedMatch(matchId: string): Promise<UnfinishedMatch | undefined>;

  /** Jaunākās partijas (debug / "pēdējo spēļu saraksts"), jaunākās pirmās. */
  listRecentMatches(limit: number): Promise<readonly MatchSummaryRecord[]>;

  /** Saglabā (upsert) spēlētāja statistiku. */
  savePlayerStats(stats: PlayerStatsRecord): Promise<void>;

  /** Atomiski inkrementē spēlētāja statistiku. */
  incrementPlayerStats(stats: PlayerStatsIncrementRecord): Promise<void>;

  /** Spēlētāja statistika vai `undefined`, ja vēl nav ierakstu. */
  getPlayerStats(playerId: string): Promise<PlayerStatsRecord | undefined>;

  /** Pievieno lobby čata ziņu append-only žurnālam (pārdzīvo restartu). */
  appendChatMessage(message: ChatMessage): Promise<void>;

  /** Pēdējās (līdz `limit`) čata ziņas hronoloģiskā secībā (vecākās pirmās). */
  loadRecentChatMessages(limit: number): Promise<readonly ChatMessage[]>;

  /** Aizver glabātuvi (savieno ar servera izslēgšanu). Pēc tam izsaukumi nedrīkst. */
  close(): Promise<void>;
}

/** Viena sēdvieta partijas sākumā (sastāva momentuzņēmums). */
export interface MatchSeatRecord {
  /** Sēdvietas indekss 0..3 (atbilst `corePlayerIdForSeat`). */
  readonly seatIndex: number;
  /** Core spēlētāja id ("1".."4"). */
  readonly corePlayerId: string;
  /** Vai sēdvietu spēlē cilvēks vai bots. */
  readonly kind: "human" | "bot";
  /** Publiskais `displayId` (ja zināms; boti to var nesniegt). */
  readonly displayId?: string | undefined;
}

/** Partijas sākuma ieraksts: pietiekami, lai partiju deterministiski atkārtotu. */
export interface MatchStartedRecord {
  /** Partijas (istabas) id. */
  readonly matchId: string;
  /** Maisīšanas/izdales sēkla (determinisma avots — NEKAD nemaina). */
  readonly seed: string;
  /** Raundu skaits partijā. */
  readonly numberOfRounds: number;
  /** Sēdvietu sastāvs partijas sākumā. */
  readonly players: readonly MatchSeatRecord[];
  /** Servera laiks (ms), kad partija sākās — kalpo arī istabas TTL atskaitei. */
  readonly startedAt: number;
}

/** Viens append-only partijas notikums (room-līmeņa `seq` + core notikums). */
export interface MatchEventRecord {
  /** Room-līmeņa monotonais `seq` (no `RoomEngine`). */
  readonly seq: number;
  /** Core multiplayer notikums (serializējams). */
  readonly event: MultiplayerEvent;
}

/** Partijas rezultāts pēc tās beigām. */
export interface MatchFinishedRecord {
  readonly matchId: string;
  /** Uzvarētāja core spēlētāja id (`undefined`, ja neizšķirts/pamesta). */
  readonly winnerPlayerId?: string | undefined;
  /** Servera laiks (ms), kad partija beidzās. */
  readonly finishedAt: number;
}

/** Nepabeigta partija: metadata + viss notikumu žurnāls atkārtotai izspēlei. */
export interface UnfinishedMatch {
  readonly match: MatchStartedRecord;
  readonly events: readonly MatchEventRecord[];
}

/** Kompakts partijas kopsavilkums saraksta skatam (debug / pēdējās spēles). */
export interface MatchSummaryRecord {
  readonly matchId: string;
  readonly seed: string;
  readonly numberOfRounds: number;
  readonly startedAt: number;
  /** `undefined`, ja partija vēl nav pabeigta. */
  readonly finishedAt?: number | undefined;
  readonly winnerPlayerId?: string | undefined;
  /** Žurnālā saglabāto notikumu skaits. */
  readonly eventCount: number;
}

/** Pamata spēlētāja statistika (Fāze 10.3 "Basic player stats"). */
export interface PlayerStatsRecord {
  /** Spēlētāja stabilais identifikators (piem. reconnect identitāte). */
  readonly playerId: string;
  readonly gamesPlayed: number;
  readonly gamesWon: number;
  /** Servera laiks (ms) pēdējam atjauninājumam. */
  readonly updatedAt: number;
}

/** Atomisks statistikas pieaugums pēc vienas pabeigtas partijas. */
export interface PlayerStatsIncrementRecord {
  readonly playerId: string;
  readonly gamesPlayedDelta: number;
  readonly gamesWonDelta: number;
  /** Servera laiks (ms) pēdējam atjauninājumam. */
  readonly updatedAt: number;
}
