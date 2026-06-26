import type { AdminStore, SegmentPlayer, SuspiciousPlayer } from "./AdminStore.js";
import type { CountryResolver } from "./CountryResolver.js";
import { classifyPlatform } from "./platform.js";

/**
 * Admin analītikas serviss (Fāze 4A, read-only). Komponē agregātu vaicājumus no `AdminStore`
 * pārskatam, aktivitātes laikrindai un segmentiem. Visi skaitļi ir servera-autoritatīvi; nekādu
 * mutāciju. Dienu bucketi ir UTC (`created_at / 86400000` = epohas-dienas indekss).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Drošības griesti distinct (lietotājs, IP/UA) pāriem, ko velk valsts/platformas segmentiem.
 * Aizsargā pret neierobežotu kardinalitāti (Codex). Ja sasniegts → `geoTruncated = true`
 * (skaiti daļēji, NE kluss cap).
 */
const GEO_DISTINCT_PAIR_CAP = 50_000;

/** Pārskata metrikas (Fāze 4A.1). */
export interface AnalyticsOverview {
  readonly totalUsers: number;
  readonly newUsers7d: number;
  readonly newUsers30d: number;
  /** "successful-login active users" (atšķirīgi konti ar veiksmīgu login logā). */
  readonly activeUsers7d: number;
  readonly activeUsers30d: number;
  readonly totalMatches: number;
  /** Materializētās monētu bilances (rindas eksistē tikai pēc pirmā getBalance). */
  readonly totalCoins: number;
  readonly activeBans: number;
}

/** Viena diena aktivitātes laikrindā (UTC). */
export interface ActivityDay {
  readonly date: string;
  readonly registrations: number;
  readonly logins: number;
}

/** Viens valsts/platformas spaiņa skaits (D4). `key` = ISO valsts kods vai platformas spainis. */
export interface SegmentBucket {
  readonly key: string;
  readonly count: number;
}

/** Segmentu rezultāts (Fāze 4A.2; D4 valsts/platforma iekļauta). */
export interface AnalyticsSegments {
  readonly newPlayers: readonly SegmentPlayer[];
  readonly inactivePlayers: readonly SegmentPlayer[];
  readonly suspiciousPlayers: readonly SuspiciousPlayer[];
  /** Unikāli spēlētāji uz valsti (GeoIP no veiksmīgo login IP `geoWithinDays` logā), skaits dilstoši. */
  readonly countries: readonly SegmentBucket[];
  /** Unikāli spēlētāji uz platformu (mobile/desktop/other) tajā pašā logā, skaits dilstoši. */
  readonly platforms: readonly SegmentBucket[];
  /** `true`, ja distinct-pāru skaits sasniedza drošības griestus → valsts/platformas skaiti daļēji. */
  readonly geoTruncated: boolean;
}

export interface AnalyticsSegmentParams {
  /** Cik dienas atpakaļ skaitās "jauns" (noklusējums 7). */
  readonly newWithinDays: number;
  /** Cik dienas bez veiksmīga login skaitās "neaktīvs" (noklusējums 30). */
  readonly inactiveAfterDays: number;
  /** Aizdomīguma logs dienās (noklusējums 7) + minimālais neveiksmju skaits. */
  readonly suspiciousWithinDays: number;
  readonly suspiciousMinFailed: number;
  readonly limit: number;
  /** Logs dienās valsts/platformas distribūcijai (noklusējums 30). */
  readonly geoWithinDays: number;
}

/**
 * Saliek distinct `(userId, ...)` pārus spaiņos pēc `keyOf`, skaitot UNIKĀLUS lietotājus uz spaini
 * (`Set<userId>`). Tāpēc viens lietotājs no 2 IP vienā valstī = 1 (Codex: novērš pārskaitīšanu),
 * bet lietotājs no 2 valstīm skaitās abās. Kārto pēc skaita dilstoši, tad atslēgas augoši (stabils).
 */
function bucketize<T extends { readonly userId: string }>(
  pairs: readonly T[],
  keyOf: (pair: T) => string
): readonly SegmentBucket[] {
  const byKey = new Map<string, Set<string>>();
  for (const pair of pairs) {
    const key = keyOf(pair);
    let users = byKey.get(key);
    if (!users) {
      users = new Set();
      byKey.set(key, users);
    }
    users.add(pair.userId);
  }
  return [...byKey.entries()]
    .map(([key, users]) => ({ key, count: users.size }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export class AdminAnalyticsService {
  constructor(
    private readonly store: AdminStore,
    private readonly clock: () => number,
    private readonly countryResolver: CountryResolver
  ) {}

  /** Pārskata metrikas (7d + 30d logi). */
  async overview(): Promise<AnalyticsOverview> {
    const now = this.clock();
    const since7d = now - 7 * DAY_MS;
    const since30d = now - 30 * DAY_MS;
    const [
      totalUsers,
      newUsers7d,
      newUsers30d,
      activeUsers7d,
      activeUsers30d,
      totalMatches,
      totalCoins,
      activeBans
    ] = await Promise.all([
      this.store.countUsers(),
      this.store.countNewUsers(since7d),
      this.store.countNewUsers(since30d),
      this.store.countActiveUsers(since7d),
      this.store.countActiveUsers(since30d),
      this.store.countMatches(),
      this.store.sumCoinBalances(),
      this.store.countActiveBans(now)
    ]);
    return {
      totalUsers,
      newUsers7d,
      newUsers30d,
      activeUsers7d,
      activeUsers30d,
      totalMatches,
      totalCoins,
      activeBans
    };
  }

  /**
   * Aktivitātes laikrinda pēdējām `days` UTC KALENDĀRAJĀM dienām (ieskaitot šodienu) — tieši
   * `days` rindas (reģistrācijas + veiksmīgi login), tukšās aizpildītas ar 0.
   */
  async activity(days: number): Promise<readonly ActivityDay[]> {
    const now = this.clock();
    const lastDay = Math.floor(now / DAY_MS);
    const firstDay = lastDay - (days - 1);
    const sinceMs = firstDay * DAY_MS;
    const [regs, logins] = await Promise.all([
      this.store.dailyRegistrations(sinceMs),
      this.store.dailyLogins(sinceMs)
    ]);
    const regByDay = new Map(regs.map((r) => [r.day, r.count]));
    const loginByDay = new Map(logins.map((r) => [r.day, r.count]));
    const out: ActivityDay[] = [];
    for (let day = firstDay; day <= lastDay; day += 1) {
      out.push({
        date: new Date(day * DAY_MS).toISOString().slice(0, 10),
        registrations: regByDay.get(day) ?? 0,
        logins: loginByDay.get(day) ?? 0
      });
    }
    return out;
  }

  /**
   * Segmenti: jaunie / neaktīvie / aizdomīgie (capped saraksti) + valsts/platformas distribūcija
   * (D4). Valsti/platformu atvasina LASĪŠANAS laikā no veiksmīgo login distinct pāriem; skaita
   * unikālus lietotājus uz spaini. Jēldati (IP/UA) NEpamet servisu — atbildē tikai agregāti.
   */
  async segments(params: AnalyticsSegmentParams): Promise<AnalyticsSegments> {
    const now = this.clock();
    const geoSince = now - params.geoWithinDays * DAY_MS;
    const [newPlayers, inactivePlayers, suspiciousPlayers, ipPairs, uaPairs] = await Promise.all([
      this.store.listNewPlayers(now - params.newWithinDays * DAY_MS, params.limit),
      this.store.listInactivePlayers(now - params.inactiveAfterDays * DAY_MS, params.limit),
      this.store.listSuspiciousPlayers(
        now - params.suspiciousWithinDays * DAY_MS,
        params.suspiciousMinFailed,
        params.limit
      ),
      this.store.successfulLoginUserIps(geoSince, GEO_DISTINCT_PAIR_CAP),
      this.store.successfulLoginUserAgents(geoSince, GEO_DISTINCT_PAIR_CAP)
    ]);
    const countries = bucketize(ipPairs, (pair) => this.countryResolver.resolve(pair.ip));
    const platforms = bucketize(uaPairs, (pair) => classifyPlatform(pair.userAgent));
    const geoTruncated =
      ipPairs.length >= GEO_DISTINCT_PAIR_CAP || uaPairs.length >= GEO_DISTINCT_PAIR_CAP;
    return { newPlayers, inactivePlayers, suspiciousPlayers, countries, platforms, geoTruncated };
  }
}
