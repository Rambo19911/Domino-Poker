import { z } from "zod";

/**
 * Konta ievades lauku Zod shēmas — VIENS autoritatīvais avots (CLAUDE.md: nedublēt
 * validāciju). Lieto GAN spēlētāju `/auth/*` maršruti (`authRoutes`), GAN admin paneļa
 * konta rediģēšana (`adminRoutes`, Fāze 2.1), lai admin NEVARĒTU iestatīt vērtību, ko
 * spēlētāja plūsma noraida (citādi username/email noteikumi varētu izšķirties = drift).
 */

/** Lietotājvārds: 3–20 rakstzīmes, tikai `[A-Za-z0-9_-]`, apgriezts. */
export const usernameField = z
  .string()
  .trim()
  .min(3)
  .max(20)
  .regex(/^[A-Za-z0-9_-]+$/u);

/** Parole: 8–200 rakstzīmes (hašo `passwords.ts`). */
export const passwordField = z.string().min(8).max(200);

/** E-pasts: 3–254 rakstzīmes, vienkārša `local@domain.tld` forma, apgriezts. */
export const emailField = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/u);
