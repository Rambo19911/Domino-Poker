"use client";

import { useEffect, useRef } from "react";
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
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    dialog.scrollTop = 0;
    const timeoutId = window.setTimeout(() => {
      dialog.scrollTop = 0;
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

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
    }
  ] as const;

  return (
    <div className="modalBackdrop">
      <section ref={dialogRef} className="alertDialog rulesDialog" aria-labelledby="rules-title">
        <div className="settingsHeader">
          <div>
            <h2 id="rules-title"><HelpIcon /> {labels.rules}</h2>
            <p>{labels.rulesDescription}</p>
          </div>
          <button
            className="iconButton settingsCloseButton"
            type="button"
            aria-label={labels.close}
            onClick={() => {
              audio.play("uiClick");
              onClose();
            }}
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
      </section>
    </div>
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
