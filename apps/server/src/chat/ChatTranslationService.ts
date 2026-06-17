export interface TranslateTextInput {
  readonly text: string;
  readonly targetLanguage: string;
}

export interface TranslateTextOutput {
  readonly translatedText: string;
  readonly detectedSourceLanguage?: string;
}

export interface TextTranslator {
  translateText(input: TranslateTextInput): Promise<TranslateTextOutput>;
}

export type ChatTranslationResult =
  | { readonly ok: true; readonly translation: TranslateTextOutput }
  | { readonly ok: false; readonly error: "quota_exceeded" };

interface UsageWindow {
  used: number;
  resetKey: string;
}

export interface ChatTranslationServiceOptions {
  readonly translator: TextTranslator;
  readonly clock: () => number;
  readonly dailyCharLimit: number;
  readonly monthlyCharLimit: number;
  readonly cacheMaxEntries: number;
}

export class ChatTranslationService {
  private readonly translator: TextTranslator;
  private readonly clock: () => number;
  private readonly dailyCharLimit: number;
  private readonly monthlyCharLimit: number;
  private readonly cacheMaxEntries: number;
  private readonly cache = new Map<string, TranslateTextOutput>();
  private daily: UsageWindow;
  private monthly: UsageWindow;

  constructor(options: ChatTranslationServiceOptions) {
    this.translator = options.translator;
    this.clock = options.clock;
    this.dailyCharLimit = options.dailyCharLimit;
    this.monthlyCharLimit = options.monthlyCharLimit;
    this.cacheMaxEntries = options.cacheMaxEntries;
    this.daily = { used: 0, resetKey: dayKey(options.clock()) };
    this.monthly = { used: 0, resetKey: monthKey(options.clock()) };
  }

  async translate(input: TranslateTextInput): Promise<ChatTranslationResult> {
    const cacheKey = `${input.targetLanguage}\n${input.text}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return { ok: true, translation: cached };
    }

    const charCount = Array.from(input.text).length;
    this.refreshWindows();
    if (!this.canSpend(charCount)) {
      return { ok: false, error: "quota_exceeded" };
    }

    const translation = await this.translator.translateText(input);
    this.daily.used += charCount;
    this.monthly.used += charCount;
    this.cache.set(cacheKey, translation);
    this.trimCache();
    return { ok: true, translation };
  }

  private refreshWindows(): void {
    const now = this.clock();
    const nextDay = dayKey(now);
    if (this.daily.resetKey !== nextDay) {
      this.daily = { used: 0, resetKey: nextDay };
    }
    const nextMonth = monthKey(now);
    if (this.monthly.resetKey !== nextMonth) {
      this.monthly = { used: 0, resetKey: nextMonth };
    }
  }

  private canSpend(charCount: number): boolean {
    return (
      this.daily.used + charCount <= this.dailyCharLimit &&
      this.monthly.used + charCount <= this.monthlyCharLimit
    );
  }

  private trimCache(): void {
    while (this.cache.size > this.cacheMaxEntries) {
      const firstKey = this.cache.keys().next().value as string | undefined;
      if (firstKey === undefined) return;
      this.cache.delete(firstKey);
    }
  }
}

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function monthKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}
