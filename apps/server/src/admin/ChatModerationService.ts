import type { AdminAuditService } from "./AdminAuditService.js";
import type { AdminStore } from "./AdminStore.js";

/**
 * Čata moderācija (Fāze 3.2). Tur in-memory bloķēto vārdu sarakstu (hidratēts no DB startā),
 * lai `filter` neprasa DB lasījumu KATRAI čata ziņai (čats ir karsts ceļš). Admin add/remove
 * atjauno GAN DB, GAN in-memory + raksta audit. `LobbyChat.submit` izsauc `filter`.
 *
 * **Filtrs (minimāls — Codex):** whole-word, reģistr-nejutīga aizvietošana ar `****`. Robežas
 * izmanto unicode burtu/ciparu lookaround (`\p{L}\p{N}`), nevis ASCII `\b`, lai latviešu vārdi
 * (ā/č/ē/…) tiek korekti tverti. Vārdi glabājas normalizēti (lowercase).
 */
export class ChatModerationService {
  private readonly store: AdminStore;
  private readonly audit: AdminAuditService;
  private readonly clock: () => number;
  private words: string[] = [];
  private patterns: RegExp[] = [];

  constructor(store: AdminStore, audit: AdminAuditService, clock: () => number) {
    this.store = store;
    this.audit = audit;
    this.clock = clock;
  }

  /** Ielādē sarakstu no DB (izsaukt VIENREIZ startā, pirms apkalpošanas). */
  async hydrate(): Promise<void> {
    this.setWords(await this.store.listBlockedWords());
  }

  /**
   * Aizvieto bloķētos vārdus ar `****`. Tukšs saraksts → teksts nemainās (ātrais ceļš).
   * Teksts tiek normalizēts uz NFC PIRMS salīdzināšanas, lai NFC-formā bloķēts vārds tiktu
   * tverts arī tad, ja lietotājs ievada vizuāli identisku decomposed (NFD) formu (Codex).
   * Vārdi glabājas NFC (`normalize`), tāpēc abas puses ir vienā normālformā.
   */
  filter(text: string): string {
    if (this.patterns.length === 0) {
      return text;
    }
    let out = text.normalize("NFC");
    for (const pattern of this.patterns) {
      out = out.replace(pattern, "****");
    }
    return out;
  }

  /** Bloķēto vārdu saraksts (normalizēti). */
  list(): readonly string[] {
    return this.words;
  }

  /** Pievieno vārdu (idempotents) → DB + memory + audit. Atgriež normalizēto vārdu. */
  async add(word: string, ctx: { readonly ip?: string | undefined }): Promise<string> {
    const norm = normalize(word);
    await this.store.addBlockedWord(norm, this.clock());
    this.setWords(await this.store.listBlockedWords());
    await this.audit.record({
      action: "chat.blocked_word.add",
      targetType: "chat",
      summary: `Blocked chat word "${norm}"`,
      diff: { word: norm },
      ip: ctx.ip
    });
    return norm;
  }

  /** Noņem vārdu → DB + memory + audit. */
  async remove(word: string, ctx: { readonly ip?: string | undefined }): Promise<void> {
    const norm = normalize(word);
    await this.store.removeBlockedWord(norm);
    this.setWords(await this.store.listBlockedWords());
    await this.audit.record({
      action: "chat.blocked_word.remove",
      targetType: "chat",
      summary: `Unblocked chat word "${norm}"`,
      diff: { word: norm },
      ip: ctx.ip
    });
  }

  /** Pārbūvē in-memory sarakstu + prekompilē regex šablonus. */
  private setWords(words: readonly string[]): void {
    this.words = [...words];
    this.patterns = this.words.map(
      (w) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(w)}(?![\\p{L}\\p{N}])`, "giu")
    );
  }
}

/**
 * Normalizē vārdu glabāšanai + salīdzināšanai (trim + lowercase + NFC). NFC mazina dažus
 * unicode normalizācijas apiešanas trikus. ZINĀMI apiešanas veidi (PIEŅEMTI minimālajam pirmajam
 * solim — Codex): nulles-platuma rakstzīmes, homoglifi, ievietota pieturzīme/atstarpe, leetspeak,
 * vārdu locījumi. Pilnvērtīga moderācija ir atsevišķs vēlāks darbs.
 */
function normalize(word: string): string {
  return word.trim().toLowerCase().normalize("NFC");
}

/** Aizsargā regex metarakstzīmes lietotāja vārdā. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
