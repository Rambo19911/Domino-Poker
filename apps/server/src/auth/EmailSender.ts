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
  /**
   * Nosūta kontaktformas ziņu uz īpašnieka adresi (`to`). `replyTo` ir ziņas autora
   * e-pasts, lai uz to var tieši atbildēt. Met kļūdu, ja piegāde neizdevās.
   */
  sendContactMessage(
    to: string,
    replyTo: string,
    message: string,
    locale: EmailLocale
  ): Promise<void>;
  /**
   * Nosūta admin paneļa 2FA pieslēgšanās kodu (OTP) uz admin e-pastu. Tikai angļu valodā
   * (admin panelis ir tikai ENG). Met kļūdu, ja piegāde neizdevās (NEKAD klusi — bez
   * koda admin nevar pieslēgties, tāpēc kļūme jāatklāj).
   */
  sendAdminLoginCode(to: string, code: string): Promise<void>;
  /**
   * Nosūta bana paziņojumu spēlētājam ar iemeslu + ilgumu (Fāze 3.1, D1). Divvalodu
   * (`locale`). Best-effort: izsaucējs ķer kļūdu (bana izpilde nedrīkst atkarīga no e-pasta).
   */
  sendBanNotice(to: string, reason: string, durationLabel: string, locale: EmailLocale): Promise<void>;
}

/** Admin 2FA OTP e-pasta saturs (tikai angļu — admin panelis ir ENG-only). */
const ADMIN_CODE_EMAIL = {
  subject: "Domino Poker Admin — login code",
  body: (code: string) =>
    `Your Domino Poker admin login code is:\n\n${code}\n\n` +
    `It is valid for 10 minutes and can be used once. ` +
    `If you did not try to sign in, ignore this email and rotate the admin password.`
};

/** Bana paziņojuma e-pasta saturs (subject + plain-text body) abās valodās. */
const BAN_EMAIL: Record<
  EmailLocale,
  { readonly subject: string; readonly body: (reason: string, durationLabel: string) => string }
> = {
  lv: {
    subject: "Domino Poker — konta bloķēšana",
    body: (reason, durationLabel) =>
      `Sveiki!\n\nTavs Domino Poker konts ir bloķēts.\n\nIlgums: ${durationLabel}\nIemesls: ${reason}\n\n` +
      `Bloķēšanas laikā tu nevarēsi pieslēgties ar šo kontu. Ja uzskati, ka tā ir kļūda, atbildi uz šo e-pastu.`
  },
  en: {
    subject: "Domino Poker — account ban",
    body: (reason, durationLabel) =>
      `Hello!\n\nYour Domino Poker account has been banned.\n\nDuration: ${durationLabel}\nReason: ${reason}\n\n` +
      `While banned you cannot sign in with this account. If you believe this is a mistake, reply to this email.`
  }
};

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

/** Kontaktformas e-pasta saturs (subject + plain-text body) abās valodās. */
const CONTACT_EMAIL: Record<
  EmailLocale,
  { readonly subject: string; readonly body: (replyTo: string, message: string) => string }
> = {
  lv: {
    subject: "Domino Poker — jauna kontaktziņa",
    body: (replyTo, message) =>
      `Jauna ziņa no Domino Poker kontaktformas.\n\nNo: ${replyTo}\n\nZiņojums:\n${message}\n`
  },
  en: {
    subject: "Domino Poker — new contact message",
    body: (replyTo, message) =>
      `New message from the Domino Poker contact form.\n\nFrom: ${replyTo}\n\nMessage:\n${message}\n`
  }
};

/** Dev/test senderis: logo reset linku konsolē (nesūta reālu e-pastu). */
export class ConsoleEmailSender implements EmailSender {
  async sendPasswordReset(to: string, resetUrl: string, locale: EmailLocale): Promise<void> {
    // Tikai dev: drošs izvads atkļūdošanai. Prod NEKAD nelieto šo senderi.
    console.log(`[email:dev] password reset (${locale}) for ${to}: ${resetUrl}`);
  }

  async sendContactMessage(
    to: string,
    replyTo: string,
    message: string,
    locale: EmailLocale
  ): Promise<void> {
    console.log(`[email:dev] contact (${locale}) to ${to}, reply-to ${replyTo}: ${message}`);
  }

  async sendAdminLoginCode(to: string, code: string): Promise<void> {
    // Tikai dev: kods konsolē, lai var pieslēgties bez reāla e-pasta. Prod NEKAD šo senderi.
    console.log(`[email:dev] admin login code for ${to}: ${code}`);
  }

  async sendBanNotice(
    to: string,
    reason: string,
    durationLabel: string,
    locale: EmailLocale
  ): Promise<void> {
    console.log(`[email:dev] ban notice (${locale}) for ${to}: ${durationLabel} — ${reason}`);
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

  async sendContactMessage(
    to: string,
    replyTo: string,
    message: string,
    locale: EmailLocale
  ): Promise<void> {
    const content = CONTACT_EMAIL[locale];
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: this.from,
        to,
        // `reply_to` = ziņas autors → atbilde no pastkastes aiziet tieši viņam.
        reply_to: replyTo,
        subject: content.subject,
        text: content.body(replyTo, message)
      })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Resend API error ${response.status}: ${detail.slice(0, 200)}`);
    }
  }

  async sendAdminLoginCode(to: string, code: string): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: this.from,
        to,
        subject: ADMIN_CODE_EMAIL.subject,
        text: ADMIN_CODE_EMAIL.body(code)
      })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Resend API error ${response.status}: ${detail.slice(0, 200)}`);
    }
  }

  async sendBanNotice(
    to: string,
    reason: string,
    durationLabel: string,
    locale: EmailLocale
  ): Promise<void> {
    const content = BAN_EMAIL[locale];
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
        text: content.body(reason, durationLabel)
      })
    });
    if (!response.ok) {
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
