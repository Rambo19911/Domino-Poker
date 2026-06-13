/**
 * Auth glabātuves saskarne — atsevišķa "spēja" (kā `DurableSessionStore`), ko
 * implementē GAN `SqliteStorage` (lokāli/dev), GAN `PostgresStorage` (prod), lai
 * autentifikācija strādātu abos režīmos.
 *
 * `users.avatar` glabā avatar `id` (sk. `@domino-poker/shared` `avatarCatalog`),
 * NE faila ceļu. `password_hash` ir `scrypt` encoded virkne (sk. `passwords.ts`).
 * Laiks visur ir servera ms (BIGINT/INTEGER), kā pārējā shēmā.
 */

import type { UserStatsRecord } from "../storage/StoragePort.js";

/** Atbalstītā spēles valoda (sakrīt ar web `i18n` locale). DB `CHECK` to ierobežo. */
export type AccountLanguage = "en" | "lv";

/** Noklusējuma valoda, ja lietotājam vēl nav `user_preferences` rindas. */
export const DEFAULT_ACCOUNT_LANGUAGE: AccountLanguage = "en";

/**
 * Viena Leaderboard rinda: globālais rangs + konta publiskie stats + valoda
 * (Leaderboard fāze). Rangs ir `ROW_NUMBER()` pozīcija (1-bāzēts, bez caurumiem)
 * pār kvalificētajiem kontiem (`games_played >= minGames`), kārtots pēc win rate.
 * `email`/`passwordHash` šeit NEKAD neparādās (tikai publiskie lauki).
 */
export interface LeaderboardEntryRecord {
  /** 1-bāzēta globālā vieta (ROW_NUMBER; nav caurumu pie neizšķirtiem). */
  readonly rank: number;
  readonly userId: string;
  readonly username: string;
  /** Avatar id no `avatarCatalog` (UI atrisina ceļu/fallback). */
  readonly avatar: string;
  readonly wins: number;
  readonly losses: number;
  readonly gamesPlayed: number;
  /** Uzvaru īpatsvars 0..1 (`wins / games_played`). */
  readonly winRate: number;
  readonly language: AccountLanguage;
  /** Servera laiks (ms) pēdējam stats atjauninājumam. */
  readonly updatedAt: number;
}

/** Viegls (userId + rangs) ieraksts kešam (Leaderboard rangu snapshot). */
export interface RankSnapshotRecord {
  readonly userId: string;
  readonly rank: number;
}

/** Lietotāja ieraksts (DTO; JSON-drošs). `passwordHash`/`email` NEKAD nesūta citiem. */
export interface UserRecord {
  readonly id: string;
  /** Attēlojamā forma (oriģinālais reģistrs). */
  readonly username: string;
  /** lowercased+trimmed; UNIQUE (novērš "Rihards"/"rihards"). */
  readonly usernameNorm: string;
  readonly email?: string | undefined;
  /** lowercased+trimmed; UNIQUE (ja dots). */
  readonly emailNorm?: string | undefined;
  readonly passwordHash: string;
  /** Avatar id no `avatarCatalog`. */
  readonly avatar: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** "created" — ievietots; "conflict" — username vai email aizņemts (sacensība). */
export type CreateUserResult = "created" | "conflict";

/** Profila atjauninājums (Fāze 2D): lietotājvārds + avatars. */
export interface ProfileUpdate {
  readonly username: string;
  readonly usernameNorm: string;
  readonly avatar: string;
  readonly updatedAt: number;
}

export type UpdateProfileResult = "updated" | "username_taken" | "not_found";

/** Login tokena ieraksts. Glabā tikai `sha256(token)`, NEKAD raw tokenu. */
export interface AuthTokenRecord {
  readonly tokenHash: string;
  readonly userId: string;
  readonly createdAt: number;
  readonly lastUsedAt: number;
  readonly expiresAt: number;
}

/** Paroles atjaunošanas tokena ieraksts (Fāze 5). Glabā tikai `sha256(token)`. */
export interface PasswordResetTokenRecord {
  readonly tokenHash: string;
  readonly userId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

/** Pielāgots (augšupielādēts) profila avatars (Fāze 5). Bytes = JAU samazināts attēls. */
export interface CustomAvatarRecord {
  readonly userId: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
  readonly updatedAt: number;
}

export interface AuthStore {
  createUser(record: UserRecord): Promise<CreateUserResult>;
  getUserById(id: string): Promise<UserRecord | undefined>;
  getUserByUsernameNorm(usernameNorm: string): Promise<UserRecord | undefined>;
  getUserByEmailNorm(emailNorm: string): Promise<UserRecord | undefined>;
  updateUserProfile(id: string, update: ProfileUpdate): Promise<UpdateProfileResult>;
  createAuthToken(record: AuthTokenRecord): Promise<void>;
  getAuthToken(tokenHash: string): Promise<AuthTokenRecord | undefined>;
  touchAuthToken(tokenHash: string, lastUsedAt: number, expiresAt: number): Promise<void>;
  deleteAuthToken(tokenHash: string): Promise<void>;
  /** Notīra beigušos tokenus (Fāze 5 cleanup). */
  deleteExpiredAuthTokens(now: number): Promise<void>;
  /** Konta MP statistika (Fāze 3) vai `undefined`, ja vēl nav ieskaitītu spēļu. */
  getUserStats(userId: string): Promise<UserStatsRecord | undefined>;
  // --- Leaderboard (globālā statistika) ---
  /**
   * Top `limit` ranžētie konti pēc win rate (DESC), kārtoti ar stabilu tie-break
   * (`win_rate, wins, games_played, username, user_id`). Iekļauj tikai kontus ar
   * `games_played >= minGames`. Rangs ir 1-bāzēts `ROW_NUMBER()`.
   */
  getLeaderboard(limit: number, minGames: number): Promise<readonly LeaderboardEntryRecord[]>;
  /**
   * Viena lietotāja GLOBĀLĀ vieta (rangs pār visiem kvalificētajiem, ne tikai
   * top-N), vai `null`, ja lietotājs nav kvalificēts (`games_played < minGames`
   * vai nav stats). Lieto "mana vieta" panelim, kad spēlētājs ir ārpus top 100.
   */
  getUserRank(userId: string, minGames: number): Promise<LeaderboardEntryRecord | null>;
  /**
   * Visu kvalificēto kontu (userId + rangs) momentuzņēmums kešam (LeaderboardService).
   * Bez `limit` — pilns rangu saraksts, lai badge pārklājumu varētu rādīt jebkuram seat'am.
   */
  getRankedSnapshot(minGames: number): Promise<readonly RankSnapshotRecord[]>;
  // --- Konta valodas preference (`user_preferences`) ---
  /** Upsert spēles valodu kontam (idempotents pēc `userId`). */
  setUserLanguage(userId: string, language: AccountLanguage, updatedAt: number): Promise<void>;
  /** Konta saglabātā valoda vai `undefined`, ja vēl nav preferences rindas. */
  getUserLanguage(userId: string): Promise<AccountLanguage | undefined>;
  // --- Paroles atjaunošana pa e-pastu (Fāze 5) ---
  createPasswordResetToken(record: PasswordResetTokenRecord): Promise<void>;
  /** Dzēš lietotāja neizmantotos reset tokenus (pie jauna pieprasījuma — invalidē vecos). */
  deleteUnusedPasswordResetTokens(userId: string): Promise<void>;
  /**
   * Atomiski "patērē" reset tokenu: ja derīgs (neizmantots UN nav beidzies),
   * nomaina lietotāja paroli, atzīmē tokenu lietotu, un atsauc VISUS lietotāja
   * auth + reset tokenus (force re-login). Atgriež `userId`, ja izdevās;
   * `undefined`, ja tokens nederīgs/beidzies/jau lietots.
   */
  resetPasswordWithToken(
    tokenHash: string,
    newPasswordHash: string,
    now: number
  ): Promise<string | undefined>;
  /** Notīra beigušos reset tokenus (Fāze 5 cleanup). */
  deleteExpiredPasswordResetTokens(now: number): Promise<void>;
  // --- Pielāgots profila avatars (Fāze 5) ---
  /**
   * Atomiski saglabā augšupielādēto avataru (upsert blob) UN iestata
   * `users.avatar = 'custom'` + `updated_at`. `updatedAt` kalpo kā cache versija.
   */
  setUserAvatar(record: CustomAvatarRecord): Promise<void>;
  /** Augšupielādētā avatara baiti + content-type serve maršrutam; `undefined`, ja nav. */
  getUserAvatar(userId: string): Promise<CustomAvatarRecord | undefined>;
  /** Dzēš augšupielādēto avataru (pārslēdzoties atpakaļ uz preset). */
  deleteUserAvatar(userId: string): Promise<void>;
}

/** Runtime pārbaude, vai glabātuve atbalsta auth (abas to dara; sargs index.ts). */
export function isAuthStore(value: unknown): value is AuthStore {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AuthStore).createUser === "function" &&
    typeof (value as AuthStore).getAuthToken === "function"
  );
}
