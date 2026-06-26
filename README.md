# Domino Poker

Browser-playable **Domino Poker** built with Next.js, React, and TypeScript. The game
started as a local single-player table (one human vs. three bots on a double-six set) and
has grown into a full product: a **strong trained AI opponent** for offline play, an
**authoritative real-time multiplayer server** for up to four players over WebSocket, and
**player accounts, profiles, and a global leaderboard**. It is installable as a PWA and
fully responsive on desktop and mobile.

**▶ Play it live: [domino-poker.com](https://domino-poker.com/)**

![Domino Poker lobby](Screenshots/Lobby-screen.png)

> **Status.** This is the live `main` codebase behind
> [domino-poker.com](https://domino-poker.com/). It is a complete, playable game (single-player
> vs. AI, and 2–4 human multiplayer with optional bot-fill) and is still being refined.
> Contributions are welcome (see [Contributing](#contributing)).

## Overview

Domino Poker is a trick-taking domino game where each round starts with bidding, then players
compete across seven tricks. The goal is to score the most points by predicting how many
tricks you will win and playing your tiles according to the trump, ace, and follow-number
rules.

This repository contains two ways to play, sharing one rules engine:

- **Single-player** (offline, in the browser): one human vs. three CPU players driven by a
  **trained ISMCTS bot** (`packages/ai_bot`, published standalone as
  [Domino_Poker_MAX_BOT](https://github.com/Rambo19911/Domino_Poker_MAX_BOT)) with three
  difficulty levels — **Medium / Hard / Epic** — that you switch in **Settings**. No server
  needed; the bot runs off-thread in a Web Worker.
- **Multiplayer** (Node server): 2–4 humans in a room (the host can fill empty seats with
  bots), playing in real time against an authoritative server. Optional **accounts** add a
  persistent profile, win/loss stats, and a global leaderboard.

> **Bot difficulty** is configurable: open **Settings** and pick **Medium**, **Hard**, or
> **Epic** to set how strong the single-player CPU opponents play.

## What's in this update (multiplayer)

The multiplayer work is implemented as a **separate zone** so it never mixes with the proven
single-player rules. Highlights:

- **Authoritative server** (`apps/server`): the server owns all game state and is the single
  source of truth. Clients only send *intent* (bid/move) and render server snapshots — they
  do not decide whether an action is accepted, so they cannot cheat or desync the table.
  The web client may reuse `packages/core` only for non-authoritative UI hints such as
  highlighting playable tiles.
- **Lobby + rooms**: create public/private rooms, join by list or code, choose seats, host can
  fill empty seats with bots and start the game. Rooms have a 1-hour TTL.
- **Real-time WebSocket protocol**: a small typed protocol (`packages/shared`) with a strict
  validate-then-route pipeline, HELLO handshake, protocol-version check, and heartbeat.
- **Server-driven turn timers**: each turn has a countdown (default 10s, configurable). If a
  player doesn't act in time, the server auto-plays a legal move so the game never stalls.
- **Reconnect & resilience**: the client auto-reconnects with backoff; the server keeps a
  reconnect token and restores the player's room/seat and a fresh snapshot. Disconnected
  seats keep playing via timeout auto-play; abandoned rooms are cleaned up.
- **Persistence (SQLite or PostgreSQL)**: match start (with seed), an append-only event log,
  match results, basic player stats, and lobby chat are stored through `StoragePort`; lobby
  chat survives a server restart.
- **Lobby chat**: rate-limited (token bucket), broadcast to everyone online.
- **Determinism**: the multiplayer deck is shuffled from a seed, so a match is fully
  reproducible from its seed + event log (replay, recovery, fairness auditing).
- **Load-tested**: a local load-test tool drives hundreds–thousands of virtual clients; the
  server is hardened against broadcast-fanout overload (debounce + backpressure + single-pass
  serialization).

The single-player game still works fully offline; its CPU seats are now powered by the trained
bot rather than the original heuristics.

## Accounts, profiles & leaderboard

Play is anonymous by default — single-player and multiplayer both work with no account. On top
of that, an **optional account layer** adds:

- **Register / log in** with a username and password, plus **email-based password reset**.
- A **player profile**: avatar, title (e.g. *Champion*), and lifetime stats — wins, losses,
  games played, and win rate.
- A **global leaderboard** ranking the top players by win rate.

Accounts are additive: the server stays authoritative, and anonymous play keeps working
exactly as before.

## Screenshots

**Main menu — desktop & mobile**

| Desktop | Mobile |
| --- | --- |
| <img src="Screenshots/menu-desktop.png" alt="Domino Poker desktop main menu" width="100%"> | <img src="Screenshots/menu-mobile.png" alt="Domino Poker mobile main menu" width="55%"> |

**Accounts & leaderboard**

| Log in / register | Leaderboard | Player profile |
| --- | --- | --- |
| <img src="Screenshots/auth-login.png" alt="Log in and register dialog" width="100%"> | <img src="Screenshots/leaderboard-desktop.png" alt="Leaderboard ranked by win rate" width="100%"> | <img src="Screenshots/profile-card.png" alt="Player profile with stats" width="100%"> |

**Multiplayer lobby & rooms**

| Lobby (desktop) | Create room | Lobby (mobile) |
| --- | --- | --- |
| <img src="Screenshots/lobby-desktop.png" alt="Multiplayer lobby" width="100%"> | <img src="Screenshots/create-room.png" alt="Create room dialog" width="100%"> | <img src="Screenshots/lobby-mobile.png" alt="Multiplayer lobby on mobile" width="60%"> |

**Single-player table**

| Game in progress (mobile) | Settings | Game rules |
| --- | --- | --- |
| <img src="Screenshots/singleplayer-table-mobile.png" alt="Single-player table with AI opponents" width="60%"> | <img src="Screenshots/settings-screen.png" alt="Domino Poker settings" width="100%"> | <img src="Screenshots/gamerules-screen.png" alt="Domino Poker rules dialog" width="100%"> |

## How multiplayer works (architecture)

```
   Browser (apps/web)                 Node server (apps/server)
 ┌────────────────────┐   WebSocket   ┌──────────────────────────────┐
 │ React UI           │  /ws (JSON)   │ Gateway (validate + route)   │
 │ MultiplayerClient  │ ────────────▶ │ RoomManager / LobbyManager   │
 │  - sends intent    │ ◀──────────── │ RoomEngine (single-writer)   │
 │  - renders snapshot│   snapshots   │   → core rules (packages/core)│
└────────────────────┘   + events    │ StoragePort → SQLite/Postgres │
                                       └──────────────────────────────┘
```

Key design rules (please preserve these when contributing):

- **One source of rules.** All game logic lives in `packages/core`. The server and clients
  must not reimplement rules locally. The multiplayer engine reuses the core rules through a
  dedicated `core/multiplayer` zone; the web client may call shared core helpers only for
  non-authoritative display hints, never to accept or reject a move.
- **Single-writer per room.** Every state change for a room goes through `RoomEngine.dispatch`
  (serialized). This is the only place room state mutates.
- **Server is the time + state authority.** The server overrides client-supplied timestamps,
  assigns event sequence numbers, and decides acceptance — clients render snapshots and may
  derive UI-only hints from shared core helpers.
- **Multiplayer determinism stays in the multiplayer zone.** The single-player code uses
  `Math.random`; the multiplayer code uses a seeded RNG so games are reproducible. These are
  intentionally separate.
- **Persistence is DB-agnostic and async.** `StoragePort` is a `Promise`-based interface.
  `DATABASE_URL` selects SQLite file paths/`:memory:` or PostgreSQL URLs (`postgres://` /
  `postgresql://`) without changing server call sites.
- **PostgreSQL multi-instance mode is a foundation, not full failover.** PostgreSQL provides
  shared storage, durable reconnect sessions, room ownership leases, and cross-instance
  fanout. Active room state still lives in the owning Node process, so production
  multi-instance deploys need room-affinity/owner routing or explicit state rehydration
  before claiming per-game crash failover.

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

- **Next.js App Router 16** + **React 19** for the web client, served as an installable **PWA**.
- **Node.js** authoritative server using the **`ws`** library, built-in **`node:sqlite`**, and
  optional **PostgreSQL** via `pg`.
- **TypeScript** across the web app, server, rules engine, AI bot, and tools.
- **Web Worker** to run the single-player ISMCTS bot off the main thread.
- **npm workspaces** for the monorepo.
- **Vitest** for core, server, shared, and tool tests; **Playwright** for web e2e.
- **Zod** for protocol message validation.

## Repository structure

```text
apps/web         Next.js web app: single-player game, multiplayer lobby/table UI, auth/profile, PWA
apps/server      Authoritative multiplayer server (gateway, rooms, timers, storage, chat, auth)
packages/core    Pure TypeScript rules, scoring, state, AI — incl. the `multiplayer/` zone
packages/shared  Protocol contracts (client/server messages, room DTOs) — single source
packages/ai_bot  Trained single-player bot (ISMCTS); `engine` + `ai` consumed by apps/web
                 (standalone repo: github.com/Rambo19911/Domino_Poker_MAX_BOT)
tools/simulators Headless full-game simulator (determinism + invariant stress tests)
tools/load-test  Local WebSocket load generator (npm run load:local)
deploy           Deployment examples (Dockerfile, systemd, nginx, Caddy, backups)
docs             Rules, scoring examples, and design notes
Screenshots      Public README screenshots
```

## Getting started

### Prerequisites

- **Node.js 24+** (pinned in `.nvmrc`/`.node-version`; required by `geoip-lite`, and the default SQLite storage uses the built-in `node:sqlite` which needs Node 22.5+)
- **npm**
- Optional: **PostgreSQL** if `DATABASE_URL` is a `postgres://` or `postgresql://` URL.

### Installation

```bash
npm install
```

### Quick start on Windows (one click)

On Windows you can launch the whole game with the bundled batch script instead of running npm
commands by hand — just double-click it (or run it from the repo root):

```bat
start-domino-poker.bat
```

It will:

- check that **Node.js** and **npm** are installed,
- run `npm install` automatically on the first run,
- free ports `3000` (web) and `4000` (server) if they are busy,
- start the **multiplayer server** and the **web client** in separate windows, and
- open the game at `http://127.0.0.1:3000` once both are ready (so single-player **and**
  multiplayer work).

Optional environment overrides: `DOMINO_PORT` (web, default `3000`), `DOMINO_SERVER_PORT`
(server, default `4000`), `DOMINO_HOST`, `DOMINO_SERVER_HOST`, `DOMINO_WAIT_SECONDS` (startup
timeout, default `90`), and `DOMINO_NO_OPEN=1` to skip auto-opening the browser. Close the two
spawned windows to stop the game.

On macOS/Linux (or if you prefer running things manually), use the steps below.

### Run single-player (browser only)

```bash
npm run dev
```

Open the local URL printed by Next.js. Choose **Play** for the single-player table.

### Run multiplayer locally (server + web)

Open two terminals from the repo root:

```bash
# Terminal 1 — authoritative server (builds core → shared → server, then runs on port 4000)
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

## Available scripts

```bash
npm run dev          # Web app (single-player + multiplayer UI) in dev mode
npm run dev:server   # Build core → shared → server and run the authoritative MP server
npm run build        # Build all workspaces
npm run test         # Run unit tests across workspaces (core, server, shared, tools)
npm run typecheck    # TypeScript checks for all workspaces
npm run simulate     # Headless full-game simulations (determinism + invariants)
npm run load:local   # Local load test against a running server (e.g. -- 100)
npm run test:web     # Playwright web e2e tests
npm run test:postgres:docker # Start disposable Docker PostgreSQL, run Postgres integration tests, clean up
```

Optional PostgreSQL storage integration check:

```bash
npm run test:postgres:docker
```

Or, against an already running PostgreSQL database:

```bash
TEST_POSTGRES_DATABASE_URL=postgres://user:password@localhost:5432/domino_test \
  npm run test:postgres --workspace apps/server
```

PowerShell:

```powershell
$env:TEST_POSTGRES_DATABASE_URL = "postgres://user:password@localhost:5432/domino_test"
npm run test:postgres --workspace apps/server
```

The tests create and drop their own schemas inside that database and verify PostgreSQL storage
round-trips, atomic player-stat increments, durable reconnect sessions, room ownership leases,
and the PostgreSQL LISTEN/NOTIFY-backed fanout bus used between server instances. Without
`TEST_POSTGRES_DATABASE_URL`, the integration specs are skipped by the normal test suite.

### Troubleshooting workspace links

This repo uses npm workspaces. On Windows, if a previous install was interrupted, the
workspace entries under `node_modules/@domino-poker/*` can occasionally end up as empty
regular folders instead of workspace junctions. Builds then fail with misleading errors such
as `Cannot find module '@domino-poker/shared'` or `Cannot find module
'@domino-poker/core/multiplayer'`.

First repair the install from the repo root:

```bash
npm install
```

Then verify that the workspace packages resolve again:

```bash
npm ls --depth=0 --workspaces
```

CI or other clean environments should prefer `npm ci` so dependency installation starts from
a fresh lockfile-based state.

## Project status

**Working:** single-player vs. trained AI (3 difficulties); multiplayer lobby, rooms, bot-fill,
real-time play, server turn timers + timeout auto-play, reconnect, lobby chat,
SQLite/PostgreSQL persistence, a basic load test; optional accounts with profiles, stats, and a
global leaderboard; email-based password reset; installable PWA and responsive desktop/mobile UI.

**Not done yet / intentionally deferred (post-MVP):** real-money play; ranked matchmaking;
tournaments; spectator mode; full horizontal scaling with active room failover; in-room (table)
chat; moderation; AI bots in multiplayer (the server still uses the lightweight heuristic bot).

## Contributing

Contributions are welcome. A few ground rules that keep the codebase healthy:

- **Do not mix multiplayer and single-player logic.** Multiplayer code lives in `apps/server`
  and `packages/core/multiplayer`; keep determinism and server logic there.
- **Do not change the shuffle/deal algorithm** (it is intentional game design).
- **Rules live only in `packages/core`** — don't reimplement them in the client or server.
  Client-side rule helper use is allowed only for non-authoritative UI hints; the server still
  validates and rejects illegal actions.
- Add tests for multiplayer changes (core/server/shared/tools all use Vitest). Run
  `npm run typecheck && npm run test` before opening a PR.

## Full game rules

The full Domino Poker rules are available in the [`docs`](docs) folder:

- [`docs/Domino pokera Noteikumi.md`](docs/Domino%20pokera%20Noteikumi.md) — complete Latvian game rules.
- [`docs/domino_poker_rules_summary.md`](docs/domino_poker_rules_summary.md) — compact rules summary.
- [`docs/PUNKTU_SISTEMA_PIEMERI.md`](docs/PUNKTU_SISTEMA_PIEMERI.md) — scoring examples.

## License

This project is licensed under the [Apache License 2.0](LICENSE).
