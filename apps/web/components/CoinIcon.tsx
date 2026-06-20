/**
 * Zelta monētas/žetona ikona. Token-krāsota: izmanto TIKAI `currentColor` (manto
 * teksta krāsu — parasti `--primary`/`--coin`), iekšējās detaļas ar caurspīdīgumu,
 * tāpēc nav nepieciešami krāsu literāļi. Atkārtoti lietojams (bilance, pods, istabu nozīme).
 */
export function CoinIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      <circle cx="12" cy="12" r="9.5" />
      <circle
        cx="12"
        cy="12"
        r="6.2"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="1.4"
      />
      <circle cx="12" cy="12" r="2" fillOpacity="0.4" />
    </svg>
  );
}
