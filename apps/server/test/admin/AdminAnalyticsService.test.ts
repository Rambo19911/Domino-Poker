import { describe, expect, it } from "vitest";

import { AdminAnalyticsService } from "../../src/admin/AdminAnalyticsService.js";
import type { AdminStore, LoginUserAgent, LoginUserIp } from "../../src/admin/AdminStore.js";
import type { CountryResolver } from "../../src/admin/CountryResolver.js";

/** Minimāls fake store — segments() izsauc tikai šīs 5 metodes; pārējās nav vajadzīgas. */
function fakeStore(ipPairs: LoginUserIp[], uaPairs: LoginUserAgent[]): AdminStore {
  return {
    listNewPlayers: async () => [],
    listInactivePlayers: async () => [],
    listSuspiciousPlayers: async () => [],
    successfulLoginUserIps: async () => ipPairs,
    successfulLoginUserAgents: async () => uaPairs
  } as unknown as AdminStore;
}

const PARAMS = {
  newWithinDays: 7,
  inactiveAfterDays: 30,
  suspiciousWithinDays: 7,
  suspiciousMinFailed: 5,
  limit: 50,
  geoWithinDays: 30
};

describe("AdminAnalyticsService.segments — country/platform (D4)", () => {
  it("counts DISTINCT users per country (one user from two IPs in same country = 1, not 2)", async () => {
    const ipPairs: LoginUserIp[] = [
      { userId: "u1", ip: "a" }, // US
      { userId: "u1", ip: "b" }, // US (tas pats lietotājs, cita IP)
      { userId: "u2", ip: "c" }, // US
      { userId: "u3", ip: "d" } // LV
    ];
    const resolver: CountryResolver = { resolve: (ip) => (ip === "d" ? "LV" : "US") };
    const service = new AdminAnalyticsService(fakeStore(ipPairs, []), () => 1_000_000, resolver);

    const { countries } = await service.segments(PARAMS);
    // US = {u1, u2} = 2 (NE 3 — u1 divas US IP saskaita kā 1); LV = {u3} = 1. Kārtots dilstoši.
    expect(countries).toEqual([
      { key: "US", count: 2 },
      { key: "LV", count: 1 }
    ]);
  });

  it("classifies platforms; missing UA -> 'other'; sorts by count desc then key asc", async () => {
    const uaPairs: LoginUserAgent[] = [
      { userId: "u1", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120" }, // desktop
      { userId: "u2", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120" }, // desktop
      { userId: "u3", userAgent: undefined }, // other (NULL UA)
      { userId: "u4", userAgent: "Mozilla/5.0 (iPhone) Mobile/15E148" } // mobile
    ];
    const resolver: CountryResolver = { resolve: () => "Unknown" };
    const service = new AdminAnalyticsService(fakeStore([], uaPairs), () => 1_000_000, resolver);

    const { platforms, geoTruncated } = await service.segments(PARAMS);
    expect(platforms).toEqual([
      { key: "desktop", count: 2 },
      { key: "mobile", count: 1 },
      { key: "other", count: 1 }
    ]);
    expect(geoTruncated).toBe(false);
  });
});
