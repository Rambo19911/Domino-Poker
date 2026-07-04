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

/** SP grūtības līmeņi, kas dod balvu (atbilst web `BotDifficulty`). */
export type CoinDifficulty = "medium" | "hard" | "epic";

/** SP balva par 1.–2. vietu pēc grūtības (medium/hard/epic). */
export const SP_REWARDS: Readonly<Record<CoinDifficulty, number>> = {
  medium: 50,
  hard: 100,
  epic: 300
};

/**
 * Dienas uzdevums (Daily Tasks) — VIENĪGAIS autoritatīvais slieksņu + balvu avots.
 * Importē GAN serveris (piespiež slieksni + summu; klients tos NEKAD nesūta), GAN web
 * (rāda). "Uzvara" = SP gala vieta 1./2. dotajā grūtībā. Ikdienas atiestatīšana pēc
 * UTC 00:00; savākšana secīga (`order` 1→4 tajā pašā UTC dienā), progress paralēls.
 * Uzdevumi 3 un 4 abi lasa TO PAŠU dienas epic uzvaru skaitu (30/30 un 50/50).
 */
export interface DailyTask {
  /** Stabils slug — ledger `ref` daļa (`daily:{yyyymmdd}:{id}`); nemainīt pēc palaišanas. */
  readonly id: string;
  readonly difficulty: CoinDifficulty;
  /** Uzvaru (placement ≤ 2) skaits šodien, kas atbloķē balvu. */
  readonly threshold: number;
  readonly rewardCoins: number;
  /** Secīgās savākšanas kārtība (1..4); balvu N var savākt tikai, ja N-1 šodien savākts. */
  readonly order: number;
}

/** 4 dienas uzdevumu katalogs (kārtībā pēc `order`). */
export const DAILY_TASKS = [
  { id: "win10_medium", difficulty: "medium", threshold: 10, rewardCoins: 2000, order: 1 },
  { id: "win20_hard", difficulty: "hard", threshold: 20, rewardCoins: 4000, order: 2 },
  { id: "win30_epic", difficulty: "epic", threshold: 30, rewardCoins: 8000, order: 3 },
  { id: "win50_epic", difficulty: "epic", threshold: 50, rewardCoins: 16000, order: 4 }
] as const satisfies readonly DailyTask[];

/** Derīgie uzdevumu id (route zod-validācijai; serveris nepieņem citus). */
export type DailyTaskId = (typeof DAILY_TASKS)[number]["id"];

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
