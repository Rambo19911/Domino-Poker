"use client";

import { useState } from "react";

import { apiResetPassword } from "../../lib/auth/authApi";
import type { AppStrings } from "../../lib/i18n";
import { TextField } from "../ui/TextField";

/**
 * Paroles atjaunošanas ekrāns (Fāze 5). Atvērts no e-pasta linka — `AppShell` izlasa
 * tokenu no URL hash (`#reset=<token>`), iztīra URL, un renderē šo ekrānu. Tokens
 * dzīvo tikai komponenta state (NE localStorage). Pēc veiksmes lietotājs atgriežas
 * lobby un var pieslēgties ar jauno paroli.
 */
export function ResetPasswordScreen({
  labels: t,
  token,
  onDone,
  playClick
}: {
  readonly labels: AppStrings;
  readonly token: string;
  readonly onDone: () => void;
  readonly playClick?: (() => void) | undefined;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <main className="lobbyShell">
      <section className="authResetScreen" aria-labelledby="reset-title">
        <h1 id="reset-title" className="authResetTitle">{t.resetPasswordTitle}</h1>

        {done ? (
          <>
            <p className="authNotice" role="status">{t.resetPasswordSuccess}</p>
            <div className="dialogActions">
              <button
                className="mpPrimaryButton"
                type="button"
                onClick={() => {
                  playClick?.();
                  onDone();
                }}
              >
                {t.backToLogin}
              </button>
            </div>
          </>
        ) : (
          <form
            className="authForm"
            onSubmit={async (event) => {
              event.preventDefault();
              playClick?.();
              setBusy(true);
              setError(null);
              const result = await apiResetPassword(token, password);
              setBusy(false);
              if (result.ok) {
                setDone(true);
              } else if (result.status === 429) {
                setError(t.authErrorRateLimited);
              } else if (result.status === 400) {
                // invalid_token vai invalid_input — abos gadījumos saite nederīga/parole vāja.
                setError(result.error === "invalid_input" ? t.passwordHint : t.resetPasswordInvalidToken);
              } else if (result.status === 503) {
                setError(t.authResetUnavailable);
              } else {
                setError(t.authErrorGeneric);
              }
            }}
          >
            {error !== null ? (
              <p className="authError" role="alert">{error}</p>
            ) : null}
            <TextField
              label={t.newPassword}
              type="password"
              autoComplete="new-password"
              value={password}
              maxLength={200}
              onChange={(event) => setPassword(event.currentTarget.value)}
              required
              hint={t.passwordHint}
            />
            <div className="dialogActions authProfileActions">
              <button className="textButton" type="button" onClick={onDone} disabled={busy}>
                {t.backToLogin}
              </button>
              <button className="mpPrimaryButton" type="submit" disabled={busy}>
                {t.resetPasswordSubmit}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
