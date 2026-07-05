/**
 * Zelta monētu (virtuālās valūtas) ekonomikas konstantes — VIENĪGAIS autoritatīvais
 * avots summām un dalījumiem. Importē GAN serveris (piespiež), GAN web (rāda
 * noteikumos / UI). Nedublēt šīs vērtības nekur citur.
 *
 * Nauda ir VESELI skaitļi (monētas). Serveris ir autoritatīvs visām bilances
 * izmaiņām; klients tikai rāda.
 */

/** Starta bonuss, ko saņem katrs reģistrētais konts (vienreiz, idempotenti). */
export const STARTING_COINS = 5000;

/**
 * Pērkamās vizuālās tēmas cena (kosmētika — monētu izlietne, NE pay-to-win).
 * VIENĪGAIS cenas avots; lieto `store-catalog.ts`. Mainot, mainās visur.
 */
export const THEME_PRICE = 200_000;

/**
 * "supportHuman" bota palīga cena (monētu izlietne — dod 3 padomus/raundā, NE pay-to-win:
 * padoms tikai iesaka cilvēka PAŠA labāko gājienu no info, kas jau viņam ir). VIENĪGAIS
 * cenas avots; lieto `store-catalog.ts`. Mainot, mainās visur.
 */
export const BOT_ASSISTANT_PRICE = 5_000_000;

/**
 * Cik "supportHuman" padomus īpašnieks saņem katrā raundā (GAN SP, GAN MP). VIENĪGAIS
 * autoritatīvais avots šai robežai: SP to lieto React kvotas state (D6), MP to piespiež
 * serveris (`RoomEngine`, D7). Mainot, mainās abās pusēs — nedublēt literāli.
 */
export const HINTS_PER_ROUND = 3;

/** SP grūtības līmeņi, kas dod balvu (atbilst web `BotDifficulty`). */
export type CoinDifficulty = "medium" | "hard" | "epic";

/** SP balva par 1.–2. vietu pēc grūtības (medium/hard/epic). */
export const SP_REWARDS: Readonly<Record<CoinDifficulty, number>> = {
  medium: 50,
  hard: 100,
  epic: 300
};

/**
 * Dienas uzdevums (Daily Tasks) — VIENĪGAIS autoritatīvais raundu-slieksņu + balvu avots.
 * Importē GAN serveris (piespiež slieksni + summu; klients tos NEKAD nesūta), GAN web
 * (rāda). Izpilde = uzvarēt (SP gala vieta 1./2.) VIENU spēli dotajā grūtībā ar raundu
 * skaitu `>= requiredRounds`. Raundu skaits nāk no `/sp/start` tokena (servera-
 * autoritatīvs), tāpēc to nevar viltot. Ikdienas atiestatīšana pēc UTC 00:00; savākšana
 * secīga (`order` 1→4 tajā pašā UTC dienā), progress paralēls un binārs (izpildīts / nav).
 * Piez.: `>=` semantika → viena 50-raundu epic uzvara izpilda GAN order 3 (≥30), GAN 4 (≥50).
 */
export interface DailyTask {
  /** Stabils slug — ledger `ref` daļa (`daily:{yyyymmdd}:{id}`); nemainīt pēc palaišanas. */
  readonly id: string;
  readonly difficulty: CoinDifficulty;
  /** Minimālais raundu skaits (≥) uzvarētajā spēlē, kas atbloķē balvu. */
  readonly requiredRounds: number;
  readonly rewardCoins: number;
  /** Secīgās savākšanas kārtība (1..4); balvu N var savākt tikai, ja N-1 šodien savākts. */
  readonly order: number;
}

/** 4 dienas uzdevumu katalogs (kārtībā pēc `order`). */
export const DAILY_TASKS = [
  { id: "win10_medium", difficulty: "medium", requiredRounds: 10, rewardCoins: 2000, order: 1 },
  { id: "win20_hard", difficulty: "hard", requiredRounds: 20, rewardCoins: 4000, order: 2 },
  { id: "win30_epic", difficulty: "epic", requiredRounds: 30, rewardCoins: 8000, order: 3 },
  { id: "win50_epic", difficulty: "epic", requiredRounds: 50, rewardCoins: 16000, order: 4 }
] as const satisfies readonly DailyTask[];

/** Derīgie uzdevumu id (route zod-validācijai; serveris nepieņem citus). */
export type DailyTaskId = (typeof DAILY_TASKS)[number]["id"];

/**
 * SP spēles variants — marķē speciālās istabas rezultātu `player_game_results.variant`.
 * `undefined`/NULL = parasta (standard) istaba; `"weekly_bosses"` = nedēļas uzdevumu
 * speciālā istaba ar jauktajiem botiem (inclusion/denyHuman/aggressiveVsHuman). Nāk no
 * `/sp/start` tokena (servera-autoritatīvs snapshot), tāpēc to nevar viltot pēc spēles.
 * Paplašināms nākotnē (piem. citiem speciālajiem režīmiem).
 */
export type SpVariant = "weekly_bosses";

/** Nedēļas uzdevuma tips — nosaka, kuru atvasināto skaitītāju serveris lieto. */
export type WeeklyTaskKind = "mp_finish" | "sp_win";

/**
 * Nedēļas uzdevums (Weekly Tasks) — VIENĪGAIS autoritatīvais slieksņu + balvu + kritēriju
 * avots. Importē GAN serveris (piespiež; klients NEKAD nesūta summu/slieksni), GAN web (rāda).
 * Atiestatīšana katru pirmdienu 00:00 UTC; balvu savākšana NEATKARĪGA (nav secīga kā dienas
 * uzdevumos); progress ir count-based (`min(threshold, count)`), atvasināts no
 * `player_game_results`. "Uzvara" = `placement <= WEEKLY_TASK_PLACEMENT_MAX` (top-2).
 *
 * - `mp_finish` (uzd. 1): skaita jebkuru pabeigtu MP spēli (mode='mp' rinda logā).
 * - `sp_win` (uzd. 2/3/4): SP uzvara ar TIEŠU `exactRounds` raundu skaitu; `variant`
 *   undefined = tikai standard istaba (`variant IS NULL`), `"weekly_bosses"` = tikai speciālā.
 */
export interface WeeklyTask {
  /** Stabils slug — ledger `ref` daļa (`weekly:{yyyymmdd}:{id}`); nemainīt pēc palaišanas. */
  readonly id: string;
  readonly kind: WeeklyTaskKind;
  /** Tikai `sp_win`: SP grūtība, ko skaita. */
  readonly difficulty?: CoinDifficulty;
  /** Tikai `sp_win`: `undefined` = standard (`variant IS NULL`); `"weekly_bosses"` = speciālā istaba. */
  readonly variant?: SpVariant;
  /** Tikai `sp_win`: TIEŠS raundu skaits (`round_count == exactRounds`). */
  readonly exactRounds?: number;
  /** Cik reižu jāizpilda (count-based progress mērķis). */
  readonly threshold: number;
  readonly rewardCoins: number;
  /** Vai uzdevumam ir `[Play]` poga, kas palaiž speciālo istabu (uzd. 3/4). */
  readonly hasPlayButton: boolean;
}

/** "Uzvaras vieta" = top-2 (placement ≤ 2) — konsekventi ar SP "uzvaras" definīciju. */
export const WEEKLY_TASK_PLACEMENT_MAX = 2;

/** 4 nedēļas uzdevumu katalogs. */
export const WEEKLY_TASKS = [
  { id: "mp_finish_20", kind: "mp_finish", threshold: 20, rewardCoins: 40000, hasPlayButton: false },
  {
    id: "sp_epic50_x2",
    kind: "sp_win",
    difficulty: "epic",
    exactRounds: 50,
    threshold: 2,
    rewardCoins: 100000,
    hasPlayButton: false
  },
  {
    id: "boss30",
    kind: "sp_win",
    difficulty: "epic",
    variant: "weekly_bosses",
    exactRounds: 30,
    threshold: 1,
    rewardCoins: 150000,
    hasPlayButton: true
  },
  {
    id: "boss50",
    kind: "sp_win",
    difficulty: "epic",
    variant: "weekly_bosses",
    exactRounds: 50,
    threshold: 1,
    rewardCoins: 400000,
    hasPlayButton: true
  }
] as const satisfies readonly WeeklyTask[];

/** Derīgie nedēļas uzdevumu id (route zod-validācijai; serveris nepieņem citus). */
export type WeeklyTaskId = (typeof WEEKLY_TASKS)[number]["id"];

/**
 * MP poda dalījums starp top-2 reģistrētajiem cilvēkiem (botus izlaiž): 1. vieta
 * 70%, 2. vieta 30%. Noapaļošanas atlikums (pēc `Math.floor`) → 1. vietai.
 */
export const POT_SPLIT: readonly [number, number] = [0.7, 0.3];

/** Minimālā maksas istabas dalības maksa; 0 = bezmaksas istaba. */
export const MIN_ENTRY_FEE = 1;

/**
 * Maksas istabas dalības maksas saprātīguma augšējā robeža (drošības/precizitātes
 * sargs, NE produkta limits). Faktiskā robeža paliek hosta bilance (serveris to
 * piespiež atomiski pie debeta). Šī tikai bloķē absurdas/precizitāti laužošas
 * vērtības boundary validācijā (`createRoomSchema`), saglabājot drošu veselu skaitli.
 */
export const MAX_ENTRY_FEE = 1_000_000_000;

/**
 * Sadala podu starp diviem labākajiem cilvēkiem (70/30), atlikumu pievienojot
 * 1. vietai. Ja ir tikai viens cilvēks, viņš saņem visu podu. Atgriež veselus
 * skaitļus, kas vienmēr summējas līdz `pot`.
 *
 * @param pot kopējais pods (veseli skaitļi ≥ 0)
 * @param humanCount cik reģistrētu cilvēku ir kvalificēti izmaksai (0, 1 vai 2)
 */
export function splitPot(pot: number, humanCount: number): readonly [number, number] {
  if (pot <= 0 || humanCount <= 0) {
    return [0, 0];
  }
  if (humanCount === 1) {
    return [pot, 0];
  }
  const second = Math.floor(pot * POT_SPLIT[1]);
  return [pot - second, second];
}
