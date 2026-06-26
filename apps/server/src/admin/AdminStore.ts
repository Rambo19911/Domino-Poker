/**
 * Admin paneļa glabātuves saskarne — atsevišķa "spēja" (kā `AuthStore`/`CoinStore`),
 * ko implementē GAN `SqliteStorage` (lokāli/dev), GAN `PostgresStorage` (prod). Pilnīgi
 * NODALĪTA no spēlētāju auth: citas tabulas (`admin_*`), cits tokenu veids, obligāts 2FA.
 *
 * Drošības principi (sk. `docs/TODO/admin-panel-plan.md`, Fāze 0):
 *   • Sesijas un OTP kodi glabājas TIKAI kā `sha256(...)` hash, NEKAD raw.
 *   • OTP ir vienreizējs (`consumed_at`), ar attempts griestiem un īsu TTL.
 *   • `login_attempts` ir spēlētāju (NE admin) login audita pamatdats + last-login avots.
 */

/** Admin sesijas ieraksts. Glabā tikai `sha256(token)`. `revokedAt` = vienreizēja atsaukšana. */
export interface AdminSessionRecord {
  readonly tokenHash: string;
  readonly createdAt: number;
  readonly lastUsedAt: number;
  readonly expiresAt: number;
  readonly revokedAt?: number | undefined;
  readonly ip?: string | undefined;
  readonly userAgent?: string | undefined;
}

/**
 * Singleton rindas atslēga `admin_login_codes` (viens admins → viens aktīvs OTP
 * izaicinājums). Jauns kods atomiski (upsert `ON CONFLICT(id)`) aizvieto iepriekšējo,
 * tāpēc paralēli `/admin/login` nevar atstāt vairākus derīgus kodus (Codex).
 */
export const ADMIN_LOGIN_CODE_ID = "admin";

/** Admin 2FA OTP koda ieraksts. Glabā tikai `sha256(code)`. */
export interface AdminLoginCodeRecord {
  readonly codeHash: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly attempts: number;
  readonly consumedAt?: number | undefined;
}

/**
 * OTP patērēšanas rezultāts (atomiski). `ok` = kods derīgs un tikko patērēts; `invalid`
 * = nepareizs kods (attempts inkrementēts); `expired` = beidzies; `locked` = pārsniegti
 * attempts griesti (izaicinājums invalidēts); `no_code` = nav aktīva izaicinājuma.
 */
export type AdminLoginCodeConsumeResult =
  | { readonly status: "ok" }
  | { readonly status: "invalid" }
  | { readonly status: "expired" }
  | { readonly status: "locked" }
  | { readonly status: "no_code" };

/** Viens admin audita ieraksts (append-only žurnāls katrai mutējošai darbībai). */
export interface AdminAuditEntry {
  readonly id: string;
  readonly action: string;
  readonly targetType?: string | undefined;
  readonly targetId?: string | undefined;
  readonly summary: string;
  /** Strukturēts izmaiņu diff (JSON-serializējams) vai `undefined`. */
  readonly diff?: unknown;
  readonly ip?: string | undefined;
  readonly createdAt: number;
}

/** Spēlētāja login mēģinājums (veiksme + neveiksme). `userId` NULL nezināmam lietotājam. */
export interface LoginAttemptRecord {
  readonly id: string;
  readonly userId?: string | undefined;
  readonly usernameTried: string;
  readonly ip?: string | undefined;
  /** User-agent (D4 platformas segmentācijai); `undefined`, ja nav. */
  readonly userAgent?: string | undefined;
  readonly source: string;
  readonly success: boolean;
  readonly createdAt: number;
}

/** Spēlētāja kopsavilkums admin meklēšanas/saraksta skatam (Fāze 1.1). */
export interface AdminPlayerRow {
  readonly id: string;
  readonly username: string;
  readonly email?: string | undefined;
  /** Avatar id (`avatar-NN` vai `custom`). */
  readonly avatar: string;
  readonly createdAt: number;
  /** Pēdējās VEIKSMĪGĀS pieslēgšanās laiks (ms) vai `undefined`, ja nekad. */
  readonly lastLoginAt?: number | undefined;
}

/** Viens login mēģinājums admin login-vēstures skatam (Fāze 1.3). */
export interface LoginAttemptView {
  readonly id: string;
  readonly ip?: string | undefined;
  readonly userAgent?: string | undefined;
  readonly source: string;
  readonly success: boolean;
  readonly createdAt: number;
}

/** Login mēģinājumu kopskaiti spēlētājam (kopā + neveiksmes; aizdomīguma signāls). */
export interface LoginAttemptCounts {
  readonly total: number;
  readonly failed: number;
}

/** Dienas skaitlis (Fāze 4A): `day` = epohas-dienas indekss (`created_at / 86400000`). */
export interface DailyCount {
  readonly day: number;
  readonly count: number;
}

/** Segmenta spēlētājs (Fāze 4A.2): jauns / neaktīvs. */
export interface SegmentPlayer {
  readonly id: string;
  readonly username: string;
  readonly createdAt: number;
}

/** Aizdomīgs spēlētājs (Fāze 4A.2): neveiksmīgu login skaits dotajā logā. */
export interface SuspiciousPlayer {
  readonly id: string;
  readonly username: string;
  readonly failedAttempts: number;
}

/** Distinct (lietotājs, IP) pāris veiksmīgam login logā (D4 valsts segments). */
export interface LoginUserIp {
  readonly userId: string;
  readonly ip: string;
}

/** Distinct (lietotājs, user-agent) pāris veiksmīgam login logā (D4 platformas segments). */
export interface LoginUserAgent {
  readonly userId: string;
  readonly userAgent: string | undefined;
}

/** Viena ledger rinda eksportam (Fāze 4B.2). */
export interface LedgerEntryView {
  readonly id: string;
  readonly delta: number;
  readonly reason: string;
  readonly ref: string;
  readonly createdAt: number;
}

/** Bana veids (atbilst `bans.kind` CHECK). */
export type BanKind = "permanent" | "temporary";

/**
 * Viens bana ieraksts (Fāze 3.1, D1). Mērķē `userId` (konta bans) UN/VAI `ip` (IP bans);
 * vismaz viens ne-`undefined` (DB CHECK). `expiresAt` `undefined` = permanent. `revokedAt`
 * `undefined` = aktīvs. AKTĪVS = nav atsaukts UN (permanent VAI `expiresAt > now`).
 */
export interface BanRecord {
  readonly id: string;
  readonly userId?: string | undefined;
  readonly ip?: string | undefined;
  readonly reason: string;
  readonly kind: BanKind;
  readonly durationLabel: string;
  readonly expiresAt?: number | undefined;
  readonly createdAt: number;
  readonly revokedAt?: number | undefined;
  readonly createdBy: string;
}

export interface AdminStore {
  // --- Spēlētāju lasīšana (Fāze 1) ---
  /**
   * Meklē spēlētājus pēc ID (precīzs) / display name / e-pasta (LIKE, reģistr-nejutīgs),
   * kārtots pēc pēdējās veiksmīgās pieslēgšanās (jaunākā pirmā; nekad-pieslēgušies beigās),
   * tad pēc izveides laika. `query` `undefined`/tukšs → visi (saraksta noklusējums). Lapošana.
   */
  searchPlayers(query: string | undefined, limit: number, offset: number): Promise<readonly AdminPlayerRow[]>;
  /** Spēlētāja login mēģinājumu vēsture (jaunākie pirmie), ar lapošanu. */
  getPlayerLoginHistory(userId: string, limit: number, offset: number): Promise<readonly LoginAttemptView[]>;
  /** Login mēģinājumu kopskaiti spēlētājam (kopā + neveiksmes). */
  countPlayerLoginAttempts(userId: string): Promise<LoginAttemptCounts>;
  // --- Admin sesijas ---
  createAdminSession(record: AdminSessionRecord): Promise<void>;
  /** Sesijas ieraksts pēc token haša (NEfiltrē derīgumu — to pārbauda izsaukuma vieta). */
  getAdminSession(tokenHash: string): Promise<AdminSessionRecord | undefined>;
  touchAdminSession(tokenHash: string, lastUsedAt: number, expiresAt: number): Promise<void>;
  revokeAdminSession(tokenHash: string, revokedAt: number): Promise<void>;
  deleteExpiredAdminSessions(now: number): Promise<void>;
  // --- Admin 2FA OTP kodi ---
  /** Atomiski (upsert) iestata vienīgo aktīvo OTP izaicinājumu (singleton rinda), atiestatot attempts/consumed_at. */
  createAdminLoginCode(record: AdminLoginCodeRecord): Promise<void>;
  /**
   * Atomiski validē + patērē aktīvo OTP izaicinājumu pret iesniegto `sha256(code)`.
   * Inkrementē attempts katrā mēģinājumā; pie `attempts > maxAttempts` invalidē izaicinājumu.
   */
  consumeAdminLoginCode(
    submittedCodeHash: string,
    now: number,
    maxAttempts: number
  ): Promise<AdminLoginCodeConsumeResult>;
  deleteExpiredAdminLoginCodes(now: number): Promise<void>;
  // --- Admin audita žurnāls ---
  appendAdminAudit(entry: AdminAuditEntry): Promise<void>;
  /** Jaunākie audita ieraksti (jaunākie pirmie), ar lapošanu. */
  listAdminAudit(limit: number, offset: number): Promise<readonly AdminAuditEntry[]>;
  // --- Spēlētāju login mēģinājumi ---
  appendLoginAttempt(record: LoginAttemptRecord): Promise<void>;
  // --- Bani (Fāze 3.1) ---
  createBan(record: BanRecord): Promise<void>;
  /** Visi bani (jaunākie pirmie), ar lapošanu — iekļauj aktīvos UN atsauktos/beigušos. */
  listBans(limit: number, offset: number): Promise<readonly BanRecord[]>;
  getBanById(id: string): Promise<BanRecord | undefined>;
  /** Atsauc banu, ja tas šobrīd aktīvs; atgriež `true`, ja tika atsaukts. */
  revokeBan(id: string, now: number): Promise<boolean>;
  /** Aktīvs konta bans (`revoked_at IS NULL AND (permanent OR expires_at>now)`) vai `undefined`. */
  findActiveUserBan(userId: string, now: number): Promise<BanRecord | undefined>;
  /** Aktīvs IP bans vai `undefined`. */
  findActiveIpBan(ip: string, now: number): Promise<BanRecord | undefined>;
  // --- Čata moderācija (Fāze 3.2) ---
  /** Pievieno bloķēto vārdu (NORMALIZĒTS lowercase PK; idempotents). */
  addBlockedWord(word: string, now: number): Promise<void>;
  removeBlockedWord(word: string): Promise<void>;
  /** Visi bloķētie vārdi (normalizēti). */
  listBlockedWords(): Promise<readonly string[]>;
  // --- Analītika (Fāze 4A, read-only agregāti) ---
  countUsers(): Promise<number>;
  /** Konti, kas izveidoti kopš `sinceMs`. */
  countNewUsers(sinceMs: number): Promise<number>;
  /** Atšķirīgi konti ar VEIKSMĪGU login kopš `sinceMs` ("successful-login active users"). */
  countActiveUsers(sinceMs: number): Promise<number>;
  countMatches(): Promise<number>;
  /** Kopējās materializētās monētu bilances (rindas eksistē tikai pēc pirmā `getBalance`). */
  sumCoinBalances(): Promise<number>;
  countActiveBans(now: number): Promise<number>;
  /** Konta reģistrācijas pa dienām kopš `sinceMs` (epohas-dienas indekss). */
  dailyRegistrations(sinceMs: number): Promise<readonly DailyCount[]>;
  /** Veiksmīgi login pa dienām kopš `sinceMs`. */
  dailyLogins(sinceMs: number): Promise<readonly DailyCount[]>;
  // --- Segmenti (Fāze 4A.2) ---
  /** Jaunie konti (izveidoti kopš `sinceMs`), jaunākie pirmie. */
  listNewPlayers(sinceMs: number, limit: number): Promise<readonly SegmentPlayer[]>;
  /** Neaktīvie: konti BEZ veiksmīga login kopš `beforeMs`. */
  listInactivePlayers(beforeMs: number, limit: number): Promise<readonly SegmentPlayer[]>;
  /** Aizdomīgie: konti ar ≥`minFailed` neveiksmīgiem login kopš `sinceMs`. */
  listSuspiciousPlayers(
    sinceMs: number,
    minFailed: number,
    limit: number
  ): Promise<readonly SuspiciousPlayer[]>;
  // --- Segmenti: valsts/platforma (Fāze 4A.2, D4) ---
  /**
   * Distinct (lietotājs, IP) pāri veiksmīgiem login kopš `sinceMs` (tikai `user_id`+`ip` ne-NULL).
   * Atgriež PĀRUS (NE uz-IP skaitus), lai serviss valsti atvasinātu (GeoIP) un skaitītu UNIKĀLUS
   * lietotājus uz valsti — viens lietotājs no 2 IP vienā valstī = 1 (Codex: novērš pārskaitīšanu).
   * `limit` = drošības griesti; serviss atklāj nošķelšanu, ja atgriež `limit` rindas.
   */
  successfulLoginUserIps(sinceMs: number, limit: number): Promise<readonly LoginUserIp[]>;
  /**
   * Distinct (lietotājs, user-agent) pāri veiksmīgiem login kopš `sinceMs` (`user_id` ne-NULL;
   * UA var būt `undefined`, ja netika tverts → serviss klasificē kā "other").
   */
  successfulLoginUserAgents(sinceMs: number, limit: number): Promise<readonly LoginUserAgent[]>;
  // --- Eksports (Fāze 4B.2; PILNS, bez limita — D5 backup) ---
  /** VISAS lietotāja ledger rindas (jaunākās pirmās). */
  exportUserLedger(userId: string): Promise<readonly LedgerEntryView[]>;
  /** VISA lietotāja login vēsture (jaunākā pirmā). */
  exportUserLoginHistory(userId: string): Promise<readonly LoginAttemptView[]>;
  /** VISI lietotāja bani (jaunākie pirmie). */
  exportUserBans(userId: string): Promise<readonly BanRecord[]>;
}

/** Runtime pārbaude, vai glabātuve atbalsta admin (abas to dara; sargs index.ts). */
export function isAdminStore(value: unknown): value is AdminStore {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AdminStore).createAdminSession === "function" &&
    typeof (value as AdminStore).consumeAdminLoginCode === "function" &&
    typeof (value as AdminStore).appendAdminAudit === "function"
  );
}
