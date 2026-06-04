# Domino Poker

Browser-playable **Domino Poker** built with Next.js, React, and TypeScript. The game
started as a local single-player table (one human vs. three bots on a double-six set) and
now also includes a complete **authoritative real-time multiplayer server** that lets up to
four players share a room and play the same game over WebSocket.

**▶ Play it live: [domino-poker.com](https://domino-poker.com/)**

![Domino Poker lobby](Screenshots/Lobby-screen.png)

> **Branch note.** This is the **`multiplayer`** branch — a large work-in-progress update that
> adds the multiplayer server, lobby, persistence, and deployment groundwork on top of the
> single-player game. It runs and is playable with 4 humans (or humans + bots) and is now
> **live at [domino-poker.com](https://domino-poker.com/)**, still being tested and refined. Contributions
> are welcome (see [Contributing](#contributing)).

## Overview

Domino Poker is a trick-taking domino game where each round starts with bidding, then players
compete across seven tricks. The goal is to score the most points by predicting how many
tricks you will win and playing your tiles according to the trump, ace, and follow-number
rules.

This repository now contains two ways to play, sharing one rules engine:

- **Single-player** (offline, in the browser): one human vs. three bots. No server needed.
- **Multiplayer** (local server): 2–4 humans in a room (the host can fill empty seats with
  bots), playing in real time against an authoritative Node.js server.

## What's in this update (multiplayer)

The multiplayer work is implemented as a **separate zone** so it never mixes with the proven
single-player rules. Highlights:

- **Authoritative server** (`apps/server`): the server owns all game state and is the single
  source of truth. Clients only send *intent* (bid/move) and render server snapshots — they
  contain no game rules, so they cannot cheat or desync the table.
- **Lobby + rooms**: create public/private rooms, join by list or code, choose seats, host can
  fill empty seats with bots and start the game. Rooms have a 1-hour TTL.
- **Real-time WebSocket protocol**: a small typed protocol (`packages/shared`) with a strict
  validate-then-route pipeline, HELLO handshake, protocol-version check, and heartbeat.
- **Server-driven turn timers**: each turn has a countdown (default 10s, configurable). If a
  player doesn't act in time, the server auto-plays a legal move so the game never stalls.
- **Reconnect & resilience**: the client auto-reconnects with backoff; the server keeps a
  reconnect token and restores the player's room/seat and a fresh snapshot. Disconnected
  seats keep playing via timeout auto-play; abandoned rooms are cleaned up.
- **Persistence (SQLite)**: match start (with seed), an append-only event log, match results,
  basic player stats, and lobby chat are stored locally; lobby chat survives a server restart.
- **Lobby chat**: rate-limited (token bucket), broadcast to everyone online.
- **Determinism**: the multiplayer deck is shuffled from a seed, so a match is fully
  reproducible from its seed + event log (replay, recovery, fairness auditing).
- **Load-tested**: a local load-test tool drives hundreds–thousands of virtual clients; the
  server is hardened against broadcast-fanout overload (debounce + backpressure + single-pass
  serialization). See [`docs/SCALING.md`](docs/SCALING.md).
- **Deployment groundwork**: `.env` configuration, a systemd service, a Dockerfile, and an
  Nginx/Caddy reverse-proxy example. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

The single-player game is unchanged and still works fully offline.

## Screenshots

| Game room | Settings | Game rules |
| --- | --- | --- |
| <img src="Screenshots/playing-room-screen.png" alt="Domino Poker game room" width="100%"> | <img src="Screenshots/settings-screen.png" alt="Domino Poker settings" width="100%"> | <img src="Screenshots/gamerules-screen.png" alt="Domino Poker rules dialog" width="100%"> |

## How multiplayer works (architecture)

```
   Browser (apps/web)                 Node server (apps/server)
 ┌────────────────────┐   WebSocket   ┌──────────────────────────────┐
 │ React UI           │  /ws (JSON)   │ Gateway (validate + route)   │
 │ MultiplayerClient  │ ────────────▶ │ RoomManager / LobbyManager   │
 │  - sends intent    │ ◀──────────── │ RoomEngine (single-writer)   │
 │  - renders snapshot│   snapshots   │   → core rules (packages/core)│
 └────────────────────┘   + events    │ StoragePort → SQLite          │
                                       └──────────────────────────────┘
```

Key design rules (please preserve these when contributing):

- **One source of rules.** All game logic lives in `packages/core`. The server and clients
  never duplicate rules; the multiplayer engine reuses the core rules through a dedicated
  `core/multiplayer` zone.
- **Single-writer per room.** Every state change for a room goes through `RoomEngine.dispatch`
  (serialized). This is the only place room state mutates.
- **Server is the time + state authority.** The server overrides client-supplied timestamps,
  assigns event sequence numbers, and decides acceptance — clients are render-only.
- **Multiplayer determinism stays in the multiplayer zone.** The single-player code uses
  `Math.random`; the multiplayer code uses a seeded RNG so games are reproducible. These are
  intentionally separate.
- **Persistence is DB-agnostic and async.** `StoragePort` is a `Promise`-based interface
  (today: SQLite via the built-in `node:sqlite`; a PostgreSQL adapter can be swapped in with
  no call-site changes — see [`docs/DB_MIGRATION.md`](docs/DB_MIGRATION.md)).

## Shuffle and deal method

Domino Poker intentionally uses a human-style domino shuffle instead of a Fisher-Yates
shuffle. For this game the current method is preferred because it better resembles how
physical domino tiles are mixed and cut before play.

The round deck is prepared as follows:

1. A full double-six set of 28 unique tiles is created.
2. The set is randomly cut.
3. The tiles are mixed with an overhand-style shuffle using small packets of 2–6 tiles.
4. The mixed set is randomly cut again.
5. The final deck is dealt sequentially: 7 tiles to each of the 4 players.

This is intentional game design and **must not be changed**. Multiplayer uses the **same
algorithm** but driven by a **seeded** random generator (instead of `Math.random`) so the deal
is deterministic and reproducible from the match seed — the shuffle "feel" is identical.

## Tech stack

- **Next.js App Router** + **React** for the web client.
- **Node.js** authoritative server using the **`ws`** library and the built-in **`node:sqlite`**.
- **TypeScript** across the web app, server, rules engine, and tools.
- **npm workspaces** for the monorepo.
- **Vitest** for core, server, shared, and tool tests; **Playwright** for web e2e.
- **Zod** for protocol message validation.

## Repository structure

```text
apps/web         Next.js web app: single-player game + multiplayer lobby/table UI
apps/server      Authoritative multiplayer server (gateway, rooms, timers, storage, chat)
packages/core    Pure TypeScript rules, scoring, state, AI — incl. the `multiplayer/` zone
packages/shared  Protocol contracts (client/server messages, room DTOs) — single source
tools/simulators Headless full-game simulator (determinism + invariant stress tests)
tools/load-test  Local WebSocket load generator (npm run load:local)
deploy           systemd service, Dockerfile, Nginx/Caddy reverse-proxy examples
docs             Rules, scoring examples, deployment, scaling, and DB-migration guides
Screenshots      Public README screenshots
```

## Getting started

### Prerequisites

- **Node.js 22.5+** (the server uses the built-in `node:sqlite`; Node 24 recommended)
- **npm**

### Installation

```bash
npm install
```

### Run single-player (browser only)

```bash
npm run dev
```

Open the local URL printed by Next.js. Choose **Play** for the single-player table.

### Run multiplayer locally (server + web)

Open two terminals from the repo root:

```bash
# Terminal 1 — authoritative server (builds core + server, then runs on port 4000)
npm run dev:server

# Terminal 2 — web client
npm run dev
```

Then, to play with four humans on one machine, open **four separate browser sessions** (e.g.
one normal window + one incognito per browser, so each gets its own identity), go to
**Multiplayer → Lobby** in each, and:

1. One player creates a room (optionally fill empty seats with bots).
2. Others join the room from the list (or by code for private rooms).
3. The host starts the game (from the room screen, or the **Start** button in the lobby list).
4. Bid and play; the server runs the per-turn countdown and auto-plays on timeout.

The web client connects to `ws://<host>:4000/ws` by default. Behind a reverse proxy, set
`NEXT_PUBLIC_MP_WS_URL` at build time (see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)).

## Available scripts

```bash
npm run dev          # Web app (single-player + multiplayer UI) in dev mode
npm run dev:server   # Build core + server and run the authoritative MP server
npm run build        # Build all workspaces
npm run test         # Run unit tests across workspaces (core, server, shared, tools)
npm run typecheck    # TypeScript checks for all workspaces
npm run simulate     # Headless full-game simulations (determinism + invariants)
npm run load:local   # Local load test against a running server (e.g. -- 100)
npm run test:web     # Playwright web e2e tests
```

## Configuration

The server reads configuration from environment variables (and an optional `.env` file at the
repo root). Copy the example and adjust:

```bash
cp .env.example .env
```

| Variable | Purpose | Default |
| --- | --- | --- |
| `SERVER_PORT` (or `HTTP_PORT`) | HTTP + WebSocket port | `4000` |
| `SERVER_HOST` | Bind address (`127.0.0.1` behind a proxy) | `0.0.0.0` |
| `DATABASE_URL` | SQLite file path or `:memory:` | `./data/dev.sqlite` |
| `TURN_DURATION_MS` | Per-turn countdown in ms (range 100–600000) | `10000` |
| `NODE_ENV` | `development` / `production` | `development` |

See [`.env.example`](.env.example) for full notes.

## Deployment, scaling, and database

- **[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)** — production build, systemd service or Docker,
  and an Nginx/Caddy reverse proxy with WebSocket upgrade (VPS prep).
- **[`docs/SCALING.md`](docs/SCALING.md)** — measured load-test results, where the bottleneck
  is (global chat broadcast fan-out), and the path to thousands of users (Redis pub/sub +
  room sharding).
- **[`docs/DB_MIGRATION.md`](docs/DB_MIGRATION.md)** — SQLite (local) → PostgreSQL (VPS)
  strategy using the same `StoragePort` interface.

## Project status

**Working locally:** single-player; multiplayer lobby, rooms, bot-fill, real-time play, server
turn timers + timeout auto-play, reconnect, chat, SQLite persistence, and a basic load test.

**Not done yet / intentionally deferred (post-MVP):** public deployment; real-money or ranked
play; tournaments; spectator mode; horizontal scaling (Redis pub/sub, room sharding); full
per-game crash recovery; persistent cross-session player identity / accounts; in-room chat;
moderation. These are out of scope for the current local MVP.

## Contributing

Contributions are welcome. A few ground rules that keep the codebase healthy:

- **Do not mix multiplayer and single-player logic.** Multiplayer code lives in `apps/server`
  and `packages/core/multiplayer`; keep determinism and server logic there.
- **Do not change the shuffle/deal algorithm** (it is intentional game design).
- **Rules live only in `packages/core`** — don't duplicate them in the client or server.
- Add tests for multiplayer changes (core/server/shared/tools all use Vitest). Run
  `npm run typecheck && npm run test` before opening a PR.

## Full game rules

The full Domino Poker rules are available in the [`docs`](docs) folder:

- [`docs/Domino pokera Noteikumi.md`](docs/Domino%20pokera%20Noteikumi.md) — complete Latvian game rules.
- [`docs/domino_poker_rules_summary.md`](docs/domino_poker_rules_summary.md) — compact rules summary.
- [`docs/PUNKTU_SISTEMA_PIEMERI.md`](docs/PUNKTU_SISTEMA_PIEMERI.md) — scoring examples.

## License

This project is licensed under the [Apache License 2.0](LICENSE).
