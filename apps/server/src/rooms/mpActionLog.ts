import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import type { MultiplayerCommand, MultiplayerGameState } from "@domino-poker/core/multiplayer";

import type { RoomDispatchResult } from "./RoomEngine.js";

/**
 * MP darbību logošana (atkļūdošanai). Logo KATRU komandu, kas iet caur
 * `RoomEngine.process` (cilvēka gājiens, bota auto-play, turn timeout, forfeit,
 * turnu sākumi) + tās rezultātu. Noraidījumiem pievieno kontekstu (fāze, kura
 * kārta, turnId sakritība, lead/required), lai noķertu retus konfliktus, piem.
 * "likumīgs kauliņš noraidīts".
 *
 * Izvads iet UZREIZ uz divām vietām:
 *   • terminālis (`console.log`/`warn`) — dzīvai vērošanai;
 *   • **atsevišķs `.txt` fails KATRAI spēlei** mapē `logs/`:
 *     `mp-actions-<roomId>-<YYYY-MM-DD_HH-MM-SS>.txt`. roomId (= gameId) ir spēles
 *     unikālais identifikators; datums_laiks = spēles pirmās darbības laiks.
 *     Mapi pārraksta ar `MP_ACTION_LOG_DIR`.
 *
 * **Opt-in (F8):** pēc noklusējuma IZSLĒGTS (arī produkcijā). Sinhronais
 * `appendFileSync` ir spēles komandu ceļā, tāpēc ieslēgts-pēc-noklusējuma radītu
 * latenci reālā slodzē, un `playerId` nonāktu žurnālos bez nepieciešamības.
 * Ieslēdz atkļūdošanai ar `MP_ACTION_LOG=1` (vai `true`). Tad faili ir
 * `/opt/domino-poker/logs/` (servisa CWD), tos var izgūt ar SSH; konsoles izvads
 * nonāk arī `journalctl -u domino-poker`. Mapi pārraksta ar `MP_ACTION_LOG_DIR`.
 * Faila rakstīšanas kļūda NEKAD nesalauž spēli (best-effort, kā persistence).
 * Tikai MP — SP neiet caur `RoomEngine`.
 */
export function resolveMpActionLogEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.MP_ACTION_LOG;
  return flag === "1" || flag === "true"; // opt-in: izslēgts, ja vien nav skaidri ieslēgts
}

const ENABLED = resolveMpActionLogEnabled();
const LOG_DIR = resolve(process.env.MP_ACTION_LOG_DIR?.trim() || "logs");
let fileBroken = false;
/** roomId (spēle) → tās faila ceļš. Pirmā darbība istabā izveido failu + galveni. */
const roomFiles = new Map<string, string>();

export function mpActionLogEnabled(): boolean {
  return ENABLED;
}

/** Logo vienu dispatch rezultātu (no `RoomEngine.process`). No-op, ja izslēgts. */
export function logMpAction(
  nowMs: number,
  command: MultiplayerCommand,
  result: RoomDispatchResult,
  state: MultiplayerGameState | undefined
): void {
  if (!ENABLED) return;
  const head = `[mp ${formatTime(nowMs)}] room=${command.gameId} ${command.type} p=${playerOf(command)} req=${command.requestId}${payloadOf(command)}`;

  if (result.idempotentReplay) {
    // Atkārtots requestId — klients pārsūtīja to pašu komandu (retry/dublikāts).
    emit(command.gameId, nowMs, `${head} → IDEMPOTENT REPLAY (dublēts requestId)`, true);
    return;
  }
  if (result.accepted) {
    const events = result.events.map((entry) => entry.event.type).join(",") || "-";
    const seq = result.events[result.events.length - 1]?.seq ?? "-";
    emit(command.gameId, nowMs, `${head} → OK seq=${seq} ev=[${events}]`, false);
    return;
  }
  const errors = result.errors.map((error) => `${error.code}:${error.message}`).join(" | ") || "-";
  emit(command.gameId, nowMs, `${head} → REJECTED [${errors}]${rejectContext(command, state)}`, true);
}

/** Logo re-entrant (rindā ielikto) komandu — aizdomīga aizsardzības situācija. */
export function logMpQueued(nowMs: number, command: MultiplayerCommand): void {
  if (!ENABLED) return;
  emit(
    command.gameId,
    nowMs,
    `[mp ${formatTime(nowMs)}] room=${command.gameId} ${command.type} req=${command.requestId} → QUEUED (re-entrant dispatch; tiks apstrādāts pēc tekošā)`,
    true
  );
}

/** Izvada vienu rindu uz termināli (warn=stderr) un attiecīgās spēles failu. */
function emit(roomId: string, nowMs: number, line: string, warn: boolean): void {
  if (warn) console.warn(line);
  else console.log(line);
  writeToFile(roomId, nowMs, line);
}

/** Best-effort pieraksts spēles failā; pie pirmās kļūdas atslēdz failus (spēli nelauž). */
function writeToFile(roomId: string, nowMs: number, line: string): void {
  if (fileBroken) return;
  const path = fileForRoom(roomId, nowMs);
  if (!path) return;
  try {
    appendFileSync(path, `${line}\n`);
  } catch (error) {
    fileBroken = true;
    console.error("[mp] log faila rakstīšana neizdevās, atslēdzu failus:", error);
  }
}

/** Atgriež (vai izveido) šīs spēles log faila ceļu: `mp-actions-<roomId>-<stamp>.txt`. */
function fileForRoom(roomId: string, nowMs: number): string | undefined {
  const existing = roomFiles.get(roomId);
  if (existing) return existing;
  const path = resolve(LOG_DIR, `mp-actions-${sanitize(roomId)}-${fileStamp(nowMs)}.txt`);
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    // Lokāls laiks (saskan ar faila nosaukumu un rindām, neatkarīgi no servera TZ).
    const started = `${fileStamp(nowMs).slice(0, 10)} ${formatTime(nowMs).slice(0, 8)}`;
    appendFileSync(path, `=== MP spēle room=${roomId} sākta ${started} (pid ${process.pid}) ===\n`);
    roomFiles.set(roomId, path);
    return path;
  } catch (error) {
    fileBroken = true;
    console.error("[mp] neizdevās izveidot spēles log failu:", error);
    return undefined;
  }
}

function playerOf(command: MultiplayerCommand): string {
  return "playerId" in command && command.playerId ? command.playerId : "-";
}

function payloadOf(command: MultiplayerCommand): string {
  switch (command.type) {
    case "SUBMIT_MOVE":
      return ` turn=${command.turnId} tile=${command.tile.side1}|${command.tile.side2}${command.declaredNumber !== undefined ? ` declared=${command.declaredNumber}` : ""}`;
    case "SUBMIT_BID":
      return ` turn=${command.turnId} bid=${command.bid}`;
    case "TURN_TIMEOUT":
    case "START_TURN":
      return ` turn=${command.turnId}`;
    default:
      return "";
  }
}

/** Papildu konteksts noraidītam gājienam/solījumam — galvenā atkļūdošanas info. */
function rejectContext(command: MultiplayerCommand, state: MultiplayerGameState | undefined): string {
  if (command.type !== "SUBMIT_MOVE" && command.type !== "SUBMIT_BID") return "";
  if (!state) return " | state=none";
  const core = state.coreState;
  const turn = state.currentTurn;
  const turnInfo = !turn
    ? "turnId=NO-ACTIVE-TURN"
    : turn.turnId === command.turnId
      ? "turnId=match"
      : `turnId=STALE(cmd=${command.turnId} cur=${turn.turnId})`;
  const lead = core.leadTile ? `${core.leadTile.side1}|${core.leadTile.side2}` : "-";
  return ` | phase=${core.phase} cur=${core.currentPlayerIndex} ${turnInfo} lead=${lead} req#=${core.requiredNumber ?? "-"} trump=${core.isTrumpLead} ace=${core.isAceLead}`;
}

/** `HH:MM:SS.mmm` (lokāls laiks) — rindas iekšā. */
function formatTime(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number, width = 2): string => String(value).padStart(width, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/** `YYYY-MM-DD_HH-MM-SS` (lokāls laiks) — faila nosaukumā (failsistēmas-drošs). */
function fileStamp(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

/** Faila nosaukumam drošs roomId (UUID iziet cauri nemainīts). */
function sanitize(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, "_");
}
