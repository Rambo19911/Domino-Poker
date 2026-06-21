// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StatisticsPanel } from "../components/auth/StatisticsPanel";
import { en } from "../lib/locales/en";
import * as statsApi from "../lib/stats/playerStats";
import type { PlayerStats } from "../lib/stats/playerStats";

afterEach(cleanup);

const emptyDist = { p1: 0, p2: 0, p3: 0, p4: 0 } as const;

const sample: PlayerStats = {
  bidAccuracy: { met: 10, exceeded: 5, missed: 5 }, // 50% / 25% / 25%
  spByDifficulty: {
    medium: { p1: 2, p2: 1, p3: 1, p4: 0 },
    hard: { p1: 1, p2: 0, p3: 0, p4: 0 },
    epic: emptyDist
  },
  mpPlacement: { p1: 0, p2: 1, p3: 0, p4: 1 }
};

const empty: PlayerStats = {
  bidAccuracy: { met: 0, exceeded: 0, missed: 0 },
  spByDifficulty: { medium: emptyDist, hard: emptyDist, epic: emptyDist },
  mpPlacement: emptyDist
};

describe("StatisticsPanel", () => {
  it("renders bid accuracy and placement sections once stats load", async () => {
    vi.spyOn(statsApi, "apiGetStats").mockResolvedValue({ ok: true, data: sample });
    render(<StatisticsPanel labels={en} getToken={() => "tok"} />);
    await waitFor(() => expect(screen.getByText(en.statsBidAccuracy)).toBeTruthy());
    expect(screen.getAllByText("50%").length).toBeGreaterThan(0); // 10/20 met
    expect(screen.getByText(en.statsPlacementVsBots)).toBeTruthy();
    expect(screen.getByText(en.statsMpPlacement)).toBeTruthy();
    // Taktiskās tendences atvasinātas no tiem pašiem datiem (over/under-bidding).
    expect(screen.getByText(en.statsOverbidding)).toBeTruthy();
    expect(screen.getByText(en.statsUnderbidding)).toBeTruthy();
  });

  it("shows the empty state when there are no games", async () => {
    vi.spyOn(statsApi, "apiGetStats").mockResolvedValue({ ok: true, data: empty });
    render(<StatisticsPanel labels={en} getToken={() => "tok"} />);
    await waitFor(() => expect(screen.getByText(en.statsEmpty)).toBeTruthy());
  });

  it("shows an error message when the fetch fails", async () => {
    vi.spyOn(statsApi, "apiGetStats").mockResolvedValue({ ok: false, status: 500, error: "internal_error" });
    render(<StatisticsPanel labels={en} getToken={() => "tok"} />);
    await waitFor(() => expect(screen.getByText(en.statsLoadError)).toBeTruthy());
  });
});
