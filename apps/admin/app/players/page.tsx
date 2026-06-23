"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { apiPlayers, apiSession, type PlayerRow } from "@/lib/api";

/**
 * Players search + list (Phase 1.1). Search by id / display name / email; sorted by last
 * successful login (server-side). Session-guarded; redirects to login when unauthenticated.
 */
export default function PlayersPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<readonly PlayerRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      setPlayers(await apiPlayers(q));
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
      await load("");
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
          void load(query);
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
    </div>
  );
}

function formatTs(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}
