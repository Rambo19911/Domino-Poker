#!/usr/bin/env node
/**
 * Dzīvā nedēļas uzdevumu izspēle pret PALAISTU serveri (SP uzdevumi, ĪSTAS laika aizkaves).
 *
 * Kāpēc: lai nebūtu manuāli jāspēlē 30/50 raundu spēles, šis skripts izspēlē SP-balstītos nedēļas
 * uzdevumus caur HTTP (`/auth`, `/sp`, `/weekly`) ar reālu min-ilguma nogaidīšanu, tad savāc balvas
 * un izdrukā rezultātu. (MP uzdevums `mp_finish_20` iet caur WebSocket istabām, ne HTTP, tāpēc to
 * validē integrācijas tests `apps/server/test/weekly/weeklyTaskFlow.integration.test.ts`.)
 *
 * Lietošana:
 *   node scripts/sim-weekly-tasks.mjs [baseUrl]
 *   SIM_BASE=http://localhost:4000 node scripts/sim-weekly-tasks.mjs
 * Noklusējums: http://localhost:4000. Serverim JĀBŪT palaistam (ar jauno kodu — epoch labojums).
 * Ilgums ~3 min (reālas min-ilguma aizkaves 30–60s uz spēli).
 */

const BASE = process.argv[2] || process.env.SIM_BASE || "http://localhost:4000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function register() {
  const suffix = `${Date.now()}${Math.floor(performance.now())}`.slice(-10);
  const username = `simw_${suffix}`;
  const r = await api("POST", "/auth/register", undefined, {
    username,
    password: "secret123",
    email: `${username}@example.com`
  });
  if (r.status !== 200 || !r.json.token) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.token, username };
}

async function playSp(token, { difficulty, rounds, variant, placement, waitSec }) {
  const start = await api("POST", "/sp/start", token, { difficulty, rounds, ...(variant ? { variant } : {}) });
  if (start.status !== 200 || !start.json.gameToken) throw new Error(`/sp/start failed: ${start.status}`);
  process.stdout.write(`   waiting ${waitSec}s (min-duration gate)…\n`);
  await sleep(waitSec * 1000);
  const done = await api("POST", "/sp/complete", token, {
    gameToken: start.json.gameToken,
    placement,
    bidMet: rounds,
    bidExceeded: 0,
    bidMissed: 0
  });
  if (done.status !== 200) throw new Error(`/sp/complete failed: ${done.status} ${JSON.stringify(done.json)}`);
}

function findTask(state, id) {
  return (state.tasks || []).find((t) => t.id === id);
}

async function main() {
  console.log(`Weekly-task live simulation against ${BASE}\n`);
  const { token, username } = await register();
  console.log(`Registered temp user: ${username}\n`);

  const results = [];

  // boss30 — speciālā istaba, 2. vieta (top-2), ~35s > 30s vārti.
  console.log("[1/3] boss30 — Take winning place in a 30-round game (special room), 2nd place");
  await playSp(token, { difficulty: "epic", rounds: 30, variant: "weekly_bosses", placement: 2, waitSec: 35 });
  {
    const state = (await api("GET", "/weekly/tasks", token)).json;
    const t = findTask(state, "boss30");
    console.log(`   progress ${t?.progress}/${t?.threshold}, claimable=${t?.claimable}`);
    const claim = await api("POST", "/weekly/tasks/claim", token, { taskId: "boss30" });
    results.push(["boss30", claim.status, claim.json.awarded, 150000]);
  }

  // boss50 — speciālā istaba, 1. vieta, ~55s > 50s vārti.
  console.log("\n[2/3] boss50 — Take winning place in a 50-round game (special room), 1st place");
  await playSp(token, { difficulty: "epic", rounds: 50, variant: "weekly_bosses", placement: 1, waitSec: 55 });
  {
    const claim = await api("POST", "/weekly/tasks/claim", token, { taskId: "boss50" });
    results.push(["boss50", claim.status, claim.json.awarded, 400000]);
  }

  // sp_epic50_x2 — divas standard epic-50 uzvaras.
  console.log("\n[3/3] sp_epic50_x2 — Win twice a 50-round game on Epic (standard room)");
  await playSp(token, { difficulty: "epic", rounds: 50, placement: 1, waitSec: 55 });
  await playSp(token, { difficulty: "epic", rounds: 50, placement: 2, waitSec: 55 });
  {
    const claim = await api("POST", "/weekly/tasks/claim", token, { taskId: "sp_epic50_x2" });
    results.push(["sp_epic50_x2", claim.status, claim.json.awarded, 100000]);
  }

  console.log("\n──────── RESULTS ────────");
  let allOk = true;
  for (const [id, status, awarded, expected] of results) {
    const ok = status === 200 && awarded === expected;
    allOk = allOk && ok;
    console.log(`${ok ? "PASS" : "FAIL"}  ${id.padEnd(14)} status=${status} awarded=${awarded} (expected ${expected})`);
  }
  console.log("─────────────────────────");
  console.log(allOk ? "\nAll SP-based weekly tasks work. ✅" : "\nSome tasks FAILED — see above. ❌");
  console.log("(mp_finish_20 is validated by the integration test — MP goes through WebSocket, not HTTP.)");
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("\nSimulation error:", err.message);
  console.error("Is the server running with the latest code? Default base is http://localhost:4000 (override: node scripts/sim-weekly-tasks.mjs <baseUrl>).");
  process.exit(1);
});
