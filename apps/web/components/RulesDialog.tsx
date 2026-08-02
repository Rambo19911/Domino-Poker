"use client";

import { Dialog } from "./Dialog";
import { CloseIcon } from "./ui/CloseIcon";
import { IconButton } from "./ui/IconButton";
import type { AppStrings } from "../lib/i18n";
import { getSpRulesSections } from "../lib/rulesContent";
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

  const sections = getSpRulesSections(labels);

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
          <IconButton
            className="settingsCloseButton"
            label={labels.close}
            onClick={handleClose}
          >
            <CloseIcon />
          </IconButton>
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
