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
