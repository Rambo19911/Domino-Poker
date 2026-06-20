# Repository Overview

Last refreshed: 2026-06-20 (gold-coin Phase 4 — MP paid-room UI: fee input, room badges, table pot, live balance).

## Purpose

Domino Poker is an npm-workspace TypeScript monorepo for a browser-playable Domino Poker game.

It has two game modes:

- Single-player: browser-only local game, one human against three CPU players.
- Multiplayer: authoritative real-time server over WebSocket, with lobby rooms, chat, reconnect/resume, turn timers, optional accounts/profiles, SQLite persistence by default, and PostgreSQL persistence/fanout foundations for multi-instance deployments.

The core rule engine is shared. The browser may derive UI hints from shared logic, but authoritative multiplayer decisions belong to the server.

A virtual gold-coin economy is being added on top of the optional account system (server-authoritative). Each registered account holds a coin balance persisted in the DB; single-player wins award coins via a server-issued one-time game token (Phase 2, shipped), and multiplayer paid rooms (host-set entry fee, prize pot split 70/30 to the top-2 registered humans) are shipped server-side (Phase 3) with the paid-room web UI in Phase 4 (fee input gated to logged-in hosts, coin badges in room lists, pot at the table, live `WALLET_UPDATED` balance). Anonymous play is unaffected — anonymous users have no wallet, cannot join paid rooms, and earn nothing. Economy phases are tracked in `docs/TODO/gold-coins-plan.md` (local/ignored); Phase 5 (rules/i18n polish) and Phase 6 (test/docs sweep) remain.

## Main Technologies

- npm workspaces.
- TypeScript 6.x across core, shared protocol, server, web, and tools.
- Next.js App Router 16.x and React 19.x for `apps/web`.
- Node.js server in `apps/server`, using `ws`, `zod`, built-in `node:sqlite`, optional `pg`, and optional Google Cloud Translation for MP lobby chat translation.
- Vitest for workspace tests.
- Playwright for browser e2e/smoke tests.
- ESLint 9 flat config with TypeScript and React Hooks rules.

Node is pinned/restricted through `.nvmrc`, `.node-version`, `package.json` engines, and `.npmrc` engine-strict. Node 22.5+ is required; Node 24 is the pinned local/CI/deploy runtime.

## Workspace Layout

- `apps/web`: Next.js app, main route, PWA shell, local single-player UI, multiplayer lobby/table UI, MP chat emoji/translation UI, auth/profile UI, gold-coin balance + SP reward UI (`components/CoinIcon.tsx`, `CoinBalance.tsx`, `lib/sp/spReward.ts`, `styles/coin.css`), localization, shared UI primitives, theme tokens, CSS partials, public assets, and web-focused Vitest tests.
- `apps/server`: authoritative multiplayer server, HTTP `/health`, `/metrics`, optional `/auth/*`, optional `/sp/*` (single-player coin rewards), optional `/chat/translate`, WebSocket `/ws`, gateway/hub/fanout, room/lobby lifecycle, game timers/directors, chat, auth, the gold-coin wallet (`wallet/WalletService.ts`, `storage/CoinStore.ts`) + SP reward tokens (`sp/SpRewardTokens.ts`), sessions/identity, storage adapters, PostgreSQL event bus, and server tests.
- `packages/core`: framework-free Domino Poker rules, tile/shuffle logic, legal-play validation, scoring, single-player game state, AI heuristics, plus the separate `packages/core/src/multiplayer` command/event state machine.
- `packages/shared`: public protocol package. It owns Zod client-message validation, protocol versioning, room DTOs, error payloads, avatar/title helpers, server-event schemas, and the single-source economy constants (`economy.ts`: `STARTING_COINS`, `SP_REWARDS`, `POT_SPLIT`, `MIN_ENTRY_FEE`, `splitPot`). Important coupling: `serverEvents.ts` imports core multiplayer event/snapshot types from `@domino-poker/core/multiplayer`.
- `packages/ai_bot`: strong Domino Poker bot (hidden-hand, ISMCTS max^n), sub-packages `engine`, `ai`, `bot-adapter`. WIRED INTO single-player: `engine` + `ai` are now root npm workspaces consumed by the browser game (`bot-adapter` stays Node-only and is bypassed). The trained bot drives all 3 SP CPU seats via `apps/web/lib/bot/botBridge.ts` with 3 difficulty levels (Medium/Hard/Epic) chosen in Settings. Its `dist` is gitignored and deploy-excluded, so `apps/web` prebuild/predev and CI build `engine` then `ai` from `src` before the web build. Not yet wired into multiplayer (server still uses `core/aiService`).
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
- Server routing/gateway: `apps/server/src/net/WebSocketGateway.ts`, `GatewayHub.ts`, `GatewayConnection.ts`, `ServerEventBus.ts`, `PostgresEventBus.ts`, `messageRouter.ts`, `apps/server/src/httpServer.ts`, optional `apps/server/src/chat/chatTranslateRoutes.ts`.
- Room workflow: `apps/server/src/rooms/RoomManager.ts`, `RoomEngine.ts`, `GameDirector.ts`, `LobbyManager.ts`.
- Session/identity workflow: `apps/server/src/sessions/SessionManager.ts`, `DurableSessionStore.ts`, `apps/server/src/identity/DisplayIdRegistry.ts`.
- Storage boundary: `apps/server/src/storage/StoragePort.ts`, `CoinStore.ts`, `index.ts`, `SqliteStorage.ts`, `PostgresStorage.ts`, `schema.ts`.
- Gold-coin economy: shared `packages/shared/src/economy.ts`; server `apps/server/src/wallet/WalletService.ts`, `storage/CoinStore.ts`, `sp/SpRewardTokens.ts`, `http/spRewardRoutes.ts`, `http/httpUtils.ts`; web `apps/web/components/CoinBalance.tsx`, `CoinIcon.tsx`, `lib/sp/spReward.ts`. Balance is surfaced via `GET /auth/me` (`balance`) and the WS `WELCOME` event (`goldBalance`).
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
- Gold-coin economy is server-authoritative: all balance changes flow through `WalletService` over the `CoinStore` boundary (atomic + idempotent ledger). `packages/shared/src/economy.ts` is the one authoritative source for amounts/splits — the server enforces them, the web only displays them. The web never decides balances; it shows `/auth/me` / `WELCOME` values and asks the server to reward/charge.
- `tools/*` are verification/load utilities and must not become production dependencies.
- `packages/ai_bot`: `engine` + `ai` are root npm workspaces consumed by the browser single-player game through `apps/web/lib/bot/botBridge.ts` (maps core `{side1,side2}` tiles <-> bot bitmask `PlayerView`). `ai`'s dep on `engine` is exact `1.0.0` (npm rejects pnpm `workspace:*`). `bot-adapter` (Node `worker_threads`) is intentionally NOT a workspace. Do not keep a local pnpm `node_modules` under `packages/ai_bot` (its `tsc` bin shadows root typescript for the npm build). The browser bridge — not `AiClient` — is the SP integration surface; `bot-adapter`/`AiClient` would only be needed for a Node/Web-Worker transport later.

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
- `packages/shared/src/clientMessages.ts`: external input boundary. Keep Zod limits on client-controlled ids, room identifiers, chat text, bids, moves, and pips. `createRoomSchema.entryFee` (Phase 3) is bounded by `MAX_ENTRY_FEE` (sanity cap); the real limit is the host balance, enforced server-side at debit.
- `packages/shared/src/serverEvents.ts`: protocol event/snapshot schemas are coupled to core MP types; changing snapshots/events requires checking core, server, web client, and tests. The `WALLET_UPDATED` event (Phase 3, balance push) must stay in BOTH the `ServerEvent` union and `serverEventSchema`, or cross-instance Postgres fanout drops it. `RoomSummary.entryFee` + `RoomView.pot` in `roomTypes.ts` are required fields (server always populates; old clients ignore extras).
- `packages/shared/src/economy.ts`: single source for coin amounts/splits — `STARTING_COINS`, `SP_REWARDS`, `POT_SPLIT` (70/30), `MIN_ENTRY_FEE`/`MAX_ENTRY_FEE`, and `splitPot(pot, humanCount)` (remainder→1st, single human→100%). Server enforces; web displays. Do not duplicate these values.
- `apps/server/src/chat/*Translation*` and `apps/server/src/chat/chatTranslateRoutes.ts`: optional MP lobby chat translation. Google credentials must stay in env/secret files, client calls only the server route, and rate/character limits should remain bounded to avoid cost surprises.
- `apps/server/src/net/messageRouter.ts`: large routing/lifecycle file. It enforces membership, ownership, lifecycle finalization, reconnect, and command routing; avoid adding rule logic here. Phase 3 added paid-room money orchestration (the one deliberate exception): `createPaidRoom`/`joinPaidRoom` do debit-then-commit-seat with full rollback (refund + room teardown) on any post-debit failure, and re-check `isUserSeated` synchronously right before the seat commit to close the concurrent duplicate-userId race; leave/delete/TTL refunds go through `tryRefund`, which idempotently credits and, on transient DB failure, queues into `pendingRefunds` (drained by the periodic `sweepExpiredRooms`). Money rules live in `WalletService`/`MatchPayoutService`, not here.
- `apps/server/src/net/WebSocketGateway.ts`, `GatewayHub.ts`, `GatewayConnection.ts`, and `ServerEventBus.ts`: handshake, heartbeat, reconnect, supersede, slow-client backpressure, and cross-instance fanout are tightly coupled.
- `apps/server/src/sessions/SessionManager.ts`, `DurableSessionStore.ts`, and `apps/server/src/identity/DisplayIdRegistry.ts`: reconnect tokens, display ids, public profiles, and durable cleanup must stay privacy-safe and anonymous-play compatible.
- `apps/server/src/rooms/RoomEngine.ts`: single-writer room state mutation path. Do not mutate room state elsewhere.
- `apps/server/src/storage/schema.ts`: single DDL source for SQLite and PostgreSQL migrations (latest is `0007_coin_wallet`: `coin_balances` + append-only `coin_ledger`). Add migrations only at the end; do not renumber or fork schema definitions.
- `apps/server/src/wallet/WalletService.ts` + `apps/server/src/storage/CoinStore.ts`: gold-coin money authority. All changes go through `applyLedger` (atomic; idempotent by `(user_id, reason, ref)` ledger unique key — SQLite tx, Postgres `FOR UPDATE` tx). Never mutate `coin_balances` directly. SP daily cap is clamped under a per-user in-process lock (single-instance, like the rate limiter). Phase 3 MP methods reuse `applyLedger` with no new migration: `debitEntryFee` (`mp_entry`, ref=entryId, minBalance 0), `refundEntryFee` (`mp_refund`, ref=entryId), `payoutCoins` (`mp_payout`, ref=matchId). `ref=entryId` is per-seat-occupation (NOT roomId) so refund→rejoin is a real new debit, not an idempotent no-op. Money correctness is critical; favor under-credit over over-credit on errors.
- `apps/server/src/wallet/MatchPayoutService.ts`: MP pot payout engine (Phase 3), mirroring `OutcomeRecorder`. Caches pot + start-roster for paid matches at `matchStarted`; at `gameOver` it splits the pot 70/30 (`splitPot`, remainder→1st) among the top-2 registered, non-forfeited humans by final standings (bots and forfeited players excluded), pays each via `payoutCoins`, and returns results for `WALLET_UPDATED` push. Idempotent by matchId; fire-and-forget with logging. Wired in `index.ts` only when a wallet exists; pot is carried on `MatchStartedRecord.pot` (in-memory only, not persisted).
- `apps/server/src/sp/SpRewardTokens.ts` + `apps/server/src/http/spRewardRoutes.ts`: SP coin-reward anti-cheat (D3). Reward difficulty comes from a server-issued one-time token (not the client); `/sp/reward` enforces auth + min game duration + rate limit + hard daily cap. Tokens are in-memory/single-instance. Residual: the client still asserts placement.
- `apps/server/src/http/httpUtils.ts`: shared raw-HTTP helpers (`writeJson`, `bearerToken`, `clientIp`, `applyCors`) used by both `authRoutes` and `spRewardRoutes`. `httpServer.ts` chains the SP handler before the auth handler.
- `apps/server/src/auth/*` and `apps/server/src/http/authRoutes.ts`: optional auth must remain additive. Anonymous single-player and multiplayer must keep working. `/auth/me` now also returns `balance`; registration grants the signup bonus (repair-on-read in `WalletService.getBalance` also backfills existing accounts).
- `apps/web/components/AppShell.tsx`: central shell for screen routing, auth state, locale, audio, round count, and password-reset hash routing.
- `apps/web/components/DominoPokerGame.tsx`: single-player UI workflow and timers around core state.
- `apps/web/components/MultiplayerLobby.tsx` and `apps/web/lib/mp/*`: render server state and send intents only. Do not accept/reject MP moves authoritatively in the browser. Phase 4 paid-room UI: `lib/mp/clientView.ts` holds `wallet.balance` (from WELCOME `goldBalance` + live `WALLET_UPDATED`; each WELCOME reflects current auth state, so anonymous reconnect clears it); `lib/mp/gameTableView.ts` carries `pot`; `components/mp/RoomFeeChip.tsx` is the shared coin badge for room lists; `CreateRoomDialog` (in `MpLobbyDialogs.tsx`) shows the entry-fee input only to logged-in hosts with client-side balance validation (server re-checks at debit); `components/MobilePot.tsx` + `MP_MOBILE_POS.pot` render the table pot on mobile, `MpInfoPanel` on desktop. Coin colors are token-only (`--coin`); animations (`coinGainPulse`, `potBump`) live in `styles/animations.css` and respect `prefers-reduced-motion`.
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
