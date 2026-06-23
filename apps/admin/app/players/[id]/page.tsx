"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  apiPlayerLogins,
  apiPlayerOverview,
  apiSession,
  type LoginHistoryPage,
  type PlayerOverview
} from "@/lib/api";

const LOGIN_PAGE_SIZE = 25;

/**
 * Player overview (Phase 1.2) + paginated login history (Phase 1.3). Session-guarded.
 * Shows id, account info, email, avatar, coin balance, MP stats, and the login history
 * with failed attempts highlighted (suspicious signal).
 */
export default function PlayerDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [ready, setReady] = useState(false);
  const [overview, setOverview] = useState<PlayerOverview | null | undefined>(undefined);
  const [logins, setLogins] = useState<LoginHistoryPage | undefined>();
  const [page, setPage] = useState(0);

  const loadLogins = useCallback(
    async (p: number) => {
      setLogins(await apiPlayerLogins(id, LOGIN_PAGE_SIZE, p * LOGIN_PAGE_SIZE));
    },
    [id]
  );

  useEffect(() => {
    void apiSession().then(async (ok) => {
      if (!ok) {
        router.replace("/");
        return;
      }
      setReady(true);
      const ov = await apiPlayerOverview(id);
      setOverview(ov ?? null);
      if (ov) {
        await loadLogins(0);
      }
    });
  }, [router, id, loadLogins]);

  if (!ready || overview === undefined) {
    return (
      <div className="shell">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (overview === null) {
    return (
      <div className="shell">
        <div className="row">
          <h1>Player not found</h1>
          <nav className="navlinks">
            <Link href="/players">Back to players</Link>
          </nav>
        </div>
      </div>
    );
  }

  const { account, balance, stats } = overview;

  return (
    <div className="shell">
      <div className="row">
        <div>
          <h1>{account.username}</h1>
          <p className="muted">
            <code>{account.id}</code>
          </p>
        </div>
        <nav className="navlinks">
          <Link href="/players">Players</Link>
          <Link href="/dashboard">Audit</Link>
        </nav>
      </div>

      <div className="panel">
        <h2>Account</h2>
        <dl className="kv">
          <dt>Email</dt>
          <dd>{account.email ?? "—"}</dd>
          <dt>Avatar</dt>
          <dd>{account.avatar}</dd>
          <dt>Coin balance</dt>
          <dd>{balance.toLocaleString("en-US")}</dd>
          <dt>Created (UTC)</dt>
          <dd>{formatTs(account.createdAt)}</dd>
          <dt>Stats (MP)</dt>
          <dd>
            {stats
              ? `${stats.wins}W / ${stats.losses}L / ${stats.gamesPlayed} games`
              : "no games yet"}
          </dd>
        </dl>
      </div>

      <div className="panel">
        <div className="row">
          <h2>Login history</h2>
          {logins ? (
            <span className="muted">
              {logins.total} total · {logins.failed} failed
            </span>
          ) : null}
        </div>
        {!logins || logins.entries.length === 0 ? (
          <p className="muted">No login attempts recorded.</p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Time (UTC)</th>
                  <th>Result</th>
                  <th>IP</th>
                  <th>Source</th>
                  <th>User agent</th>
                </tr>
              </thead>
              <tbody>
                {logins.entries.map((e) => (
                  <tr key={e.id} className={e.success ? undefined : "rowDanger"}>
                    <td>{formatTs(e.createdAt)}</td>
                    <td>{e.success ? "success" : "failed"}</td>
                    <td>{e.ip ?? "—"}</td>
                    <td>{e.source}</td>
                    <td className="ua">{e.userAgent ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pager">
              <button
                className="secondary"
                type="button"
                disabled={page === 0}
                onClick={() => {
                  const p = page - 1;
                  setPage(p);
                  void loadLogins(p);
                }}
              >
                Prev
              </button>
              <span className="muted">page {page + 1}</span>
              <button
                className="secondary"
                type="button"
                disabled={(page + 1) * LOGIN_PAGE_SIZE >= logins.total}
                onClick={() => {
                  const p = page + 1;
                  setPage(p);
                  void loadLogins(p);
                }}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatTs(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}
