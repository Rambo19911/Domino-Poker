import type { Metadata } from "next";

import { JsonLd } from "../../../components/JsonLd";
import { PublicPageShell } from "../../../components/public/PublicPageShell";
import { gameStructuredData } from "../../../lib/gameStructuredData";
import { getHome, getScreenshots } from "../../../lib/publicContent";
import { publicPageMetadata, resolvePublicPage } from "../../../lib/publicPage";

// Metadati ir Server Component robežā un lasa to pašu kontrakta dokumentu, ko lapa,
// tāpēc redzamais saturs un `<title>`/apraksts nevar aiziet viens no otra.
export async function generateMetadata({
  params
}: {
  readonly params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { doc } = await resolvePublicPage(params, "home");
  return publicPageMetadata(doc);
}

export default async function PublicHomePage({
  params
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale, doc } = await resolvePublicPage(params, "home");
  const home = getHome(locale);
  const screenshots = getScreenshots(locale);

  return (
    <PublicPageShell doc={doc}>
      {/* Spēles entītija. Tikai šeit: abas valodu versijas apraksta VIENU spēli ar kopīgu
          `@id`, un atkārtošana pārējās lapās to tikai dublētu. */}
      <JsonLd data={gameStructuredData(locale)} />
      <p className="publicLead">{home.intro}</p>
      {home.sections.map((section) => (
        <section className="publicSection" key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}

      {/* Ekrānattēli. Parasts `<img>` ar `srcSet`, nevis `next/image`: WebP faili jau ir
          sagatavoti divos izmēros, tāpēc izpildlaika optimizators un tā slodze uz VPS
          nedod neko klāt. (`next/image` arī renderētu HTML serverī — tā nav atšķirība.)
          `width`/`height` novērš izkārtojuma lēkāšanu (CLS). `alt` apraksta attēlu tiem,
          kas to neredz, un APZINĀTI nedublē redzamo parakstu. */}
      <section className="publicSection" id="screenshots">
        <h2>{home.galleryHeading}</h2>
        <div className="publicGallery">
          {screenshots.map((image) => (
            <figure className="publicFigure" key={image.slug}>
              <img
                src={`/images/${image.slug}-1440.webp`}
                srcSet={`/images/${image.slug}-800.webp 800w, /images/${image.slug}-1440.webp 1440w`}
                sizes="(max-width: 720px) 100vw, 640px"
                width={image.width}
                height={image.height}
                alt={image.alt}
                loading="lazy"
                decoding="async"
              />
              <figcaption>{image.caption}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </PublicPageShell>
  );
}
