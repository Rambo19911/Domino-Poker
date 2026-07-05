// Vieglā botu grūtības konfigurācija + tipi. APZINĀTI bez smagajiem importiem
// (@domino-poker/ai / engine), lai lobby (AppShell, LobbyScreen) to var importēt,
// neievelkot ISMCTS botu sākotnējā bundle. Pati lēmumu loģika dzīvo `botBridge.ts`
// (kas šo konfigurāciju lieto un tiek code-split spēles chunk-ā).

export type BotDifficulty = "medium" | "hard" | "epic";

// Viens autoritatīvs avots līmeņu budžetiem:
// - bidSamples: Monte Carlo sadales uz solījumu (vairāk = precīzāka solīšana).
// - moveIterations: ISMCTS iterācijas uz gājienu (iterāciju budžets → reproducējams spēks).
export const BOT_DIFFICULTIES: Record<
  BotDifficulty,
  { readonly bidSamples: number; readonly moveIterations: number }
> = {
  medium: { bidSamples: 1000, moveIterations: 8000 },
  hard: { bidSamples: 3000, moveIterations: 30000 },
  epic: { bidSamples: 5000, moveIterations: 50000 }
};

export const DEFAULT_DIFFICULTY: BotDifficulty = "medium";

export function isBotDifficulty(value: string): value is BotDifficulty {
  return value === "medium" || value === "hard" || value === "epic";
}

/**
 * Bota UZVEDĪBA (personība) — atsevišķa ass no grūtības (budžeta). Vada, KO bots optimizē
 * ISMCTS gājienu meklēšanā (sk. `docs/bot-behaviors.md`). `inclusion` = esošais noklusējums
 * (precīzs paša solījums, bez cilvēka mērķa); pārējie ir uz cilvēku vērsti. APZINĀTI viegls
 * tips šeit (bez `@domino-poker/ai` importa), lai lobby to var padot bez botu bundle ievilkšanas.
 * `weight` (0..1) sabalansē paša mērķi pret uz cilvēku vērsto komponenti (mērķa noklusējums, ja nav).
 */
export type BotBehaviorChoice =
  | { readonly objective: "inclusion" }
  | { readonly objective: "denyHuman" | "aggressiveVsHuman"; readonly weight?: number };
