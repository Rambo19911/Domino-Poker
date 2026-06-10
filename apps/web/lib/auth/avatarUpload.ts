/**
 * Klienta puses avatara sagatavošana (Fāze 5 — custom avatari). Augšupielādes
 * brīdī, PĀRLŪKĀ: validē tipu + min izšķirtspēju, cover-crop kvadrātu, samazina
 * līdz 512×512 un encode WebP (fallback JPEG). Tā 5MB oriģināls NEKAD nesasniedz
 * serveri — augšupielādē jau ~30–80KB Blob. Bez jaunas atkarības (Canvas API).
 */

/** Mērķa izmērs = lielākais profila renders (~235px CSS @2x ≈ 470px) ar rezervi. */
export const AVATAR_TARGET_SIZE = 512;
/** Maks. oriģināla izmērs, ko klients vispār pieņem (pirms apstrādes). */
export const AVATAR_MAX_ORIGINAL_BYTES = 5 * 1024 * 1024;
/** Atļautie ievades tipi (jpg/jpeg → image/jpeg, png → image/png). */
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png"]);
/** Apstrādātā faila griesti (< servera 256KB cap) — drošības rezerve. */
const MAX_UPLOAD_BYTES = 250 * 1024;
/** Dilstošas kvalitātes mēģinājumi, lai augsta-entropija attēls iekļautos izmērā. */
const QUALITIES = [0.85, 0.7, 0.55];

export type AvatarPrepResult =
  | { readonly ok: true; readonly blob: Blob }
  | { readonly ok: false; readonly error: "type" | "too_large" | "too_small" | "decode" };

export async function prepareAvatar(file: File): Promise<AvatarPrepResult> {
  if (!ALLOWED_TYPES.has(file.type)) {
    return { ok: false, error: "type" };
  }
  if (file.size > AVATAR_MAX_ORIGINAL_BYTES) {
    return { ok: false, error: "too_large" };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, error: "decode" };
  }

  // Min izšķirtspēja: mazākā mala >= mērķis, lai 512×512 cover-crop nav izplūdis.
  const minSide = Math.min(bitmap.width, bitmap.height);
  if (minSide < AVATAR_TARGET_SIZE) {
    bitmap.close();
    return { ok: false, error: "too_small" };
  }

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_TARGET_SIZE;
  canvas.height = AVATAR_TARGET_SIZE;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    bitmap.close();
    return { ok: false, error: "decode" };
  }
  // Centrēts kvadrāta izgriezums (cover), zīmēts uz 512×512.
  const sx = (bitmap.width - minSide) / 2;
  const sy = (bitmap.height - minSide) / 2;
  ctx.drawImage(bitmap, sx, sy, minSide, minSide, 0, 0, AVATAR_TARGET_SIZE, AVATAR_TARGET_SIZE);
  bitmap.close();

  const blob = await encodeBlob(canvas);
  if (blob === null) {
    return { ok: false, error: "decode" };
  }
  // Augsta-entropija attēls var pārsniegt griestus pat pēc dilstošas kvalitātes.
  if (blob.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "too_large" };
  }
  return { ok: true, blob };
}

/**
 * WebP (labākā saspiešana; fallback JPEG), dilstošā kvalitātē, līdz fails iekļaujas
 * `MAX_UPLOAD_BYTES`. Atgriež pirmo, kas der; ja neviens, atgriež mazāko (izsaucējs
 * pārbauda izmēru).
 */
async function encodeBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  let smallest: Blob | null = null;
  for (const quality of QUALITIES) {
    const blob = await toBlobWithFallback(canvas, quality);
    if (blob === null) {
      continue;
    }
    if (smallest === null || blob.size < smallest.size) {
      smallest = blob;
    }
    if (blob.size <= MAX_UPLOAD_BYTES) {
      return blob;
    }
  }
  return smallest;
}

/** WebP pie dotās kvalitātes; ja pārlūks neatbalsta WebP, atkrīt uz JPEG. */
function toBlobWithFallback(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (webp) => {
        if (webp !== null && webp.type === "image/webp") {
          resolve(webp);
          return;
        }
        canvas.toBlob((jpeg) => resolve(jpeg), "image/jpeg", quality);
      },
      "image/webp",
      quality
    );
  });
}
