import type { DisplayIdRegistry } from "../identity/DisplayIdRegistry.js";

/**
 * Savienojumam piesaistītā identitāte (6.4 "Piesaista session/player identitāti
 * socketam"). `playerId` ir stabilā spēlētāja identitāte (no `HELLO.clientId`);
 * `displayId` ir vienīgā publiski atklājamā forma; `reconnectToken` ir slepens
 * un nodots tikai pašam spēlētājam `WELCOME` ziņojumā.
 */
export interface ConnectionIdentity {
  readonly connectionId: string;
  readonly sessionId: string;
  readonly playerId: string;
  readonly displayId: string;
  readonly reconnectToken: string;
}

export interface SessionRegistryOptions {
  readonly displayIds: DisplayIdRegistry;
  readonly createSessionId?: () => string;
  readonly createReconnectToken?: () => string;
}

/**
 * Uztur aktīvo savienojumu → identitāšu kartēšanu un apgriezto
 * `playerId → savienojumi` kartēšanu (vajadzīga 6.7 "socket pieder spēlētājam"
 * pārbaudei). `displayId` deleģē kopīgajam `DisplayIdRegistry`, lai gaidītavas
 * sēdvietas un `WELCOME` rādītu vienu un to pašu publisko id.
 */
export class SessionRegistry {
  private readonly byConnection = new Map<string, ConnectionIdentity>();
  private readonly connectionsByPlayer = new Map<string, Set<string>>();
  private readonly displayIds: DisplayIdRegistry;
  private readonly createSessionId: () => string;
  private readonly createReconnectToken: () => string;

  constructor(options: SessionRegistryOptions) {
    this.displayIds = options.displayIds;
    this.createSessionId = options.createSessionId ?? defaultToken;
    this.createReconnectToken = options.createReconnectToken ?? defaultToken;
  }

  /** Izveido un saglabā identitāti savienojumam (HELLO handshake laikā). */
  register(connectionId: string, playerId: string): ConnectionIdentity {
    const normalized = playerId.trim();
    if (normalized === "") {
      throw new Error("SessionRegistry.register requires a non-empty playerId.");
    }

    const identity: ConnectionIdentity = {
      connectionId,
      sessionId: this.createSessionId(),
      playerId: normalized,
      displayId: this.displayIds.assign(normalized),
      reconnectToken: this.createReconnectToken()
    };

    this.byConnection.set(connectionId, identity);
    const connections = this.connectionsByPlayer.get(normalized) ?? new Set<string>();
    connections.add(connectionId);
    this.connectionsByPlayer.set(normalized, connections);
    return identity;
  }

  get(connectionId: string): ConnectionIdentity | undefined {
    return this.byConnection.get(connectionId);
  }

  /** Vai dotais savienojums pieder norādītajam spēlētājam (6.7 maršrutēšanai). */
  ownsPlayer(connectionId: string, playerId: string): boolean {
    return this.byConnection.get(connectionId)?.playerId === playerId;
  }

  /** Noņem identitāti, kad savienojums aizveras. Atgriež noņemto identitāti. */
  unregister(connectionId: string): ConnectionIdentity | undefined {
    const identity = this.byConnection.get(connectionId);
    if (!identity) {
      return undefined;
    }
    this.byConnection.delete(connectionId);
    const connections = this.connectionsByPlayer.get(identity.playerId);
    if (connections) {
      connections.delete(connectionId);
      if (connections.size === 0) {
        this.connectionsByPlayer.delete(identity.playerId);
      }
    }
    return identity;
  }

  /** Unikālu tiešsaistes spēlētāju skaits (6.6 `onlineCount` izsūtīšanai). */
  onlineCount(): number {
    return this.connectionsByPlayer.size;
  }
}

function defaultToken(): string {
  return globalThis.crypto.randomUUID();
}
