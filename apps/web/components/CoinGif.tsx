/**
 * Animēta zelta monēta (griežas) — raster GIF, aizstāj zīmēto `CoinIcon` tur, kur
 * vēlama "dzīva" monēta: bilance/profils un MP-lobby (maksas čipi, dalības maksas
 * ievade). Izmēru dod klase (parasti `width/height: 1em`), tāpat kā `CoinIcon`, lai
 * lietošanas vietas paliek nemainīgas. `aria-hidden` — pieejamības tekstu nes vecāks.
 *
 * Piezīme: GIF griežas vienmēr (arī `prefers-reduced-motion`) — apzināts produkta
 * lēmums. Statisko `CoinIcon` SVG joprojām lieto desktop pods un spēles beigu balva.
 */
export function CoinGif({ className }: { readonly className?: string }) {
  return (
    <img
      className={className}
      src="/assets/coins/spinRight-32.gif"
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
