import type { AppStrings } from "../../lib/i18n";
import type { ConnectionStatus } from "../../lib/mp/clientView";

/**
 * Savienojuma stāvokļa indikators. Parastam lietotājam, kad viss kārtībā, rāda
 * tikai **zaļu punktu** (bez tehniska teksta). Problēmstāvokļos (savienojas /
 * atjauno / kļūda) papildus rāda tekstu, lai lietotājs pamana.
 *
 * a11y (UI spec §8): stāvoklis vienmēr ir pieejams **tekstā** (savienots — caur
 * sr-only + `title`, ne tikai krāsa) un `role="status"`+`aria-live` paziņo izmaiņas.
 */
export function ConnectionBanner({
  status,
  labels: t
}: {
  readonly status: ConnectionStatus;
  readonly labels: AppStrings;
}) {
  const label = connectionLabel(status, t);
  const isConnected = status === "connected";
  return (
    <div className={`mpConnBanner mpConn-${status}`} role="status" aria-live="polite" title={label}>
      <span className="mpConnDot" aria-hidden="true" />
      {/* Savienots → tekstu paslēpj vizuāli (paliek pieejams ekrānlasītājiem). */}
      <span className={isConnected ? "srOnly" : "mpConnText"}>{label}</span>
    </div>
  );
}

function connectionLabel(status: ConnectionStatus, t: AppStrings): string {
  switch (status) {
    case "connected":
      return t.mpConnConnected;
    case "reconnecting":
      return t.mpConnReconnecting;
    case "error":
      return t.mpConnError;
    default:
      return t.mpConnConnecting;
  }
}
