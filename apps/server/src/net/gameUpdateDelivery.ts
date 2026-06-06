import type { SequencedRoomEvent } from "../rooms/RoomEngine.js";
import type { RoomManager } from "../rooms/RoomManager.js";
import type { GatewayHub } from "./GatewayHub.js";

/**
 * Piegādā spēles atjauninājumu visiem istabas sēdošajiem cilvēkiem: vispirms
 * publiskie `GAME_EVENT` (secībā), tad katram personalizēts `STATE_SNAPSHOT`
 * (autoritatīvais pašreizējais state — sedz arī jaunas rokas pēc
 * `START_NEXT_ROUND`). Kopīgs gan klienta-iniciētai (maršrutētājs), gan
 * servera-iniciētai (turn timeout) piegādei.
 */
export function publishGameUpdate(
  hub: GatewayHub,
  rooms: RoomManager,
  roomId: string,
  events: readonly SequencedRoomEvent[],
  serverNow: number
): void {
  const humans = rooms.getSeatedHumans(roomId);
  const seq = rooms.getSeq(roomId);
  for (const human of humans) {
    for (const entry of events) {
      hub.sendToPlayer(human.clientId, {
        type: "GAME_EVENT",
        roomId,
        seq: entry.seq,
        event: entry.event,
        serverNow
      });
    }
    hub.sendToPlayer(human.clientId, {
      type: "STATE_SNAPSHOT",
      roomId,
      seq,
      snapshot: rooms.getSnapshotForClient(roomId, human.clientId),
      serverNow
    });
  }
}
