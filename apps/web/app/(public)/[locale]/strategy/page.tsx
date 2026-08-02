import type { Metadata } from "next";

import { PublicPageShell } from "../../../../components/public/PublicPageShell";
import { getStrategy } from "../../../../lib/publicContent";
import { publicPageMetadata, resolvePublicPage } from "../../../../lib/publicPage";

export async function generateMetadata({
  params
}: {
  readonly params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { doc } = await resolvePublicPage(params, "strategy");
  return publicPageMetadata(doc);
}

export default async function StrategyPage({
  params
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale, doc } = await resolvePublicPage(params, "strategy");
  const strategy = getStrategy(locale);

  return (
    <PublicPageShell doc={doc}>
      <p className="publicLead">{strategy.intro}</p>
      {strategy.sections.map((section) => (
        <section className="publicSection" key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
      <p className="publicNote">{strategy.disclaimer}</p>
    </PublicPageShell>
  );
}
