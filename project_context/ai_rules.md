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
- AI tile selection intentionally preserves its existing heuristic ace context through `isStrongerTileWithContext`; do not replace it with plain `isStrongerTile` without updating AI behavior tests and product expectations.
- Trump lead requires a stronger trump if the player has one stronger than the highest trump already in the trick.
- Non-trump required-number leads require a non-trump matching number before trumping.
- UI invalid-move messages should use core `getInvalidMoveReason(...)` from `packages/core/src/player.ts`; do not infer message type directly from approximate `GameState` flags.
- Round winner tiebreakers are round score, then bid, then tricks won, then seat order from dealer.
- Final game winner tiebreakers are total score first, then the same bid/tricks-won/seat-order tiebreakers used for round winners.
- The next round dealer is the previous round winner.

## Commands

- Install: `npm install`
- Typecheck: `npm run typecheck`
- Test: `npm run test`
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

Run `npm run typecheck`, `npm run test`, `npm run test:web`, and `npm run build` sequentially rather than in parallel because Next rewrites `.next/types` during builds and Playwright owns a dev server during smoke tests.

## Architecture Rules

- The app is local single-player only. Do not add external game hosting, matchmaking, account, auth, database, or stats services unless the user explicitly asks for a new integration.
- The main lobby keeps the multiplayer button visible but disabled.
- Lobby statistics and game-session tracking were removed; do not reintroduce stats storage, stats UI, or stats API routes unless the user explicitly asks for them.
- Browser audio settings are localStorage-only and do not contain secrets.
- `useAudioSettings()` reuses a small pool of effect audio elements; do not switch back to creating a new `Audio` object on every effect play.
- Use `apps/web/lib/safeStorage.ts` for localStorage access so unavailable, blocked, or throwing storage does not crash the app.
- Keep `useAudioSettings()` owned by `AppShell` so lobby and game share one audio state and one background music element.
- Keep configurable game setup owned by `AppShell`; the lobby-selected round count is passed into `DominoPokerGame` as `numberOfRounds`.
- Multiplayer implementation exists across `packages/core/src/multiplayer`, `packages/shared`, `apps/server`, and `apps/web/lib/mp`/`components/MultiplayerLobby.tsx`. Keep new MP protocol/UI work in those zones and do not mix it into single-player logic.
- The lobby uses the circular mode wheel for desktop-sized viewports and a separate compact control panel for narrow or short viewports. Do not solve lobby fit issues by uniformly shrinking the wheel until labels and controls become impractical.
- The game table currently preserves a fixed 1920x1080 coordinate layout and uses uniform contain scaling so the full stage remains visible. Do not convert this to phone portrait reflow unless explicitly requested.
- Keep user-facing web text in `apps/web/lib/locales/*.ts` and register locales through `apps/web/lib/i18n.ts`; pass the active locale strings through component props instead of importing a fixed strings object or writing hardcoded JSX text.
- Keep locale switching owned by `AppShell`; the selected locale is persisted in `localStorage` under `domino-poker-locale`.

## Security And Configuration

- Never commit secrets, service keys, OAuth credentials, session credentials, or local secret files.
- Never commit local runtime databases; `data/*.sqlite` is intentionally ignored.
- Do not reintroduce removed service environment variables or ignored local secret directories for this local-only game.
- The web app should be playable without authentication.
- Client components must not depend on server-only secrets or external service SDKs.

## Testing Expectations

- Add or update Vitest tests in `packages/core/test` for any scoring, legal-play, trick-resolution, AI, or round-flow changes.
- Use Playwright browser smoke checks in `tests/e2e` for meaningful UI changes, especially lobby start, bidding, number selection, trick completion delay, and round summary behavior.
