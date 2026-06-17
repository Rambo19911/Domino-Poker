import { resolveServerUrl } from "./serverUrl";

export function serverHttpBase(): string {
  const ws = resolveServerUrl({ envUrl: process.env.NEXT_PUBLIC_MP_WS_URL });
  return ws.replace(/^ws/u, "http").replace(/\/ws$/u, "");
}
