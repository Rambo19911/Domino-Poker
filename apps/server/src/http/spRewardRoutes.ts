import type { IncomingMessage, ServerResponse } from "node:http";

import { SP_REWARDS } from "@domino-poker/shared";
import { z } from "zod";

import type { AuthService } from "../auth/AuthService.js";
import type { SpRewardTokens } from "../sp/SpRewardTokens.js";
import type { PlayerStatsService } from "../stats/PlayerStatsService.js";
import type { WalletService } from "../wallet/WalletService.js";
import { applyCors, bearerToken, writeJson } from "./httpUtils.js";
import { readJsonBody } from "./readJsonBody.js";
import { RateLimiter } from "./rateLimiter.js";

/**
 * SP balvas HTTP maršruti (Fāze 2, D3 anti-cheat). SP spēle notiek pārlūkā, tāpēc
 * serveris nevar verificēt rezultātu; aizsardzība ir slāņota:
 *   1) auth obligāts (anonīmie spēlē, bet nesaņem neko);
 *   2) `/sp/start` izsniedz vienreizēju tokenu, kas momentuzņem grūtību (balva no
 *      tokena, NE no klienta → nevar sākt medium un pieprasīt epic);
 *   3) `/sp/reward` pieņem TIKAI derīgu, neizmantotu tokenu + min spēles ilgumu;
 *   4) rate-limit uz lietotāju; 5) dienas monētu griesti (DB ledger summa).
 * Atlikušais risks: klients joprojām paziņo `placement` (pieņemts, D3).
 */

/** Minimālais spēles ilgums (s) balvai — bloķē momentānu start→reward bez spēlēšanas. */
const SP_REWARD_MIN_GAME_SECONDS = 5;
/** Maks. SP balvās nopelnāmais dienā (24h) uz kontu — kaitējuma griesti. */
const SP_DAILY_COIN_CAP = 3000;

/** Maks. raundu skaits SP spēlē (atbilst spēles konfigurācijai) — saprātīga augšējā robeža. */
const SP_MAX_ROUNDS = 50;

const startSchema = z.object({
  difficulty: z.enum(["medium", "hard", "epic"]),
  // Raundu skaits momentuzņemts tokenā (bid-accuracy validācijai pie /sp/complete).
  // `.default(7)` saglabā /sp/start atpakaļsaderību (vecs payload bez `rounds` joprojām
  // izdod tokenu /sp/reward plūsmai); jaunais klients vienmēr sūta īsto skaitu.
  rounds: z.number().int().min(1).max(SP_MAX_ROUNDS).default(7)
});
const rewardSchema = z.object({
  gameToken: z.string().min(1).max(64),
  placement: z.union([z.literal(1), z.literal(2)])
});
/**
 * `/sp/complete` ķermenis: pabeigta SP spēle (VISI placement 1..4). Solījumu skaitītāji
 * ir robežoti (≤ raundu maks.) — to summai jāatbilst TOKENA raundu skaitam (serverī
 * pārbaudīts), tāpēc klients tos nevar uzpūst. Difficulty + roundCount nāk no tokena.
 */
const completeSchema = z.object({
  gameToken: z.string().min(1).max(64),
  placement: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  bidMet: z.number().int().min(0).max(SP_MAX_ROUNDS),
  bidExceeded: z.number().int().min(0).max(SP_MAX_ROUNDS),
  bidMissed: z.number().int().min(0).max(SP_MAX_ROUNDS)
});

export type SpRewardHandler = (
  request: IncomingMessage,
  response: ServerResponse
) => Promise<boolean>;

export interface SpRewardRoutesOptions {
  readonly auth: AuthService;
  readonly wallet: WalletService;
  readonly tokens: SpRewardTokens;
  /** Padziļinātās statistikas serviss (SP spēles ieraksts). */
  readonly stats: PlayerStatsService;
  readonly webOrigins: readonly string[];
  readonly clock: () => number;
  readonly dev: boolean;
}

export function createSpRewardHandler(options: SpRewardRoutesOptions): SpRewardHandler {
  // Uz lietotāju: start 20/h (spēles sākas reti), reward 10/h.
  const startLimiter = new RateLimiter(20, 60 * 60 * 1000, options.clock);
  const rewardLimiter = new RateLimiter(10, 60 * 60 * 1000, options.clock);
  // `/sp/complete` (statistika + balva) — augstāks limits (60/h), lai aktīva spēlēšana
  // NEKAD nepazaudē statistiku; monētu dienas griesti ir neatkarīgi un tikai nullē balvu.
  const completeLimiter = new RateLimiter(60, 60 * 60 * 1000, options.clock);

  return async (request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (!path.startsWith("/sp/")) {
      return false;
    }
    applyCors(request, response, options.webOrigins, options.dev);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return true;
    }

    try {
      if (request.method === "POST" && path === "/sp/start") {
        await handleStart(request, response, options, startLimiter);
      } else if (request.method === "POST" && path === "/sp/reward") {
        await handleReward(request, response, options, rewardLimiter);
      } else if (request.method === "POST" && path === "/sp/complete") {
        await handleComplete(request, response, options, completeLimiter);
      } else {
        writeJson(response, 404, { error: "not_found" });
      }
    } catch (error) {
      console.error("[sp] route error:", error);
      if (!response.headersSent) {
        writeJson(response, 500, { error: "internal_error" });
      }
    }
    return true;
  };
}

async function handleStart(
  request: IncomingMessage,
  response: ServerResponse,
  options: SpRewardRoutesOptions,
  limiter: RateLimiter
): Promise<void> {
  const token = bearerToken(request);
  const user = token ? await options.auth.resolveToken(token) : undefined;
  if (!user) {
    writeJson(response, 401, { error: "unauthorized" });
    return;
  }
  if (!limiter.check(user.id)) {
    writeJson(response, 429, { error: "rate_limited" });
    return;
  }
  const body = await readJsonBody(request);
  if (!body.ok) {
    writeJson(response, body.status, { error: body.status === 413 ? "too_large" : "invalid_input" });
    return;
  }
  const parsed = startSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }
  const gameToken = options.tokens.issue(user.id, parsed.data.difficulty, parsed.data.rounds);
  writeJson(response, 200, { gameToken });
}

async function handleReward(
  request: IncomingMessage,
  response: ServerResponse,
  options: SpRewardRoutesOptions,
  limiter: RateLimiter
): Promise<void> {
  const token = bearerToken(request);
  const user = token ? await options.auth.resolveToken(token) : undefined;
  if (!user) {
    writeJson(response, 401, { error: "unauthorized" });
    return;
  }
  if (!limiter.check(user.id)) {
    writeJson(response, 429, { error: "rate_limited" });
    return;
  }
  const body = await readJsonBody(request);
  if (!body.ok) {
    writeJson(response, body.status, { error: body.status === 413 ? "too_large" : "invalid_input" });
    return;
  }
  const parsed = rewardSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }

  const claimed = options.tokens.consume(parsed.data.gameToken, user.id);
  if (!claimed) {
    // Nederīgs / izmantots / izbeidzies / cita lietotāja tokens.
    writeJson(response, 409, { error: "invalid_token" });
    return;
  }

  const now = options.clock();
  // Pārāk ātri (start→reward bez reālas spēles) → graciozi bez balvas (token jau patērēts).
  if (now - claimed.issuedAt < SP_REWARD_MIN_GAME_SECONDS * 1000) {
    writeJson(response, 200, { awarded: 0, balance: await options.wallet.getBalance(user.id) });
    return;
  }

  // Balva no TOKENA grūtības + HARD dienas griesti (clamp uz atlikušo, atomiski uz
  // lietotāju) — kopsumma 24h nekad nepārsniedz griestus, arī pie vienlaicīgām spēlēm.
  const reward = SP_REWARDS[claimed.difficulty];
  const { awarded, balance } = await options.wallet.creditSpRewardCapped(
    user.id,
    parsed.data.gameToken,
    reward,
    SP_DAILY_COIN_CAP,
    now
  );
  writeJson(response, 200, { awarded, balance });
}

/**
 * `/sp/complete` (Fāze: statistika) — pabeigta SP spēle reģistrētam lietotājam VISIEM
 * placement 1..4. Kārtība (sk. `docs/TODO/player-stats-plan.md`): peek tokenu (NEpatērē)
 * → validē ķermeni pret tokena raundu skaitu → ieraksta statistiku (idempotents) →
 * kreditē monētas (idempotents, tikai 1./2. + min ilgums) → patērē tokenu PĒC veiksmes.
 * Daļēja kļūme ir atkārtojama (idempotence pa visu ceļu); dublikāts → stabils success.
 */
async function handleComplete(
  request: IncomingMessage,
  response: ServerResponse,
  options: SpRewardRoutesOptions,
  limiter: RateLimiter
): Promise<void> {
  const token = bearerToken(request);
  const user = token ? await options.auth.resolveToken(token) : undefined;
  if (!user) {
    writeJson(response, 401, { error: "unauthorized" });
    return;
  }
  if (!limiter.check(user.id)) {
    writeJson(response, 429, { error: "rate_limited" });
    return;
  }
  const body = await readJsonBody(request);
  if (!body.ok) {
    writeJson(response, body.status, { error: body.status === 413 ? "too_large" : "invalid_input" });
    return;
  }
  const parsed = completeSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }

  // PEEK (NEpatērē): DB kļūme PĒC peek nepazaudē tokenu — to patērējam TIKAI pēc
  // veiksmīga ieraksta+kredīta, tāpēc daļēja kļūme ir atkārtojama (idempotenti).
  const claimed = options.tokens.peek(parsed.data.gameToken, user.id);
  if (!claimed) {
    // Tokens jau patērēts/izbeidzies. Ja šī spēle JAU ierakstīta (replay PĒC veiksmes)
    // un pieder šim lietotājam → stabils success (recorded:false), NE 409 — idempotentās
    // pabeigšanas kontrakts. Citādi (nezināms/cita lietotāja/izbeidzies bez ieraksta) → 409.
    const owner = await options.stats.findSpGameOwner(parsed.data.gameToken);
    if (owner === user.id) {
      writeJson(response, 200, {
        recorded: false,
        coinsAwarded: 0,
        balance: await options.wallet.getBalance(user.id)
      });
      return;
    }
    writeJson(response, 409, { error: "invalid_token" });
    return;
  }

  // Solījumu skaitītāju summai JĀATBILST tokena raundu skaitam (serverī uzticams) →
  // klients nevar uzpūst raundu skaitu vai sadali.
  const { bidMet, bidExceeded, bidMissed, placement } = parsed.data;
  if (bidMet + bidExceeded + bidMissed !== claimed.roundCount) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }

  const now = options.clock();

  // 1) Statistika (idempotents pēc sp:{gameToken}). Difficulty + roundCount no TOKENA.
  //    Stats dzen tikai personīgu atgriezenisku saiti → ierakstām visiem placement 1..4
  //    un neatkarīgi no monētu griestiem/min-ilguma (tie tikai nullē balvu).
  const recorded = await options.stats.recordSpGame({
    userId: user.id,
    gameToken: parsed.data.gameToken,
    difficulty: claimed.difficulty,
    placement,
    roundCount: claimed.roundCount,
    bidMet,
    bidExceeded,
    bidMissed,
    now
  });

  // 2) Monētas (idempotents pēc gameToken ledger ref). Tikai 1./2. vieta UN min ilgums
  //    (kā /sp/reward). Kreditē KATRĀ izsaukumā (NE tikai pie jauna ieraksta) → daļēja
  //    kļūme atkārtojama; `awarded` no `applied` → dublikātā 0.
  const eligible =
    placement <= 2 && now - claimed.issuedAt >= SP_REWARD_MIN_GAME_SECONDS * 1000;
  const { awarded, balance } = eligible
    ? await options.wallet.creditSpRewardCapped(
        user.id,
        parsed.data.gameToken,
        SP_REWARDS[claimed.difficulty],
        SP_DAILY_COIN_CAP,
        now
      )
    : { awarded: 0, balance: await options.wallet.getBalance(user.id) };

  // 3) Patērē tokenu TIKAI tagad (pēc veiksmes). Ja šis neizdotos, replay ir nekaitīgs
  //    (DB id + ledger ref idempotence). Dublikāts ar dzīvu tokenu → recorded:false,
  //    awarded:0 (stabils success, NE kļūda).
  options.tokens.consume(parsed.data.gameToken, user.id);
  writeJson(response, 200, { recorded, coinsAwarded: awarded, balance });
}

export { SP_REWARD_MIN_GAME_SECONDS, SP_DAILY_COIN_CAP };
