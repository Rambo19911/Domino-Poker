import type { Metadata } from "next";
import "./globals.css";
import { appStrings, defaultLocale } from "../lib/i18n";

export const metadata: Metadata = {
  title: appStrings[defaultLocale].metadataTitle,
  description: appStrings[defaultLocale].metadataDescription
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={appStrings[defaultLocale].localeCode}>
      <body>{children}</body>
    </html>
  );
}
