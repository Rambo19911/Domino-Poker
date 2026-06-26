"use client";

import { useState } from "react";

import { apiContact } from "../lib/contact/contactApi";
import { emailLocale, type AppStrings, type Locale } from "../lib/i18n";

/** Klienta validācija (atspoguļo serveri): e-pasta formāts + ziņas garums 10..2000. */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 2000;

type ContactStatus = "idle" | "sending" | "sent" | "error";

/**
 * Kontaktforma (About panelī): e-pasts + ziņojums → `POST /contact`. Anonīms drīkst;
 * serveris ir autoritāte (validē + rate-limito + sūta). Šeit tikai forma + statuss
 * abās spēles valodās. Pēc veiksmes lauki tiek notīrīti un parādās paldies-ziņa.
 */
export function ContactForm({
  labels: t,
  locale
}: {
  readonly labels: AppStrings;
  readonly locale: Locale;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<ContactStatus>("idle");
  // Kļūdas teksts no pēdējā mēģinājuma (validācija/rate-limit/piegāde); tukšs = nav.
  const [errorText, setErrorText] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status === "sending") return;

    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();
    if (!EMAIL_RE.test(trimmedEmail) || trimmedMessage.length < MESSAGE_MIN) {
      setStatus("error");
      setErrorText(t.contactValidation);
      return;
    }

    setStatus("sending");
    setErrorText("");
    const result = await apiContact(trimmedEmail, trimmedMessage, emailLocale(locale));
    if (result.ok) {
      setStatus("sent");
      setEmail("");
      setMessage("");
      return;
    }
    setStatus("error");
    setErrorText(result.status === 429 ? t.contactRateLimited : t.contactError);
  };

  const isSending = status === "sending";

  return (
    <form className="contactForm" onSubmit={submit}>
      <h3 className="contactTitle">{t.contactTitle}</h3>
      <p className="contactIntro">{t.contactIntro}</p>

      <label className="contactField">
        <span>{t.contactEmailLabel}</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          placeholder={t.contactEmailPlaceholder}
          onChange={(event) => setEmail(event.currentTarget.value)}
        />
      </label>

      <label className="contactField">
        <span>{t.contactMessageLabel}</span>
        <textarea
          required
          rows={4}
          maxLength={MESSAGE_MAX}
          value={message}
          placeholder={t.contactMessagePlaceholder}
          onChange={(event) => setMessage(event.currentTarget.value)}
        />
      </label>

      <div className="contactActions">
        {status === "sent" ? (
          <p className="contactStatus contactStatusOk" role="status">{t.contactSuccess}</p>
        ) : null}
        {status === "error" ? (
          <p className="contactStatus contactStatusError" role="alert">{errorText}</p>
        ) : null}
        <button className="primaryButton" type="submit" disabled={isSending}>
          {isSending ? t.contactSending : t.contactSend}
        </button>
      </div>
    </form>
  );
}
