import { describe, expect, it, vi } from "vitest";

import { ChatTranslationService, type TextTranslator } from "../../src/chat/ChatTranslationService.js";

const baseTime = Date.UTC(2026, 0, 1, 12, 0, 0);

describe("ChatTranslationService", () => {
  it("caches repeated translations by text and target language", async () => {
    const translator: TextTranslator = {
      translateText: vi.fn(async ({ text, targetLanguage }) => ({
        translatedText: `${text}:${targetLanguage}`,
        detectedSourceLanguage: "en"
      }))
    };
    const service = new ChatTranslationService({
      translator,
      clock: () => baseTime,
      dailyCharLimit: 100,
      monthlyCharLimit: 100,
      cacheMaxEntries: 10
    });

    await expect(service.translate({ text: "hello", targetLanguage: "lv" })).resolves.toEqual({
      ok: true,
      translation: { translatedText: "hello:lv", detectedSourceLanguage: "en" }
    });
    await service.translate({ text: "hello", targetLanguage: "lv" });

    expect(translator.translateText).toHaveBeenCalledTimes(1);
  });

  it("rejects requests beyond the configured daily character limit", async () => {
    const translator: TextTranslator = {
      translateText: vi.fn(async ({ text }) => ({ translatedText: text }))
    };
    const service = new ChatTranslationService({
      translator,
      clock: () => baseTime,
      dailyCharLimit: 4,
      monthlyCharLimit: 100,
      cacheMaxEntries: 10
    });

    await expect(service.translate({ text: "abcd", targetLanguage: "lv" })).resolves.toMatchObject({
      ok: true
    });
    await expect(service.translate({ text: "ef", targetLanguage: "lv" })).resolves.toEqual({
      ok: false,
      error: "quota_exceeded"
    });
  });
});
