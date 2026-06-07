"use client";

import { useState } from "react";

import { AVATAR_IDS, avatarFilePath } from "@domino-poker/shared";

import { apiForgotPassword } from "../../lib/auth/authApi";
import type {
  AuthResult,
  AuthUser,
  LoginInput,
  ProfileInput,
  RegisterInput,
  TokenUser
} from "../../lib/auth/authApi";
import type { AuthStatus } from "../../lib/auth/useAuthUser";
import type { AppStrings } from "../../lib/i18n";
import { Dialog } from "../Dialog";

type Tab = "login" | "register" | "profile" | "forgot";

export interface AuthDialogProps {
  readonly labels: AppStrings;
  /** Pašreizējā valoda — padota paroles atjaunošanas e-pasta sūtīšanai. */
  readonly locale: "lv" | "en";
  readonly status: AuthStatus;
  readonly user: AuthUser | null;
  readonly register: (input: RegisterInput) => Promise<AuthResult<TokenUser>>;
  readonly login: (input: LoginInput) => Promise<AuthResult<TokenUser>>;
  readonly logout: () => Promise<void>;
  readonly updateProfile: (input: ProfileInput) => Promise<AuthResult<{ user: AuthUser }>>;
  readonly onClose: () => void;
  readonly playClick?: () => void;
}

/** Maršrutē servera kļūdas kodu uz lokalizētu ziņu (nekādu hardcoded tekstu). */
function errorMessage(t: AppStrings, code: string): string {
  switch (code) {
    case "username_taken":
      return t.authErrorUsernameTaken;
    case "email_taken":
      return t.authErrorEmailTaken;
    case "invalid_credentials":
      return t.authErrorInvalidCredentials;
    case "invalid_input":
      return t.authErrorInvalidInput;
    case "rate_limited":
      return t.authErrorRateLimited;
    case "network_error":
      return t.authErrorNetwork;
    case "unavailable":
      return t.authResetUnavailable;
    default:
      return t.authErrorGeneric;
  }
}

export function AuthDialog(props: AuthDialogProps) {
  const { labels: t, status, user, onClose, playClick } = props;
  const authenticated = status === "authenticated" && user !== null;
  const [tab, setTab] = useState<Tab>(authenticated ? "profile" : "login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectTab = (next: Tab) => {
    if (next === tab) return;
    playClick?.();
    setError(null);
    setTab(next);
  };

  return (
    <Dialog
      ariaLabelledBy="auth-dialog-title"
      className="alertDialog authDialog"
      onEscape={onClose}
      resetScrollOnMount
    >
      <div className="settingsHeader">
        <div className="settingsTabs" role="tablist" aria-label={t.account}>
          {authenticated ? (
            <button
              className="settingsTab"
              type="button"
              role="tab"
              aria-selected={tab === "profile"}
              onClick={() => selectTab("profile")}
            >
              {t.profile}
            </button>
          ) : (
            <>
              <button
                className="settingsTab"
                type="button"
                role="tab"
                aria-selected={tab === "login"}
                onClick={() => selectTab("login")}
              >
                {t.logIn}
              </button>
              <button
                className="settingsTab"
                type="button"
                role="tab"
                aria-selected={tab === "register"}
                onClick={() => selectTab("register")}
              >
                {t.register}
              </button>
            </>
          )}
        </div>
        <button
          className="iconButton settingsCloseButton"
          type="button"
          aria-label={t.close}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>

      <h2 id="auth-dialog-title" className="srOnly">
        {authenticated ? t.profile : t.account}
      </h2>

      {error !== null ? (
        <p className="authError" role="alert">
          {error}
        </p>
      ) : null}

      {tab === "login" ? (
        <>
          <CredentialsForm
            labels={t}
            submitLabel={t.logIn}
            busy={busy}
            withEmail={false}
            onSubmit={async (values) => {
              playClick?.();
              setBusy(true);
              setError(null);
              const result = await props.login({
                username: values.username,
                password: values.password
              });
              setBusy(false);
              if (result.ok) {
                onClose();
              } else {
                setError(errorMessage(t, result.error));
              }
            }}
          />
          <button
            type="button"
            className="textButton authForgotLink"
            onClick={() => selectTab("forgot")}
          >
            {t.forgotPassword}
          </button>
        </>
      ) : null}

      {tab === "forgot" ? (
        <ForgotPasswordForm
          labels={t}
          locale={props.locale}
          playClick={playClick}
          onBack={() => selectTab("login")}
        />
      ) : null}

      {tab === "register" ? (
        <CredentialsForm
          labels={t}
          submitLabel={t.register}
          busy={busy}
          withEmail
          onSubmit={async (values) => {
            playClick?.();
            setBusy(true);
            setError(null);
            const input: RegisterInput = {
              username: values.username,
              password: values.password,
              email: (values.email ?? "").trim()
            };
            const result = await props.register(input);
            setBusy(false);
            if (result.ok) {
              onClose();
            } else {
              setError(errorMessage(t, result.error));
            }
          }}
        />
      ) : null}

      {tab === "profile" && authenticated ? (
        <ProfileForm
          labels={t}
          user={user}
          busy={busy}
          onSave={async (input) => {
            playClick?.();
            setBusy(true);
            setError(null);
            const result = await props.updateProfile(input);
            setBusy(false);
            if (!result.ok) {
              setError(errorMessage(t, result.error));
            }
          }}
          onLogout={async () => {
            playClick?.();
            await props.logout();
            onClose();
          }}
        />
      ) : null}
    </Dialog>
  );
}

function CredentialsForm({
  labels: t,
  submitLabel,
  withEmail,
  busy,
  onSubmit
}: {
  readonly labels: AppStrings;
  readonly submitLabel: string;
  readonly withEmail: boolean;
  readonly busy: boolean;
  readonly onSubmit: (values: { username: string; password: string; email?: string }) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");

  return (
    <form
      className="authForm"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ username, password, ...(withEmail ? { email } : {}) });
      }}
    >
      <label className="authField">
        <span>{t.username}</span>
        <input
          type="text"
          autoComplete="username"
          value={username}
          maxLength={20}
          onChange={(event) => setUsername(event.currentTarget.value)}
          required
        />
        {withEmail ? <small>{t.usernameHint}</small> : null}
      </label>
      <label className="authField">
        <span>{t.password}</span>
        <input
          type="password"
          autoComplete={withEmail ? "new-password" : "current-password"}
          value={password}
          maxLength={200}
          onChange={(event) => setPassword(event.currentTarget.value)}
          required
        />
        {withEmail ? <small>{t.passwordHint}</small> : null}
      </label>
      {withEmail ? (
        <label className="authField">
          <span>{t.email}</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            maxLength={254}
            onChange={(event) => setEmail(event.currentTarget.value)}
            required
          />
        </label>
      ) : null}
      <div className="dialogActions">
        <button className="mpPrimaryButton" type="submit" disabled={busy}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function ProfileForm({
  labels: t,
  user,
  busy,
  onSave,
  onLogout
}: {
  readonly labels: AppStrings;
  readonly user: AuthUser;
  readonly busy: boolean;
  readonly onSave: (input: ProfileInput) => void;
  readonly onLogout: () => void;
}) {
  const [username, setUsername] = useState(user.username);
  const [avatar, setAvatar] = useState(user.avatar);

  return (
    <form
      className="authForm"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ username, avatar });
      }}
    >
      <label className="authField">
        <span>{t.username}</span>
        <input
          type="text"
          value={username}
          maxLength={20}
          onChange={(event) => setUsername(event.currentTarget.value)}
          required
        />
        <small>{t.usernameHint}</small>
      </label>

      <fieldset className="avatarPicker">
        <legend>{t.chooseAvatar}</legend>
        <div className="avatarGrid">
          {AVATAR_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`avatarOption ${id === avatar ? "selected" : ""}`}
              aria-pressed={id === avatar}
              aria-label={id}
              onClick={() => setAvatar(id)}
            >
              <img src={avatarFilePath(id)} alt="" />
            </button>
          ))}
        </div>
      </fieldset>

      <div className="dialogActions authProfileActions">
        <button className="textButton" type="button" onClick={onLogout} disabled={busy}>
          {t.logOut}
        </button>
        <button className="mpPrimaryButton" type="submit" disabled={busy}>
          {t.saveChanges}
        </button>
      </div>
    </form>
  );
}

function ForgotPasswordForm({
  labels: t,
  locale,
  playClick,
  onBack
}: {
  readonly labels: AppStrings;
  readonly locale: "lv" | "en";
  readonly playClick?: (() => void) | undefined;
  readonly onBack: () => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Ģeneriskā apstiprinājuma ekrāns (rādīts neatkarīgi no tā, vai konts pastāv).
  if (sent) {
    return (
      <div className="authForm">
        <p className="authNotice" role="status">{t.forgotPasswordSent}</p>
        <div className="dialogActions">
          <button className="mpPrimaryButton" type="button" onClick={onBack}>
            {t.backToLogin}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="authForm"
      onSubmit={async (event) => {
        event.preventDefault();
        playClick?.();
        setBusy(true);
        setError(null);
        const result = await apiForgotPassword(email.trim(), locale);
        setBusy(false);
        if (result.ok) {
          setSent(true); // ģeneriska atbilde — neatklājam konta esamību
        } else if (result.status === 503) {
          setError(t.authResetUnavailable);
        } else if (result.status === 429) {
          setError(t.authErrorRateLimited);
        } else {
          setError(errorMessage(t, result.error));
        }
      }}
    >
      <p className="authNotice">{t.forgotPasswordIntro}</p>
      {error !== null ? (
        <p className="authError" role="alert">{error}</p>
      ) : null}
      <label className="authField">
        <span>{t.email}</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          maxLength={254}
          onChange={(event) => setEmail(event.currentTarget.value)}
          required
        />
      </label>
      <div className="dialogActions authProfileActions">
        <button className="textButton" type="button" onClick={onBack} disabled={busy}>
          {t.backToLogin}
        </button>
        <button className="mpPrimaryButton" type="submit" disabled={busy}>
          {t.sendResetLink}
        </button>
      </div>
    </form>
  );
}

function CloseIcon() {
  return (
    <svg className="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
