// Bota uzvedības slānis (objective layer) — ATSEVIŠĶS no grūtības (difficulty = domāšanas budžets).
// Šeit dzīvo cilvēku-mērķējošie mērķi, kas ISMCTS meklēšanā maina TIKAI paša bota sēdvietas reward
// komponenti; pārējās sēdvietas patur dabisko inclusion mērķi, tāpēc determinizētajās izspēlēs
// pretinieki/cilvēks joprojām spēlē reālistiski (max^n). Sk. docs/bot-behaviors.md par pieslēgšanu.
//
// v1 tvērums: uzvedība ietekmē GĀJIENU meklēšanu (tree selection + backpropagation). Solīšana un
// rollout heiristika paliek nemainīga — tās ir atsevišķas asis, ko var paplašināt vēlāk.

import type { GameState, Seat } from "@domino-poker/engine";
import { computePointsReward, seatInclusionReward, type RewardFn } from "./ismcts.js";

// Trīs cilvēku-mērķējošas uzvedības. NAV "inclusion"/"points" — tie jau pastāv kā RewardKind un
// paliek noklusējuma, uz cilvēku neorientētais spēles režīms.
export type BotObjective = "denyHuman" | "aggressiveVsHuman" | "supportHuman";

// Uzvedības konfigurācija. `botSeat` ir pati bota sēdvieta (view.seat), `targetSeat` ir cilvēka
// sēdvieta, uz kuru uzvedība ir vērsta. `weight` (0..1) sabalansē paša bota mērķi pret uz cilvēku
// vērsto komponenti; noklusējums atkarīgs no mērķa.
export type BotBehaviorConfig = {
  readonly objective: BotObjective;
  readonly botSeat: Seat;
  readonly targetSeat: Seat;
  readonly weight?: number;
};

// Uz cilvēku vērstās komponentes noklusējuma svars katram mērķim.
const DEFAULT_WEIGHT: Record<BotObjective, number> = {
  supportHuman: 0.6,
  denyHuman: 0.5,
  aggressiveVsHuman: 0.6
};

// Nosaka drošu svaru [0, 1] robežās. NaN/Infinity → mērķa noklusējums (Math.min/max ar NaN dotu
// NaN, kas saindētu UCB izvēli — sk. RewardFn kontraktu ismcts.ts).
function resolveWeight(weight: number | undefined, objective: BotObjective): number {
  if (weight === undefined || !Number.isFinite(weight)) {
    return DEFAULT_WEIGHT[objective];
  }
  if (weight < 0) return 0;
  if (weight > 1) return 1;
  return weight;
}

// Būvē `RewardFn` izvēlētajai uzvedībai. Atgriezto funkciju padod ISMCTS meklēšanai caur
// `reward` opciju (ChooseMoveOptions / SearcherConfig), kur tā pārraksta `rewardKind`.
//
// Katrā stāvoklī: vispirms KATRAI sēdvietai ieraksta dabisko inclusion reward (reālistisks
// pretinieku/cilvēka modelis — viņi spēlē, lai trāpītu SAVU solījumu), tad pārraksta TIKAI
// `out[botSeat]` atbilstoši mērķim. Visas komponentes paliek [0, 1] robežās (UCB pieņēmums).
export function createBehaviorReward(config: BotBehaviorConfig): RewardFn {
  const { objective, botSeat, targetSeat } = config;
  if (botSeat === targetSeat) {
    throw new Error(`createBehaviorReward: botSeat and targetSeat must differ (both ${botSeat}).`);
  }
  const weight = resolveWeight(config.weight, objective);
  // Closure-lokāls scratch aggressiveVsHuman punktu aprēķinam — bez alokācijas uz iterāciju.
  const pointsScratch = new Float64Array(4);

  return (state, out) => {
    for (let seat = 0; seat < 4; seat += 1) {
      out[seat] = seatInclusionReward(state.taken[seat] as number, state.bids[seat] as number);
    }
    const selfIncl = out[botSeat] as number;
    const targetIncl = out[targetSeat] as number;

    if (objective === "supportHuman") {
      // Palīdz cilvēkam trāpīt solījumu: jo augstāks cilvēka inclusion, jo augstāks bota reward.
      out[botSeat] = (1 - weight) * selfIncl + weight * targetIncl;
      return;
    }

    if (objective === "denyHuman") {
      // Kavē cilvēku trāpīt solījumu (1 - cilvēka inclusion), vienlaikus turot savu solījumu.
      out[botSeat] = (1 - weight) * selfIncl + weight * (1 - targetIncl);
      return;
    }

    // aggressiveVsHuman: paša mērķis ir relatīvie PUNKTI (score-orientēts, tiecas uz augstāku
    // rezultātu, ne tikai precīzu solījumu) apvienots ar cilvēka kavēšanu.
    computePointsReward(state, pointsScratch);
    out[botSeat] = (1 - weight) * (pointsScratch[botSeat] as number) + weight * (1 - targetIncl);
  };
}
