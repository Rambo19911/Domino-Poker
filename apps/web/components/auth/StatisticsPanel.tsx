"use client";

import { useEffect, useState } from "react";

import type { AppStrings } from "../../lib/i18n";
import { apiGetStats, type PlacementDistribution, type PlayerStats } from "../../lib/stats/playerStats";

/**
 * "Statistika" tabs (Fāze 5). Lēni ielādē `GET /stats` pie mount (tikai atverot tabu),
 * tad rāda pašu rakstītas SVG/CSS-mazās diagrammas (bez chart bibliotēkas, token-krāsas).
 * Bez animācijām → prefers-reduced-motion droši. Tikai reģistrētiem (tabs autentificēts).
 */
export function StatisticsPanel({
  labels: t,
  getToken
}: {
  readonly labels: AppStrings;
  readonly getToken: () => string | undefined;
}) {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (token === undefined) {
      setPhase("error");
      return undefined;
    }
    void apiGetStats(token).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setStats(result.data);
        setPhase("ready");
      } else {
        setPhase("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  if (phase === "loading") {
    return <div className="statsPanel"><p className="statsHint">…</p></div>;
  }
  if (phase === "error" || stats === null) {
    return (
      <div className="statsPanel">
        <p className="authError" role="alert">{t.statsLoadError}</p>
      </div>
    );
  }

  const { met, exceeded, missed } = stats.bidAccuracy;
  const rounds = met + exceeded + missed;
  const hasGames =
    rounds > 0 ||
    sumDist(stats.mpPlacement) > 0 ||
    sumDist(stats.spByDifficulty.medium) > 0 ||
    sumDist(stats.spByDifficulty.hard) > 0 ||
    sumDist(stats.spByDifficulty.epic) > 0;

  if (!hasGames) {
    return (
      <div className="statsPanel">
        <p className="settingsTabDescription">{t.statsTabDescription}</p>
        <p className="statsEmpty">{t.statsEmpty}</p>
      </div>
    );
  }

  return (
    <div className="statsPanel">
      <p className="settingsTabDescription">{t.statsTabDescription}</p>

      <section className="statsSection">
        <h3 className="statsHeading">{t.statsBidAccuracy}</h3>
        <p className="statsHint">{t.statsBidAccuracyHint}</p>
        <div className="statsBar" role="img" aria-label={`${t.statsBidMet} ${pctLabel(met, rounds)}, ${t.statsBidExceeded} ${pctLabel(exceeded, rounds)}, ${t.statsBidMissed} ${pctLabel(missed, rounds)}`}>
          <Seg className="statsSeg-met" value={met} total={rounds} />
          <Seg className="statsSeg-exceeded" value={exceeded} total={rounds} />
          <Seg className="statsSeg-missed" value={missed} total={rounds} />
        </div>
        <ul className="statsLegend">
          <li><span className="statsDot statsSeg-met" />{t.statsBidMet} <strong>{pctLabel(met, rounds)}</strong></li>
          <li><span className="statsDot statsSeg-exceeded" />{t.statsBidExceeded} <strong>{pctLabel(exceeded, rounds)}</strong></li>
          <li><span className="statsDot statsSeg-missed" />{t.statsBidMissed} <strong>{pctLabel(missed, rounds)}</strong></li>
        </ul>
      </section>

      <section className="statsSection">
        <h3 className="statsHeading">{t.statsTactics}</h3>
        <Tendency label={t.statsOverbidding} hint={t.statsOverbiddingHint} value={missed} total={rounds} segClass="statsSeg-missed" />
        <Tendency label={t.statsUnderbidding} hint={t.statsUnderbiddingHint} value={exceeded} total={rounds} segClass="statsSeg-exceeded" />
      </section>

      <section className="statsSection">
        <h3 className="statsHeading">{t.statsPlacementVsBots}</h3>
        <PlacementLegend t={t} />
        <PlacementRow label={t.difficultyMedium} dist={stats.spByDifficulty.medium} t={t} />
        <PlacementRow label={t.difficultyHard} dist={stats.spByDifficulty.hard} t={t} />
        <PlacementRow label={t.difficultyEpic} dist={stats.spByDifficulty.epic} t={t} />
      </section>

      <section className="statsSection">
        <h3 className="statsHeading">{t.statsMpPlacement}</h3>
        <PlacementRow label="" dist={stats.mpPlacement} t={t} hideLabel />
      </section>
    </div>
  );
}

function Seg({ className, value, total }: { readonly className: string; readonly value: number; readonly total: number }) {
  if (value <= 0) return null;
  return <span className={`statsSeg ${className}`} style={{ width: pct(value, total) }} />;
}

function Tendency({
  label,
  hint,
  value,
  total,
  segClass
}: {
  readonly label: string;
  readonly hint: string;
  readonly value: number;
  readonly total: number;
  readonly segClass: string;
}) {
  return (
    <div className="statsTactic">
      <div className="statsTacticHead">
        <span>{label}</span>
        <strong>{pctLabel(value, total)}</strong>
      </div>
      <div className="statsBar statsBar-thin">
        <Seg className={segClass} value={value} total={total} />
      </div>
      <p className="statsHint">{hint}</p>
    </div>
  );
}

const PLACES = [1, 2, 3, 4] as const;

function PlacementLegend({ t }: { readonly t: AppStrings }) {
  return (
    <ul className="statsLegend">
      {PLACES.map((place) => (
        <li key={place}>
          <span className={`statsDot statsSeg-p${place}`} />
          {placeLabel(t, place)}
        </li>
      ))}
    </ul>
  );
}

function PlacementRow({
  label,
  dist,
  t,
  hideLabel = false
}: {
  readonly label: string;
  readonly dist: PlacementDistribution;
  readonly t: AppStrings;
  readonly hideLabel?: boolean;
}) {
  const total = sumDist(dist);
  return (
    <div className="statsPlaceRow">
      <span className="statsPlaceLabel">{hideLabel ? "" : label}</span>
      {total === 0 ? (
        <span className="statsHint statsPlaceEmpty">{t.statsNoGamesMode}</span>
      ) : (
        <>
          <div
            className="statsBar"
            role="img"
            aria-label={PLACES.map((place) => `${placeLabel(t, place)} ${pctLabel(distValue(dist, place), total)}`).join(", ")}
          >
            {PLACES.map((place) => (
              <Seg key={place} className={`statsSeg-p${place}`} value={distValue(dist, place)} total={total} />
            ))}
          </div>
          <span className="statsPlaceTotal">{total}</span>
        </>
      )}
    </div>
  );
}

function distValue(dist: PlacementDistribution, place: number): number {
  return dist[`p${place}` as keyof PlacementDistribution];
}

function sumDist(dist: PlacementDistribution): number {
  return dist.p1 + dist.p2 + dist.p3 + dist.p4;
}

function pct(value: number, total: number): string {
  return total > 0 ? `${(value / total) * 100}%` : "0%";
}

function pctLabel(value: number, total: number): string {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : "0%";
}

function placeLabel(t: AppStrings, place: number): string {
  switch (place) {
    case 1:
      return t.statsPlace1;
    case 2:
      return t.statsPlace2;
    case 3:
      return t.statsPlace3;
    default:
      return t.statsPlace4;
  }
}
