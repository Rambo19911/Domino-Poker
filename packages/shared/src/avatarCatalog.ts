/**
 * Avataru katalogs — vienīgais patiesības avots derīgajiem avatar `id`.
 * Klients to izmanto attēlošanai, serveris — validācijai (`users.avatar` glabā `id`,
 * NE faila ceļu). Faili: `apps/web/public/assets/avatars/<id>.svg`.
 *
 * `id` ir stabils mūžīgi — to mainot, tiktu salauzti esošo lietotāju avatari.
 */

/** Visi derīgie avatar id (`avatar-01` .. `avatar-38`). */
export const AVATAR_IDS: readonly string[] = Array.from(
  { length: 38 },
  (_, index) => `avatar-${String(index + 1).padStart(2, "0")}`
);

/** Noklusējuma avatars, ja lietotājs vēl nav izvēlējies (pirmais katalogā). */
export const DEFAULT_AVATAR_ID = "avatar-01";

const avatarIdSet = new Set(AVATAR_IDS);

/** Validācija pirms `users.avatar` glabāšanas (serveris) un attēlošanas (klients). */
export function isValidAvatarId(id: string): boolean {
  return avatarIdSet.has(id);
}

/** Publiskais ceļš avatara SVG failam (Next.js `public/`). */
export function avatarFilePath(id: string): string {
  return `/assets/avatars/${id}.svg`;
}
