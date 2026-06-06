import type { Metadata, Viewport } from "next";
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
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
