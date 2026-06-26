"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  apiAddBlockedWord,
  apiAnnounce,
  apiListBlockedWords,
  apiRemoveBlockedWord,
  apiSession
} from "@/lib/api";

type Status =
  | { kind: "idle" | "busy" }
  | { kind: "ok"; msg: string }
  | { kind: "err"; msg: string };

/**
 * Chat moderation (Phase 3.2). Session-guarded. Admin-editable blocked-word list (server
 * replaces matches with **** in lobby chat) + an announcement form (posts as "Admin").
 */
export default function ModerationPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [words, setWords] = useState<readonly string[]>([]);

  const reload = useCallback(async () => {
    setWords(await apiListBlockedWords());
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
        <h1>Chat moderation</h1>
        <nav className="navlinks">
          <Link href="/players">Players</Link>
          <Link href="/bans">Bans</Link>
          <Link href="/analytics">Analytics</Link>
          <Link href="/dashboard">Audit</Link>
        </nav>
      </div>

      <BlockedWordsPanel words={words} onChanged={reload} />
      <AnnouncePanel />
    </div>
  );
}

function BlockedWordsPanel({
  words,
  onChanged
}: {
  words: readonly string[];
  onChanged: () => Promise<void>;
}) {
  const [word, setWord] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function add(): Promise<void> {
    if (word.trim() === "") {
      setStatus({ kind: "err", msg: "Enter a word." });
      return;
    }
    setStatus({ kind: "busy" });
    const res = await apiAddBlockedWord(word.trim());
    if (res.ok) {
      setStatus({ kind: "ok", msg: "Word blocked." });
      setWord("");
      await onChanged();
    } else {
      setStatus({ kind: "err", msg: `Failed: ${res.error}` });
    }
  }

  async function remove(w: string): Promise<void> {
    await apiRemoveBlockedWord(w);
    await onChanged();
  }

  return (
    <div className="panel">
      <h2>Blocked words</h2>
      <p className="muted">Matches are replaced with **** in lobby chat (whole word, case-insensitive).</p>
      <div className="searchbar">
        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder="word to block"
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
        />
        <button type="button" onClick={() => void add()} disabled={status.kind === "busy"}>
          Block
        </button>
      </div>
      {words.length === 0 ? (
        <p className="muted">No blocked words.</p>
      ) : (
        <ul className="chips">
          {words.map((w) => (
            <li key={w} className="chip">
              <code>{w}</code>
              <button type="button" className="chipx" aria-label={`remove ${w}`} onClick={() => void remove(w)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {status.kind === "ok" ? <p className="ok">{status.msg}</p> : null}
      {status.kind === "err" ? <p className="error">{status.msg}</p> : null}
    </div>
  );
}

function AnnouncePanel() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function send(): Promise<void> {
    if (text.trim() === "") {
      setStatus({ kind: "err", msg: "Enter a message." });
      return;
    }
    setStatus({ kind: "busy" });
    const res = await apiAnnounce(text.trim());
    if (res.ok) {
      setStatus({ kind: "ok", msg: "Announcement sent." });
      setText("");
    } else {
      setStatus({ kind: "err", msg: `Failed: ${res.error}` });
    }
  }

  return (
    <div className="panel">
      <h2>Announcement</h2>
      <p className="muted">Posts a message to the lobby chat as “Admin”.</p>
      <label>
        Message
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
      </label>
      <button type="button" onClick={() => void send()} disabled={status.kind === "busy"}>
        Send announcement
      </button>
      {status.kind === "ok" ? <p className="ok">{status.msg}</p> : null}
      {status.kind === "err" ? <p className="error">{status.msg}</p> : null}
    </div>
  );
}
