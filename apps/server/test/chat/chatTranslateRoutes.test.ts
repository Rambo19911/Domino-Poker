import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { ChatTranslationService, type TextTranslator } from "../../src/chat/ChatTranslationService.js";
import { createChatTranslateHandler } from "../../src/chat/chatTranslateRoutes.js";
import { createHealthHttpServer } from "../../src/httpServer.js";

const servers: ReturnType<typeof createHealthHttpServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        })
    )
  );
});

describe("chat translate route", () => {
  it("translates valid chat text to the requested target language", async () => {
    const translator: TextTranslator = {
      translateText: async ({ text, targetLanguage }) => ({
        translatedText: `${text} -> ${targetLanguage}`,
        detectedSourceLanguage: "en"
      })
    };
    const server = createHealthHttpServer({
      chatTranslateHandler: createChatTranslateHandler({
        translation: new ChatTranslationService({
          translator,
          clock: () => Date.UTC(2026, 0, 1),
          dailyCharLimit: 100,
          monthlyCharLimit: 100,
          cacheMaxEntries: 10
        }),
        webOrigins: ["http://localhost:3000"],
        dev: true,
        trustProxy: false,
        clock: () => Date.UTC(2026, 0, 1),
        rateLimitPerMinute: 10
      })
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${address.port}/chat/translate`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ text: "hello", targetLanguage: "lv" })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    await expect(response.json()).resolves.toEqual({
      translatedText: "hello -> lv",
      targetLanguage: "lv",
      detectedSourceLanguage: "en"
    });
  });

  it("rejects unsupported language tags before calling the provider", async () => {
    const server = createHealthHttpServer({
      chatTranslateHandler: createChatTranslateHandler({
        translation: new ChatTranslationService({
          translator: { translateText: async () => ({ translatedText: "bad" }) },
          clock: () => Date.UTC(2026, 0, 1),
          dailyCharLimit: 100,
          monthlyCharLimit: 100,
          cacheMaxEntries: 10
        }),
        webOrigins: [],
        dev: true,
        trustProxy: false,
        clock: () => Date.UTC(2026, 0, 1),
        rateLimitPerMinute: 10
      })
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${address.port}/chat/translate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello", targetLanguage: "../lv" })
    });

    expect(response.status).toBe(400);
  });
});
