"use client";

import { Dialog } from "./Dialog";
import type { AppStrings } from "../lib/i18n";
import type { AudioSettings } from "../lib/useAudioSettings";

export function RulesDialog({
  audio,
  labels,
  onClose
}: {
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly onClose: () => void;
}) {
  const handleClose = () => {
    audio.play("uiClick");
    onClose();
  };

  const sections = [
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
      title: labels.rulesStatsTitle,
      body: [labels.rulesStatsBody]
    }
  ] as const;

  return (
    <Dialog
      ariaLabelledBy="rules-title"
      className="alertDialog rulesDialog"
      onEscape={handleClose}
      resetScrollOnMount
    >
        <div className="settingsHeader">
          <div>
            <h2 id="rules-title"><HelpIcon /> {labels.rules}</h2>
            <p>{labels.rulesDescription}</p>
          </div>
          <button
            className="iconButton settingsCloseButton"
            type="button"
            aria-label={labels.close}
            onClick={handleClose}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="rulesContent">
          {sections.map((section) => (
            <section className="rulesSection" key={section.title}>
              <h3>{section.title}</h3>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>
    </Dialog>
  );
}

export function HelpIcon() {
  return (
    <span className="helpAssetIcon" aria-hidden="true">
      <img
        className="helpAssetIconFrame static"
        src="/assets/icons/circle-question_solid.svg"
        alt=""
      />
      <img
        className="helpAssetIconFrame animated"
        src="/assets/icons/circle-question_solid_flip.svg"
        alt=""
      />
    </span>
  );
}

function CloseIcon() {
  return (
    <svg className="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
