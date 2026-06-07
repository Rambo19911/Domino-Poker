# Repository Overview

This repository is a Next.js + React + TypeScript monorepo for a browser-playable Domino Poker game with two modes: local single-player (vs. CPU) and authoritative real-time multiplayer.

## Purpose

Provide a four-player Domino Poker game in the browser:
- **Single-player:** one human vs. three CPU players, fully local (no backend, no account, no database).
- **Multiplayer (live):** authoritative WebSocket server with a lobby, rooms, chat, server-driven turn timers, reconnect/resume, optional account authentication/profile avatars, SQLite/PostgreSQL persistence (match event log + anonymous player stats + registered-user stats + chat history), and PostgreSQL-backed multi-instance foundations (room leases, durable sessions, cross-instance fanout). The main lobby exposes a live multiplayer entry alongside single-player, and anonymous play remains supported.

Single-player needs no external services. Multiplayer is self-hosted via the bundled `apps/server` (no third-party game/matchmaking service); persistence uses `StoragePort` with local SQLite via Node's built-in `node:sqlite` (Node ≥ 22.5) by default or PostgreSQL when `DATABASE_URL` is a `postgres://`/`postgresql://` URL. PostgreSQL mode also enables room ownership leases, durable reconnect sessions, and the LISTEN/NOTIFY-backed fanout bus between server instances. Active room state still lives in the owning Node process, so full multi-instance room failover needs room-affinity/owner routing or explicit state rehydration/command forwarding before it is production-complete.

## Main Technologies

- npm workspaces for the monorepo (`packages/core`, `packages/shared`, `apps/server`, `apps/web`).
- Next.js App Router and React for the web UI in `apps/web`.
- TypeScript for app code and pure rule logic.
- Browser `localStorage` for audio and locale preferences.
- Vitest for workspace unit tests across core, shared protocol, server, web multiplayer client helpers, simulators, and load-test tools.

## Main Folders

- `apps/web`: Next.js UI, main lobby, optional login/profile UI, localized rules/settings dialogs, single-player game screen, live multiplayer lobby/game table, MP mobile views, PWA manifest/service worker, CSS, and public game assets.
- `apps/server`: authoritative multiplayer server workspace. Current MP server includes raw HTTP `/health`, `/metrics`, and optional `/auth/*` routes; scrypt password auth with opaque DB tokens; the room engine, lobby manager, WebSocket gateway/router, lobby chat, game start/move routing, server-authoritative timers, reconnect snapshot/resume routing, room metadata (`visibility`, `numberOfRounds`, TTL), optional bot-fill on room creation, `DisplayIdRegistry`/username identity, account outcome recording, and structured `LobbyError` codes.
- `packages/core`: pure TypeScript game rules, domino hierarchy, legal-play validation, bidding, trick resolution, scoring, round flow, and CPU AI decisions.
- `packages/core/src/multiplayer`: isolated multiplayer core-adjacent helpers; currently contains seeded RNG, deterministic MP domino shuffle, MP game setup metadata, MP-only state/player/turn types, MP command/event contracts, the `applyCommand` entrypoint with deadline/timeout/auto-bid/auto-move/inactivity handling, legal move/bid helpers, read-only invariants, event replay, and privacy-safe public/per-player snapshots — all without changing the single-player shuffle/deal path.
- `packages/shared`: transport-neutral protocol shared by server and client — protocol version + compatibility check, avatar catalog, structured error codes/payload, Zod schemas for all client→server messages (including optional HELLO `authToken`), public room DTO types (`RoomSummary`/`RoomView` include `numberOfRounds`), shared room-round limits, and TypeScript types for all server→client events.
- `tools/simulators`: `@domino-poker/simulators` workspace that plays full multiplayer games through `applyCommand` with random legal bids/moves, asserting invariants after every command; backs `npm run simulate` and imports MP only via the `@domino-poker/core/multiplayer` subpath export.
- `tools/load-test`: local WebSocket load generator that speaks the real shared protocol, drives virtual clients, checks `/health`, polls `/metrics`, and reports stability/latency/server resource signals.
- `data`: local runtime data directory for the default multiplayer SQLite database (path from `DATABASE_URL`); the `*.sqlite` files here are git-ignored. PostgreSQL deployments use `DATABASE_URL=postgres://...` instead. Persistence is live (`apps/server/src/storage` + `MatchPersistence`), not reserved for the future.
- `docs`: public game rules/scoring/strategy documents plus local ignored planning/deployment/scaling/mockup notes in this working tree.
- `deploy`: production deployment examples for Docker, systemd, nginx, Caddy, and PostgreSQL backup/restore notes.
- `Screenshots`: public README screenshots for the lobby, game room, settings, and rules dialog.
- `project_context`: AI navigation notes for future work.

## Key Workflows

- Install dependencies: `npm install`
- Development server (web client, port 3000): `npm run dev`
- Multiplayer server (HTTP `/health` + `/metrics` on port 4000 by default, configurable via `HTTP_PORT`; WS on `/ws` same port): `npm run dev:server` (self-sufficient — builds `packages/core`, then `packages/shared`, then `apps/server`, then runs `node apps/server/dist/index.js`). Build order matters: the server imports `@domino-poker/shared`, so `shared` must be built before `apps/server`.
- Multiplayer simulation: `npm run simulate` (builds core + simulators, then runs random full games; configurable via `SIM_COUNT`, `SIM_SEED`, `SIM_ROUNDS`, `SIM_TIMEOUT_PROB`, `SIM_DISCONNECT_PROB`; `SIM_SUITE=1` runs the Phase 4.2 4-scenario 10000-game gate, also asserted by `volume.test.ts` and tunable with `SIM_VOLUME`).
- Local load-test: `npm run load:local -- <clients>` (builds `packages/shared` + `tools/load-test`, then drives virtual WS clients against a running server; requires `npm run dev:server` to be up first, else it exits with a clear "server unreachable" message).
- Windows launcher: `start-domino-poker.bat` — sequentially starts the multiplayer server (port 4000, waits for `/health`) then the web client (port 3000), each in its own window, then opens the browser. Override ports via `DOMINO_PORT`/`DOMINO_SERVER_PORT`.
- Typecheck all workspaces: `npm run typecheck`
- Lint: `npm run lint` (ESLint 9 flat config at repo root: `eslint.config.mjs`)
- Run tests: `npm run test`
- Run web smoke tests: `npm run test:web`
- Production build: `npm run build`

## Fragile Or High-Risk Areas

- `packages/core/src/gameState.ts`: trick winner resolution, special 0-6 ace behavior, round winner tiebreakers, dealer rotation, and configured round count.
- `packages/core/src/dominoTile.ts` + `packages/core/src/shuffleAlgorithm.ts`: `shuffleSet()` intentionally uses the shared cut-and-overhand human-style shuffle (Math.random by default), not a perfect Fisher-Yates shuffle, to preserve tile clusters and create higher hand variety.
- `packages/core/src/multiplayer/*`: deterministic MP setup, MP state wrappers, command/event contracts, and MP `applyCommand`; do not change single-player `shuffleSet()`, `createNewGame()`, `GameState`, `Player`, or deal flow when extending MP behavior.
- `packages/core/scripts/fix-esm-imports.cjs`: generic recursive postbuild that adds .js extensions to emitted relative imports; needed so `@domino-poker/core/multiplayer` resolves under Node. Keep it generic — do not revert to hardcoded module names.
- `tools/simulators/*`: simulation determinism must stay seed-driven via the MP zone RNG; never introduce Math.random/Date.now into decisions, and keep the per-command invariant, single-turn, and monotonic-turnId assertions.
- `packages/core/src/player.ts`: legal-play validation for trump leads and required-number leads.
- `packages/core/src/aiService.ts`: AI bidding/number/tile heuristics. Trick-strength prediction (`wouldWinTrick`) now shares the engine's authoritative `isStrongerTile` so it matches the real trick winner (incl. the 0-6 special tile); do not fork a separate AI-only ace comparison.
- `apps/web/components/AppShell.tsx`: main lobby, localized rules dialog, multiplayer lobby entry/transition (lobby ↔ mp-lobby), game screen switching, locale selection, and shared audio settings ownership.
- `apps/web/components/AppShell.tsx`: the lobby uses a desktop circular mode wheel and a separate compact control panel for narrow or short viewports.
- `apps/web/components/DominoPokerGame.tsx`: async AI turn timers, delayed trick completion, round end handling, and game exit behavior.
- `apps/web/components/DominoPokerGame.tsx`: the game table keeps a fixed 1920x1080 coordinate system and uses uniform contain scaling; phone portrait reflow is not part of the current layout contract.
- `apps/web/app/globals.css`: fixed 16:9 table layout and domino rendering styles.
- `apps/server`: owns HTTP health/config bootstrap and the RoomEngine; do not place single-player UI or rule logic there. `RoomEngine.dispatch` is the single state-mutation path per room — never mutate room state elsewhere; keep time server-authoritative (override command `now` with the server clock) and turn timers behind the `TurnTimerScheduler` interface.
- `apps/server` resource lifecycle (do not regress): (1) a finished game (`GAME_OVER`) destroys its room via `RoomManager.destroyFinishedRoom`, driven by `messageRouter.publishAndFinalize` on both the client- and server-initiated delivery paths — engine, timers, and membership are freed and a fresh `LOBBY_STATE` is broadcast; (2) durable sessions (`SessionManager` reconnect token + `displayId`) are released on membership loss while offline (`RoomManager.setMemberDepartedHandler` → `WebSocketGateway.releaseSession`, offline-guarded), NOT on disconnect — the token must survive disconnect for reconnect grace and wrong-token impostor rejection; (3) room creation is rate-limited per connection (`messageRouter` token-bucket) and DESTROYED room tombstones + their codes are pruned during the TTL sweep (`LobbyManager.destroyExpired`) so `create → leave → create` does not grow memory unbounded; (4) client-controlled identity strings (`clientId`/`reconnectToken`) are length-capped in the shared Zod schema (`maxIdentifierLength`).
- `data`: keep only placeholder or safe non-runtime files tracked; do not commit local `*.sqlite` databases.

- `apps/server/src/auth` + `apps/server/src/http/authRoutes.ts`: optional account layer. It must stay additive; invalid/missing auth tokens fall back to anonymous play, and `/auth/*` uses strict validation, rate limits, and CORS allowlisting via `WEB_ORIGIN`. Registration REQUIRES email (Phase 5: the only password-reset channel). Password reset by email (`/auth/forgot-password` + `/auth/reset-password`) uses single-use hashed tokens in `password_reset_tokens` (migration 0004), an atomic store method (`resetPasswordWithToken`), and the `EmailSender` abstraction (`auth/EmailSender.ts`): dev logs to console, prod sends via Resend HTTP API; if `RESEND_API_KEY` is missing in prod the feature is disabled (503), never a silent pseudo-send. The reset link carries the token in the URL hash (`#reset=`), and the client clears it via `history.replaceState`. Beigušos `auth_tokens`/`password_reset_tokens` periodically cleans up via an `index.ts` interval (6h + startup sweep). Seat avatars + win-tier titles render in SP/MP game-table seats; the Loser badge stays only in the main-lobby profile.
