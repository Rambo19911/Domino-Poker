import type { ClientSocket, ClientSocketHandlers } from "./MultiplayerClient";

/**
 * Reālais pārlūka `WebSocket` ietverts `ClientSocket` saskarnē. Tas ir vienīgais
 * I/O slānis — visa klienta protokola loģika dzīvo `MultiplayerClient` un ir
 * deterministiski testējama bez reāla socketa.
 */
export function createBrowserSocket(url: string, handlers: ClientSocketHandlers): ClientSocket {
  const ws = new WebSocket(url);

  ws.addEventListener("open", () => handlers.onOpen());
  ws.addEventListener("message", (event) => {
    handlers.onMessage(typeof event.data === "string" ? event.data : String(event.data));
  });
  ws.addEventListener("close", (event) => handlers.onClose(event.code));
  // `error` vienmēr seko `close`, tāpēc reconnect plūsmu vada `close`.
  ws.addEventListener("error", () => {});

  return {
    send: (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    },
    close: () => ws.close()
  };
}
