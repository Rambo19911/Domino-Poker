import { serverHttpBase } from "./serverHttpBase";

export type ChatTranslationResult =
  | {
      readonly ok: true;
      readonly translatedText: string;
      readonly detectedSourceLanguage: string | null;
      readonly targetLanguage: string;
    }
  | { readonly ok: false; readonly status: number; readonly error: string };

export async function translateChatMessage(
  text: string,
  targetLanguage: string
): Promise<ChatTranslationResult> {
  let response: Response;
  try {
    response = await fetch(`${serverHttpBase()}/chat/translate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, targetLanguage })
    });
  } catch {
    return { ok: false, status: 0, error: "network_error" };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const error =
      typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : "request_failed";
    return { ok: false, status: response.status, error };
  }

  const data = body as {
    readonly translatedText?: unknown;
    readonly detectedSourceLanguage?: unknown;
    readonly targetLanguage?: unknown;
  };
  return {
    ok: true,
    translatedText: typeof data.translatedText === "string" ? data.translatedText : "",
    detectedSourceLanguage:
      typeof data.detectedSourceLanguage === "string" ? data.detectedSourceLanguage : null,
    targetLanguage: typeof data.targetLanguage === "string" ? data.targetLanguage : targetLanguage
  };
}
