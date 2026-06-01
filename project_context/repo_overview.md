# Repository Overview

This repository is a Next.js + React + TypeScript monorepo for a browser-playable local single-player Domino Poker game.

## Purpose

Provide a four-player Domino Poker game in the browser: one human player against three CPU players, configurable round count, shared audio controls, locale switching, localized rules dialog, and a disabled multiplayer entry in the main lobby.

The project must run without external game, account, database, deployment, or matchmaking services.

## Main Technologies

- npm workspaces for the monorepo (`packages/core`, `packages/shared`, `apps/server`, `apps/web`).
- Next.js App Router and React for the web UI in `apps/web`.
- TypeScript for app code and pure rule logic.
- Browser `localStorage` for audio and locale preferences.
- Vitest for pure rule tests in `packages/core`.

## Main Folders

- `apps/web`: Next.js UI, main lobby, localized rules dialog, single-player game screen, multiplayer lobby screen (layout preview), settings dialog, CSS, and public game assets.
- `apps/server`: authoritative multiplayer server workspace. Current MP server includes the room engine, lobby manager, WebSocket gateway/router, lobby chat, game start/move routing, server-authoritative timers, reconnect snapshot/resume routing, room metadata (`visibility`, `numberOfRounds`, TTL), optional bot-fill on room creation, `DisplayIdRegistry` identity, and structured `LobbyError` codes.
- `packages/core`: pure TypeScript game rules, domino hierarchy, legal-play validation, bidding, trick resolution, scoring, round flow, and CPU AI decisions.
- `packages/core/src/multiplayer`: isolated multiplayer core-adjacent helpers; currently contains seeded RNG, deterministic MP domino shuffle, MP game setup metadata, MP-only state/player/turn types, MP command/event contracts, the `applyCommand` entrypoint with deadline/timeout/auto-bid/auto-move/inactivity handling, legal move/bid helpers, read-only invariants, event replay, and privacy-safe public/per-player snapshots — all without changing the single-player shuffle/deal path.
- `packages/shared`: transport-neutral WebSocket protocol shared by server and client — protocol version + compatibility check, structured error codes/payload, Zod schemas for all client→server messages, public room DTO types (`RoomSummary`/`RoomView` include `numberOfRounds`), shared room-round limits, and TypeScript types for all server→client events.
- `tools/simulators`: `@domino-poker/simulators` workspace that plays full multiplayer games through `applyCommand` with random legal bids/moves, asserting invariants after every command; backs `npm run simulate` and imports MP only via the `@domino-poker/core/multiplayer` subpath export.
- `data`: local runtime data directory reserved for future SQLite files; SQLite files under this folder are ignored.
- `docs`: game rules, scoring notes, and strategy documents.
- `Screenshots`: public README screenshots for the lobby, game room, settings, and rules dialog.
- `project_context`: AI navigation notes for future work.

## Key Workflows

- Install dependencies: `npm install`
- Development server (web client, port 3000): `npm run dev`
- Multiplayer server (HTTP `/health` on port 4000 by default, configurable via `HTTP_PORT`/`WS_PORT`): `npm run dev:server` (self-sufficient — builds `packages/core` then `apps/server`, then runs `node apps/server/dist/index.js`)
- Multiplayer simulation: `npm run simulate` (builds core + simulators, then runs random full games; configurable via `SIM_COUNT`, `SIM_SEED`, `SIM_ROUNDS`, `SIM_TIMEOUT_PROB`, `SIM_DISCONNECT_PROB`; `SIM_SUITE=1` runs the Phase 4.2 4-scenario 10000-game gate, also asserted by `volume.test.ts` and tunable with `SIM_VOLUME`).
- Local load-test command currently exists as a placeholder: `npm run load:local`
- Windows launcher: `start-domino-poker.bat` — sequentially starts the multiplayer server (port 4000, waits for `/health`) then the web client (port 3000), each in its own window, then opens the browser. Override ports via `DOMINO_PORT`/`DOMINO_SERVER_PORT`.
- Typecheck all workspaces: `npm run typecheck`
- Run tests: `npm run test`
- Run web smoke tests: `npm run test:web`
- Production build: `npm run build`

## Fragile Or High-Risk Areas

- `packages/core/src/gameState.ts`: trick winner resolution, special 0-6 ace behavior, round winner tiebreakers, dealer rotation, and configured round count.
- `packages/core/src/dominoTile.ts`: `shuffleSet()` intentionally uses an imperfect human-style shuffle, not a perfect Fisher-Yates shuffle, to preserve tile clusters and create higher hand variety.
- `packages/core/src/multiplayer/*`: deterministic MP setup, MP state wrappers, command/event contracts, and MP `applyCommand`; do not change single-player `shuffleSet()`, `createNewGame()`, `GameState`, `Player`, or deal flow when extending MP behavior.
- `packages/core/scripts/fix-esm-imports.cjs`: generic recursive postbuild that adds .js extensions to emitted relative imports; needed so `@domino-poker/core/multiplayer` resolves under Node. Keep it generic — do not revert to hardcoded module names.
- `tools/simulators/*`: simulation determinism must stay seed-driven via the MP zone RNG; never introduce Math.random/Date.now into decisions, and keep the per-command invariant, single-turn, and monotonic-turnId assertions.
- `packages/core/src/player.ts`: legal-play validation for trump leads and required-number leads.
- `packages/core/src/aiService.ts`: intentionally preserves original AI heuristics, including its simpler trick-strength comparison.
- `apps/web/components/AppShell.tsx`: main lobby, localized rules dialog, multiplayer lobby entry/transition (lobby ↔ mp-lobby), game screen switching, locale selection, and shared audio settings ownership.
- `apps/web/components/AppShell.tsx`: the lobby uses a desktop circular mode wheel and a separate compact control panel for narrow or short viewports.
- `apps/web/components/DominoPokerGame.tsx`: async AI turn timers, delayed trick completion, round end handling, and game exit behavior.
- `apps/web/components/DominoPokerGame.tsx`: the game table keeps a fixed 1920x1080 coordinate system and uses uniform contain scaling; phone portrait reflow is not part of the current layout contract.
- `apps/web/app/globals.css`: fixed 16:9 table layout and domino rendering styles.
- `apps/server`: owns HTTP health/config bootstrap and the RoomEngine; do not place single-player UI or rule logic there. `RoomEngine.dispatch` is the single state-mutation path per room — never mutate room state elsewhere; keep time server-authoritative (override command `now` with the server clock) and turn timers behind the `TurnTimerScheduler` interface.
- `data`: keep only placeholder or safe non-runtime files tracked; do not commit local `*.sqlite` databases.
