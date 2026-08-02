import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "../globals.css";
import { appStrings, defaultLocale } from "../../lib/i18n";
import { BootstrapScripts } from "../../components/BootstrapScripts";
import { PwaRegister } from "../../components/PwaRegister";
import { SITE_NAME, SITE_URL } from "../../lib/site";

export const metadata: Metadata = {
  // Bāze relatīvo metadatu URL atrisināšanai (canonical, Open Graph). Nāk no
  // `lib/site.ts`, lai kanoniskais domēns paliktu vienā vietā.
  metadataBase: SITE_URL,
  title: {
    // Spēles saknei — pilns, dabisks nosaukums; veidne attiecas uz iespējamām
    // nākamajām šīs saknes lapām.
    default: appStrings[defaultLocale].metadataTitle,
    template: `%s | ${SITE_NAME}`
  },
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
  // Sinhronizēts ar --background (tokens.css); PWA prasa literālu HEX.
  themeColor: "#1b6048",
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
    // suppressHydrationWarning: tēmas bootstrap (zemāk) drīkst mainīt `<html
    // data-theme>` PIRMS hidratācijas; tas ir gaidīts vienlīmeņa neatbilstības
    // izņēmums (escape hatch), neslēpj bērnu mezglu neatbilstības.
    <html lang={appStrings[defaultLocale].localeCode} suppressHydrationWarning>
      <body>
        {/* Tēmas un stikla bootstrap PIRMS krāsošanas (FOUC). Kopīgs ar publisko
            sakni, tāpēc dzīvo atsevišķā komponentā, nevis kopēts divreiz. */}
        <BootstrapScripts />
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
