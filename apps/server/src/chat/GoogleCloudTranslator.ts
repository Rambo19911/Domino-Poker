import { TranslationServiceClient } from "@google-cloud/translate";

import type { TextTranslator, TranslateTextInput, TranslateTextOutput } from "./ChatTranslationService.js";

export interface GoogleCloudTranslatorOptions {
  readonly projectId: string;
  readonly location: string;
  readonly credentialsFile?: string | undefined;
}

export class GoogleCloudTranslator implements TextTranslator {
  private readonly client: TranslationServiceClient;
  private readonly parent: string;

  constructor(options: GoogleCloudTranslatorOptions) {
    this.client = new TranslationServiceClient(
      options.credentialsFile === undefined ? undefined : { keyFilename: options.credentialsFile }
    );
    this.parent = `projects/${options.projectId}/locations/${options.location}`;
  }

  async translateText(input: TranslateTextInput): Promise<TranslateTextOutput> {
    const [response] = await this.client.translateText({
      parent: this.parent,
      contents: [input.text],
      mimeType: "text/plain",
      targetLanguageCode: input.targetLanguage
    });
    const translation = response.translations?.[0];
    return {
      translatedText: translation?.translatedText ?? "",
      ...(translation?.detectedLanguageCode
        ? { detectedSourceLanguage: translation.detectedLanguageCode }
        : {})
    };
  }
}
