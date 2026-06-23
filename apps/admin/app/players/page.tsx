"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { apiPlayers, apiSession, type PlayerRow } from "@/lib/api";

const PAGE_SIZE = 25;

/**
 * Players search + list (Phase 1.1). Search by id / display name / email; sorted by last
 * successful login (server-side). Session-guarded; redirects to login when unauthenticated.
 * Paginated (Next/Prev): the list endpoint returns no total, so "has more" is inferred from
 * a full page (PAGE_SIZE rows).
 */
export default function PlayersPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  // The query that the current results reflect (so paging keeps the active search).
  const [activeQuery, setActiveQuery] = useState("");
  const [page, setPage] = useState(0);
  const [players, setPlayers] = useState<readonly PlayerRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (q: string, p: number) => {
    setLoading(true);
    try {
      setPlayers(await apiPlayers(q, PAGE_SIZE, p * PAGE_SIZE));
      setActiveQuery(q);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void apiSession().then(async (ok) => {
      if (!ok) {
        router.replace("/");
        return;
      }
      setReady(true);
      await load("", 0);
    });
  }, [router, load]);

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
        <div>
          <h1>Players</h1>
          <p className="muted">Search by ID, display name, or email.</p>
        </div>
        <nav className="navlinks">
          <Link href="/dashboard">Audit history</Link>
        </nav>
      </div>

      <form
        className="searchbar"
        onSubmit={(e) => {
          e.preventDefault();
          void load(query, 0);
        }}
      >
        <input
          aria-label="Search players"
          placeholder="ID, name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="secondary" type="submit" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      <div className="panel">
        {players.length === 0 ? (
          <p className="muted">No players found.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Display name</th>
                <th>Email</th>
                <th>ID</th>
                <th>Last login (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/players/${encodeURIComponent(p.id)}`}>{p.username}</Link>
                  </td>
                  <td>{p.email ?? "—"}</td>
                  <td>
                    <code>{p.id}</code>
                  </td>
                  <td>{p.lastLoginAt ? formatTs(p.lastLoginAt) : "never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {page > 0 || players.length === PAGE_SIZE ? (
        <div className="pager">
          <button
            className="secondary"
            type="button"
            disabled={loading || page === 0}
            onClick={() => void load(activeQuery, page - 1)}
          >
            Prev
          </button>
          <span className="muted">page {page + 1}</span>
          <button
            className="secondary"
            type="button"
            disabled={loading || players.length < PAGE_SIZE}
            onClick={() => void load(activeQuery, page + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formatTs(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}
