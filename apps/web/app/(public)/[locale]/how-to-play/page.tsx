import type { Metadata } from "next";

import { PublicPageShell } from "../../../../components/public/PublicPageShell";
import { getHowToPlay } from "../../../../lib/publicContent";
import { getPublicChrome } from "../../../../lib/publicNav";
import { publicPageMetadata, resolvePublicPage } from "../../../../lib/publicPage";
import { PUBLIC_ROUTES } from "../../../../lib/site";

export async function generateMetadata({
  params
}: {
  readonly params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { doc } = await resolvePublicPage(params, "howToPlay");
  return publicPageMetadata(doc);
}

export default async function HowToPlayPage({
  params
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale, doc } = await resolvePublicPage(params, "howToPlay");
  const howTo = getHowToPlay(locale);

  return (
    <PublicPageShell doc={doc}>
      <p className="publicLead">{howTo.intro}</p>
      {/* Secīga pamācība: `<ol>` nes soļu secību arī bez CSS un bez JavaScript. */}
      <ol className="publicSteps">
        {howTo.steps.map((step) => (
          <li key={step.title}>
            <h2>{step.title}</h2>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
      <p className="publicNote">
        {howTo.fullRulesNote}{" "}
        <a href={PUBLIC_ROUTES[locale].rules}>{getPublicChrome(locale).nav.rules}</a>
      </p>
    </PublicPageShell>
  );
}
