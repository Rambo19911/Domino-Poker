# AI Working Rules

## Read Before Major Edits

- For rule behavior: read `packages/core/src/dominoTile.ts`, `packages/core/src/player.ts`, `packages/core/src/gameState.ts`, and `packages/core/test/dominoRules.test.ts`.
- `packages/core` source keeps extensionless relative imports for Next/Turbopack workspace transpilation. Its build script runs `packages/core/scripts/fix-esm-imports.cjs` after `tsc` so emitted `dist/*.js` files have Node-compatible `.js` ESM specifiers.
- For AI behavior: read `packages/core/src/aiService.ts` before changing heuristics.
- For app/lobby flow: read `apps/web/components/AppShell.tsx`, `apps/web/lib/i18n.ts`, and `apps/web/components/AudioControls.tsx`.
- For lobby UI controls: keep desktop wheel and compact lobby rendering in `apps/web/components/LobbyWheel.tsx`, with shared selected round count passed from `AppShell`.
- For UI/game flow: read `apps/web/components/DominoPokerGame.tsx` and `apps/web/app/globals.css`.
- For game-table UI extraction: use `apps/web/components/GameDialogs.tsx`, `apps/web/components/PlayerSeat.tsx`, `apps/web/components/InfoPanel.tsx`, and `apps/web/components/DominoTileView.tsx`; do not move deck creation, shuffle, dealing, AI timers, or trick state transitions into these UI components.
- For modal/dialog UI: use `apps/web/components/Dialog.tsx` with `apps/web/components/useDialogFocus.ts` instead of duplicating `role="dialog"`, `aria-modal`, focus trap, Escape, or focus restoration behavior.
- For local statistics behavior: read `apps/web/lib/stats/client.ts` and `apps/web/lib/stats/types.ts`.

## Rule-Specific Care Points

- Preserve tested TypeScript behavior over stale docs when they disagree. Known disagreement: `docs/domino_poker_rules_summary.md` says overtricks are `-1`, but `docs/PUNKTU_SISTEMA_PIEMERI.md` and current tests use `tricksWon * 5`.
- `shuffleSet()` intentionally uses an imperfect human-style random cut + overhand packet shuffle + random cut. This is a game-design choice to create more varied hands with more frequent 0, 5, 6, and occasional 7 trump hands. Do not replace it with Fisher-Yates unless explicitly requested.
- 0-6 is special: it is an ace only when played/required as 0; when declared as 6 it behaves as a regular 6 for ace comparison.
- Trump lead requires a stronger trump if the player has one stronger than the highest trump already in the trick.
- Non-trump required-number leads require a non-trump matching number before trumping.
- Round winner tiebreakers are round score, then bid, then tricks won, then seat order from dealer.
- The next round dealer is the previous round winner.

## Commands

- Install: `npm install`
- Typecheck: `npm run typecheck`
- Test: `npm run test`
- Web smoke tests: `npm run test:web`
- Build: `npm run build`
- Dev server: `npm run dev`
- Windows launcher: `start-domino-poker.bat`

Run `npm run typecheck`, `npm run test`, `npm run test:web`, and `npm run build` sequentially rather than in parallel because Next rewrites `.next/types` during builds and Playwright owns a dev server during smoke tests.

## Architecture Rules

- The app is local single-player only. Do not add external game hosting, matchmaking, account, auth, database, or stats services unless the user explicitly asks for a new integration.
- The main lobby keeps the multiplayer button visible but disabled.
- Local lobby stats live behind `apps/web/lib/stats/client.ts` and use browser storage only. Do not add API routes for stats unless a future task explicitly changes the architecture.
- Browser audio settings are localStorage-only and do not contain secrets.
- Use `apps/web/lib/safeStorage.ts` for localStorage access so unavailable, blocked, or throwing storage does not crash the app.
- Keep `useAudioSettings()` owned by `AppShell` so lobby and game share one audio state and one background music element.
- Keep configurable game setup owned by `AppShell`; the lobby-selected round count is passed into `DominoPokerGame` as `numberOfRounds`.
- The lobby uses the circular mode wheel for desktop-sized viewports and a separate compact control panel for narrow or short viewports. Do not solve lobby fit issues by uniformly shrinking the wheel until labels and controls become impractical.
- The game table currently preserves a fixed 1920x1080 coordinate layout and uses uniform contain scaling so the full stage remains visible. Do not convert this to phone portrait reflow unless explicitly requested.
- Keep user-facing web text in `apps/web/lib/locales/*.ts` and register locales through `apps/web/lib/i18n.ts`; pass the active locale strings through component props instead of importing a fixed strings object or writing hardcoded JSX text.
- Keep locale switching owned by `AppShell`; the selected locale is persisted in `localStorage` under `domino-poker-locale`.

## Security And Configuration

- Never commit secrets, service keys, OAuth credentials, session credentials, or local secret files.
- Do not reintroduce removed service environment variables or ignored local secret directories for this local-only game.
- The web app should be playable without authentication.
- Client components must not depend on server-only secrets or external service SDKs.

## Testing Expectations

- Add or update Vitest tests in `packages/core/test` for any scoring, legal-play, trick-resolution, AI, or round-flow changes.
- Use Playwright browser smoke checks in `tests/e2e` for meaningful UI changes, especially lobby start, bidding, number selection, trick completion delay, and round summary behavior.
