import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
// NEVIS `globals.css`: tas ievelk visus 29 stilu failus, no kuriem publiskās lapas lieto
// piecus. Sk. `app/public.css` galvenē — tur ir gan mērījums, gan katra faila pamatojums.
import "../../public.css";
import { BootstrapScripts } from "../../../components/BootstrapScripts";
import { PwaRegister } from "../../../components/PwaRegister";
import {
  INDEXED_LOCALES,
  SITE_URL,
  isIndexedLocale,
  type IndexedLocale
} from "../../../lib/site";

// Otrā root sakne (D5). Publiskajām lapām dokumenta valoda jābūt pareizai jau serverī,
// tāpēc tām ir savs `<html lang>`; spēles sakne `(game)` paliek neskarta.
//
// Navigācija starp abām saknēm ir pilna lapas pārlāde — tas ir Next.js uzvedība ar
// vairākiem root layout un šeit ir pieņemts: publiskās saites tāpat ir parastas
// `<a href>` navigācijas.

// Vairāku root layout gadījumā metadatu koks NETIEK mantots no spēles saknes, tāpēc
// `metadataBase` jānorāda arī šeit — bez tā 9.2 relatīvie canonical/alternates
// neatrisinātos pret produkcijas domēnu. Pašus lapu metadatus (title, description,
// canonical, hreflang) pievieno 9.2 katrā lapā ar `generateMetadata()`.
export const metadata: Metadata = {
  metadataBase: SITE_URL
};

export const viewport: Viewport = {
  // Tāds pats kā spēles saknē; PWA prasa literālu HEX.
  themeColor: "#1b6048",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

// Tikai `en` un `lv` tiek ģenerētas; kopā ar `dynamicParams = false` jebkurš cits
// segments ir statisks 404, nevis SSR ceļš.
export function generateStaticParams(): { locale: IndexedLocale }[] {
  return INDEXED_LOCALES.map((locale) => ({ locale }));
}

export const dynamicParams = false;

export default async function PublicRootLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  // Next.js 16: dinamisko segmentu `params` ir Promise.
  const { locale } = await params;

  // Nederīgu locale NEKAD nerādām ar angļu saturu — tā būtu klusa datu maiņa.
  if (!isIndexedLocale(locale)) notFound();

  return (
    // suppressHydrationWarning: tēmas bootstrap drīkst mainīt `<html data-theme>`
    // PIRMS hidratācijas (tāpat kā spēles saknē).
    <html lang={locale} suppressHydrationWarning>
      <body>
        <BootstrapScripts />
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
