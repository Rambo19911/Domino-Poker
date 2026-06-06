import type { ServerEvent } from "@domino-poker/shared";
import { afterEach, describe, expect, it } from "vitest";

import type { ClientView } from "../../lib/mp/clientView";
import {
  MultiplayerClient,
  type ClientSocket,
  type ClientSocketHandlers,
  type MultiplayerClientOptions
} from "../../lib/mp/MultiplayerClient";

interface ParsedMessage {
  readonly type: string;
  readonly [key: string]: unknown;
}

class FakeSocket implements ClientSocket {
  readonly sent: ParsedMessage[] = [];
  closed = false;

  constructor(readonly handlers: ClientSocketHandlers) {}

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ParsedMessage);
  }

  close(): void {
    this.closed = true;
  }

  // ---- testa vadība ----
  open(): void {
    this.handlers.onOpen();
  }

  emit(event: ServerEvent): void {
    this.handlers.onMessage(JSON.stringify(event));
  }

  serverClose(code?: number): void {
    this.handlers.onClose(code);
  }

  sentTypes(): string[] {
    return this.sent.map((message) => message.type);
  }
}

interface Timer {
  readonly id: number;
  readonly run: () => void;
}

function buildHarness(overrides: Partial<MultiplayerClientOptions> = {}) {
  const sockets: FakeSocket[] = [];
  const views: ClientView[] = [];
  let token: string | undefined;
  let timerSeq = 0;
  let timers: Timer[] = [];

  const client = new MultiplayerClient({
    url: "ws://test/ws",
    clientId: "client-A",
    clientBuild: "test",
    socketFactory: (_url, handlers) => {
      const socket = new FakeSocket(handlers);
      sockets.push(socket);
      return socket;
    },
    onView: (view) => views.push(view),
    getReconnectToken: () => token,
    onReconnectToken: (next) => {
      token = next;
    },
    now: () => 1000,
    setTimeoutFn: (run) => {
      timerSeq += 1;
      timers.push({ id: timerSeq, run });
      return timerSeq as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeoutFn: (handle) => {
      timers = timers.filter((timer) => timer.id !== (handle as unknown as number));
    },
    reconnectDelaysMs: [500],
    pingIntervalMs: 15_000,
    ...overrides
  });

  /** Izpilda šobrīd ieplānotos timerus (vienu "raundu"; re-arm nonāk jaunā rindā). */
  const runTimers = (): void => {
    const due = timers;
    timers = [];
    for (const timer of due) timer.run();
  };

  const welcome = (socket: FakeSocket): void => {
    socket.emit({
      type: "WELCOME",
      sessionId: "s1",
      playerId: "client-A",
      displayId: "#00001",
      reconnectToken: "tok-1",
      serverNow: 1
    });
  };

  return { client, sockets, views, runTimers, welcome, getToken: () => token };
}

afterEach(() => {
  // nekas globāls
});

describe("MultiplayerClient handshake + sending (8.1)", () => {
  it("sends HELLO with clientId and protocol version on open", () => {
    const { client, sockets } = buildHarness();
    client.connect();
    sockets[0]!.open();

    const hello = sockets[0]!.sent[0]!;
    expect(hello.type).toBe("HELLO");
    expect(hello.clientId).toBe("client-A");
    expect(hello.protocolVersion).toBe("1");
    expect(hello.reconnectToken).toBeUndefined();
  });

  it("marks the view connected and stores identity on WELCOME", () => {
    const { client, sockets, views, getToken } = buildHarness();
    client.connect();
    sockets[0]!.open();
    welcomeEmit(sockets[0]!);

    expect(client.getView().connection).toBe("connected");
    expect(client.getView().identity?.displayId).toBe("#00001");
    expect(getToken()).toBe("tok-1"); // reconnectToken saglabāts
    expect(views.length).toBeGreaterThan(0);
  });

  it("sends lobby intents only after the socket is open", () => {
    const { client, sockets } = buildHarness();
    client.createRoom(); // vēl nav savienots → izlaists
    client.connect();
    sockets[0]!.open();
    client.createRoom({ visibility: "private", numberOfRounds: 9, fillWithBots: true });
    client.viewRoom("room-1");
    client.joinRoom("room-1", undefined, 1);
    client.joinRoom(undefined, "abc123", 2);

    expect(sockets[0]!.sentTypes()).toContain("CREATE_ROOM");
    const create = sockets[0]!.sent.find((message) => message.type === "CREATE_ROOM")!;
    expect(create.visibility).toBe("private");
    expect(create.numberOfRounds).toBe(9);
    expect(create.fillWithBots).toBe(true);
    expect(sockets[0]!.sent).toContainEqual({ type: "VIEW_ROOM", roomId: "room-1" });
    expect(sockets[0]!.sent).toContainEqual({ type: "JOIN_ROOM", roomId: "room-1", seatIndex: 1 });
    expect(sockets[0]!.sent).toContainEqual({ type: "JOIN_ROOM", code: "ABC123", seatIndex: 2 });
  });

  it("includes roomId and turnId when submitting a bid for the active turn", () => {
    const { client, sockets } = buildHarness();
    client.connect();
    sockets[0]!.open();
    welcomeEmit(sockets[0]!);
    sockets[0]!.emit({ type: "ROOM_JOINED", room: roomView("room-1") });
    sockets[0]!.emit(turnStarted(2, "turn-7"));

    client.submitBid(0);

    const bid = sockets[0]!.sent.find((message) => message.type === "SUBMIT_BID");
    expect(bid).toMatchObject({ type: "SUBMIT_BID", roomId: "room-1", turnId: "turn-7", bid: 0 });
  });

  it("drops a bid when there is no active turn", () => {
    const { client, sockets } = buildHarness();
    client.connect();
    sockets[0]!.open();
    welcomeEmit(sockets[0]!);

    client.submitBid(3);
    expect(sockets[0]!.sentTypes()).not.toContain("SUBMIT_BID");
  });
});

describe("MultiplayerClient reconnect (8.1)", () => {
  it("reconnects with backoff after an unexpected close and resyncs the room", () => {
    const { client, sockets, runTimers } = buildHarness();
    client.connect();
    sockets[0]!.open();
    welcomeEmit(sockets[0]!);
    sockets[0]!.emit({ type: "ROOM_JOINED", room: roomView("room-1") });
    sockets[0]!.emit(turnStarted(4, "turn-1"));

    sockets[0]!.serverClose();
    expect(client.getView().connection).toBe("reconnecting");

    runTimers(); // izpilda reconnect timeri
    expect(sockets).toHaveLength(2);

    sockets[1]!.open();
    expect(sockets[1]!.sent[0]!.type).toBe("HELLO");
    expect(sockets[1]!.sent[0]!.reconnectToken).toBe("tok-1"); // saglabātais token

    welcomeEmit(sockets[1]!);
    // Pēc atkārtota WELCOME ar zināmu istabu → REQUEST_SNAPSHOT(lastSeq).
    const resync = sockets[1]!.sent.find((message) => message.type === "REQUEST_SNAPSHOT");
    expect(resync).toMatchObject({ type: "REQUEST_SNAPSHOT", roomId: "room-1", lastSeq: 4 });
  });

  it("does not reconnect after an explicit close()", () => {
    const { client, sockets, runTimers } = buildHarness();
    client.connect();
    sockets[0]!.open();
    welcomeEmit(sockets[0]!);

    client.close();
    sockets[0]!.serverClose();
    runTimers();

    expect(sockets).toHaveLength(1); // nav jauna savienojuma
  });

  it("ignores stale socket messages after an explicit close()", () => {
    const { client, sockets, views } = buildHarness();
    client.connect();
    sockets[0]!.open();
    welcomeEmit(sockets[0]!);
    const viewCountAfterWelcome = views.length;

    client.close();
    sockets[0]!.emit({ type: "ROOM_JOINED", room: roomView("room-1") });

    expect(views).toHaveLength(viewCountAfterWelcome);
    expect(client.getView().room).toBeUndefined();
  });

  it("stops reconnecting on PROTOCOL_VERSION_MISMATCH", () => {
    const { client, sockets, runTimers } = buildHarness();
    client.connect();
    sockets[0]!.open();
    sockets[0]!.emit({ type: "ERROR", code: "PROTOCOL_VERSION_MISMATCH", message: "bad version" });
    sockets[0]!.serverClose();
    runTimers();

    expect(client.getView().connection).toBe("error");
    expect(sockets).toHaveLength(1);
  });

  it("does not reconnect when superseded by another connection (close 4003)", () => {
    const { client, sockets, runTimers } = buildHarness();
    client.connect();
    sockets[0]!.open();
    welcomeEmit(sockets[0]!);

    sockets[0]!.serverClose(4003); // cits tabs pārņēma → superseded
    runTimers();

    expect(client.getView().connection).toBe("error");
    expect(sockets).toHaveLength(1); // nav ping-pong reconnect
  });
});

describe("MultiplayerClient liveness + recovery (8.1)", () => {
  it("sends PING on the heartbeat interval", () => {
    const { client, sockets, runTimers } = buildHarness();
    client.connect();
    sockets[0]!.open();
    welcomeEmit(sockets[0]!);

    runTimers(); // ping tick
    expect(sockets[0]!.sentTypes()).toContain("PING");
  });

  it("requests a snapshot when a GAME_EVENT seq gap appears", () => {
    const { client, sockets } = buildHarness();
    client.connect();
    sockets[0]!.open();
    welcomeEmit(sockets[0]!);
    sockets[0]!.emit({ type: "ROOM_JOINED", room: roomView("room-1") });
    sockets[0]!.emit(turnStarted(5, "turn-1")); // seq 5
    sockets[0]!.emit(turnStarted(9, "turn-2")); // robs (5 → 9)

    const resync = sockets[0]!.sent.find((message) => message.type === "REQUEST_SNAPSHOT");
    expect(resync).toMatchObject({ type: "REQUEST_SNAPSHOT", roomId: "room-1", lastSeq: 5 });
  });

  it("deduplicates snapshot requests until recovery arrives", () => {
    const { client, sockets } = buildHarness();
    client.connect();
    sockets[0]!.open();
    welcomeEmit(sockets[0]!);
    sockets[0]!.emit({ type: "ROOM_JOINED", room: roomView("room-1") });
    sockets[0]!.emit(turnStarted(5, "turn-1"));
    sockets[0]!.emit(turnStarted(9, "turn-2"));
    sockets[0]!.emit(turnStarted(12, "turn-3"));

    expect(snapshotRequests(sockets[0]!)).toEqual([
      { type: "REQUEST_SNAPSHOT", roomId: "room-1", lastSeq: 5 }
    ]);

    sockets[0]!.emit(snapshotEvent(12));
    sockets[0]!.emit(turnStarted(16, "turn-4"));

    expect(snapshotRequests(sockets[0]!)).toEqual([
      { type: "REQUEST_SNAPSHOT", roomId: "room-1", lastSeq: 5 },
      { type: "REQUEST_SNAPSHOT", roomId: "room-1", lastSeq: 12 }
    ]);
  });
});

// ---- helperi ----

function welcomeEmit(socket: FakeSocket): void {
  socket.emit({
    type: "WELCOME",
    sessionId: "s1",
    playerId: "client-A",
    displayId: "#00001",
    reconnectToken: "tok-1",
    serverNow: 1
  });
}

function roomView(id: string) {
  return {
    id,
    code: "CODE",
    visibility: "public" as const,
    isPrivate: false,
    status: "WAITING" as const,
    seatsFilled: 1,
    seatsTotal: 4,
    hostDisplayId: "#00001",
    createdAt: 0,
    expiresAt: 0,
    numberOfRounds: 7,
    seats: []
  };
}

function turnStarted(seq: number, turnId: string): ServerEvent {
  return {
    type: "GAME_EVENT",
    roomId: "room-1",
    seq,
    event: {
      type: "TURN_STARTED",
      gameId: "room-1",
      eventSeq: seq,
      turn: {
        turnId,
        playerId: "1",
        startedAt: 1000,
        deadlineAt: 11_000,
        allowedActionTypes: ["SUBMIT_BID"],
        phase: "bidding"
      }
    },
    serverNow: 1
  } as ServerEvent;
}

function snapshotEvent(seq: number): ServerEvent {
  return {
    type: "STATE_SNAPSHOT",
    roomId: "room-1",
    seq,
    snapshot: { hand: [], turnId: "turn-snapshot" },
    serverNow: 1
  } as unknown as ServerEvent;
}

function snapshotRequests(socket: FakeSocket): ParsedMessage[] {
  return socket.sent.filter((message) => message.type === "REQUEST_SNAPSHOT");
}
