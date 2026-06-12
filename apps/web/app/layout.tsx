import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { appStrings, defaultLocale } from "../lib/i18n";
import { PwaRegister } from "../components/PwaRegister";

export const metadata: Metadata = {
  title: appStrings[defaultLocale].metadataTitle,
  description: appStrings[defaultLocale].metadataDescription,
  applicationName: "Domino Poker",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Domino Poker"
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#184f3d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={appStrings[defaultLocale].localeCode}>
      <body>
        {/* Agrīna `beforeinstallprompt` notveršana: Chromium to izšauj nedeterministiskā
            brīdī (parasti pie ielādes, PIRMS React hidratācijas), tāpēc React `useEffect`
            klausītājs to var nokavēt. `beforeInteractive` skripts notver eventu uz
            window un paziņo `InstallPrompt` komponentam ar custom eventu. */}
        <Script id="pwa-install-capture" strategy="beforeInteractive">{`
          window.addEventListener("beforeinstallprompt", function (event) {
            event.preventDefault();
            window.__dominoInstallPromptEvent = event;
            window.dispatchEvent(new Event("domino:installprompt"));
          });
          // Stash jātīra GLOBĀLI: ja instalēšana notiek, kamēr InstallPrompt nav
          // uzmontēts (piem. atvērts dialogs), komponenta klausītāja nav — citādi
          // pēc remount novecojušais events rādītu banneri jau instalējušam.
          window.addEventListener("appinstalled", function () {
            window.__dominoInstallPromptEvent = undefined;
          });
        `}</Script>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
