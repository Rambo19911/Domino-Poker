# Repository Overview

Last refreshed: 2026-06-14.

## Purpose

Domino Poker is an npm-workspace TypeScript monorepo for a browser-playable Domino Poker game.

It has two game modes:

- Single-player: browser-only local game, one human against three CPU players.
- Multiplayer: authoritative real-time server over WebSocket, with lobby rooms, chat, reconnect/resume, turn timers, optional accounts/profiles, SQLite persistence by default, and PostgreSQL persistence/fanout foundations for multi-instance deployments.

The core rule engine is shared. The browser may derive UI hints from shared logic, but authoritative multiplayer decisions belong to the server.

## Main Technologies

- npm workspaces.
- TypeScript 6.x across core, shared protocol, server, web, and tools.
- Next.js App Router 16.x and React 19.x for `apps/web`.
- Node.js server in `apps/server`, using `ws`, `zod`, built-in `node:sqlite`, and optional `pg`.
- Vitest for workspace tests.
- Playwright for browser e2e/smoke tests.
- ESLint 9 flat config with TypeScript and React Hooks rules.

Node is pinned/restricted through `.nvmrc`, `.node-version`, `package.json` engines, and `.npmrc` engine-strict. Node 22.5+ is required; Node 24 is the pinned local/CI/deploy runtime.

## Workspace Layout

- `apps/web`: Next.js app, main route, PWA shell, local single-player UI, multiplayer lobby/table UI, auth/profile UI, localization, shared UI primitives, theme tokens, CSS partials, public assets, and web-focused Vitest tests.
- `apps/server`: authoritative multiplayer server, HTTP `/health` and `/metrics`, optional `/auth/*`, WebSocket `/ws`, gateway/hub/fanout, room/lobby lifecycle, game timers/directors, chat, auth, sessions/identity, storage adapters, PostgreSQL event bus, and server tests.
- `packages/core`: framework-free Domino Poker rules, tile/shuffle logic, legal-play validation, scoring, single-player game state, AI heuristics, plus the separate `packages/core/src/multiplayer` command/event state machine.
- `packages/shared`: public protocol package. It owns Zod client-message validation, protocol versioning, room DTOs, error payloads, avatar/title helpers, and server-event schemas. Important coupling: `serverEvents.ts` imports core multiplayer event/snapshot types from `@domino-poker/core/multiplayer`.
- `packages/ai_bot`: standalone strong Domino Poker bot (hidden-hand, ISMCTS max^n) as its own pnpm workspace (sub-packages `engine`, `ai`, `bot-adapter`). Intended to LATER replace the current AI bots; not yet wired into the live game. It is NOT a root npm workspace member (root install/build/CI ignore it) and uses pnpm. Integration surface: `@domino-poker/bot-adapter` → `AiClient`.
- `tools/simulators`: headless full-game simulator for multiplayer core determinism/invariants.
- `tools/load-test`: local WebSocket load generator that speaks the real shared protocol against a running server.
- `tests/e2e`: Playwright tests for single-player flow, multiplayer smoke, layout, dialog accessibility, and storage resilience.
- `deploy`: tracked deployment examples for Docker, systemd, nginx, Caddy, and backups.
- `docs`: only four public rules/strategy docs are tracked. Local deployment/scaling/DB/TODO/mockup notes may exist in this working tree but are ignored by `.gitignore`.
- `data`: tracked `.gitkeep` plus ignored local SQLite runtime files.
- `project_context`: this AI navigation layer.

## Key Entrypoints

- Web route: `apps/web/app/page.tsx` renders `AppShell`.
- Web root layout/PWA/version: `apps/web/app/layout.tsx`, `apps/web/app/manifest.ts`, `apps/web/public/sw.js`, `apps/web/next.config.ts`, `VERSION`.
- Main web shell: `apps/web/components/AppShell.tsx`.
- Single-player UI workflow: `apps/web/components/DominoPokerGame.tsx`.
- Multiplayer UI workflow: `apps/web/components/MultiplayerLobby.tsx`, `apps/web/components/mp/MpDesktopTable.tsx`, `apps/web/components/mp/MpMobileTable.tsx`, `apps/web/lib/mp/useMultiplayer.ts`, `apps/web/lib/mp/MultiplayerClient.ts`.
- Web UI/theme primitives: `apps/web/components/ui/*`, `apps/web/styles/tokens.css`, `apps/web/styles/glass.css`, `apps/web/lib/theme.ts`.
- Server process: `apps/server/src/index.ts`.
- Server config: `apps/server/src/config.ts`.
- Server routing/gateway: `apps/server/src/net/WebSocketGateway.ts`, `GatewayHub.ts`, `GatewayConnection.ts`, `ServerEventBus.ts`, `PostgresEventBus.ts`, `messageRouter.ts`, `apps/server/src/httpServer.ts`.
- Room workflow: `apps/server/src/rooms/RoomManager.ts`, `RoomEngine.ts`, `GameDirector.ts`, `LobbyManager.ts`.
- Session/identity workflow: `apps/server/src/sessions/SessionManager.ts`, `DurableSessionStore.ts`, `apps/server/src/identity/DisplayIdRegistry.ts`.
- Storage boundary: `apps/server/src/storage/StoragePort.ts`, `index.ts`, `SqliteStorage.ts`, `PostgresStorage.ts`, `schema.ts`.
- Core rules: `packages/core/src/dominoTile.ts`, `player.ts`, `gameState.ts`, `aiService.ts`.
- Multiplayer core API: `packages/core/src/multiplayer/applyCommand.ts`, `types.ts`, `commands.ts`, `events.ts`, `snapshots.ts`.
- Shared protocol API: `packages/shared/src/clientMessages.ts`, `serverEvents.ts`, `roomTypes.ts`, `errors.ts`, `protocolVersion.ts`.

## Dependency Direction

- `packages/core` is the domain layer. It must not import UI, server, storage, or transport code.
- `packages/core/src/multiplayer` is the deterministic multiplayer state-machine layer around core rules.
- `packages/shared` is the public protocol/DTO layer. It validates external client input and currently depends on core MP types for server snapshots/events.
- `apps/server` is the authoritative application/infrastructure layer for multiplayer. It may use core and shared, and it owns DB/network/time authority.
- Inside `apps/server`, keep request flow directional: gateway/hub -> router -> room manager/engine -> core. Storage, auth, sessions, event bus, and HTTP are infrastructure boundaries around that flow.
- `apps/web` is presentation and client application state. It may use core for single-player and UI hints, and shared for protocol types, but it must not become authoritative for multiplayer decisions.
- `tools/*` are verification/load utilities and must not become production dependencies.
- `packages/ai_bot` is a standalone, not-yet-connected bot in its own pnpm workspace. Nothing currently imports it, and it must not be added to the root npm workspaces. When integrating, the only intended entrypoint is `@domino-poker/bot-adapter` (`AiClient`); reconcile its independent `engine` rules/scoring with `packages/core` at the boundary rather than deep-importing internals.

## Key Workflows

- Install: `npm install`
- Web dev: `npm run dev`
- Multiplayer server dev: `npm run dev:server` (builds core, shared, server, then runs `apps/server/dist/index.js`)
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Unit tests: `npm run test`
- Playwright e2e: `npm run test:web`
- Production build: `npm run build`
- Multiplayer simulation: `npm run simulate`
- Local load test: `npm run load:local -- <clients>` against an already running server
- Disposable PostgreSQL integration: `npm run test:postgres:docker`
- Server-only Postgres integration with existing DB: set `TEST_POSTGRES_DATABASE_URL`, then run `npm run test:postgres --workspace apps/server`

CI (`.github/workflows/ci.yml`) runs install, core/shared/server build, typecheck, lint, tests, Postgres integration tests, web build, Playwright browser install, and `npm run test:web`.

## Fragile Or High-Risk Areas

- `packages/core/src/gameState.ts`: deal validation, trick winner logic, special 0-6 ace context, round/game scoring, dealer rotation, and tiebreakers.
- `packages/core/src/player.ts`: legal-play validation and scoring. `getInvalidMoveReason` is the structured rule source for UI invalid-move messaging.
- `packages/core/src/dominoTile.ts` and `shuffleAlgorithm.ts`: human-style cut/overhand shuffle is intentional. Do not replace with Fisher-Yates unless explicitly requested.
- `packages/core/src/multiplayer/*`: deterministic seed-driven multiplayer state machine. Do not introduce `Math.random` or `Date.now` into decisions.
- `packages/shared/src/clientMessages.ts`: external input boundary. Keep Zod limits on client-controlled ids, room identifiers, chat text, bids, moves, and pips.
- `packages/shared/src/serverEvents.ts`: protocol event/snapshot schemas are coupled to core MP types; changing snapshots/events requires checking core, server, web client, and tests.
- `apps/server/src/net/messageRouter.ts`: large routing/lifecycle file. It enforces membership, ownership, lifecycle finalization, reconnect, and command routing; avoid adding rule logic here.
- `apps/server/src/net/WebSocketGateway.ts`, `GatewayHub.ts`, `GatewayConnection.ts`, and `ServerEventBus.ts`: handshake, heartbeat, reconnect, supersede, slow-client backpressure, and cross-instance fanout are tightly coupled.
- `apps/server/src/sessions/SessionManager.ts`, `DurableSessionStore.ts`, and `apps/server/src/identity/DisplayIdRegistry.ts`: reconnect tokens, display ids, public profiles, and durable cleanup must stay privacy-safe and anonymous-play compatible.
- `apps/server/src/rooms/RoomEngine.ts`: single-writer room state mutation path. Do not mutate room state elsewhere.
- `apps/server/src/storage/schema.ts`: single DDL source for SQLite and PostgreSQL migrations. Add migrations only at the end; do not renumber or fork schema definitions.
- `apps/server/src/auth/*` and `apps/server/src/http/authRoutes.ts`: optional auth must remain additive. Anonymous single-player and multiplayer must keep working.
- `apps/web/components/AppShell.tsx`: central shell for screen routing, auth state, locale, audio, round count, and password-reset hash routing.
- `apps/web/components/DominoPokerGame.tsx`: single-player UI workflow and timers around core state.
- `apps/web/components/MultiplayerLobby.tsx` and `apps/web/lib/mp/*`: render server state and send intents only. Do not accept/reject MP moves authoritatively in the browser.
- `apps/web/components/mp/MpDesktopTable.tsx`, `MpMobileTable.tsx`, `apps/web/lib/mp/mobileLayout.ts`, and `desktopStage.ts`: multiplayer table layout is split by viewport and needs both desktop and phone checks.
- `apps/web/styles/tokens.css`, `glass.css`, `components/ui/*`, and `apps/web/lib/theme.ts`: token/theme primitives are shared UI infrastructure. Keep color tokens and RGB channel pairs aligned.
- `apps/web/app/globals.css`: import-only CSS entry. Add CSS to feature partials under `apps/web/styles/`.
- PWA/service-worker/version assets can mask changes through cache behavior; verify browser behavior when changing `manifest.ts`, `sw.js`, `VERSION`, `next.config.ts`, icons, or public assets.
- `data/*.sqlite*`, `logs/`, `.env`, local TODO/deploy/scaling docs, and `deploy.sh` are local/ignored and must not be committed.

## Known Context Notes

- `README.md` currently describes `dev:server` in one place as building "core + server"; the actual script builds `core -> shared -> server`.
- `.gitignore` has a duplicate `docs/*` block. It is harmless but noisy.
- Local ignored docs such as `docs/DEPLOYMENT.md`, `docs/SCALING.md`, `docs/DB_MIGRATION.md`, `docs/TODO/*`, and `docs/mockups/*` may be useful in this working tree but should not be assumed present in a clean clone.
- `deploy.sh` is ignored/local, but if used it mutates `VERSION` and `apps/web/public/sw.js`, commits, pushes to `main`, builds server+web on the VPS, and restarts both `domino-poker` and `domino-web`.
