# Repository Overview

This repository is a Next.js + React + TypeScript monorepo for a browser-playable local single-player Domino Poker game.

## Purpose

Provide a four-player Domino Poker game in the browser: one human player against three CPU players, configurable round count, shared audio controls, locale switching, localized rules dialog, disabled multiplayer entry in the main lobby, and local lobby statistics stored in the browser.

The project must run without external game, account, database, deployment, or matchmaking services.

## Main Technologies

- npm workspaces for the monorepo.
- Next.js App Router and React for the web UI in `apps/web`.
- TypeScript for app code and pure rule logic.
- Browser `localStorage` for local statistics and audio/locale preferences.
- Vitest for pure rule tests in `packages/core`.

## Main Folders

- `apps/web`: Next.js UI, main lobby, localized rules dialog, single-player game screen, settings dialog, local stats client, CSS, and public game assets.
- `packages/core`: pure TypeScript game rules, domino hierarchy, legal-play validation, bidding, trick resolution, scoring, round flow, and CPU AI decisions.
- `docs`: game rules, scoring notes, and strategy documents.
- `Screenshots`: public README screenshots for the lobby, game room, settings, and rules dialog.
- `project_context`: AI navigation notes for future work.

## Key Workflows

- Install dependencies: `npm install`
- Development server: `npm run dev`
- Typecheck all workspaces: `npm run typecheck`
- Run tests: `npm run test`
- Production build: `npm run build`

## Fragile Or High-Risk Areas

- `packages/core/src/gameState.ts`: trick winner resolution, special 0-6 ace behavior, round winner tiebreakers, dealer rotation, and configured round count.
- `packages/core/src/dominoTile.ts`: `shuffleSet()` intentionally uses an imperfect human-style shuffle, not a perfect Fisher-Yates shuffle, to preserve tile clusters and create higher hand variety.
- `packages/core/src/player.ts`: legal-play validation for trump leads and required-number leads.
- `packages/core/src/aiService.ts`: intentionally preserves original AI heuristics, including its simpler trick-strength comparison.
- `apps/web/components/AppShell.tsx`: main lobby, localized rules dialog, disabled multiplayer button, game screen switching, local stats session lifecycle, locale selection, and shared audio settings ownership.
- `apps/web/components/DominoPokerGame.tsx`: async AI turn timers, delayed trick completion, round end handling, and game exit behavior.
- `apps/web/lib/stats/client.ts`: browser-only local statistics persistence; must not depend on external APIs or services.
- `apps/web/app/globals.css`: fixed 16:9 table layout and domino rendering styles.
