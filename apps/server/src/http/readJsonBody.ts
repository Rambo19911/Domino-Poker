import type { IncomingMessage } from "node:http";

/** Maksimālais auth ķermeņa izmērs (DoS aizsardzība; mazas JSON kravas). */
export const MAX_BODY_BYTES = 4096;
/** Maksimālais avatara augšupielādes izmērs — klients jau samazina līdz ~50KB WebP. */
export const MAX_AVATAR_BYTES = 256 * 1024;

export type ReadJsonResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly status: 400 | 413 };

export type ReadBinaryResult =
  | { readonly ok: true; readonly bytes: Buffer }
  | { readonly ok: false; readonly status: 400 | 413 };

/**
 * Nolasa raw bin(attēla) ķermeni ar izmēra ierobežojumu. Pārsniedzot → `413`
 * (savienojums pārtraukts); tukšs → `400`. Lieto avatara augšupielādei, kur
 * ķermenis ir jau klienta pusē saspiests WebP/JPEG, NE JSON.
 */
export async function readBinaryBody(
  request: IncomingMessage,
  maxBytes: number
): Promise<ReadBinaryResult> {
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of request) {
      const buffer = chunk as Buffer;
      size += buffer.length;
      if (size > maxBytes) {
        request.destroy();
        return { ok: false, status: 413 };
      }
      chunks.push(buffer);
    }
  } catch {
    return { ok: false, status: 400 };
  }
  if (chunks.length === 0) {
    return { ok: false, status: 400 };
  }
  return { ok: true, bytes: Buffer.concat(chunks) };
}

/**
 * Nolasa un parsē JSON ķermeni ar izmēra ierobežojumu. Pārsniedzot limitu →
 * `413` (savienojums tiek pārtraukts). Tukšs/nederīgs JSON → `400`. Tā auth
 * maršruti nekad neparsē neierobežotu ievadi.
 */
export async function readJsonBody(
  request: IncomingMessage,
  maxBytes: number = MAX_BODY_BYTES
): Promise<ReadJsonResult> {
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of request) {
      const buffer = chunk as Buffer;
      size += buffer.length;
      if (size > maxBytes) {
        request.destroy();
        return { ok: false, status: 413 };
      }
      chunks.push(buffer);
    }
  } catch {
    return { ok: false, status: 400 };
  }
  if (chunks.length === 0) {
    return { ok: false, status: 400 };
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, status: 400 };
  }
}
