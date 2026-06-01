/** Noklusējuma MP servera ports (sk. start-domino-poker.bat / config). */
export const DEFAULT_MP_SERVER_PORT = 4000;
export const MP_WS_PATH = "/ws";

export interface ResolveServerUrlOptions {
  /** `NEXT_PUBLIC_MP_WS_URL` override (ja iestatīts, lieto to bez izmaiņām). */
  readonly envUrl?: string | undefined;
  /** Pārlūka atrašanās vieta (testiem injicējama). */
  readonly location?: { readonly hostname: string; readonly protocol: string } | undefined;
  readonly port?: number;
}

/**
 * Atrisina MP WebSocket URL. Prioritāte: tiešs env override → atvasināts no
 * pārlūka host (ws/wss pēc http/https) + servera porta (noklusējums 4000) + `/ws`.
 */
export function resolveServerUrl(options: ResolveServerUrlOptions = {}): string {
  const envUrl = options.envUrl?.trim();
  if (envUrl !== undefined && envUrl !== "") {
    return envUrl;
  }

  const location =
    options.location ?? (typeof window !== "undefined" ? window.location : undefined);
  const hostname = location?.hostname ?? "127.0.0.1";
  const wsProtocol = location?.protocol === "https:" ? "wss:" : "ws:";
  const port = options.port ?? DEFAULT_MP_SERVER_PORT;

  return `${wsProtocol}//${hostname}:${port}${MP_WS_PATH}`;
}
