import type { Metadata } from "next";

import { PublicPageShell } from "../../../../components/public/PublicPageShell";
import { getAppStrings } from "../../../../lib/i18n";
import { getMpRulesDoc } from "../../../../lib/mpRulesContent";
import { getPublicChrome } from "../../../../lib/publicNav";
import { publicPageMetadata, resolvePublicPage } from "../../../../lib/publicPage";
import { getSpRulesSections } from "../../../../lib/rulesContent";

// Noteikumu teksts NETIEK dublēts: SP nāk no `rulesContent.ts` (to pašu renderē arī
// spēles dialogs), MP — no `mpRulesContent.ts`. Šeit ir tikai izkārtojums un enkuri.

export async function generateMetadata({
  params
}: {
  readonly params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { doc } = await resolvePublicPage(params, "rules");
  return publicPageMetadata(doc);
}

export default async function RulesPage({
  params
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale, doc } = await resolvePublicPage(params, "rules");
  const chrome = getPublicChrome(locale);
  const spSections = getSpRulesSections(getAppStrings(locale));
  const mpDoc = getMpRulesDoc(locale);

  const spId = (index: number) => `sp-${index}`;
  const mpId = (index: number) => `mp-${index}`;

  return (
    <PublicPageShell doc={doc}>
      <nav className="publicToc" aria-label={chrome.contentsLabel}>
        <h2>{chrome.contentsLabel}</h2>
        <ol>
          <li>
            <a href="#single-player">{chrome.rulesSinglePlayer}</a>
            <ul>
              {spSections.map((section, index) => (
                <li key={section.title}>
                  <a href={`#${spId(index)}`}>{section.title}</a>
                </li>
              ))}
            </ul>
          </li>
          <li>
            <a href="#multiplayer">{chrome.rulesMultiplayer}</a>
            <ul>
              {mpDoc.sections.map((section, index) => (
                <li key={section.title}>
                  <a href={`#${mpId(index)}`}>{section.title}</a>
                </li>
              ))}
            </ul>
          </li>
        </ol>
      </nav>

      <section className="publicSection" id="single-player">
        <h2>{chrome.rulesSinglePlayer}</h2>
        {spSections.map((section, index) => (
          <section className="publicSubSection" id={spId(index)} key={section.title}>
            <h3>{section.title}</h3>
            {section.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
      </section>

      <section className="publicSection" id="multiplayer">
        <h2>{chrome.rulesMultiplayer}</h2>
        {mpDoc.intro.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {mpDoc.sections.map((section, index) => (
          <section className="publicSubSection" id={mpId(index)} key={section.title}>
            <h3>{section.title}</h3>
            {section.blocks.map((block) =>
              typeof block === "string" ? (
                <p key={block}>{block}</p>
              ) : (
                <ul key={block.list.join("|")}>
                  {block.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )
            )}
          </section>
        ))}
      </section>
    </PublicPageShell>
  );
}
