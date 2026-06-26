"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { apiBanIp, apiListBans, apiRevokeBan, apiSession, type Ban, type BanKind } from "@/lib/api";

/**
 * Bans (Phase 3.1). Session-guarded. Lists active + historical bans (newest first) with a
 * revoke action, plus an IP-ban form. Account bans are created from a player's profile page.
 */
export default function BansPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [bans, setBans] = useState<readonly Ban[]>([]);

  const reload = useCallback(async () => {
    setBans(await apiListBans(100, 0));
  }, []);

  useEffect(() => {
    void apiSession().then(async (ok) => {
      if (!ok) {
        router.replace("/");
        return;
      }
      setReady(true);
      await reload();
    });
  }, [router, reload]);

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
        <h1>Bans</h1>
        <nav className="navlinks">
          <Link href="/players">Players</Link>
          <Link href="/moderation">Moderation</Link>
          <Link href="/analytics">Analytics</Link>
          <Link href="/dashboard">Audit</Link>
        </nav>
      </div>

      <IpBanPanel onChanged={reload} />

      <div className="panel">
        <h2>All bans</h2>
        {bans.length === 0 ? (
          <p className="muted">No bans recorded.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Target</th>
                <th>Reason</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Created (UTC)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {bans.map((b) => {
                const active = b.revokedAt === undefined && (b.expiresAt === undefined || b.expiresAt > Date.now());
                return (
                  <tr key={b.id} className={active ? undefined : "muted"}>
                    <td>{b.userId ? `user ${b.userId}` : `ip ${b.ip}`}</td>
                    <td>{b.reason}</td>
                    <td>{b.durationLabel}</td>
                    <td>{b.revokedAt !== undefined ? "revoked" : active ? "active" : "expired"}</td>
                    <td>{formatTs(b.createdAt)}</td>
                    <td>
                      {active ? (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => {
                            void apiRevokeBan(b.id).then(reload);
                          }}
                        >
                          Revoke
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** IP-ban form (additional signal; blocks new logins + WS from the IP). */
function IpBanPanel({ onChanged }: { onChanged: () => Promise<void> }) {
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<BanKind>("permanent");
  const [days, setDays] = useState("7");
  const [status, setStatus] = useState<
    { kind: "idle" | "busy" } | { kind: "ok"; msg: string } | { kind: "err"; msg: string }
  >({ kind: "idle" });

  async function ban(): Promise<void> {
    if (ip.trim() === "" || reason.trim() === "") {
      setStatus({ kind: "err", msg: "IP and reason are required." });
      return;
    }
    const input: { ip: string; reason: string; kind: BanKind; durationDays?: number } = {
      ip: ip.trim(),
      reason: reason.trim(),
      kind
    };
    if (kind === "temporary") {
      const d = Number(days);
      if (!Number.isInteger(d) || d < 1) {
        setStatus({ kind: "err", msg: "Duration (days) must be a positive integer." });
        return;
      }
      input.durationDays = d;
    }
    setStatus({ kind: "busy" });
    const res = await apiBanIp(input);
    if (res.ok) {
      setStatus({ kind: "ok", msg: "IP banned." });
      setIp("");
      setReason("");
      await onChanged();
    } else {
      setStatus({
        kind: "err",
        msg: res.error === "already_banned" ? "IP is already banned." : `Failed: ${res.error}`
      });
    }
  }

  return (
    <div className="panel">
      <h2>Ban an IP</h2>
      <div className="formGrid">
        <label>
          IP address
          <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="e.g. 203.0.113.7" />
        </label>
        <label>
          Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <label>
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value as BanKind)}>
            <option value="permanent">Permanent</option>
            <option value="temporary">Temporary</option>
          </select>
        </label>
        {kind === "temporary" ? (
          <label>
            Duration (days)
            <input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" />
          </label>
        ) : null}
      </div>
      <button type="button" className="danger" onClick={() => void ban()} disabled={status.kind === "busy"}>
        Ban IP
      </button>
      {status.kind === "busy" ? <p className="muted">Working…</p> : null}
      {status.kind === "ok" ? <p className="ok">{status.msg}</p> : null}
      {status.kind === "err" ? <p className="error">{status.msg}</p> : null}
    </div>
  );
}

function formatTs(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}
