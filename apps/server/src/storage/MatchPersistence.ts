import type { ChatMessage } from "@domino-poker/shared";

import type { SequencedRoomEvent } from "../rooms/RoomEngine.js";
import type { Clock } from "../timers/TurnTimerScheduler.js";
import type { MatchSeatRecord, StoragePort } from "./StoragePort.js";

export interface MatchPersistenceOptions {
  readonly storage: StoragePort;
  readonly clock: Clock;
  /** Kļūdu reģistrētājs (noklusējums `console.error`); glabāšana ir best-effort. */
  readonly onError?: (context: string, error: unknown) => void;
}

/**
 * Persistences koordinators (Fāze 10.3): savieno servera domēna notikumus ar
 * `StoragePort`. Te dzīvo VISA "ko glabāt" loģika (partijas sākums, append-only
 * event log, rezultāts pēc `GAME_OVER`), lai izsaukuma vietas (RoomManager/
 * index) paliktu vienkāršas un šo varētu testēt izolēti.
 *
 * **Fire-and-forget:** visi DB izsaukumi ir asinhroni, bet izsaucēji tos negaida —
 * glabāšanas kļūda nedrīkst aizkavēt vai salauzt spēles plūsmu (serveris paliek
 * autoritatīvs neatkarīgi no DB pieejamības). Kļūdas tiek reģistrētas, ne mestas.
 */
export class MatchPersistence {
  private readonly storage: StoragePort;
  private readonly clock: Clock;
  private readonly onError: (context: string, error: unknown) => void;
  /** Partijas sastāvs (matchId → sēdvietas), lai pie GAME_OVER aprēķinātu statistiku. */
  private readonly rosters = new Map<string, readonly MatchSeatRecord[]>();

  constructor(options: MatchPersistenceOptions) {
    this.storage = options.storage;
    this.clock = options.clock;
    this.onError =
      options.onError ??
      ((context, error) => {
        console.error(`[persistence] ${context}:`, error);
      });
  }

  /** Partija sākta: saglabā metadata + seed (idempotents pēc matchId). */
  matchStarted(record: Parameters<StoragePort["saveMatchStarted"]>[0]): void {
    // Iegaumējam sastāvu statistikas aprēķinam pie GAME_OVER.
    this.rosters.set(record.matchId, record.players);
    this.run("saveMatchStarted", () => this.storage.saveMatchStarted(record));
  }

  /**
   * Jauni room eventi: pievieno katru append-only žurnālam un, ja kāds ir
   * `GAME_OVER`, fiksē partijas rezultātu. `event.gameId` ir matchId.
   */
  events(events: readonly SequencedRoomEvent[]): void {
    for (const entry of events) {
      const matchId = entry.event.gameId;
      this.run("appendMatchEvent", () =>
        this.storage.appendMatchEvent(matchId, { seq: entry.seq, event: entry.event })
      );
      if (entry.event.type === "GAME_OVER") {
        this.matchFinished(matchId, entry.event.winnerPlayerId);
      }
    }
  }

  /** Lobby čata ziņa: append-only (pārdzīvo restartu). */
  chatMessage(message: ChatMessage): void {
    this.run("appendChatMessage", () => this.storage.appendChatMessage(message));
  }

  private matchFinished(matchId: string, winnerPlayerId: string | undefined): void {
    this.run("saveMatchFinished", () =>
      this.storage.saveMatchFinished({
        matchId,
        ...(winnerPlayerId !== undefined ? { winnerPlayerId } : {}),
        finishedAt: this.clock()
      })
    );

    // Basic player stats: katram CILVĒKAM (ar stabilo clientId) +1 spēle; uzvarētājam
    // +1 uzvara. Boti netiek skaitīti. Atslēga ir stabilais clientId (reconnect
    // identitāte), NE reciklējamais publiskais displayId (F5) — citādi divu dažādu
    // cilvēku spēles var saskaitīties vienā rindā pēc displayId atkārtotas izmantošanas.
    // Pilna starpsesijas identitāte (autentifikācija) joprojām ir atlikta uz vēlāk.
    const roster = this.rosters.get(matchId);
    this.rosters.delete(matchId);
    if (roster) {
      this.run("savePlayerStats", () => this.updatePlayerStats(roster, winnerPlayerId));
    }
  }

  /** Saglabā katra cilvēka statistikas pieaugumu kā atomisku storage operāciju. */
  private async updatePlayerStats(
    roster: readonly MatchSeatRecord[],
    winnerPlayerId: string | undefined
  ): Promise<void> {
    const now = this.clock();
    for (const seat of roster) {
      if (seat.kind !== "human" || seat.clientId === undefined) continue;
      const won = seat.corePlayerId === winnerPlayerId;
      await this.storage.incrementPlayerStats({
        playerId: seat.clientId,
        gamesPlayedDelta: 1,
        gamesWonDelta: won ? 1 : 0,
        updatedAt: now
      });
    }
  }

  /** Izpilda asinhronu glabāšanas darbību fire-and-forget ar kļūdu reģistrāciju. */
  private run(context: string, action: () => Promise<void>): void {
    try {
      action().catch((error: unknown) => this.onError(context, error));
    } catch (error) {
      // Sinhrona kļūda (piem. JSON serializācija) — arī nedrīkst salauzt plūsmu.
      this.onError(context, error);
    }
  }
}
