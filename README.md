# Domino Poker

**Play Domino Poker free in your browser — no download, no sign-up required.** Take on a
strong trained AI offline, or jump into real-time tables with up to four players. Earn gold
coins, climb a global leaderboard, unlock animated themes, and play in your own language —
all in a fast, installable web app that works on desktop and mobile.

**▶ Play it live: [domino-poker.com](https://domino-poker.com/)**

![Domino Poker main menu](Screenshots/main-menu.png)

> **Status.** This is the live `main` codebase behind
> [domino-poker.com](https://domino-poker.com/) — a complete, playable game that is actively
> maintained and refined. It is built and maintained by a **single developer, in their spare
> time**. Contributions are welcome (see [Contributing](#contributing)).

## Why you'll like it

- 🀰 **A real card-game brain, in dominoes.** Domino Poker is a trick-taking game: bid how many
  of the seven tricks you'll win, then fight for them using trump, ace, and follow-number
  rules. Easy to learn, deep to master.
- 🤖 **A genuinely strong opponent.** Single-player runs a *trained* ISMCTS bot with three
  difficulty levels — **Medium / Hard / Epic**. Even Epic players get a real challenge. It
  runs entirely in your browser, fully offline.
- 🌐 **Real-time multiplayer.** Create or join a room for 2–4 humans, fill empty seats with
  bots, and play live against an authoritative server with per-turn timers, auto-reconnect,
  and lobby chat.
- 🪙 **A gold-coin economy.** Register to claim a welcome bonus, earn coins by winning
  single-player games, and ante up in paid multiplayer rooms where the prize pot goes to the
  top finishers. Anonymous play always stays free and unaffected.
- 🎨 **Unlockable themes.** Spend your coins in the in-game store on six animated background
  themes — *Twilight, Rain Drops, Pop Out, Confetti, Bubbles, Luminous*. Pure cosmetics: **no
  real money, no pay-to-win.**
- 🏆 **Profiles, leaderboard & stats.** Pick an avatar, earn a title, and track your lifetime
  record. A global leaderboard ranks the best players, and a personal statistics panel breaks
  down your bidding accuracy and finishing positions.
- 🗣️ **Play in 21 languages.** The full UI is localized, and lobby chat can be **translated
  live** so players around the table understand each other.
- 📱 **Installable & responsive.** Add it to your home screen as a PWA; it adapts cleanly from
  phones to widescreen desktops.

## Two ways to play

Both modes share **one rules engine**, so the game plays identically everywhere.

- **Single-player** (offline, in the browser): one human vs. three CPU players driven by a
  **trained ISMCTS bot** (`packages/ai_bot`, also published standalone as
  [Domino_Poker_MAX_BOT](https://github.com/Rambo19911/Domino_Poker_MAX_BOT)). Switch
  difficulty — **Medium / Hard / Epic** — in **Settings**. No server needed; the bot runs
  off-thread in a Web Worker so the UI stays smooth.
- **Multiplayer** (Node server): 2–4 humans in a room (the host can fill empty seats with
  bots), playing in real time against an authoritative server. Optional **accounts** add a
  persistent profile, win/loss stats, the gold-coin wallet, and a global leaderboard.

## An original game

Domino Poker's ruleset is **original** — designed from scratch by the project's author and not
copied from any published game, so you won't find these exact rules anywhere online. If you
have played **Texas 42**, you'll spot the family resemblance: the two games overlap by roughly
**60%** (trick-taking on a double-six set with bidding and trumps), but the bidding, scoring,
and special-tile rules here are their own thing.

## Screenshots

**Single-player — you vs. the trained AI**

| Bidding | A trick in play |
| --- | --- |
| <img src="Screenshots/gameplay-bidding.png" alt="Single-player table: choosing how many tricks to bid" width="100%"> | <img src="Screenshots/gameplay-trick.png" alt="Single-player table mid-trick with the trump shown" width="100%"> |

**Multiplayer lobby & rooms**

| Lobby, rooms & live chat |
| --- |
| <img src="Screenshots/multiplayer-lobby.png" alt="Multiplayer lobby with public/private rooms and online chat" width="100%"> |

**Accounts, profile & competition**

| Profile & avatars | Leaderboard | Your statistics |
| --- | --- | --- |
| <img src="Screenshots/profile-avatars.png" alt="Player profile with avatar picker" width="100%"> | <img src="Screenshots/leaderboard.png" alt="Global leaderboard ranked by win rate" width="100%"> | <img src="Screenshots/statistics.png" alt="Personal statistics: bid accuracy and placement" width="100%"> |

**Coins, store & settings**

| Theme store | Settings, difficulty & language |
| --- | --- |
| <img src="Screenshots/store-themes.png" alt="In-game store with six animated themes to unlock for coins" width="100%"> | <img src="Screenshots/settings.png" alt="Settings: difficulty, audio, and language selection" width="100%"> |

**Learn the game**

| Multiplayer rules | Single-player quick rules |
| --- | --- |
| <img src="Screenshots/rules-multiplayer.png" alt="Multiplayer game rules dialog" width="100%"> | <img src="Screenshots/rules-singleplayer.png" alt="Single-player quick rules reference" width="100%"> |

## Gold coins, paid rooms & the store

Play is anonymous and free by default. Registered accounts get an **optional gold-coin
economy** on top, kept fully **server-authoritative** so it can't be cheated:

- **Welcome bonus** on registration, plus coins awarded for winning **single-player** games
  (more for higher difficulty).
- **Paid multiplayer rooms**: a host can set an entry fee; each seated player pays it, and the
  prize pot is split **70/30** between the top two registered human finishers (bots and
  players who forfeit are excluded).
- **In-game store** (a coin *sink*, never real money): unlock six animated themes for a flat
  price each. Owned themes are tied to your account.

Anonymous users have no wallet, can't join paid rooms, and earn nothing — the free game is
never gated behind coins, and there is **no pay-to-win**: every cosmetic is just for looks.

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

The multiplayer work lives in a **separate zone** so it never mixes with the proven
single-player rules. Highlights:

- **Authoritative server** (`apps/server`): the server owns all game state and is the single
  source of truth. Clients send only *intent* (bid/move) and render server snapshots — they
  can't decide whether an action is accepted, so they can't cheat or desync the table.
- **Lobby + rooms**: create public/private rooms, join by list or code, choose seats, fill
  empty seats with bots, and start. Rooms have a 1-hour TTL.
- **Real-time WebSocket protocol**: a small typed protocol (`packages/shared`) with a strict
  validate-then-route pipeline, HELLO handshake, protocol-version check, and heartbeat.
- **Server-driven turn timers**: each turn has a countdown (default 10s, configurable). If a
  player doesn't act in time, the server auto-plays a legal move so the game never stalls.
- **Reconnect & resilience**: the client auto-reconnects with backoff; the server keeps a
  reconnect token and restores the player's room/seat and a fresh snapshot. Abandoned rooms
  are cleaned up.
- **Lobby chat with live translation**: rate-limited (token bucket) chat, broadcast to
  everyone online, with optional server-side translation (Google Cloud Translation).
- **Persistence (SQLite or PostgreSQL)**: match start (with seed), an append-only event log,
  match results, coins, player stats, and lobby chat are stored through `StoragePort`.
- **Determinism**: the multiplayer deck is shuffled from a seed, so a match is fully
  reproducible from its seed + event log (replay, recovery, fairness auditing).
- **Load-tested**: a local load-test tool drives hundreds–thousands of virtual clients; the
  server is hardened against broadcast-fanout overload (debounce + backpressure + single-pass
  serialization).

Key design rules (please preserve these when contributing):

- **One source of rules.** All game logic lives in `packages/core`. The server and clients
  must not reimplement rules locally. The multiplayer engine reuses core rules through a
  dedicated `core/multiplayer` zone; the web client may call shared core helpers only for
  non-authoritative display hints, never to accept or reject a move.
- **Single-writer per room.** Every state change for a room goes through `RoomEngine.dispatch`
  (serialized). This is the only place room state mutates.
- **Server is the time, state & money authority.** The server overrides client timestamps,
  assigns event sequence numbers, decides acceptance, and owns every coin balance change
  (atomic, idempotent ledger). Clients render snapshots and display balances; they never
  decide them.
- **Multiplayer determinism stays in the multiplayer zone.** Single-player uses `Math.random`;
  multiplayer uses a seeded RNG so games are reproducible. These are intentionally separate.
- **Persistence is DB-agnostic and async.** `StoragePort` is a `Promise`-based interface.
  `DATABASE_URL` selects SQLite file paths/`:memory:` or PostgreSQL URLs (`postgres://` /
  `postgresql://`) without changing server call sites.
- **PostgreSQL multi-instance mode is a foundation, not full failover.** It provides shared
  storage, durable reconnect sessions, room ownership leases, and cross-instance fanout.
  Active room state still lives in the owning Node process, so production multi-instance
  deploys need room-affinity/owner routing before claiming per-game crash failover.

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
- **Node.js** authoritative server using the **`ws`** library, built-in **`node:sqlite`**,
  optional **PostgreSQL** via `pg`, and optional **Google Cloud Translation** for lobby chat.
- **TypeScript** across the web app, server, rules engine, AI bot, and tools.
- **Web Worker** to run the single-player ISMCTS bot off the main thread.
- **npm workspaces** for the monorepo.
- **Vitest** for core, server, shared, and tool tests; **Playwright** for web e2e.
- **Zod** for protocol message validation.

## Repository structure

```text
apps/web         Next.js web app: single-player game, multiplayer lobby/table UI, auth/profile,
                 coins, store, 21-language UI, PWA
apps/server      Authoritative multiplayer server (gateway, rooms, timers, storage, chat,
                 auth, wallet, stats)
apps/admin       Separate internal "Game Manager" portal (players, moderation, analytics)
packages/core    Pure TypeScript rules, scoring, state, AI — incl. the `multiplayer/` zone
packages/shared  Protocol contracts + single-source economy constants — one source of truth
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

- **Node.js 24+** (pinned in `.nvmrc`/`.node-version`; required by `geoip-lite`, and the
  default SQLite storage uses the built-in `node:sqlite` which needs Node 22.5+)
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

Open the local URL printed by Next.js. Choose **Single Player** for the offline table.

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

Optional PostgreSQL storage integration check, against an already running database:

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
round-trips, atomic coin/player-stat increments, durable reconnect sessions, room ownership
leases, and the PostgreSQL LISTEN/NOTIFY-backed fanout bus used between server instances.
Without `TEST_POSTGRES_DATABASE_URL`, the integration specs are skipped by the normal suite.

### Troubleshooting workspace links

This repo uses npm workspaces. On Windows, if a previous install was interrupted, the
workspace entries under `node_modules/@domino-poker/*` can occasionally end up as empty
regular folders instead of workspace junctions. Builds then fail with misleading errors such
as `Cannot find module '@domino-poker/shared'` or `Cannot find module
'@domino-poker/core/multiplayer'`.

First repair the install from the repo root, then verify the workspace packages resolve again:

```bash
npm install
npm ls --depth=0 --workspaces
```

CI or other clean environments should prefer `npm ci` so dependency installation starts from
a fresh lockfile-based state.

## Project status

**Working:** single-player vs. trained AI (3 difficulties); multiplayer lobby, rooms,
bot-fill, real-time play, server turn timers + timeout auto-play, reconnect; lobby chat with
live translation; SQLite/PostgreSQL persistence; a local load test; optional accounts with
profiles, avatars, stats, and a global leaderboard; the gold-coin economy (welcome bonus,
single-player rewards, paid multiplayer rooms with 70/30 pot split); an in-game cosmetics
store with six animated themes; deep per-player statistics; a 21-language UI; email-based
password reset; an internal admin/moderation portal; an installable PWA with a responsive
desktop/mobile UI.

**Not done yet / intentionally deferred (post-MVP):** ranked matchmaking;
tournaments; spectator mode; full horizontal scaling with active room failover; in-room (table)
chat; trained AI bots in multiplayer (the server still uses the lightweight heuristic bot).

## Contributing

Contributions are welcome. A few ground rules that keep the codebase healthy:

- **Do not mix multiplayer and single-player logic.** Multiplayer code lives in `apps/server`
  and `packages/core/multiplayer`; keep determinism and server logic there.
- **Do not change the shuffle/deal algorithm** (it is intentional game design).
- **Rules live only in `packages/core`** — don't reimplement them in the client or server.
  Client-side rule helper use is allowed only for non-authoritative UI hints; the server still
  validates and rejects illegal actions.
- **The economy is server-authoritative.** All coin changes flow through the wallet's atomic,
  idempotent ledger; `packages/shared/src/economy.ts` is the single source for amounts/splits.
  The web only displays balances.
- Add tests for changes (core/server/shared/tools all use Vitest). Run
  `npm run typecheck && npm run test` before opening a PR.

> **Note for would-be contributors.** Several files that affect how the game runs on the
> **server** are intentionally **gitignored** (deployment, scaling, environment, and internal
> design notes), so a clean clone does not contain everything needed for a full production
> deploy. If you're serious about helping with development, get in touch first — including
> through the in-game **Settings → About** contact form — and the relevant pieces can be
> shared.

## Full game rules

The full Domino Poker rules are available in the [`docs`](docs) folder:

- [`docs/Domino pokera Noteikumi.md`](docs/Domino%20pokera%20Noteikumi.md) — complete Latvian game rules.
- [`docs/domino_poker_rules_summary.md`](docs/domino_poker_rules_summary.md) — compact rules summary.
- [`docs/PUNKTU_SISTEMA_PIEMERI.md`](docs/PUNKTU_SISTEMA_PIEMERI.md) — scoring examples.

A deeper **tactical guide** — describing ways to influence the flow of a game — also exists,
but it is kept private and is not published in this repository.

## License

This project is licensed under the [Apache License 2.0](LICENSE).
