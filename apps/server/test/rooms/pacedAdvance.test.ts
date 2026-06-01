import { describe, expect, it } from "vitest";

import type { SequencedRoomEvent } from "../../src/rooms/RoomEngine.js";
import { RoomManager } from "../../src/rooms/RoomManager.js";

/**
 * Daudz-slotu manuālais timeris: katrs `create()` atgriež neatkarīgu schedulera
 * instanci ar vienu gaidošo timeri (kā `SystemTurnTimerScheduler`). `advanceTo`
 * izpilda visus gaidošos timerus `fireAt` secībā līdz mērķim. Vajadzīgs, jo
 * pacētā izspēle vienlaikus lieto vairākus timerus (dzinēja turn timeout + pacing).
 */
class MultiManualTimer {
  private current = 0;
  private idSeq = 0;
  private readonly pending: { fireAt: number; run: () => void; id: number }[] = [];

  readonly now = (): number => this.current;

  create(): { schedule: (fireAt: number, run: () => void) => void; cancel: () => void } {
    let myId: number | undefined;
    return {
      schedule: (fireAt, run) => {
        if (myId !== undefined) this.remove(myId);
        myId = (this.idSeq += 1);
        this.pending.push({ fireAt, run, id: myId });
      },
      cancel: () => {
        if (myId !== undefined) {
          this.remove(myId);
          myId = undefined;
        }
      }
    };
  }

  advanceTo(target: number): void {
    for (;;) {
      let idx = -1;
      for (let i = 0; i < this.pending.length; i += 1) {
        if (this.pending[i]!.fireAt <= target && (idx < 0 || this.pending[i]!.fireAt < this.pending[idx]!.fireAt)) {
          idx = i;
        }
      }
      if (idx < 0) break;
      const [timer] = this.pending.splice(idx, 1);
      this.current = timer!.fireAt;
      timer!.run();
    }
    if (target > this.current) this.current = target;
  }

  private remove(id: number): void {
    const index = this.pending.findIndex((entry) => entry.id === id);
    if (index >= 0) this.pending.splice(index, 1);
  }
}

function buildPacedRooms() {
  const timer = new MultiManualTimer();
  const deliveries: SequencedRoomEvent[][] = [];
  const rooms = new RoomManager({
    clock: timer.now,
    createRoomId: () => "room-1",
    createRoomCode: () => "CODE1",
    createSeed: () => "seed-fixed",
    createTurnScheduler: () => timer.create(),
    botPaceMs: 800,
    trickPauseMs: 1700
  });
  rooms.setGameUpdateSink((_roomId, events) => deliveries.push([...events]));
  return { timer, rooms, deliveries };
}

function firstHumanTurnStarted(deliveries: SequencedRoomEvent[][]) {
  return deliveries
    .flat()
    .map((entry) => entry.event)
    .find((event) => event.type === "TURN_STARTED" && event.turn.playerId === "1");
}

describe("Server-paced bot advance (botPaceMs)", () => {
  it("does not play bots synchronously and delivers steps incrementally", () => {
    const { timer, rooms, deliveries } = buildPacedRooms();
    rooms.createRoom("host");
    rooms.fillSeatsWithBots("host");
    rooms.startGame("host");

    const inline = rooms.advanceGame("room-1");
    expect(inline).toEqual([]); // pacēts: nekas netiek atgriezts sinhroni
    expect(deliveries).toHaveLength(0); // boti NAV nospēlēti uzreiz

    timer.advanceTo(800); // pirmais solis
    expect(deliveries.length).toBeGreaterThan(0);
  });

  it("starts the human's 10s deadline only after the bot pacing reaches them", () => {
    const { timer, rooms, deliveries } = buildPacedRooms();
    rooms.createRoom("host");
    rooms.fillSeatsWithBots("host");
    rooms.startGame("host");
    rooms.advanceGame("room-1");

    // Virzām laiku pa mazumam, līdz parādās cilvēka turns; apstājamies pirms timeout.
    let humanTurn = firstHumanTurnStarted(deliveries);
    for (let t = 0; t <= 30_000 && !humanTurn; t += 400) {
      timer.advanceTo(t + 400);
      humanTurn = firstHumanTurnStarted(deliveries);
    }

    expect(humanTurn).toBeDefined();
    if (humanTurn && humanTurn.type === "TURN_STARTED") {
      // Deadline sākas, kad cilvēka turns PATIEŠĀM pienāk (pēc vismaz viena pacēta soļa),
      // nevis advanceGame brīdī (t=0). Tas ir labojuma kodols.
      expect(humanTurn.turn.startedAt).toBeGreaterThanOrEqual(800);
      expect(humanTurn.turn.deadlineAt).toBe(humanTurn.turn.startedAt + 10_000);
    }
  });
});
