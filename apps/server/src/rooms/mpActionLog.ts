import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

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
 *   • `.txt` fails (`logs/mp-actions.txt`) — pilnam ierakstam (terminālim ir
 *     ritināšanas limits). Pārraksta ceļu ar `MP_ACTION_LOG_FILE`.
 *
 * Pēc noklusējuma: IESLĒGTS visur (arī produkcijā — lai noķertu retas kļūdas uz
 * VPS), IZSLĒGTS testos (`VITEST`). Manuāli atslēdz ar `MP_ACTION_LOG=0`.
 * Produkcijā fails ir `/opt/domino-poker/logs/mp-actions.txt` (servisa CWD), to var
 * izgūt ar SSH; konsoles izvads nonāk arī `journalctl -u domino-poker`.
 * Faila rakstīšanas kļūda NEKAD nesalauž spēli (best-effort, kā persistence).
 * Tikai MP — SP neiet caur `RoomEngine`.
 */
function resolveEnabled(): boolean {
  const flag = process.env.MP_ACTION_LOG;
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;
  return !process.env.VITEST; // noklusējums: ieslēgts visur, izņemot testus
}

const ENABLED = resolveEnabled();
const FILE_PATH = ENABLED ? openLogFile() : undefined;
let fileBroken = false;

/** Sagatavo log failu (izveido mapi + pieraksta sesijas galveni). */
function openLogFile(): string | undefined {
  const custom = process.env.MP_ACTION_LOG_FILE?.trim();
  const path = resolve(custom && custom.length > 0 ? custom : "logs/mp-actions.txt");
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `\n=== MP log sesija sākta ${new Date().toISOString()} (pid ${process.pid}) ===\n`);
    return path;
  } catch (error) {
    console.error("[mp] neizdevās atvērt log failu:", error);
    return undefined;
  }
}

/** Best-effort pieraksts failā; pie pirmās kļūdas atslēdz failu (spēli nelauž). */
function writeToFile(line: string): void {
  if (!FILE_PATH || fileBroken) return;
  try {
    appendFileSync(FILE_PATH, `${line}\n`);
  } catch (error) {
    fileBroken = true;
    console.error("[mp] log faila rakstīšana neizdevās, atslēdzu failu:", error);
  }
}

/** Izvada vienu rindu uz termināli (warn=stderr) un failu. */
function emit(line: string, warn: boolean): void {
  if (warn) console.warn(line);
  else console.log(line);
  writeToFile(line);
}

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
    emit(`${head} → IDEMPOTENT REPLAY (dublēts requestId)`, true);
    return;
  }
  if (result.accepted) {
    const events = result.events.map((entry) => entry.event.type).join(",") || "-";
    const seq = result.events[result.events.length - 1]?.seq ?? "-";
    emit(`${head} → OK seq=${seq} ev=[${events}]`, false);
    return;
  }
  const errors = result.errors.map((error) => `${error.code}:${error.message}`).join(" | ") || "-";
  emit(`${head} → REJECTED [${errors}]${rejectContext(command, state)}`, true);
}

/** Logo re-entrant (rindā ielikto) komandu — aizdomīga aizsardzības situācija. */
export function logMpQueued(nowMs: number, command: MultiplayerCommand): void {
  if (!ENABLED) return;
  emit(
    `[mp ${formatTime(nowMs)}] room=${command.gameId} ${command.type} req=${command.requestId} → QUEUED (re-entrant dispatch; tiks apstrādāts pēc tekošā)`,
    true
  );
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

function formatTime(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number, width = 2): string => String(value).padStart(width, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}
