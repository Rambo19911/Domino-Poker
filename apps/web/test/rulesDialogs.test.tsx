// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RulesDialog } from "../components/RulesDialog";
import { MpLobbyDialogs } from "../components/mp/MpLobbyDialogs";
import type { AppStrings } from "../lib/i18n";
import { en } from "../lib/locales/en";
import { lv } from "../lib/locales/lv";
import type { AudioSettings } from "../lib/useAudioSettings";

afterEach(cleanup);

const audio = { play: () => {}, isMuted: false, toggleMute: () => {} } as unknown as AudioSettings;

describe("RulesDialog gold-coin section (Phase 5)", () => {
  it("renders the gold-coin rules section in English", () => {
    render(<RulesDialog audio={audio} labels={en} onClose={() => {}} />);
    expect(screen.getByText(en.rulesCoinsTitle)).toBeTruthy();
    expect(screen.getByText(en.rulesCoinsIntro)).toBeTruthy();
  });

  it("renders the gold-coin rules section in Latvian", () => {
    render(<RulesDialog audio={audio} labels={lv} onClose={() => {}} />);
    expect(screen.getByText(lv.rulesCoinsTitle)).toBeTruthy();
    expect(screen.getByText(lv.rulesCoinsIntro)).toBeTruthy();
  });
});

describe("MP rules dialog gold-coin section (Phase 5)", () => {
  function renderMpRules(labels: AppStrings) {
    render(
      <MpLobbyDialogs
        isCreateOpen={false}
        isJoinCodeOpen={false}
        isRulesOpen
        isDeleteRoomOpen={false}
        isConnected
        hostBalance={undefined}
        audio={audio}
        labels={labels}
        onCreate={() => {}}
        onCancelCreate={() => {}}
        onJoin={() => {}}
        onCancelJoin={() => {}}
        onCloseRules={() => {}}
        onConfirmDeleteRoom={() => {}}
        onCancelDeleteRoom={() => {}}
      />
    );
  }

  it("shows the paid-room rules heading in English", () => {
    renderMpRules(en);
    expect(screen.getByRole("heading", { name: "Gold Coins and Paid Rooms" })).toBeTruthy();
  });

  it("shows the paid-room rules heading in Latvian", () => {
    renderMpRules(lv);
    expect(screen.getByRole("heading", { name: "Zelta monētas un maksas istabas" })).toBeTruthy();
  });
});
