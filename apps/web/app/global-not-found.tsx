import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BootstrapScripts } from "../components/BootstrapScripts";

// Vairāku root layout gadījumā saknē vairs NAV `layout.tsx`, tāpēc parasts
// `not-found.tsx` renderētos bez `<html>`/`<body>`. Next.js nesakritušos URL apstrādā
// caur sintētisku `/_not-found` maršrutu, kas izmanto TIKAI saknes līmeņa
// `global-not-found` vai `not-found` — nekad grupas līmeņa. Tāpēc 404 čaulai jābūt
// šeit un tai pašai jānes `<html>`, `<body>` un globālie stili.

export const metadata: Metadata = {
  title: "404 — Domino Poker",
  description: "This page does not exist."
  // `robots: noindex` šeit NAV jāliek: Next.js to 404 atbildei pievieno pats, un otrs
  // tags radītu dublētu `<meta name="robots">`.
};

export const viewport: Viewport = {
  themeColor: "#1b6048",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function GlobalNotFound() {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <BootstrapScripts />
        <main className="notFoundPage">
          <h1>404</h1>
          <p>This page does not exist.</p>
          <p>
            <a href="/">Play Domino Poker</a>
          </p>
        </main>
      </body>
    </html>
  );
}
