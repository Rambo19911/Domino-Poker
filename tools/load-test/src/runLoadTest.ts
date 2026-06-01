import process from "node:process";

import { LoadMetrics, type LatencySummary } from "./metrics.js";
import { VirtualClient } from "./VirtualClient.js";

/**
 * Lokālais slodzes testa CLI (Fāze 11). Rampo N virtuālos klientus pret darbojošos
 * MP serveri un ģenerē reālu protokola slodzi:
 *   - daļa klientu (`gameFraction`) izveido istabu + aizpilda ar botiem + sāk spēli
 *     (servera dzinējs + pacing timeri + persistence + cilvēka-turna 10s timeouti);
 *   - daļa (`churnEvery`) imitē disconnect→reconnect;
 *   - pārējie ģenerē lobby/čata + ping aktivitāti.
 * Mēra savienojuma + ziņojumu latenci, kļūdas, negaidītus aizvērumus, un aptaujā
 * servera `/metrics` (RSS/CPU/savienojumi) + `/health` (avārijas detektēšana).
 *
 * Lietošana (no repo saknes):
 *   npm run load:local                              # smoke (25 klienti, 8 s)
 *   npm run load:local -- --clients=100 --duration=20000
 *   npm run load:local -- 500
 */

interface LoadConfig {
  readonly clients: number;
  readonly durationMs: number;
  readonly url: string;
  readonly healthUrl: string;
  readonly metricsUrl: string;
  readonly rampBatch: number;
  readonly rampDelayMs: number;
  /** Daļa (0..1) klientu, kas hostē botu spēli. */
  readonly gameFraction: number;
  /** Katrs N-tais klients imitē disconnect/reconnect (0 = izslēgts). */
  readonly churnEvery: number;
}

function parseArgs(argv: readonly string[]): LoadConfig {
  const flags = new Map<string, string>();
  let positionalClients: number | undefined;
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/u.exec(arg);
    if (match) {
      flags.set(match[1] as string, match[2] as string);
    } else if (/^\d+$/u.test(arg)) {
      positionalClients = Number(arg);
    }
  }
  const num = (key: string, fallback: number): number => {
    const value = flags.get(key);
    return value === undefined ? fallback : Number(value);
  };

  const port = flags.get("port") ?? "4000";
  const host = flags.get("host") ?? "127.0.0.1";
  return {
    clients: Number(flags.get("clients") ?? positionalClients ?? 25),
    durationMs: num("duration", 8_000),
    url: flags.get("url") ?? `ws://${host}:${port}/ws`,
    healthUrl: flags.get("health") ?? `http://${host}:${port}/health`,
    metricsUrl: flags.get("metrics") ?? `http://${host}:${port}/metrics`,
    rampBatch: num("rampBatch", 25),
    rampDelayMs: num("rampDelay", 100),
    gameFraction: num("gameFraction", 0.25),
    churnEvery: num("churnEvery", 10)
  };
}

interface ServerMetricsSample {
  readonly rssBytes: number;
  readonly cpuUserMicros: number;
  readonly cpuSystemMicros: number;
  readonly connections: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function checkHealth(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2_000) })).ok;
  } catch {
    return false;
  }
}

/**
 * Vai serveris IZDZĪVOJA slodzi? Atkārto `/health` pārbaudi vairākas reizes —
 * tā nošķir AVĀRIJU (nekad neatbild) no īslaicīga event-loop PIESĀTINĀJUMA
 * (atbild pēc dažām sekundēm, kad slodze norimst). Pietiek ar vienu sekmīgu atbildi.
 */
async function awaitServerRecovery(url: string, attempts = 8, intervalMs = 1_500): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    if (await checkHealth(url)) return true;
    await sleep(intervalMs);
  }
  return false;
}

async function fetchMetrics(url: string): Promise<ServerMetricsSample | undefined> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    if (!response.ok) return undefined;
    return (await response.json()) as ServerMetricsSample;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const metrics = new LoadMetrics();
  console.log(
    `[load] target=${config.url} clients=${config.clients} duration=${config.durationMs}ms gameFraction=${config.gameFraction}`
  );

  if (!(await checkHealth(config.healthUrl))) {
    console.error(
      `[load] FAIL: serveris nav sasniedzams uz ${config.healthUrl}. Palaid to (npm run dev:server) un mēģini vēlreiz.`
    );
    process.exitCode = 1;
    return;
  }

  // 1. Rampa partijās (izvairās no vienlaicīga sprādziena). Unikāls run-id prefikss
  //    klientu id, lai atkārtoti palaidieni pret TO PAŠU (nerestartēto) serveri
  //    nesadurtos ar durable reconnect tokeniem (anti-hijack → citādi FORBIDDEN).
  const runId = Date.now().toString(36);
  const clients: VirtualClient[] = [];
  const startedConnectAt = Date.now();
  for (let index = 0; index < config.clients; index += config.rampBatch) {
    const batch: VirtualClient[] = [];
    for (let n = index; n < Math.min(index + config.rampBatch, config.clients); n += 1) {
      batch.push(new VirtualClient({ url: config.url, clientId: `load-${runId}-${n}`, metrics }));
    }
    await Promise.all(
      batch.map((client) => client.connect().then(() => clients.push(client), () => undefined))
    );
    if (index + config.rampBatch < config.clients) await sleep(config.rampDelayMs);
  }
  console.log(
    `[load] connected ${clients.length}/${config.clients} in ${Date.now() - startedConnectAt}ms`
  );

  // 2. Spēles hosti: daļa klientu izveido istabu + bot-fill, tad sāk spēli.
  const hostStride = config.gameFraction > 0 ? Math.max(1, Math.round(1 / config.gameFraction)) : 0;
  let gameHosts = 0;
  if (hostStride > 0) {
    for (let i = 0; i < clients.length; i += hostStride) {
      (clients[i] as VirtualClient).createRoomWithBots();
      gameHosts += 1;
    }
    await sleep(400); // ļaujam ROOM_CREATED atnākt
    for (let i = 0; i < clients.length; i += hostStride) {
      (clients[i] as VirtualClient).startGame();
    }
  }
  console.log(`[load] started ${gameHosts} bot-filled games`);

  // 3. Servera /metrics + /health paraugošana fonā.
  let serverUnreachable = 0;
  let metricsPolls = 0;
  let peakServerRssMb = 0;
  let peakConnections = 0;
  let firstSample: { cpu: number; at: number } | undefined;
  let lastSample: { cpu: number; at: number } | undefined;
  const monitor = setInterval(() => {
    metricsPolls += 1;
    void fetchMetrics(config.metricsUrl).then((sample) => {
      if (!sample) {
        serverUnreachable += 1;
        return;
      }
      peakServerRssMb = Math.max(peakServerRssMb, sample.rssBytes / (1024 * 1024));
      peakConnections = Math.max(peakConnections, sample.connections);
      const cpu = sample.cpuUserMicros + sample.cpuSystemMicros;
      const at = Date.now();
      firstSample ??= { cpu, at };
      lastSample = { cpu, at };
    });
  }, 1_000);

  // 4. Aktivitāte: ping + reizēm čats/saraksts; daļa klientu reconnect (churn).
  let tick = 0;
  const activity = clients.map((client, clientIndex) => {
    const jitter = (clientIndex % 10) * 60;
    return setInterval(() => {
      if (!client.isOpen()) return;
      client.ping();
      tick += 1;
      if (tick % 6 === clientIndex % 6) client.sendChat(`load ${clientIndex}-${tick}`);
      else if (tick % 11 === clientIndex % 11) client.listRooms();
    }, 1_500 + jitter);
  });

  // Churn: katrs N-tais klients vienreiz testa vidū atvienojas + atjaunojas.
  if (config.churnEvery > 0) {
    setTimeout(() => {
      for (let i = 0; i < clients.length; i += config.churnEvery) {
        void (clients[i] as VirtualClient).reconnect().catch(() => undefined);
      }
    }, Math.floor(config.durationMs / 2));
  }

  await sleep(config.durationMs);

  // 5. Tīra aizvēršana.
  for (const interval of activity) clearInterval(interval);
  clearInterval(monitor);
  for (const client of clients) client.close();
  await sleep(500);

  // Definitīvā avārijas pārbaude: vai serveris atgūstas PĒC slodzes? Atkārto, lai
  // nošķirtu avāriju no īslaicīga piesātinājuma (serveris var ~sekundes būt aizņemts).
  const survivedLoad = await awaitServerRecovery(config.healthUrl);

  const cpuPercentOneCore =
    firstSample && lastSample && lastSample.at > firstSample.at
      ? ((lastSample.cpu - firstSample.cpu) / ((lastSample.at - firstSample.at) * 1000)) * 100
      : 0;

  printReport(metrics, {
    config,
    gameHosts,
    serverUnreachable,
    metricsPolls,
    survivedLoad,
    peakServerRssMb,
    peakConnections,
    cpuPercentOneCore
  });
}

function fmt(summary: LatencySummary): string {
  return `n=${summary.count} mean=${summary.meanMs.toFixed(1)} p50=${summary.p50Ms} p95=${summary.p95Ms} p99=${summary.p99Ms} max=${summary.maxMs}ms`;
}

interface ReportExtra {
  readonly config: LoadConfig;
  readonly gameHosts: number;
  readonly serverUnreachable: number;
  readonly metricsPolls: number;
  readonly survivedLoad: boolean;
  readonly peakServerRssMb: number;
  readonly peakConnections: number;
  readonly cpuPercentOneCore: number;
}

function printReport(metrics: LoadMetrics, extra: ReportExtra): void {
  const report = metrics.report();
  const errors = Object.entries(report.errorsByCode);
  console.log("\n===== LOAD TEST REPORT =====");
  console.log(`Connected clients  : ${report.connectedClients}/${extra.config.clients}`);
  console.log(`Bot-filled games   : ${extra.gameHosts}`);
  console.log(`Connect failures   : ${report.connectFailures}`);
  console.log(`Connect latency    : ${fmt(report.connectLatency)}`);
  console.log(`Message RTT         : ${fmt(report.messageLatency)}`);
  console.log(`Messages sent/recv  : ${report.messagesSent} / ${report.messagesReceived}`);
  console.log(`Reconnects (churn)  : ${report.reconnects}`);
  console.log(`Dropped sockets     : ${report.droppedSockets}`);
  console.log(`Clean closures      : ${report.cleanClosures}`);
  console.log(`Server peak conns   : ${extra.peakConnections}`);
  console.log(`Server peak RSS     : ${extra.peakServerRssMb.toFixed(1)} MB`);
  console.log(`Server CPU (1 core) : ${extra.cpuPercentOneCore.toFixed(1)}%`);
  console.log(
    `Server unreachable  : ${extra.serverUnreachable}/${extra.metricsPolls} metric poll(s)`
  );
  console.log(`Survived load (end) : ${extra.survivedLoad ? "yes ✅" : "NO ❌"}`);
  console.log(`Server errors       : ${errors.length === 0 ? "none" : ""}`);
  for (const [code, count] of errors) console.log(`  - ${code}: ${count}`);

  // STABILITĀTE (pieņemšanas kritērijs): serveris izdzīvoja + nav masveida dropped
  // sockets. Šī ir cietā PASS/FAIL — avārija vai socket zudums.
  const stable = extra.survivedLoad && report.droppedSockets === 0;
  // LATENCE/SATURĀCIJA: informatīvi brīdinājumi (lēnums zem ekstrēmas slodzes nav
  // avārija; vidēja latence + connect failures norāda uz event-loop piesātinājumu).
  const saturated =
    report.connectFailures > 0 || report.messageLatency.meanMs > 1_000;

  console.log(
    `\nSTABILITĀTE: ${stable ? "OK ✅ (serveris izdzīvoja, nav dropped sockets)" : "FAIL ❌ (avārija vai socket zudums)"}`
  );
  if (stable && saturated) {
    console.log(
      "LATENCE: ⚠️ event-loop piesātinājums (augsta vidējā latence / connect failures) — stabils, bet pārslogots šim līmenim."
    );
  } else if (stable) {
    console.log("LATENCE: OK ✅ (pieņemama)");
  }
  console.log("============================\n");
  if (!stable) process.exitCode = 1;
}

void main();
