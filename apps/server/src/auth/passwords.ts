import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Paroļu hašošana ar Node iebūvēto `crypto.scrypt` (bez jaunas atkarības;
 * memory-hard, GPU-izturīga). Hašā **glabājam algoritmu + parametrus**, lai
 * nākotnē varētu palielināt work-factor, nesalaužot esošos hašus
 * (`verifyPassword` lasa parametrus no paša haša).
 *
 * Formāts: `scrypt$<N>$<r>$<p>$<saltBase64>$<hashBase64>`.
 */

// OWASP-saderīgi scrypt parametri. Atmiņa ≈ 128 * N * r ≈ 16 MiB.
const DEFAULT_N = 16384;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
// Atļaujam vairāk atmiņas nekā noklusējuma 32 MiB, lai nākotnē var celt N.
const MAX_MEM = 64 * 1024 * 1024;

/** `crypto.scrypt` ar options kā Promise (promisify neatbalsta options pārslodzi). */
function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, {
    N: DEFAULT_N,
    r: DEFAULT_R,
    p: DEFAULT_P,
    maxmem: MAX_MEM
  });
  return [
    "scrypt",
    DEFAULT_N,
    DEFAULT_R,
    DEFAULT_P,
    salt.toString("base64"),
    derived.toString("base64")
  ].join("$");
}

/**
 * Pārbauda paroli pret glabāto hašu. Konstanta laika salīdzinājums
 * (`timingSafeEqual`). Atgriež `false` pie jebkura nederīga/bojāta haša formāta.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, nRaw, rRaw, pRaw, saltB64, hashB64] = stored.split("$");
  if (
    scheme !== "scrypt" ||
    nRaw === undefined ||
    rRaw === undefined ||
    pRaw === undefined ||
    saltB64 === undefined ||
    hashB64 === undefined
  ) {
    return false;
  }
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const derived = await scryptAsync(password, salt, expected.length, {
    N: n,
    r,
    p,
    maxmem: MAX_MEM
  });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
