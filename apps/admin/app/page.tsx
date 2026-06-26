"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiLogin, apiSession, apiVerify } from "@/lib/api";

/**
 * Admin login (sk. docs/TODO/admin-panel-plan.md, Fāze 0). Divsoļu plūsma: parole →
 * e-pasta OTP 2FA. Serveris atbild konstantā formā uz paroli (200 gan pareizai, gan
 * nepareizai — neatklāj pareizību), tāpēc pie 200 ejam uz koda soli; tikai pie 429/400
 * (kods NETIKA sūtīts) rādām kļūdu. Veiksmīga verifikācija → dashboard.
 */
export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"password" | "code">("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Ja sesija jau derīga, uzreiz uz dashboard.
  useEffect(() => {
    void apiSession().then((ok) => {
      if (ok) {
        router.replace("/dashboard");
      }
    });
  }, [router]);

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const ok = await apiLogin(password);
      if (ok) {
        // Konstantas formas 200 GAN pareizai, GAN nepareizai parolei (anti-oracle) → ejam
        // uz koda soli (ja parole bija pareiza, kods jau aizsūtīts). NEatklāj pareizību.
        setStep("code");
      } else {
        // false = 429 rate_limited / 400 invalid_input → kods NETIKA sūtīts, NEpārejam.
        setError("Could not send a code (rate limited or invalid request). Please wait and try again.");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const ok = await apiVerify(code);
      if (ok) {
        router.replace("/dashboard");
      } else {
        setError("Invalid or expired code.");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <div className="panel card">
        <h1>Admin sign in</h1>
        <p className="muted">Domino Poker — Game Manager</p>

        {step === "password" ? (
          <form onSubmit={submitPassword}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <button type="submit" disabled={busy || password.length === 0}>
              {busy ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode}>
            <p className="muted">A 6-digit code was emailed to the admin address.</p>
            <label htmlFor="code">Login code</label>
            <input
              id="code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/gu, ""))}
              autoFocus
            />
            <button type="submit" disabled={busy || code.length !== 6}>
              {busy ? "Verifying…" : "Verify"}
            </button>
          </form>
        )}

        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}
