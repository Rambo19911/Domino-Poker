import Script from "next/script";

import { getGlassBootstrapScript } from "../lib/glassPrefs";
import { getThemeBootstrapScript } from "../lib/theme";

/**
 * Tēmas un stikla personalizācijas bootstrap PIRMS krāsošanas (FOUC).
 *
 * Kopīgs abām root saknēm (`(game)` un `(public)`): ja publiskās lapas to zaudētu,
 * tās ielādētos ar nepareizu tēmu un pēc tam pārkrāsotos. Izcelts komponentā, nevis
 * kopēts divreiz (plāna D5).
 */
export function BootstrapScripts() {
  return (
    <>
      {/* Uzstāda `data-theme` no saglabātās izvēles, pirms React hidratē.
          Ģenerēts no `lib/theme` konstantēm. `beforeInteractive` to pacels pirms pārējā JS. */}
      <Script id="theme-bootstrap" strategy="beforeInteractive">
        {getThemeBootstrapScript()}
      </Script>
      {/* Uzstāda `data-glass` / `data-dark-glass` no saglabātajām izvēlēm. */}
      <Script id="glass-bootstrap" strategy="beforeInteractive">
        {getGlassBootstrapScript()}
      </Script>
    </>
  );
}
