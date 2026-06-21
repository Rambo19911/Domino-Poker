/**
 * Apbalvojuma GIF pēc spēlētāja beigu vietas (1.–4.) — animēts numura žetons spēles
 * beigu summary dialogā (SP + MP). Avots ir 100×100 GIF, tāpēc NELIETOT lielāku par
 * ~100px (citādi izplūdis). `place` ārpus 1..4 tiek piesaistīts robežām.
 * `aria-hidden` — vietu jau nes rindas teksts/kārtība.
 */
export function WinnerGif({ place, className }: { readonly place: number; readonly className?: string }) {
  const n = Math.min(4, Math.max(1, Math.trunc(place)));
  return (
    <img
      className={className}
      src={`/assets/winner/winner-number-${n}.gif`}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
