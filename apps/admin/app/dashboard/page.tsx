"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { apiAudit, apiLogout, apiSession, type AuditEntry } from "@/lib/api";

/**
 * Admin dashboard + Audit History (sk. docs/TODO/admin-panel-plan.md, Fāze 0, sadaļa 22).
 * Aiz auth: ja sesija nederīga → atpakaļ uz login. Rāda audit žurnālu (laiks, darbība,
 * mērķis, kopsavilkums, izvēršams JSON diff).
 */
export default function DashboardPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState<readonly AuditEntry[]>([]);
  const [expanded, setExpanded] = useState<string | undefined>();

  const load = useCallback(async () => {
    setEntries(await apiAudit(100, 0));
  }, []);

  useEffect(() => {
    void apiSession().then(async (ok) => {
      if (!ok) {
        router.replace("/");
        return;
      }
      setReady(true);
      await load();
    });
  }, [router, load]);

  async function signOut() {
    await apiLogout();
    router.replace("/");
  }

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
          <h1>Audit history</h1>
          <p className="muted">Every admin action is recorded here.</p>
        </div>
        <button className="secondary" type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>

      <div className="panel">
        {entries.length === 0 ? (
          <p className="muted">No audit entries yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th>Action</th>
                <th>Target</th>
                <th>Summary</th>
                <th>IP</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <FragmentRow
                  key={entry.id}
                  entry={entry}
                  open={expanded === entry.id}
                  onToggle={() => setExpanded(expanded === entry.id ? undefined : entry.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FragmentRow({
  entry,
  open,
  onToggle
}: {
  readonly entry: AuditEntry;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  const hasDiff = entry.diff !== undefined && entry.diff !== null;
  return (
    <>
      <tr>
        <td>{new Date(entry.createdAt).toISOString().replace("T", " ").slice(0, 19)}</td>
        <td>{entry.action}</td>
        <td>{entry.targetType ? `${entry.targetType}:${entry.targetId ?? ""}` : "—"}</td>
        <td>{entry.summary}</td>
        <td>{entry.ip ?? "—"}</td>
        <td>
          {hasDiff ? (
            <button className="secondary" type="button" onClick={onToggle}>
              {open ? "Hide" : "Diff"}
            </button>
          ) : null}
        </td>
      </tr>
      {open && hasDiff ? (
        <tr>
          <td colSpan={6}>
            <code>{JSON.stringify(entry.diff, null, 2)}</code>
          </td>
        </tr>
      ) : null}
    </>
  );
}
