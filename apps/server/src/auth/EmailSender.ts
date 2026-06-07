/**
 * E-pasta sūtīšanas abstrakcija (Fāze 5 — paroles atjaunošana). Robeža starp
 * AuthService loģiku un konkrēto piegādes mehānismu, lai:
 *   • dev/testos var sūtīt uz konsoli (bez SMTP credentials);
 *   • prod izmanto Resend HTTP API (bez smagas atkarības — tikai `fetch`);
 *   • ja prod nav credentials → senderis ir `undefined` un funkcija ATSPĒJOTA
 *     (NEKAD klusi neizliekas, ka e-pasts nosūtīts — Codex drošības piezīme).
 *
 * E-pasta saturs ir DIVĀS valodās (spēle ir bilingvāla; klients padod `locale`).
 */

export type EmailLocale = "lv" | "en";

export interface EmailSender {
  /** Nosūta paroles atjaunošanas e-pastu ar `resetUrl`. Met kļūdu, ja piegāde neizdevās. */
  sendPasswordReset(to: string, resetUrl: string, locale: EmailLocale): Promise<void>;
}

/** Paroles atjaunošanas e-pasta saturs (subject + plain-text body) abās valodās. */
const RESET_EMAIL: Record<EmailLocale, { readonly subject: string; readonly body: (url: string) => string }> = {
  lv: {
    subject: "Domino Poker — paroles atjaunošana",
    body: (url) =>
      `Sveiki!\n\nMēs saņēmām pieprasījumu atjaunot tavu Domino Poker paroli. ` +
      `Lai izvēlētos jaunu paroli, atver šo saiti:\n\n${url}\n\n` +
      `Saite ir derīga 1 stundu un izmantojama vienu reizi. ` +
      `Ja tu šo pieprasījumu neveici, vienkārši ignorē šo e-pastu — tava parole netiks mainīta.`
  },
  en: {
    subject: "Domino Poker — password reset",
    body: (url) =>
      `Hello!\n\nWe received a request to reset your Domino Poker password. ` +
      `To choose a new password, open this link:\n\n${url}\n\n` +
      `The link is valid for 1 hour and can be used once. ` +
      `If you did not request this, simply ignore this email — your password will not change.`
  }
};

/** Dev/test senderis: logo reset linku konsolē (nesūta reālu e-pastu). */
export class ConsoleEmailSender implements EmailSender {
  async sendPasswordReset(to: string, resetUrl: string, locale: EmailLocale): Promise<void> {
    // Tikai dev: drošs izvads atkļūdošanai. Prod NEKAD nelieto šo senderi.
    console.log(`[email:dev] password reset (${locale}) for ${to}: ${resetUrl}`);
  }
}

/**
 * Prod senderis caur Resend HTTP API (https://resend.com). Bez SDK atkarības —
 * tikai `fetch`. `from` jābūt verificētā domēnā (piem. `no-reply@domino-poker.com`).
 */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async sendPasswordReset(to: string, resetUrl: string, locale: EmailLocale): Promise<void> {
    const content = RESET_EMAIL[locale];
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: this.from,
        to,
        subject: content.subject,
        text: content.body(resetUrl)
      })
    });
    if (!response.ok) {
      // Detaļas (NE raw tokenu) logošanai; kļūda paceļas uz AuthService (best-effort).
      const detail = await response.text().catch(() => "");
      throw new Error(`Resend API error ${response.status}: ${detail.slice(0, 200)}`);
    }
  }
}

export interface EmailSenderConfig {
  readonly resendApiKey: string | undefined;
  readonly emailFrom: string | undefined;
  readonly nodeEnv: string;
}

/**
 * Izvēlas e-pasta senderi pēc konfigurācijas:
 *   • ir Resend API key + from → `ResendEmailSender` (prod);
 *   • dev (NODE_ENV != production) bez key → `ConsoleEmailSender`;
 *   • prod bez key → `undefined` (funkcija atspējota; sk. moduļa komentāru).
 */
export function createEmailSender(config: EmailSenderConfig): EmailSender | undefined {
  if (config.resendApiKey && config.emailFrom) {
    return new ResendEmailSender(config.resendApiKey, config.emailFrom);
  }
  if (config.nodeEnv !== "production") {
    return new ConsoleEmailSender();
  }
  return undefined;
}
