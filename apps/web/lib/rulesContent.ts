// Viena spēlētāja (single-player) noteikumu dokumenta struktūra.
//
// Izcelts no `components/RulesDialog.tsx`, lai to pašu dokumentu varētu renderēt gan
// dialogs, gan publiskā, serverī renderētā noteikumu lapa. Divi atšķirīgi noteikumu
// avoti laika gaitā kļūtu pretrunīgi (plāna D3: viena patiesības vieta).
//
// Modulis ir serverim drošs: `AppStrings` tiek importēts kā TIPS (imports tiek
// izdzēsts būvējot), nav `"use client"`, hooku vai pārlūka API. Teksti joprojām nāk
// no `lib/locales/*` — šeit ir tikai to strukturēšana sekcijās.

import type { AppStrings } from "./i18n";

export interface SpRuleSection {
  readonly title: string;
  readonly body: readonly string[];
}

export function getSpRulesSections(labels: AppStrings): readonly SpRuleSection[] {
  return [
    {
      title: labels.rulesObjectiveTitle,
      body: [labels.rulesObjectiveBody]
    },
    {
      title: labels.rulesSetupTitle,
      body: [labels.rulesSetupBody]
    },
    {
      title: labels.rulesRoundFlowTitle,
      body: [labels.rulesRoundFlowBody]
    },
    {
      title: labels.rulesBiddingTitle,
      body: [
        labels.rulesBiddingBody,
        labels.rulesBiddingExact,
        labels.rulesBiddingOver,
        labels.rulesBiddingUnder,
        labels.rulesBiddingSeven
      ]
    },
    {
      title: labels.rulesTileRanksTitle,
      body: [labels.rulesTrumpsBody, labels.rulesAcesBody, labels.rulesRegularTilesBody]
    },
    {
      title: labels.rulesPlayTitle,
      body: [
        labels.rulesPlayLeadBody,
        labels.rulesPlayTrumpBody,
        labels.rulesPlayAceBody,
        labels.rulesPlayRegularBody
      ]
    },
    {
      title: labels.rulesWinTitle,
      body: [labels.rulesWinBody]
    },
    {
      title: labels.rulesCoinsTitle,
      body: [labels.rulesCoinsIntro, labels.rulesCoinsSpBody, labels.rulesCoinsMpBody]
    },
    {
      title: labels.rulesStatsTitle,
      body: [labels.rulesStatsBody]
    }
  ];
}
