import { z } from "zod";

/**
 * Konta ievades lauku Zod shēmas — VIENS autoritatīvais avots (CLAUDE.md: nedublēt
 * validāciju). Lieto GAN spēlētāju `/auth/*` maršruti (`authRoutes`), GAN admin paneļa
 * konta rediģēšana (`adminRoutes`, Fāze 2.1), lai admin NEVARĒTU iestatīt vērtību, ko
 * spēlētāja plūsma noraida (citādi username/email noteikumi varētu izšķirties = drift).
 */

/**
 * Rezervētie lietotājvārdi, ko spēlētājs NEDRĪKST reģistrēt vai pieņemt pārsaucoties.
 * `"admin"` sakrīt ar admin paneļa čata paziņojumu autoru (`LobbyChat.announce`,
 * `authorDisplayId: "Admin"`); ja spēlētājs to paņemtu, viņa čata ziņas būtu neatšķiramas
 * no admina (uzdošanās / maldinošs saturs). Salīdzina REĢISTRNEJUTĪGI (sk. `usernameField`),
 * jo čatā rādītais vārds ir neapstrādāts `username`. SVARĪGI: tur sinhroni ar `LobbyChat`.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set(["admin"]);

/**
 * Lietotājvārds: 3–20 rakstzīmes, tikai `[A-Za-z0-9_-]`, apgriezts, NE rezervēts
 * (reģistrnejutīgi). Rezervēto pārbaude šeit (viens avots) sedz reģistrāciju, profila
 * pārsaukšanu UN admin konta rediģēšanu vienlaikus.
 */
export const usernameField = z
  .string()
  .trim()
  .min(3)
  .max(20)
  .regex(/^[A-Za-z0-9_-]+$/u)
  .refine((value) => !RESERVED_USERNAMES.has(value.toLowerCase()), {
    message: "username_reserved"
  });

/** Parole: 8–200 rakstzīmes (hašo `passwords.ts`). */
export const passwordField = z.string().min(8).max(200);

/** E-pasts: 3–254 rakstzīmes, vienkārša `local@domain.tld` forma, apgriezts. */
export const emailField = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/u);
