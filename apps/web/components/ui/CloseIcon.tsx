/**
 * Koplietota "aizvērt" (×) ikona dialogiem. Iepriekš identiski dublēta 5 failos
 * (AuthDialog, LobbyScreen, RulesDialog, MpLobbyDialogs, LeaderboardDialog) — viens
 * avots novērš novirzi. Tīri prezentācijas SVG; krāsa nāk no `currentColor` (sk. `.iconSvg`).
 */
export function CloseIcon() {
  return (
    <svg className="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
