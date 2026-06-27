import type { ChatMessage } from "@domino-poker/shared";

import type { Clock } from "../timers/TurnTimerScheduler.js";

export type ChatRejectCode = "INVALID_MESSAGE" | "RATE_LIMITED";

export type ChatSubmitResult =
  | { readonly ok: true; readonly message: ChatMessage }
  | { readonly ok: false; readonly code: ChatRejectCode; readonly reason: string };

export interface LobbyChatOptions {
  readonly clock: Clock;
  /** Cik pēdējās ziņas paturēt vēsturē (noklusējums 50; DB nāk Fāzē 10). */
  readonly historyLimit?: number;
  /** Maksimālais ziņas garums zīmēs (noklusējums 200). */
  readonly maxLength?: number;
  /**
   * Token-bucket: cik ziņas drīkst nosūtīt PĒC KĀRTAS (uzliesmojums) pirms
   * ierobežošanas (noklusējums 5). Spainis atjaunojas ar `refillMs` ātrumu.
   */
  readonly burstCapacity?: number;
  /**
   * Token-bucket atjaunošanās: cik ms jāpaiet, lai uzkrātu vienu jaunu ziņas
   * "atļauju" (noklusējums 2000 ms = ~1 ziņa ik 2 s ilgstošā plūsmā).
   */
  readonly refillMs?: number;
  readonly createMessageId?: () => string;
  /**
   * Novērotājs (Fāze 10.3): izsaukts pēc katras PIEŅEMTAS ziņas (persistencei).
   * Blakusefekts — kļūdas tiek apslāpētas, lai glabāšana nesalauztu čatu.
   */
  readonly onMessage?: (message: ChatMessage) => void;
  /**
   * Čata moderācija (Fāze 3.2): aizvieto bloķētos vārdus pirms ziņas glabāšanas/izsūtīšanas.
   * Injicē `ChatModerationService.filter`. `undefined` = bez filtra. Admin paziņojumi (`announce`)
   * NETIEK filtrēti.
   */
  readonly filterText?: (text: string) => string;
}

const DEFAULT_HISTORY_LIMIT = 50;
const DEFAULT_MAX_LENGTH = 200;
const DEFAULT_BURST_CAPACITY = 5;
const DEFAULT_REFILL_MS = 2000;

/** Token-bucket stāvoklis vienam spēlētājam (atļauju skaits + pēdējais aprēķins). */
interface TokenBucket {
  tokens: number;
  updatedAt: number;
}

/**
 * In-memory lobby čats (Fāze 6.6). Apzināti **nesatur** spēles state vai
 * kauliņus — tikai `{id, authorDisplayId, text, serverNow}`. Autors ir servera
 * `displayId` (klients to nevar viltot). Validē tukšumu/garumu, piespiež
 * token-bucket rate limitu uz spēlētāju un glabā tekstu neapstrādātu (XSS drošību
 * nodrošina klients, renderējot kā React tekstu).
 *
 * **Mērogs (Fāze 10.3):** token-bucket atļauj cilvēcisku uzliesmojumu (līdz
 * `burstCapacity` ziņām pēc kārtas), tad ierobežo līdz ~1 ziņai ik `refillMs` —
 * tas pasargā no ilgstoša spama, neapgrūtinot normālu saraksti. Per-spēlētāja
 * stāvoklis tiek iztīrīts pie pilnas atvienošanās (`forget`), lai atmiņa
 * neaugtu bezgalīgi pie liela lietotāju skaita.
 *
 * Glabāšana ir gaistoša (ring-buferis); pastāvīgā DB vēsture nāk caur `onMessage`
 * + startup hidratāciju (Fāze 10.3).
 */
export class LobbyChat {
  private readonly clock: Clock;
  private readonly historyLimit: number;
  private readonly maxLength: number;
  private readonly burstCapacity: number;
  private readonly refillMs: number;
  private readonly createMessageId: () => string;
  private readonly onMessage: ((message: ChatMessage) => void) | undefined;
  private readonly filterText: ((text: string) => string) | undefined;
  private readonly buffer: ChatMessage[] = [];
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(options: LobbyChatOptions) {
    this.clock = options.clock;
    this.historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
    this.maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
    this.burstCapacity = Math.max(1, options.burstCapacity ?? DEFAULT_BURST_CAPACITY);
    this.refillMs = Math.max(1, options.refillMs ?? DEFAULT_REFILL_MS);
    this.createMessageId = options.createMessageId ?? defaultMessageId;
    this.onMessage = options.onMessage;
    this.filterText = options.filterText;
  }

  /**
   * Piepilda buferi ar vēsturiskām ziņām no DB (Fāze 10.3) — izsaucams VIENREIZ
   * startā pirms apkalpošanas, lai `history()` (un līdz ar to `CHAT_HISTORY` jaunam
   * dalībniekam) iekļautu pirms-restarta ziņas. Sagaida hronoloģisku secību
   * (vecākās pirmās); patur tikai pēdējās `historyLimit`.
   */
  hydrate(messages: readonly ChatMessage[]): void {
    this.buffer.push(...messages);
    if (this.buffer.length > this.historyLimit) {
      this.buffer.splice(0, this.buffer.length - this.historyLimit);
    }
  }

  /**
   * Mēģina pieņemt ziņu no spēlētāja. `authorPlayerId` ir rate-limita atslēga
   * (privāta); `authorDisplayId` ir publiskais autors izsūtāmajā ziņā.
   *
   * Teksts tiek glabāts **neapstrādāts** (tikai trim/garums/rate) — XSS drošību
   * nodrošina klients, renderējot to kā React tekstu (nekad `innerHTML`). Servera
   * HTML-escaping radītu dubultu escaping (lietotājs redzētu `&lt;`).
   */
  submit(authorPlayerId: string, authorDisplayId: string, rawText: string): ChatSubmitResult {
    const text = rawText.trim();
    if (text === "") {
      return { ok: false, code: "INVALID_MESSAGE", reason: "Chat message must not be empty." };
    }
    if (text.length > this.maxLength) {
      return {
        ok: false,
        code: "INVALID_MESSAGE",
        reason: `Chat message exceeds ${this.maxLength} characters.`
      };
    }

    const now = this.clock();
    if (!this.consumeToken(authorPlayerId, now)) {
      return { ok: false, code: "RATE_LIMITED", reason: "You are sending messages too quickly." };
    }

    const message: ChatMessage = {
      id: this.createMessageId(),
      authorDisplayId,
      // Fāze 3.2: bloķēto vārdu filtrs (pēc validācijas/rate, pirms glabāšanas/izsūtīšanas).
      text: this.filterText ? this.filterText(text) : text,
      serverNow: now
    };
    this.buffer.push(message);
    if (this.buffer.length > this.historyLimit) {
      this.buffer.splice(0, this.buffer.length - this.historyLimit);
    }
    // Persistence (10.3): pieņemtā ziņa → DB (fire-and-forget augstāk). Kļūdas
    // apslāpējam, lai glabāšanas problēma nesalauztu čata izsūtīšanu.
    if (this.onMessage) {
      try {
        this.onMessage(message);
      } catch {
        // best-effort
      }
    }
    return { ok: true, message };
  }

  /**
   * Admin paziņojums (Fāze 3.2): pievieno čata vēsturei "Admin"-autora ziņu (bez rate-limita,
   * bez vārdu filtra) un atgriež to izsūtīšanai. Teksta trim + garuma robeža kā parastai ziņai.
   */
  announce(rawText: string): ChatMessage | undefined {
    const text = rawText.trim();
    if (text === "" || text.length > this.maxLength) {
      return undefined;
    }
    const message: ChatMessage = {
      id: this.createMessageId(),
      // "Admin" autors ir REZERVĒTS lietotājvārds (sk. `auth/authFields.ts`
      // `RESERVED_USERNAMES`), lai neviens spēlētājs nevarētu uzdoties par adminu.
      authorDisplayId: "Admin",
      text,
      serverNow: this.clock()
    };
    this.buffer.push(message);
    if (this.buffer.length > this.historyLimit) {
      this.buffer.splice(0, this.buffer.length - this.historyLimit);
    }
    if (this.onMessage) {
      try {
        this.onMessage(message);
      } catch {
        // best-effort
      }
    }
    return message;
  }

  /** Pēdējās (līdz `historyLimit`) ziņas — kopija, lai ārējie to nemainītu. */
  history(): readonly ChatMessage[] {
    return [...this.buffer];
  }

  /**
   * Aizmirst spēlētāja rate-limit stāvokli (izsaucams, kad spēlētājs PILNĪBĀ
   * atvienojas). Tā per-spēlētāja atmiņa neaug bezgalīgi pie liela lietotāju
   * skaita; atgriežoties spēlētājs sāk ar pilnu uzliesmojuma budžetu.
   */
  forget(authorPlayerId: string): void {
    this.buckets.delete(authorPlayerId);
  }

  /**
   * Token-bucket: atjauno spēlētāja atļaujas pēc pagājušā laika (līdz
   * `burstCapacity`), tad mēģina patērēt vienu. Atgriež `true`, ja ziņa atļauta.
   * Stāvoklis tiek atjaunināts arī pie noraidījuma (uzkrāšanās turpinās).
   */
  private consumeToken(authorPlayerId: string, now: number): boolean {
    const bucket = this.buckets.get(authorPlayerId);
    if (!bucket) {
      // Pirmā ziņa: pilns spainis mīnus šī.
      this.buckets.set(authorPlayerId, { tokens: this.burstCapacity - 1, updatedAt: now });
      return true;
    }

    const elapsed = Math.max(0, now - bucket.updatedAt);
    const replenished = Math.min(this.burstCapacity, bucket.tokens + elapsed / this.refillMs);
    bucket.updatedAt = now;
    if (replenished < 1) {
      bucket.tokens = replenished; // saglabājam daļēju uzkrājumu
      return false;
    }
    bucket.tokens = replenished - 1;
    return true;
  }
}

function defaultMessageId(): string {
  return globalThis.crypto.randomUUID();
}
