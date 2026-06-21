# AI Working Rules

Last refreshed: 2026-06-20.

## Before Major Edits

- Read `project_context/repo_overview.md`, `project_context/module_map.json`, and `project_context/repo_map.json` before broad changes.
- Respect the layer split:
  - Domain rules: `packages/core`.
  - Multiplayer state machine: `packages/core/src/multiplayer`.
  - Protocol contracts and external input validation: `packages/shared`.
  - Authoritative multiplayer application/infrastructure: `apps/server`.
  - Browser presentation/client state: `apps/web`.
- Do not deep-import private files across module boundaries when a public package entrypoint exists.
- Keep core domain logic independent from React, Node server code, WebSocket, database adapters, and file-system code.
- Keep server-side multiplayer authoritative. Browser clients render snapshots and send intents; they do not accept/reject moves as truth.
- For build/test/tooling changes, inspect `package.json`, workspace `package.json` files, `.github/workflows/ci.yml`, `eslint.config.mjs`, `tsconfig.base.json`, workspace `tsconfig*.json`, and relevant `vitest.config.ts`.
- For e2e/UI runtime changes, inspect `playwright.config.ts`, affected `tests/e2e/*`, and `apps/web/next.config.ts`.
- For runtime/env/security changes, inspect `.env.example`, `.npmrc`, `.nvmrc`, `.node-version`, and `apps/server/src/config.ts`.
- For deploy/PWA/versioning changes, inspect `deploy/Dockerfile`, reverse-proxy examples under `deploy/`, `deploy/BACKUP.md`, `.dockerignore`, ignored local `deploy.sh` when present, `VERSION`, `apps/web/public/sw.js`, `apps/web/app/manifest.ts`, and `apps/web/next.config.ts`.

## Source Files To Inspect By Change Area

### Core Rules

Read these before changing game rules, scoring, trick behavior, shuffle/deal, AI, or single-player state:

- `packages/core/src/dominoTile.ts`
- `packages/core/src/shuffleAlgorithm.ts`
- `packages/core/src/player.ts`
- `packages/core/src/gameState.ts`
- `packages/core/src/aiService.ts`
- `packages/core/test/dominoRules.test.ts`

Care points:

- `shuffleSet()` intentionally uses human-style cut/overhand shuffle. Do not replace it with Fisher-Yates unless explicitly requested.
- `getInvalidMoveReason()` is the structured source for invalid-move reasons; do not duplicate approximate rule checks in UI.
- 0-6 has special ace behavior depending on declared/required context. Verify against tests.
- Round scoring, dealer rotation, round winner, final standings, and tiebreakers are high-risk.
- Game constants such as 4 players, 7 tiles, 28 tiles, and round limits are still duplicated in places by design; do not introduce new variants without first defining a deliberate ruleset/config path.

### Core Multiplayer

Read these before changing multiplayer state, events, snapshots, replay, timers, inactivity, auto actions, or legal helper behavior:

- `packages/core/src/multiplayer/types.ts`
- `packages/core/src/multiplayer/commands.ts`
- `packages/core/src/multiplayer/events.ts`
- `packages/core/src/multiplayer/applyCommand.ts`
- `packages/core/src/multiplayer/gameSetup.ts`
- `packages/core/src/multiplayer/determinism.ts`
- `packages/core/src/multiplayer/snapshots.ts`
- `packages/core/src/multiplayer/replay.ts`
- `packages/core/src/multiplayer/invariants.ts`
- `packages/core/test/multiplayer/*.test.ts`
- `tools/simulators/src/playGame.ts`

Care points:

- `applyCommand()` is the central state transition entrypoint.
- Multiplayer setup/shuffle must stay seed-driven and deterministic.
- Do not use `Math.random` or `Date.now` for MP decisions. Inject time/seed through command/setup paths.
- Public snapshots must not leak opponent hands; player snapshots should reveal only the viewer hand.
- Legal moves/bids helpers are read-only; mutations still go through commands.
- Simulator randomness must be seeded and reproducible.

### Shared Protocol

Read these before changing client/server protocol messages, room DTOs, error codes, snapshots, titles, avatars, or protocol validation:

- `packages/shared/src/clientMessages.ts`
- `packages/shared/src/serverEvents.ts`
- `packages/shared/src/roomTypes.ts`
- `packages/shared/src/errors.ts`
- `packages/shared/src/protocolVersion.ts`
- `packages/shared/src/avatarCatalog.ts`
- `packages/shared/src/titles.ts`
- `packages/shared/test/*.test.ts`
- `packages/core/src/multiplayer/events.ts`
- `packages/core/src/multiplayer/snapshots.ts`

Care points:

- `clientMessages.ts` validates external input. Keep max lengths, pips, bids, room ids/codes, request ids, and chat text bounded.
- `serverEvents.ts` imports core MP event/snapshot types. Shared protocol changes may require coordinated updates in core MP, server routing, web client reducer/views, tests, simulators, and load-test.
- Keep shared package free of server infrastructure and UI logic.

### Multiplayer Server

Read these before changing server lifecycle, routing, rooms, timers, reconnect, chat, auth handshake, persistence hooks, fanout, or metrics:

- `apps/server/src/index.ts`
- `apps/server/src/config.ts`
- `apps/server/src/httpServer.ts`
- `apps/server/src/net/WebSocketGateway.ts`
- `apps/server/src/net/messageRouter.ts`
- `apps/server/src/net/wsTransport.ts`
- `apps/server/src/net/PostgresEventBus.ts`
- `apps/server/src/rooms/RoomManager.ts`
- `apps/server/src/rooms/RoomEngine.ts`
- `apps/server/src/rooms/LobbyManager.ts`
- `apps/server/src/rooms/GameDirector.ts`
- `apps/server/src/rooms/RoomOwnershipGuard.ts`
- `apps/server/src/chat/LobbyChat.ts`
- `apps/server/src/chat/ChatTranslationService.ts`
- `apps/server/src/chat/GoogleCloudTranslator.ts`
- `apps/server/src/chat/chatTranslateRoutes.ts`
- `apps/server/src/sessions/SessionManager.ts`
- relevant tests under `apps/server/test/net`, `apps/server/test/rooms`, `apps/server/test/timers`, and `apps/server/test/chat`

Care points:

- `RoomEngine` is the single-writer room mutation path.
- `messageRouter.ts` is routing/application workflow; keep domain rules out of it.
- The server overrides/owns authoritative time and state.
- MP chat translation is an optional HTTP side route (`/chat/translate`) using server-side Google Cloud Translation credentials. Keep credentials in env/secret files only, validate bounded text/language input, and keep rate/character limits conservative.
- Room lifecycle invariants are high-risk: game-over teardown, disconnect/resume, durable session release, room TTL, abandoned-room cleanup, forfeit, and rate limits.
- PostgreSQL multi-instance support includes leases, durable sessions, and event fanout; it is not full active room-state failover.
- If adding active room failover later, server-initiated mutations also need ownership/failover handling.

### Storage And Database

Read these before changing persistence, migrations, storage adapters, auth storage, stats, chat persistence, leases, sessions, or metrics DB health:

- `apps/server/src/storage/StoragePort.ts`
- `apps/server/src/storage/CoinStore.ts`
- `apps/server/src/storage/schema.ts`
- `apps/server/src/storage/migrations.ts`
- `apps/server/src/storage/SqliteStorage.ts`
- `apps/server/src/storage/PostgresStorage.ts`
- `apps/server/src/storage/MatchPersistence.ts`
- `apps/server/src/storage/OutcomeRecorder.ts`
- `apps/server/src/storage/RoomLeaseStore.ts`
- `apps/server/test/storage/storageContract.ts`
- `apps/server/test/storage/*.test.ts`

Care points:

- `schema.ts` is the single DDL source for SQLite and PostgreSQL.
- Migration IDs are production identity. Append new migrations only; do not renumber, reorder, or rewrite previous IDs.
- Keep SQLite/PostgreSQL behavior aligned through storage contract tests.
- Local runtime files `data/*.sqlite*` are ignored and must not be committed.
- PostgreSQL pool settings apply to storage and event bus pools; total DB connections are operationally relevant.

### Auth And Security

Read these before changing auth, profile, password reset, avatar upload/serve, tokens, CORS, rate limits, or client auth state:

- `apps/server/src/auth/AuthService.ts`
- `apps/server/src/auth/AuthStore.ts`
- `apps/server/src/auth/passwords.ts`
- `apps/server/src/auth/EmailSender.ts`
- `apps/server/src/http/authRoutes.ts`
- `apps/server/src/http/rateLimiter.ts`
- `apps/server/src/http/readJsonBody.ts`
- `apps/web/lib/auth/authApi.ts`
- `apps/web/lib/auth/useAuthUser.ts`
- `apps/web/lib/auth/avatarUpload.ts`
- `apps/web/lib/auth/avatarUrl.ts`
- `apps/web/components/auth/*.tsx`
- `packages/shared/src/avatarCatalog.ts`

Care points:

- Auth is optional. Anonymous single-player and anonymous multiplayer must remain playable.
- Do not log raw auth tokens, reset tokens, passwords, password hashes, DB credentials, or secrets.
- Tokens are opaque client-side values; storage keeps hashes.
- Password reset must remain anti-enumeration, single-use, hashed-token based, and URL-hash based on the client.
- Avatar upload is client-resized/compressed; server validates size/magic bytes and serves with fixed content type and nosniff.
- `WEB_ORIGIN` is the auth CORS allowlist. Do not use wildcard CORS for auth.
- `TRUST_PROXY` should be enabled only behind a trusted reverse proxy.

### Web UI

Read these before changing shell routing, lobby, single-player UI, multiplayer UI, layout, dialogs, audio, localization, PWA, or web storage:

- `apps/web/components/AppShell.tsx`
- `apps/web/components/LobbyScreen.tsx`
- `apps/web/components/LobbyWheel.tsx`
- `apps/web/components/DominoPokerGame.tsx`
- `apps/web/components/GameDialogs.tsx`
- `apps/web/components/Dialog.tsx`
- `apps/web/components/useDialogFocus.ts`
- `apps/web/components/MultiplayerLobby.tsx`
- `apps/web/components/mp/*.tsx`
- `apps/web/lib/mp/*.ts`
- `apps/web/lib/i18n.ts`
- `apps/web/lib/locales/en.ts`
- `apps/web/lib/locales/lv.ts`
- `apps/web/lib/safeStorage.ts`
- `apps/web/lib/useAudioSettings.ts`
- relevant CSS partials under `apps/web/styles/`

Care points:

- `apps/web/app/globals.css` is import-only. Add rules to feature CSS partials under `apps/web/styles/`.
- `apps/web/styles/tokens.css` is the design-token source AND the theming foundation: `:root` is the default ("Default", `lib/theme.ts` `DEFAULT_THEME="default"`) theme; add a new color theme as a `[data-theme="<id>"] { ... }` override block (override only the differing tokens, BOTH the HEX `--token` and its `--token-rgb` pair) and switch via `<html data-theme="<id>">`. PREMIUM-UI / new-design CONVENTION: never introduce thematic color literals in style files — put Default values in `:root` tokens and consume via `var()`; future themes override only color tokens through `[data-theme]`. Geometry (radius, blur px, z-index, spacing, shadow offsets) stays shared. The premium primitives (`styles/ui-button.css`, `ui-icon-button.css`, `ui-text-field.css`) and the black-glass layer (`styles/glass.css`, incl. its shadow colors `--glass-shadow-color` / `--glass-inset-shadow-color`) are token-only and follow this — keep new premium CSS the same way. The base/brand color tokens that need translucent variants have a paired `--*-rgb` channel token (not every token has one); keep each pair in sync (changing one requires changing the other) and use `rgb(var(--<token>-rgb) / <alpha>)` for translucent brand colors so they follow the theme (canonical example: `apps/web/styles/info-panel.css` `.infoPanel`). REMAINING MIGRATION (deferred, not started): ~200 hardcoded `rgba(R,G,B,a)` literals in the feature CSS partials still encode brand RGB and will NOT follow a theme until migrated to the `rgb(var(--*-rgb)/a)` form; pure-black `rgba(0,0,0,a)` shadows are intentionally theme-neutral and stay. Runtime theme switching UI + persistence are NOT built yet — add them (mirroring the locale pattern: safeStorage key + early inline script in `app/layout.tsx` to avoid first-paint flash + a Settings selector) only when a second real theme exists and has been visually verified (the current design assumes dark contrast/shadows).
- Swappable per-screen SVG backgrounds + per-screen palette accents (v3.1–3.2): the 4 main screens each draw a swappable SVG background asset (`public/assets/backgrounds/{lobby,mp-lobby,sp-room,mp-room}.svg`) via the `--bg-lobby` / `--bg-mp-lobby` / `--bg-sp-room` / `--bg-mp-room` tokens, applied as `background: var(--bg-*) center/cover no-repeat, var(--overlay)` on `.lobbyShell` (LobbyScreen), `.mpLobby` (MultiplayerLobby), `.gameShell.spRoomBg` (DominoPokerGame), `.gameShell.mpRoomBg` (MpGameTable). Replace/repoint the SVG to reskin a screen with NO code change; bg colors are baked INTO the SVG (not token-recolored). Because each SVG has a distinct palette, each screen root ALSO overrides the thematic chrome token set to match its bg — `--primary`(+rgb), `--surface`(+rgb), `--surface-floating`(+rgb), `--felt`(+rgb), and (lobby only) `--wheel-arc-top/bottom-rgb` — in a dedicated "per-screen palette" section of `tokens.css` (these literals stay centralized there, NOT in feature partials). Accents: lobby teal, mp-lobby violet, mp-room ruby, sp-room teal. This per-container scope is ORTHOGONAL to `[data-theme]` (which overrides `:root`). Each scope re-pins `--coin`/`--coin-rgb` to gold so money/economy UI stays gold everywhere with its GIF icon. Dialogs INHERIT the screen accent (rendered inline via `Dialog.tsx`, not portaled). Kept universal (NOT per-screen): functional signals — green (`--success`/`--positive`/`--online`/`--accent-green`/`--background`: your-turn, connected, matched) and red (`--error`/`--danger`) — and graphics (domino tiles/`--domino-*`, logo, GIFs). A dedicated `--felt`/`--felt-rgb` token (default = `--background` green) backs the table-felt radial (`.table`, `.mpmTable` use `var(--felt)`), decoupling the recolored felt from `--background`, which stays the green your-turn ring / `.positive` / hidden-tile-back graphic.
- Use `Dialog`/`useDialogFocus` for modal semantics and focus behavior.
- Keep user-facing strings in locale files and pass labels through props.
- Use `safeStorage` wrappers for localStorage/sessionStorage.
- `AppShell` owns locale, screen routing, auth state, audio, selected round count, session restore, and reset-token routing.
- Multiplayer UI sends intents only. Do not add authoritative move acceptance/rejection to the browser.
- Layout has multiple contracts: desktop fixed stage, phone portrait game stage, and responsive MP lobby. Meaningful layout changes need browser/e2e verification.
- PWA/service-worker changes can be affected by stale caches; verify manually when changing `manifest.ts`, `sw.js`, icons, or public assets.

### AI Bot Package (wired into single-player)

Read these before touching the trained bot under `packages/ai_bot` or its browser bridge:

- `packages/ai_bot/README.md` (architecture, search/inference/bidding math, performance)
- `packages/ai_bot/INTEGRATION.md` and `packages/ai_bot/CONNECTION-README.md` (the original hookup write-up)
- `packages/ai_bot/packages/engine/src/index.ts` and `packages/ai_bot/packages/ai/src/index.ts` (public APIs the browser uses)
- `apps/web/lib/bot/botBridge.ts` (GameState <-> PlayerView + Web Worker transport), `botWorker.ts` (off-thread search), `difficulty.ts` (level budgets), `liveness.ts` (never-stall net)

Care points:

- `engine` + `ai` ARE root npm workspaces; the browser imports them by name (resolved to built `dist`). `ai`'s dep on `engine` is exact `1.0.0` (NOT pnpm `workspace:*`). `bot-adapter` (Node `worker_threads` `AiClient`) is intentionally NOT a workspace and is NOT used by the browser — the SP bridge talks to `engine`/`ai` directly via a bespoke browser Web Worker.
- The bot drives single-player only. Multiplayer bots are still core `aiService` via `core/multiplayer` `autoBid`/`autoMove` -> server `GameDirector` — that heuristic is NOT dead code; do not delete it.
- `dist/` is gitignored AND `deploy.sh` tar-excludes `dist`/`node_modules` at any depth, so the VPS gets only `src`. `apps/web` `prebuild`/`predev` and CI build `engine` then `ai` (`tsc -b`, engine first) before the web build. Do NOT keep a local pnpm `node_modules` under `packages/ai_bot` — its `tsc` bin shadows root typescript for the npm build (the VPS never has it).
- The bot ships its OWN `engine` (rules/scoring/tiles/state) independent of `packages/core`; the bridge maps core `{side1,side2}` tiles <-> bot bitmask `PlayerView`. Trump/ace ordering and the `bid=-1` sentinel are verified-identical between the two engines.
- The heavy ISMCTS runs CLIENT-SIDE in `botWorker.ts` (browser Web Worker), never on the VPS. Single-player adds NO server game CPU; measure its client cost with `tools/bot-benchmark` (`npm run bench:bot`). `eslint` ignores `packages/ai_bot/**` (vendored sub-project).
- Randomness is seedable (`mulberry32`); keep no `Math.random`/`Date.now` in decisions.

### Gold-Coin Economy

Read these before changing the virtual gold-coin currency (balances, ledger, signup bonus, single-player rewards, or — later — multiplayer paid rooms):

- `packages/shared/src/economy.ts` (single source of amounts/splits)
- `apps/server/src/storage/CoinStore.ts`, `apps/server/src/storage/schema.ts` (0007_coin_wallet)
- `apps/server/src/storage/SqliteStorage.ts`, `apps/server/src/storage/PostgresStorage.ts` (applyLedger/sumLedgerSince)
- `apps/server/src/wallet/WalletService.ts`
- `apps/server/src/sp/SpRewardTokens.ts`, `apps/server/src/http/spRewardRoutes.ts`, `apps/server/src/http/httpUtils.ts`
- `apps/server/src/http/authRoutes.ts` (signup bonus + `/auth/me` balance), `apps/server/src/net/WebSocketGateway.ts` (WELCOME goldBalance)
- `apps/web/lib/sp/spReward.ts`, `apps/web/components/CoinBalance.tsx`, `apps/web/components/CoinIcon.tsx`, `apps/web/components/GameDialogs.tsx`, `apps/web/components/auth/LobbyProfile.tsx`, `apps/web/lib/auth/useAuthUser.ts`, `apps/web/styles/coin.css`
- tests: `apps/server/test/wallet/*`, `apps/server/test/sp/*`, `apps/server/test/http/spRewardRoutes.integration.test.ts`, the coin block in `apps/server/test/storage/storageContract.ts`, `apps/web/test/CoinBalance.test.tsx`, `apps/web/test/GameEndReward.test.tsx`

Care points:

- Money is server-authoritative. Every balance change goes through `WalletService` over `CoinStore.applyLedger` (atomic; idempotent by `(user_id, reason, ref)`). Never mutate `coin_balances` directly and never trust client-supplied amounts.
- `packages/shared/src/economy.ts` is the single source of amounts/splits (STARTING_COINS, SP_REWARDS, POT_SPLIT, MIN_ENTRY_FEE, splitPot). Do not hardcode these anywhere else; the server enforces, the web only displays.
- `applyLedger` must behave identically in SQLite (transaction) and PostgreSQL (ensure-row + `FOR UPDATE` transaction) and is covered by the shared storage contract. Coin migration `0007_coin_wallet` follows schema.ts rules (append-only, never renumber).
- SP reward anti-cheat (D3): the reward difficulty comes from a server-issued one-time token (`SpRewardTokens`), NOT the client. `/sp/reward` enforces auth + minimum game duration + per-user rate limit + a HARD daily cap clamped under a per-user in-process lock. Tokens and the lock are in-memory/single-instance (same assumption as `rateLimiter.ts`). The client still asserts placement — an accepted residual.
- Anonymous play has no wallet and earns nothing. Registration grants the signup bonus; `WalletService.getBalance` is repair-on-read so `/auth/me` and `WELCOME` also backfill existing accounts idempotently.
- `httpServer.ts` chains the `/sp/*` handler before the auth handler; raw-HTTP helpers are shared via `http/httpUtils.ts` (do not re-copy them).
- On reward/charge errors, favor under-credit over over-credit (the SP token is consumed before the DB credit by design).
- Multiplayer paid rooms (entry fee + pot, 70/30 payout to top-2 registered humans) are PLANNED (Phase 3) and NOT built yet; see `docs/TODO/gold-coins-plan.md` (local/ignored).

## Commands

- Install: `npm install`
- Clean install / CI install: `npm ci`
- Web dev: `npm run dev`
- Server dev: `npm run dev:server`
- Web production start after web build: `npm run start --workspace apps/web`
- Typecheck all: `npm run typecheck`
- Lint: `npm run lint`
- Unit tests: `npm run test`
- Playwright browser install for CI-like local setup: `npx playwright install --with-deps chromium`
- Playwright e2e: `npm run test:web`
- Build all: `npm run build`
- Simulation: `npm run simulate`
- Local load-test: `npm run load:local -- <clients>`
- Disposable PostgreSQL integration: `npm run test:postgres:docker`
- Existing PostgreSQL integration: set `TEST_POSTGRES_DATABASE_URL`, then `npm run test:postgres --workspace apps/server`
- Server migration command after build: `npm run migrate --workspace apps/server`
- Server Docker image: `docker build -f deploy/Dockerfile -t domino-poker .`
- Server Docker run example: `docker run -d --name domino-poker -p 4000:4000 --env-file .env -v "$(pwd)/data:/app/data" --restart unless-stopped domino-poker`
- Ignored local VPS deploy script, if intentionally used: `bash deploy.sh`
- Skip dependency reinstall in ignored local deploy script: `DEPLOY_SKIP_DEPS=1 bash deploy.sh`

Important ordering:

- `npm run dev:server` builds `packages/core`, then `packages/shared`, then `apps/server`, then runs server dist.
- CI-like broad verification order is: `npm ci` -> build `packages/core`, `packages/shared`, `apps/server` -> `npm run typecheck` -> `npm run lint` -> `npm run test` -> PostgreSQL integration with `TEST_POSTGRES_DATABASE_URL` -> `npm run build --workspace apps/web` -> `npx playwright install --with-deps chromium` -> `npm run test:web`.
- `npm run test:web` expects `apps/server/dist/index.js` to exist because Playwright starts `node dist/index.js` in `apps/server`; it also starts `apps/web` dev server on `127.0.0.1:3000`.
- Local Playwright may reuse existing servers (`reuseExistingServer: true` outside CI), so stop stale local servers when validating configuration or startup behavior.
- If runtime tests cannot resolve `@domino-poker/*`, check workspace links and whether required dist builds exist.
- Run typecheck, lint, tests, Playwright, and build sequentially when doing broad verification; do not race generated outputs.

## Environment And Runtime Data

- Server config comes from env and `.env` through `apps/server/src/config.ts`.
- Node runtime is strict: `.nvmrc` and `.node-version` pin Node 24; `package.json` requires `>=22.5.0`; `.npmrc` has `engine-strict=true`.
- `DATABASE_URL` accepts SQLite file paths, `:memory:`, `file:` paths, or PostgreSQL URLs.
- CI PostgreSQL integration uses `postgres:17-alpine`; normal local `npm run test` skips DB integration without `TEST_POSTGRES_DATABASE_URL`.
- `.env` and `.env.*` are ignored except `.env.example`.
- `WEB_ORIGIN`, `RESEND_API_KEY`, `EMAIL_FROM`, and `APP_BASE_URL` are read by `apps/server/src/config.ts`; verify `.env.example` when changing auth CORS or password-reset email behavior because those examples can drift.
- `TRANSLATE_ENABLED`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_APPLICATION_CREDENTIALS`, and `TRANSLATE_*` limits are read by `apps/server/src/config.ts` for optional MP chat translation. Service account JSON files must stay outside source control.
- Reverse proxies must route `/ws`, `/auth/*`, `/sp/*`, and `/chat/translate` to the server port. Enable `TRUST_PROXY=true` only behind a trusted proxy that controls `X-Forwarded-For`.
- `TRICK_PAUSE_MS` must remain aligned with the web client's completed-trick freeze (`apps/web/lib/mp/useTrickFreeze.ts`); config rejects values below 1500 ms.
- `data/*.sqlite`, `data/*.sqlite-wal`, and `data/*.sqlite-shm` are ignored runtime files.
- `logs/` is ignored. MP action logging is opt-in through `MP_ACTION_LOG=1`.
- Local docs under `docs/DEPLOYMENT.md`, `docs/SCALING.md`, `docs/DB_MIGRATION.md`, `docs/TODO/*`, and `docs/mockups/*` may exist but are ignored; do not assume they exist in clean clones.
- `deploy.sh` is ignored/local and may contain host-specific deployment assumptions.

## Deploy And Operations

- `deploy/Dockerfile` builds and runs only the server dependency chain (`core -> shared -> server`). It does not build or serve the Next web client.
- Ignored local `deploy.sh`, when present, is not a generic deploy helper: it bumps `VERSION`, rewrites the `apps/web/public/sw.js` cache name, commits, pushes to `main`, copies the working tree to a VPS, builds server and web, and restarts `domino-poker` plus `domino-web`.
- The tracked `deploy/` examples include `domino-poker.service` for the server, but not a `domino-web.service`; do not assume the web service unit is documented in this repo.
- `VERSION`, `apps/web/next.config.ts`, and `apps/web/public/sw.js` are tied together for visible app version and PWA cache invalidation.
- Reverse proxy examples must keep web traffic on the web app and `/ws` plus `/auth/*` on the server.

## Testing Expectations

- Core rule changes: update/run `packages/core/test/dominoRules.test.ts` and relevant `packages/core/test/multiplayer/*.test.ts`.
- Multiplayer state-machine changes: run core MP tests and simulator tests.
- Server routing/lifecycle changes: update/run relevant `apps/server/test/net/*`, `apps/server/test/rooms/*`, and timer/session tests.
- Storage changes: extend the storage contract suite and run SQLite plus PostgreSQL tests where applicable.
- Protocol changes: update shared tests, server/client consumers, and load-test/simulator expectations if needed.
- UI changes: run focused web Vitest tests and Playwright e2e for affected flows.
- Security/auth changes: run auth route/service/storage tests and inspect CORS/rate-limit/token behavior.
- Gold-coin economy changes: run `apps/server/test/wallet/*`, `apps/server/test/sp/*`, the `/sp` route integration test, the coin block in the storage contract (SQLite + PostgreSQL), and the web coin tests; verify amounts/splits only come from `packages/shared/src/economy.ts`.

## Known Local Context

- `README.md` still has wording in one place saying server dev builds "core + server"; the actual root script builds core, shared, and server.
- `.gitignore` contains a duplicate `docs/*` ignore block. It is harmless but noisy.
- Some terminal output may show mojibake for Latvian comments depending on shell encoding; inspect files directly with UTF-8-aware tooling before changing text for encoding reasons.
