"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  apiActivityCsv,
  apiAnalyticsActivity,
  apiAnalyticsLeaderboard,
  apiAnalyticsOverview,
  apiAnalyticsSegments,
  apiSession,
  type ActivityDay,
  type AnalyticsOverview,
  type AnalyticsSegments,
  type LeaderboardView
} from "@/lib/api";

/** Lejupielādē tekstu kā failu (klienta blob; nes credentials caur fetch). */
function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Analytics (Phase 4A, read-only). Session-guarded. Overview metrics, daily activity (with a CSV
 * download), player segments (new/inactive/suspicious), and a read-only leaderboard view + config.
 */
export default function AnalyticsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [activity, setActivity] = useState<readonly ActivityDay[]>([]);
  const [segments, setSegments] = useState<AnalyticsSegments | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardView | null>(null);

  useEffect(() => {
    void apiSession().then(async (ok) => {
      if (!ok) {
        router.replace("/");
        return;
      }
      setReady(true);
      const [o, a, s, l] = await Promise.all([
        apiAnalyticsOverview(),
        apiAnalyticsActivity(30),
        apiAnalyticsSegments(),
        apiAnalyticsLeaderboard()
      ]);
      setOverview(o);
      setActivity(a);
      setSegments(s);
      setLeaderboard(l);
    });
  }, [router]);

  if (!ready) {
    return (
      <div className="shell">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="row">
        <h1>Analytics</h1>
        <nav className="navlinks">
          <Link href="/players">Players</Link>
          <Link href="/bans">Bans</Link>
          <Link href="/moderation">Moderation</Link>
          <Link href="/dashboard">Audit</Link>
        </nav>
      </div>

      <div className="panel">
        <h2>Overview</h2>
        {overview ? (
          <div className="metrics">
            <Metric label="Total users" value={overview.totalUsers} />
            <Metric label="New (7d)" value={overview.newUsers7d} />
            <Metric label="New (30d)" value={overview.newUsers30d} />
            <Metric label="Active (7d)" value={overview.activeUsers7d} />
            <Metric label="Active (30d)" value={overview.activeUsers30d} />
            <Metric label="Matches" value={overview.totalMatches} />
            <Metric label="Coins (held)" value={overview.totalCoins} />
            <Metric label="Active bans" value={overview.activeBans} />
          </div>
        ) : (
          <p className="muted">Unavailable.</p>
        )}
        <p className="muted">“Active” = accounts with a successful login in the window.</p>
      </div>

      <div className="panel">
        <div className="row">
          <h2>Daily activity (30 days)</h2>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              void apiActivityCsv(30).then((csv) => {
                if (csv !== null) downloadText("activity.csv", csv, "text/csv");
              });
            }}
          >
            Download CSV
          </button>
        </div>
        {activity.length === 0 ? (
          <p className="muted">No activity.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date (UTC)</th>
                <th>Registrations</th>
                <th>Logins</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td>{d.registrations}</td>
                  <td>{d.logins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {segments ? (
        <div className="panel">
          <h2>Segments</h2>
          <SegmentList title="New (7d)" rows={segments.newPlayers.map((p) => ({ id: p.id, label: p.username }))} />
          <SegmentList title="Inactive (no login 30d)" rows={segments.inactivePlayers.map((p) => ({ id: p.id, label: p.username }))} />
          <SegmentList
            title="Suspicious (≥5 failed logins 7d)"
            rows={segments.suspiciousPlayers.map((p) => ({ id: p.id, label: `${p.username} (${p.failedAttempts} failed)` }))}
          />
          <Breakdown
            title="By country (30d)"
            rows={(segments.countries ?? []).map((b) => ({ label: b.key, count: b.count }))}
          />
          <Breakdown
            title="By platform (30d)"
            rows={(segments.platforms ?? []).map((b) => ({ label: PLATFORM_LABELS[b.key] ?? b.key, count: b.count }))}
          />
          {segments.geoTruncated ? (
            <p className="muted">Country/platform counts are partial (data cap reached).</p>
          ) : null}
          <p className="muted">
            Country/platform = unique players by successful logins in the last 30 days; a player active from
            multiple countries or devices counts in each.
          </p>
        </div>
      ) : null}

      <div className="panel">
        <h2>Leaderboard</h2>
        <p className="muted">
          Read-only. Config: min games {leaderboard?.config.minGames ?? "—"}, size {leaderboard?.config.size ?? "—"}.
        </p>
        {!leaderboard?.leaderboard || leaderboard.leaderboard.entries.length === 0 ? (
          <p className="muted">No ranked players yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>W/L</th>
                <th>Win rate</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.leaderboard.entries.map((e) => (
                <tr key={e.rank}>
                  <td>{e.rank}</td>
                  <td>{e.username}</td>
                  <td>{e.wins}/{e.losses}</td>
                  <td>{Math.round(e.winRate * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <div className="metricValue">{value.toLocaleString("en-US")}</div>
      <div className="metricLabel">{label}</div>
    </div>
  );
}

const PLATFORM_LABELS: Record<string, string> = {
  mobile: "Mobile",
  desktop: "Desktop",
  other: "Other"
};

function Breakdown({ title, rows }: { title: string; rows: ReadonlyArray<{ label: string; count: number }> }) {
  return (
    <div className="segment">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted">No data.</p>
      ) : (
        <table>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>{r.count.toLocaleString("en-US")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SegmentList({ title, rows }: { title: string; rows: ReadonlyArray<{ id: string; label: string }> }) {
  return (
    <div className="segment">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted">None.</p>
      ) : (
        <ul className="seglist">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/players/${encodeURIComponent(r.id)}`}>{r.label}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
