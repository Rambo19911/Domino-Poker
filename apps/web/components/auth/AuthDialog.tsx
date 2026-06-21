"use client";

import { useRef, useState } from "react";

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
import { avatarUrl } from "../../lib/auth/avatarUrl";
import { prepareAvatar } from "../../lib/auth/avatarUpload";
import { IconButton } from "../ui/IconButton";
import { TextField } from "../ui/TextField";
import { StatisticsPanel } from "./StatisticsPanel";
import type { AuthStatus } from "../../lib/auth/useAuthUser";
import type { AppStrings } from "../../lib/i18n";
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from "../../lib/safeStorage";
import {
  applyTheme,
  DEFAULT_THEME,
  isThemeId,
  THEME_STORAGE_KEY,
  THEMES,
  type ThemeId
} from "../../lib/theme";
import { Dialog } from "../Dialog";

type Tab = "login" | "register" | "profile" | "personalization" | "statistics" | "forgot";

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
  readonly uploadAvatar: (blob: Blob) => Promise<AuthResult<{ user: AuthUser; avatarVersion: number }>>;
  readonly onClose: () => void;
  readonly playClick?: () => void;
  /** Pašreizējā auth tokena lasītājs — "Statistika" tabs to lieto `GET /stats`. */
  readonly getToken: () => string | undefined;
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
      className={`alertDialog authDialog ${authenticated ? "authDialogAuthenticated" : ""}`}
      onEscape={onClose}
      resetScrollOnMount
    >
      <div className="settingsHeader">
        <div className="settingsTabs" role="tablist" aria-label={t.account}>
          {authenticated ? (
            <>
              <button
                className="settingsTab"
                type="button"
                role="tab"
                aria-selected={tab === "profile"}
                onClick={() => selectTab("profile")}
              >
                {t.profile}
              </button>
              <button
                className="settingsTab"
                type="button"
                role="tab"
                aria-selected={tab === "personalization"}
                onClick={() => selectTab("personalization")}
              >
                {t.personalization}
              </button>
              <button
                className="settingsTab"
                type="button"
                role="tab"
                aria-selected={tab === "statistics"}
                onClick={() => selectTab("statistics")}
              >
                {t.statistics}
              </button>
            </>
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
        <IconButton
          className="settingsCloseButton"
          label={t.close}
          onClick={onClose}
        >
          <CloseIcon />
        </IconButton>
      </div>

      <h2 id="auth-dialog-title" className="srOnly">
        {t.account}
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
          uploadAvatar={props.uploadAvatar}
          playClick={playClick}
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

      {tab === "personalization" && authenticated ? (
        <PersonalizationPanel labels={t} playClick={playClick} />
      ) : null}

      {tab === "statistics" && authenticated ? (
        <StatisticsPanel labels={t} getToken={props.getToken} />
      ) : null}
    </Dialog>
  );
}

/**
 * Vizuālās personalizācijas panelis: krāsu tēmas izvēle. Pašpietiekams — lasa/
 * raksta `localStorage` un pielieto `<html data-theme>` (sk. `lib/theme`); React
 * nekas cits uz to nereaģē. Pagaidām saraksts satur tikai noklusējuma tēmu.
 */
function PersonalizationPanel({
  labels: t,
  playClick
}: {
  readonly labels: AppStrings;
  readonly playClick?: (() => void) | undefined;
}) {
  const [theme, setTheme] = useState<ThemeId>(() => {
    const stored = readLocalStorage(THEME_STORAGE_KEY);
    return isThemeId(stored) ? stored : DEFAULT_THEME;
  });

  const selectTheme = (next: ThemeId) => {
    if (next === theme) return;
    playClick?.();
    // Noklusējumam atslēgu DZĒŠAM (nav atslēgas = noklusējums; tīrāk nekā glabāt "").
    if (next === DEFAULT_THEME) {
      removeLocalStorage(THEME_STORAGE_KEY);
    } else {
      writeLocalStorage(THEME_STORAGE_KEY, next);
    }
    applyTheme(next);
    setTheme(next);
  };

  return (
    <div className="personalizationPanel">
      <p className="settingsTabDescription">{t.personalizationDescription}</p>
      <fieldset className="themeOptions">
        <legend className="srOnly">{t.themeLabel}</legend>
        {THEMES.map((option) => (
          <label className={`themeOption ${theme === option.id ? "selected" : ""}`} key={option.id}>
            <input
              type="radio"
              name="theme"
              value={option.id}
              checked={theme === option.id}
              onChange={() => selectTheme(option.id)}
            />
            <span className={`themeSwatch theme-${option.id}`} aria-hidden="true" />
            <span className="themeOptionName">{t[option.labelKey]}</span>
          </label>
        ))}
      </fieldset>
    </div>
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
      <TextField
        label={t.username}
        type="text"
        autoComplete="username"
        value={username}
        maxLength={20}
        onChange={(event) => setUsername(event.currentTarget.value)}
        required
        hint={withEmail ? t.usernameHint : undefined}
      />
      <TextField
        label={t.password}
        type="password"
        autoComplete={withEmail ? "new-password" : "current-password"}
        value={password}
        maxLength={200}
        onChange={(event) => setPassword(event.currentTarget.value)}
        required
        hint={withEmail ? t.passwordHint : undefined}
      />
      {withEmail ? (
        <TextField
          label={t.email}
          type="email"
          autoComplete="email"
          value={email}
          maxLength={254}
          onChange={(event) => setEmail(event.currentTarget.value)}
          required
        />
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
  uploadAvatar,
  playClick,
  onSave,
  onLogout
}: {
  readonly labels: AppStrings;
  readonly user: AuthUser;
  readonly busy: boolean;
  readonly uploadAvatar: (blob: Blob) => Promise<AuthResult<{ user: AuthUser; avatarVersion: number }>>;
  readonly playClick?: (() => void) | undefined;
  readonly onSave: (input: ProfileInput) => void;
  readonly onLogout: () => void;
}) {
  const [username, setUsername] = useState(user.username);
  const [avatar, setAvatar] = useState(user.avatar);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    playClick?.();
    setUploadError(null);
    const prepared = await prepareAvatar(file);
    if (!prepared.ok) {
      setUploadError(avatarErrorMessage(t, prepared.error));
      return;
    }
    setUploadBusy(true);
    const result = await uploadAvatar(prepared.blob);
    setUploadBusy(false);
    if (result.ok) {
      setAvatar("custom"); // serveris iestatīja avatar='custom'
    } else {
      setUploadError(result.status === 429 ? t.authErrorRateLimited : t.avatarErrorUpload);
    }
  };

  return (
    <form
      className="authForm"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ username, avatar });
      }}
    >
      {/* Lauks + brīdinājums vienā ietinējā, lai brīdinājums paliek TIEŠI zem lauka
          (6px), nevis saņem `.authForm` 14px atstarpi kā atsevišķa rinda. */}
      <div className="authUsernameField">
        <TextField
          label={t.username}
          type="text"
          value={username}
          maxLength={20}
          onChange={(event) => setUsername(event.currentTarget.value)}
          required
          hint={t.usernameHint}
        />
        {/* Brīdinājums TIKAI tad, kad vārds reāli mainīts: lietotājvārds ir arī
            ielogošanās identifikators, tāpēc maiņa maina ielogošanās datus.
            `role="status"` (pieklājīgs paziņojums, ne agresīvs alert — tā ir seku
            informācija, ne kļūda). */}
        {username.trim() !== user.username ? (
          <small className="authWarning" role="status">{t.usernameChangeWarning}</small>
        ) : null}
      </div>

      <fieldset className="avatarPicker">
        <legend>{t.chooseAvatar}</legend>
        {uploadError !== null ? (
          <p className="authError" role="alert">{uploadError}</p>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="srOnly"
          onChange={(event) => {
            void handleFile(event.currentTarget.files?.[0]);
            event.currentTarget.value = ""; // ļauj atkārtoti izvēlēties to pašu failu
          }}
        />
        <div className="avatarGrid">
          {/* Custom avatara augšupielādes poga (apaļš lauks ar fotoaparāta ikonu). */}
          <button
            type="button"
            className="avatarOption avatarUploadButton"
            aria-label={t.avatarUpload}
            title={t.avatarUpload}
            disabled={uploadBusy || busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <CameraIcon />
          </button>
          {/* Pašreizējais augšupielādētais avatars (ja ir). */}
          {avatar === "custom" ? (
            <button
              type="button"
              className="avatarOption selected"
              aria-pressed
              aria-label={t.avatarUpload}
              onClick={() => fileInputRef.current?.click()}
            >
              <img src={avatarUrl("custom", user.id, user.avatarVersion)} alt="" />
            </button>
          ) : null}
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
        <button className="mpPrimaryButton" type="submit" disabled={busy || uploadBusy}>
          {t.saveChanges}
        </button>
      </div>
    </form>
  );
}

/** TitleId → lokalizēta avatara augšupielādes kļūda. */
function avatarErrorMessage(t: AppStrings, error: "type" | "too_large" | "too_small" | "decode"): string {
  switch (error) {
    case "type":
      return t.avatarErrorType;
    case "too_large":
      return t.avatarErrorTooLarge;
    case "too_small":
      return t.avatarErrorTooSmall;
    default:
      return t.avatarErrorDecode;
  }
}

function CameraIcon() {
  return (
    <svg className="avatarCameraIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
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
      <TextField
        label={t.email}
        type="email"
        autoComplete="email"
        value={email}
        maxLength={254}
        onChange={(event) => setEmail(event.currentTarget.value)}
        required
      />
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
