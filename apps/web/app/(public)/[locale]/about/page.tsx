import type { Metadata } from "next";

import { PublicPageShell } from "../../../../components/public/PublicPageShell";
import { getAbout } from "../../../../lib/publicContent";
import { publicPageMetadata, resolvePublicPage } from "../../../../lib/publicPage";
import { GITHUB_REPO_URL } from "../../../../lib/site";

export async function generateMetadata({
  params
}: {
  readonly params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { doc } = await resolvePublicPage(params, "about");
  return publicPageMetadata(doc);
}

export default async function AboutPage({
  params
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale, doc } = await resolvePublicPage(params, "about");
  const about = getAbout(locale);

  return (
    <PublicPageShell doc={doc}>
      <p className="publicLead">{about.intro}</p>
      {/* Fakti ir termins–vērtība pāri, tāpēc `<dl>` ir pareizā semantika. */}
      <dl className="publicFacts">
        {about.facts.map((fact) => (
          <div className="publicFact" key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>
              {fact.value === GITHUB_REPO_URL ? (
                <a href={GITHUB_REPO_URL} rel="noopener noreferrer">
                  {GITHUB_REPO_URL}
                </a>
              ) : (
                fact.value
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="publicNote">{about.coinsNote}</p>
    </PublicPageShell>
  );
}
