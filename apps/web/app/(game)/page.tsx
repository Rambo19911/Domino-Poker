import type { Metadata } from "next";

import { AppShell } from "../../components/AppShell";
import { appStrings, defaultLocale } from "../../lib/i18n";
import { GAME_PATH, OG_IMAGE, SITE_NAME, SITE_URL } from "../../lib/site";

// Kopīgošanas attēls ir viens visai vietnei; `alt` šeit ir angļu, jo šīs saknes metadati
// nāk no `appStrings[defaultLocale]`.
const OG_IMAGE_DESCRIPTOR = {
  url: new URL(OG_IMAGE.path, SITE_URL).href,
  width: OG_IMAGE.width,
  height: OG_IMAGE.height,
  alt: OG_IMAGE.alt[defaultLocale]
};

// Canonical, Open Graph un Twitter dzīvo LAPĀ, nevis layout: Next.js metadati tiek
// mantoti, tāpēc `alternates.canonical: "/"` layout līmenī kanonizētu uz sākumlapu arī
// visas nākamās šīs saknes lapas. Publiskajām lapām ir sava sakne un savi metadati (9.2).
//
// `/` paliek ārpus `hreflang` kopas (D1), tāpēc šeit NAV `alternates.languages`.
export const metadata: Metadata = {
  alternates: { canonical: GAME_PATH },
  openGraph: {
    type: "website",
    url: GAME_PATH,
    siteName: SITE_NAME,
    title: appStrings[defaultLocale].metadataTitle,
    description: appStrings[defaultLocale].metadataDescription,
    images: [OG_IMAGE_DESCRIPTOR]
  },
  twitter: {
    // 1200×630 attēls tagad eksistē (10.3), tāpēc kartīte pāriet uz lielo formātu.
    card: "summary_large_image",
    title: appStrings[defaultLocale].metadataTitle,
    description: appStrings[defaultLocale].metadataDescription,
    images: [OG_IMAGE_DESCRIPTOR]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Neierobežot fragmentu un atļaut lielu attēla priekšskatījumu.
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1
    }
  }
};

export default function Page() {
  return <AppShell />;
}
