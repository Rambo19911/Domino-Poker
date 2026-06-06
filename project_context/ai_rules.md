# AI Working Rules

## Read Before Major Edits

- For rule behavior: read `packages/core/src/dominoTile.ts`, `packages/core/src/player.ts`, `packages/core/src/gameState.ts`, and `packages/core/test/dominoRules.test.ts`.
- For multiplayer work: read `docs/TODO/TODO.md` and the current phase file in `docs/TODO/` before editing; keep MP implementation in `apps/server`, `packages/shared`, and future dedicated multiplayer files rather than mixing into existing single-player UI flow.
- For multiplayer core-adjacent deterministic helpers: use `packages/core/src/multiplayer/` and tests under `packages/core/test/multiplayer/`; do not modify single-player shuffle/deal behavior for MP determinism.
- For multiplayer state fields, use `packages/core/src/multiplayer/types.ts`; do not add MP-only fields directly to single-player `GameState` or `Player`.
- For multiplayer command/event contracts, use `packages/core/src/multiplayer/commands.ts` and `packages/core/src/multiplayer/events.ts`; commands carry `requestId`, events carry `eventSeq`.
- For multiplayer command execution, use `packages/core/src/multiplayer/applyCommand.ts`; unsupported commands should fail explicitly until their rule delegation is implemented.
- `packages/core` source keeps extensionless relative imports for Next/Turbopack workspace transpilation. Its build script runs `packages/core/scripts/fix-esm-imports.cjs` after `tsc` so emitted `dist/*.js` files have Node-compatible `.js` ESM specifiers.
- For AI behavior: read `packages/core/src/aiService.ts` before changing heuristics.
- For app/lobby flow: read `apps/web/components/AppShell.tsx`, `apps/web/lib/i18n.ts`, and `apps/web/components/AudioControls.tsx`.
- For lobby UI controls: keep desktop wheel and compact lobby rendering in `apps/web/components/LobbyWheel.tsx`, with shared selected round count passed from `AppShell`.
- For UI/game flow: read `apps/web/components/DominoPokerGame.tsx` and `apps/web/app/globals.css`.
- For game-table UI extraction: use `apps/web/components/GameDialogs.tsx`, `apps/web/components/PlayerSeat.tsx`, `apps/web/components/InfoPanel.tsx`, and `apps/web/components/DominoTileView.tsx`; do not move deck creation, shuffle, dealing, AI timers, or trick state transitions into these UI components.
- For modal/dialog UI: use `apps/web/components/Dialog.tsx` with `apps/web/components/useDialogFocus.ts` instead of duplicating `role="dialog"`, `aria-modal`, focus trap, Escape, or focus restoration behavior.

## Rule-Specific Care Points

- Preserve tested TypeScript behavior over stale docs when they disagree. Known disagreement: `docs/domino_poker_rules_summary.md` says overtricks are `-1`, but `docs/PUNKTU_SISTEMA_PIEMERI.md` and current tests use `tricksWon * 5`.
- `shuffleSet()` intentionally uses an imperfect human-style random cut + overhand packet shuffle + random cut. This is a game-design choice to create more varied hands with more frequent 0, 5, 6, and occasional 7 trump hands. Do not replace it with Fisher-Yates unless explicitly requested.
- MP deterministic shuffle/setup/state wrappers are isolated in `packages/core/src/multiplayer/`; extend that MP path instead of changing `shuffleSet()`, `createNewGame()`, or core `types.ts` for multiplayer needs.
- Public setup APIs must validate `dealerIndex` and custom round decks before dealing; custom decks must contain exactly 28 unique legal domino tiles after normalized duplicate checks, while preserving the supplied order and tile orientation for dealing.
- 0-6 is special: it is an ace only when played/required as 0; when declared as 6 it behaves as a regular 6 for ace comparison.
- AI trick-strength prediction (`aiService.ts` `wouldWinTrick`) uses the SAME authoritative comparison as the engine's `determineTrickWinner` (`isStrongerTile(state, …)` → `isPlayedAsAce` + no `breakAceTiesByTotalValue`), so the AI predicts the real winner — including the 0-6 special tile (an ace only when played/required as 0). Keep them aligned: do not reintroduce a separate AI-only ace heuristic (the old `isStrongerTileForAi` with raw `isAce` + `breakAceTiesByTotalValue:true`, which mis-predicted 0-6).
- Trump lead requires a stronger trump if the player has one stronger than the highest trump already in the trick.
- Non-trump required-number leads require a non-trump matching number before trumping.
- UI invalid-move messages should use core `getInvalidMoveReason(...)` from `packages/core/src/player.ts`; do not infer message type directly from approximate `GameState` flags.
- Round winner tiebreakers are round score, then bid, then tricks won, then seat order from dealer.
- Final game winner tiebreakers are total score first, then the same bid/tricks-won/seat-order tiebreakers used for round winners.
- The next round dealer is the previous round winner.

## Commands

- Node ≥ 22.5 is REQUIRED (server uses built-in `node:sqlite`) and enforced: root `package.json` `engines.node` + `.npmrc` `engine-strict=true` make `npm install`/`npm ci` hard-fail on older Node; `.nvmrc`/`.node-version` pin `24` (matches `deploy/Dockerfile`). Do not remove these or relax `engine-strict` without a reason.
- `node:sqlite` API stability can change across Node minors (local Node 24.14 still emits `ExperimentalWarning`; current Node 24 docs mark SQLite as release candidate). Treat that warning as expected for the pinned runtime, and do not bump Node major/minor without rerunning server storage/persistence tests.
- Install: `npm install`
- If build/test/typecheck fails with `Cannot find module '@domino-poker/...'`, first check the local workspace install: `node_modules/@domino-poker/*` should be npm workspace junctions/symlinks, not empty regular directories. Run `npm install` to repair a local broken install; use `npm ci` in clean CI environments.
- Typecheck: `npm run typecheck`
- Lint: `npm run lint` (ESLint 9 flat config `eslint.config.mjs`: JS + typescript-eslint recommended + React Hooks rules for `apps/web`; NOT type-aware, so it does not duplicate `tsc`). Keep it green; `_`-prefixed args/vars are treated as intentionally unused.
- Test: `npm run test`
- Optional real PostgreSQL integration tests: run `npm run test:postgres:docker` for a disposable Docker PostgreSQL database, or set `TEST_POSTGRES_DATABASE_URL` and run `npm run test:postgres --workspace apps/server` against an existing disposable database. The specs create/drop their own schemas and are skipped in the normal suite when the env var is absent.
- PostgreSQL migrations (build first): `npm run migrate --workspace apps/server` (runs `dist/storage/migrate.js`). PostgreSQL-only; against a SQLite/`:memory:` `DATABASE_URL` it is a logged no-op. The server also migrates on startup (`PostgresStorage.open`), so this standalone command is an optional pre-deploy step, not the only path.
- Web smoke tests: `npm run test:web`
- Build: `npm run build`
- Dev server: `npm run dev`
- Dev multiplayer server: `npm run dev:server`
- Simulation placeholder: `npm run simulate`
- Local load-test placeholder: `npm run load:local`
- Windows launcher: `start-domino-poker.bat`
- Server workspace build/typecheck: `npm run build --workspace apps/server`, `npm run typecheck --workspace apps/server`
- Shared workspace build/typecheck: `npm run build --workspace packages/shared`, `npm run typecheck --workspace packages/shared`
- After changing `packages/shared`, run `npm run build --workspace packages/shared` before server tests because server runtime tests import the shared package from `packages/shared/dist`.
- The `dev:server` script builds in dependency order `core → shared → server` (`packages/shared` is required because the server imports `@domino-poker/shared`); do not drop the `packages/shared` build step or reorder it after the server build.
- TypeScript incremental/composite builds (`packages/shared`, `apps/server`) write a `*.tsbuildinfo` next to their tsconfig. Gotcha: if you delete `dist/` manually but leave `*.tsbuildinfo`, `tsc` treats the build as up-to-date and skips emit, so `dist/` stays empty and downstream builds fail with `Cannot find module '@domino-poker/...'`. A fresh clone has no `*.tsbuildinfo`, so it is unaffected. When cleaning a build locally to validate from scratch, delete `*.tsbuildinfo` together with `dist/` (e.g. `packages/shared/tsconfig.tsbuildinfo`, `apps/server/tsconfig.build.tsbuildinfo`).

Run `npm run typecheck`, `npm run test`, `npm run test:web`, and `npm run build` sequentially rather than in parallel because Next rewrites `.next/types` during builds and Playwright owns a dev server during smoke tests.

## Architecture Rules

- The app has TWO modes: local single-player (no backend) and live authoritative multiplayer (bundled `apps/server`). Single-player must stay backend-free (no account/auth/external services); do not add third-party game-hosting or matchmaking. Multiplayer already ships a self-hosted WS server + persistence (SQLite by default, PostgreSQL by `DATABASE_URL`) — treat those as part of the product, not something to remove.
- The main lobby exposes a LIVE multiplayer entry (`onStartMultiplayer` → `MultiplayerLobby`); it is not disabled. Do not "re-disable" it.
- Match results and per-player stats ARE persisted at `GAME_OVER` (`MatchPersistence` → `StoragePort`; default SQLite via `node:sqlite`, optional PostgreSQL via `pg` when `DATABASE_URL` starts with `postgres://` or `postgresql://`). Do not remove stats storage or claim it was removed; player stats must be updated through `StoragePort.incrementPlayerStats(...)` so the concrete DB adapter can perform an atomic increment instead of a read-modify-write cycle.
- PostgreSQL multi-instance foundations are implemented in three parts: room ownership leases (`room_leases` via `RoomLeaseStore`/`RoomOwnershipGuard`), durable reconnect sessions (`player_sessions` via `DurableSessionStore`/`SessionManager.registerAsync`), and cross-instance WebSocket fanout (`PostgresEventBus` using `server_event_fanout` + LISTEN/NOTIFY). `CoreMessageRouter` still owns room-scoped command execution through the lease guard; do not bypass it. Active room state is still in the owning Node process: full production horizontal scaling needs room-affinity/owner routing or explicit state rehydration/command forwarding, plus deploy/load-balancer routing and operational monitoring. These three code foundations are no longer TODOs, but do not claim full active room failover yet.
- The PostgreSQL schema has a SINGLE source of truth: the ordered `MIGRATIONS` array in `apps/server/src/storage/migrations.ts`. Do not reintroduce inline `CREATE TABLE` schema in `PostgresStorage` or `PostgresEventBus` (both now just call `runMigrations`); add new schema only by appending a new `{ id, up }` migration to the END of the array (forward-only, never reorder/rewrite past ids). Write each `up` idempotently (`IF NOT EXISTS`/`IF EXISTS`) since a run that crashes between applying `up` and recording the id will re-run it. `schema_migrations` tracks applied ids. SQLite is out of scope — it provisions its schema with `CREATE IF NOT EXISTS` on open.
- If active room-state failover/rehydration is added later, also gate server-initiated room mutations (turn-timeout, bot pacing, abandoned-room cleanup, and related fanout) by current room ownership. The current lease guard protects client-routed room commands; it is not a complete failover ownership model by itself.
- Server resource lifecycle invariants (do not regress): a finished game (`GAME_OVER`) destroys its room via `RoomManager.destroyFinishedRoom`, driven centrally by `messageRouter.publishAndFinalize`; durable sessions are released on membership loss while offline (`setMemberDepartedHandler` → `WebSocketGateway.releaseSession`, offline-guarded) and intentionally NOT on disconnect (the reconnect token must survive disconnect for reconnect grace + wrong-token impostor rejection — see the `WebSocketGateway.test.ts` "token mismatch" test); room creation is per-connection token-bucket rate-limited; DESTROYED room tombstones + their codes are pruned in `LobbyManager.destroyExpired`.
- Client-controlled identity strings (`clientId`, `reconnectToken`) are length-capped via `maxIdentifierLength` in `packages/shared/src/clientMessages.ts`; keep `.max(...)` bounds on client strings that become durable map keys or log fields.
- Browser audio settings are localStorage-only and do not contain secrets.
- `useAudioSettings()` reuses a small pool of effect audio elements; do not switch back to creating a new `Audio` object on every effect play.
- Use `apps/web/lib/safeStorage.ts` for localStorage access so unavailable, blocked, or throwing storage does not crash the app.
- Keep `useAudioSettings()` owned by `AppShell` so lobby and game share one audio state and one background music element.
- Keep configurable game setup owned by `AppShell`; the lobby-selected round count is passed into `DominoPokerGame` as `numberOfRounds`.
- Multiplayer implementation exists across `packages/core/src/multiplayer`, `packages/shared`, `apps/server`, and `apps/web/lib/mp`/`components/MultiplayerLobby.tsx`. Keep new MP protocol/UI work in those zones and do not mix it into single-player logic.
- MP clients must not accept/reject moves authoritatively. They may use shared `packages/core` helpers only for non-authoritative UI hints (for example `viewerValidTileKeys` highlighting/disabled state in `apps/web/lib/mp/gameTableView.ts`); the server still validates every submitted bid/move.
- The lobby uses the circular mode wheel for desktop-sized viewports and a separate compact control panel for narrow or short viewports. Do not solve lobby fit issues by uniformly shrinking the wheel until labels and controls become impractical.
- The game table currently preserves a fixed 1920x1080 coordinate layout and uses uniform contain scaling so the full stage remains visible. Do not convert this to phone portrait reflow unless explicitly requested.
- Keep user-facing web text in `apps/web/lib/locales/*.ts` and register locales through `apps/web/lib/i18n.ts`; pass the active locale strings through component props instead of importing a fixed strings object or writing hardcoded JSX text.
- Keep locale switching owned by `AppShell`; the selected locale is persisted in `localStorage` under `domino-poker-locale`.

## Security And Configuration

- Never commit secrets, service keys, OAuth credentials, session credentials, or local secret files.
- Never commit local runtime databases; `data/*.sqlite` is intentionally ignored.
- Server config comes from env (`SERVER_PORT`/`HTTP_PORT`, `SERVER_HOST`, `DATABASE_URL`, `TURN_DURATION_MS`, `NODE_ENV`; see `apps/server/src/config.ts` and `.env.example`). `DATABASE_URL` accepts SQLite file paths/`:memory:`/`file:` or PostgreSQL URLs; do not log or hardcode DB credentials. The multiplayer server itself has no auth/account system — identity is a client-chosen `clientId` + server-issued `reconnectToken`/`displayId`.
- Both single-player and the multiplayer lobby/game are playable without authentication.
- Client components must not depend on server-only secrets or external service SDKs.

## Testing Expectations

- Add or update Vitest tests in `packages/core/test` for any scoring, legal-play, trick-resolution, AI, or round-flow changes.
- Add or update Vitest tests in `apps/server/test` for multiplayer server changes (routing, room lifecycle, sessions/reconnect, persistence, timers, rate limits) and in `packages/shared/test` for protocol/schema changes.
- Use Playwright browser smoke checks in `tests/e2e` for meaningful UI changes, especially lobby start, bidding, number selection, trick completion delay, and round summary behavior. Note: e2e selectors must disambiguate the single-player "Play" button from the multiplayer "Lobby"/"Multiplayer" button (use `{ name: "Play", exact: true }` / `.playButton:not(.multiplayerButton)`).
