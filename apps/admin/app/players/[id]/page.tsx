"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  adminAvatarUrl,
  apiAdjustCoins,
  apiBanPlayer,
  apiCorrectStats,
  apiDeletePlayer,
  apiExportPlayer,
  apiForceResetPassword,
  apiPlayerLogins,
  apiPlayerOverview,
  apiSendResetEmail,
  apiSession,
  apiUpdateAccount,
  type BanKind,
  type LoginHistoryPage,
  type PlayerOverview
} from "@/lib/api";

const LOGIN_PAGE_SIZE = 25;

/**
 * Player overview (Phase 1) + write operations (Phase 2). Session-guarded. Shows account
 * info, coin balance, MP stats, login history (failed highlighted), and management forms:
 * edit account, correct stats, adjust coins, and password reset (soft email / hard force).
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

  const reloadOverview = useCallback(async () => {
    setOverview((await apiPlayerOverview(id)) ?? null);
  }, [id]);

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
          <Link href="/bans">Bans</Link>
          <Link href="/moderation">Moderation</Link>
          <Link href="/analytics">Analytics</Link>
          <Link href="/dashboard">Audit</Link>
        </nav>
      </div>

      <div className="panel">
        <h2>Account</h2>
        <dl className="kv">
          <dt>Email</dt>
          <dd>{account.email ?? "—"}</dd>
          <dt>Avatar</dt>
          <dd>
            <img className="avatarImg" src={adminAvatarUrl(account.avatar, account.id)} alt="Player avatar" />
            <code>{account.avatar}</code>
          </dd>
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

      <EditAccountPanel
        id={id}
        username={account.username}
        email={account.email ?? ""}
        avatar={account.avatar}
        onChanged={reloadOverview}
      />

      <CorrectStatsPanel
        id={id}
        wins={stats?.wins ?? 0}
        losses={stats?.losses ?? 0}
        onChanged={reloadOverview}
      />

      <AdjustCoinsPanel id={id} balance={balance} onChanged={reloadOverview} />

      <ResetPasswordPanel id={id} hasEmail={account.email !== undefined} />

      <BanPlayerPanel id={id} />

      <DangerZonePanel id={id} username={account.username} />

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

/** Inline status line under each management form (idle / busy / success / error). */
type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "ok"; msg: string }
  | { kind: "err"; msg: string };

function StatusLine({ status }: { status: Status }) {
  if (status.kind === "idle") return null;
  if (status.kind === "busy") return <p className="muted">Working…</p>;
  return <p className={status.kind === "ok" ? "ok" : "error"}>{status.msg}</p>;
}

/** Phase 2.1 — edit display name / email / avatar. Only changed fields are sent. */
function EditAccountPanel({
  id,
  username,
  email,
  avatar,
  onChanged
}: {
  id: string;
  username: string;
  email: string;
  avatar: string;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState(username);
  const [mail, setMail] = useState(email);
  const [av, setAv] = useState(avatar);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function save(): Promise<void> {
    const patch: { displayName?: string; email?: string; avatar?: string } = {};
    if (name !== username) patch.displayName = name;
    if (mail !== email) patch.email = mail;
    if (av !== avatar) patch.avatar = av;
    if (Object.keys(patch).length === 0) {
      setStatus({ kind: "err", msg: "No changes." });
      return;
    }
    setStatus({ kind: "busy" });
    const res = await apiUpdateAccount(id, patch);
    if (res.ok) {
      setStatus({ kind: "ok", msg: "Account updated." });
      await onChanged();
    } else {
      setStatus({ kind: "err", msg: `Failed: ${res.error}` });
    }
  }

  return (
    <div className="panel">
      <h2>Edit account</h2>
      <div className="formGrid">
        <label>
          Display name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Email
          <input value={mail} onChange={(e) => setMail(e.target.value)} />
        </label>
        <label>
          Avatar (preset id)
          <input value={av} onChange={(e) => setAv(e.target.value)} />
        </label>
      </div>
      <button type="button" onClick={() => void save()} disabled={status.kind === "busy"}>
        Save changes
      </button>
      <StatusLine status={status} />
    </div>
  );
}

/** Phase 2.2 — correct the user_stats aggregate (wins/losses). Reason is mandatory. */
function CorrectStatsPanel({
  id,
  wins,
  losses,
  onChanged
}: {
  id: string;
  wins: number;
  losses: number;
  onChanged: () => Promise<void>;
}) {
  const [w, setW] = useState(String(wins));
  const [l, setL] = useState(String(losses));
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function save(): Promise<void> {
    const wn = Number(w);
    const ln = Number(l);
    if (!Number.isInteger(wn) || !Number.isInteger(ln) || wn < 0 || ln < 0) {
      setStatus({ kind: "err", msg: "Wins/losses must be non-negative integers." });
      return;
    }
    if (reason.trim() === "") {
      setStatus({ kind: "err", msg: "Reason is required." });
      return;
    }
    setStatus({ kind: "busy" });
    const res = await apiCorrectStats(id, { wins: wn, losses: ln, reason: reason.trim() });
    if (res.ok) {
      setStatus({ kind: "ok", msg: "Stats corrected." });
      setReason("");
      await onChanged();
    } else {
      setStatus({ kind: "err", msg: `Failed: ${res.error}` });
    }
  }

  return (
    <div className="panel">
      <h2>Correct stats</h2>
      <p className="muted">Sets the MP aggregate (games = wins + losses). Per-game history is kept.</p>
      <div className="formGrid">
        <label>
          Wins
          <input value={w} onChange={(e) => setW(e.target.value)} inputMode="numeric" />
        </label>
        <label>
          Losses
          <input value={l} onChange={(e) => setL(e.target.value)} inputMode="numeric" />
        </label>
        <label>
          Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
      <button type="button" onClick={() => void save()} disabled={status.kind === "busy"}>
        Save stats
      </button>
      <StatusLine status={status} />
    </div>
  );
}

/** Phase 2.3 — adjust coin balance (+ grant / − deduct). Reason mandatory; idempotent. */
function AdjustCoinsPanel({
  id,
  balance,
  onChanged
}: {
  id: string;
  balance: number;
  onChanged: () => Promise<void>;
}) {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function apply(): Promise<void> {
    const d = Number(delta);
    if (!Number.isInteger(d) || d === 0) {
      setStatus({ kind: "err", msg: "Delta must be a non-zero integer." });
      return;
    }
    if (reason.trim() === "") {
      setStatus({ kind: "err", msg: "Reason is required." });
      return;
    }
    setStatus({ kind: "busy" });
    // Fresh idempotency key per intended adjustment (retry-safe double-submit guard).
    const adjustmentId = crypto.randomUUID();
    const res = await apiAdjustCoins(id, { delta: d, reason: reason.trim(), adjustmentId });
    if (res.ok) {
      setStatus({
        kind: "ok",
        msg: res.applied
          ? `New balance: ${res.balance.toLocaleString("en-US")}`
          : `No change (already applied). Balance: ${res.balance.toLocaleString("en-US")}`
      });
      setDelta("");
      setReason("");
      await onChanged();
    } else {
      setStatus({
        kind: "err",
        msg: res.error === "insufficient_balance" ? "Would make balance negative." : `Failed: ${res.error}`
      });
    }
  }

  return (
    <div className="panel">
      <h2>Adjust coins</h2>
      <p className="muted">Current balance: {balance.toLocaleString("en-US")}. Balance cannot go below 0.</p>
      <div className="formGrid">
        <label>
          Delta (+grant / −deduct)
          <input value={delta} onChange={(e) => setDelta(e.target.value)} inputMode="numeric" />
        </label>
        <label>
          Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
      <button type="button" onClick={() => void apply()} disabled={status.kind === "busy"}>
        Apply adjustment
      </button>
      <StatusLine status={status} />
    </div>
  );
}

/** Phase 2.1 — password reset: soft (email link) or hard (revoke sessions + email). */
function ResetPasswordPanel({ id, hasEmail }: { id: string; hasEmail: boolean }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function run(kind: "soft" | "hard"): Promise<void> {
    setStatus({ kind: "busy" });
    const res = kind === "soft" ? await apiSendResetEmail(id) : await apiForceResetPassword(id);
    if (res.ok) {
      setStatus({
        kind: "ok",
        msg: kind === "soft" ? "Reset email sent." : "Sessions revoked + reset email sent."
      });
    } else {
      setStatus({ kind: "err", msg: `Failed: ${res.error}` });
    }
  }

  return (
    <div className="panel">
      <h2>Password reset</h2>
      {!hasEmail ? (
        <p className="muted">This account has no email; password reset is unavailable.</p>
      ) : null}
      <div className="btnRow">
        <button
          type="button"
          className="secondary"
          onClick={() => void run("soft")}
          disabled={!hasEmail || status.kind === "busy"}
        >
          Send reset email
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => void run("hard")}
          disabled={!hasEmail || status.kind === "busy"}
        >
          Force reset (revoke sessions)
        </button>
      </div>
      <StatusLine status={status} />
    </div>
  );
}

/** Phase 3.1 — ban this account (revokes sessions + disconnects WS + emails the user). */
function BanPlayerPanel({ id }: { id: string }) {
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<BanKind>("permanent");
  const [days, setDays] = useState("7");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function ban(): Promise<void> {
    if (reason.trim() === "") {
      setStatus({ kind: "err", msg: "Reason is required." });
      return;
    }
    const input: { reason: string; kind: BanKind; durationDays?: number } = {
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
    const res = await apiBanPlayer(id, input);
    if (res.ok) {
      setStatus({ kind: "ok", msg: "Account banned (sessions revoked)." });
      setReason("");
    } else {
      setStatus({
        kind: "err",
        msg: res.error === "already_banned" ? "Account is already banned." : `Failed: ${res.error}`
      });
    }
  }

  return (
    <div className="panel">
      <h2>Ban account</h2>
      <p className="muted">Blocks login + WebSocket for this account and revokes active sessions.</p>
      <div className="formGrid">
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
        Ban account
      </button>
      <StatusLine status={status} />
    </div>
  );
}

/** Phase 4B.2 — export full data + irreversible hard-delete (confirm by typing the username). */
function DangerZonePanel({ id, username }: { id: string; username: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function exportData(): Promise<void> {
    setStatus({ kind: "busy" });
    const data = await apiExportPlayer(id);
    if (data === null) {
      setStatus({ kind: "err", msg: "Export failed." });
      return;
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `player-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus({ kind: "ok", msg: "Export downloaded." });
  }

  async function remove(): Promise<void> {
    if (confirm !== username) {
      setStatus({ kind: "err", msg: `Type "${username}" to confirm deletion.` });
      return;
    }
    setStatus({ kind: "busy" });
    const res = await apiDeletePlayer(id);
    if (res.ok) {
      router.replace("/players");
    } else {
      setStatus({ kind: "err", msg: `Failed: ${res.error}` });
    }
  }

  return (
    <div className="panel">
      <h2>Danger zone</h2>
      <p className="muted">
        Export the full account data (JSON), or permanently delete it. Deletion cascades all data and
        anonymizes this player in match replays; a full snapshot is saved to the audit log first.
      </p>
      <div className="btnRow">
        <button type="button" className="secondary" onClick={() => void exportData()} disabled={status.kind === "busy"}>
          Export data
        </button>
      </div>
      <label>
        Type the display name “{username}” to confirm deletion
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <button
        type="button"
        className="danger"
        onClick={() => void remove()}
        disabled={status.kind === "busy" || confirm !== username}
      >
        Permanently delete account
      </button>
      <StatusLine status={status} />
    </div>
  );
}

function formatTs(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}
