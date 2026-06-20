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

/** SP grūtības līmeņi, kas dod balvu (atbilst web `BotDifficulty`). */
export type CoinDifficulty = "medium" | "hard" | "epic";

/** SP balva par 1.–2. vietu pēc grūtības (medium/hard/epic). */
export const SP_REWARDS: Readonly<Record<CoinDifficulty, number>> = {
  medium: 50,
  hard: 100,
  epic: 300
};

/**
 * MP poda dalījums starp top-2 reģistrētajiem cilvēkiem (botus izlaiž): 1. vieta
 * 70%, 2. vieta 30%. Noapaļošanas atlikums (pēc `Math.floor`) → 1. vietai.
 */
export const POT_SPLIT: readonly [number, number] = [0.7, 0.3];

/** Minimālā maksas istabas dalības maksa; 0 = bezmaksas istaba. */
export const MIN_ENTRY_FEE = 1;

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
