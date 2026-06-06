import { deriveDisplayIdCandidate, type DisplayIdRegistry } from "../identity/DisplayIdRegistry.js";
import type { DurableSessionStore } from "./DurableSessionStore.js";

/**
 * Savienojumam piesaistītā identitāte. `playerId` = `HELLO.clientId` (stabils
 * starp savienojumiem); `displayId` ir vienīgā publiski atklājamā forma;
 * `reconnectToken` ir **slepens** (netiek logots) un nodots tikai pašam
 * spēlētājam `WELCOME` ziņojumā.
 */
export interface SessionIdentity {
  readonly connectionId: string;
  readonly sessionId: string;
  readonly playerId: string;
  readonly displayId: string;
  readonly reconnectToken: string;
}

/**
 * `register` rezultāts. `token_mismatch` → savienojums uzdodas par esošu
 * `clientId`, bet `reconnectToken` nesakrīt (vai nav padots) → noraidām.
 */
export type RegisterResult =
  | {
      readonly ok: true;
      readonly identity: SessionIdentity;
      readonly isReconnect: boolean;
      /** Iepriekšējais aktīvais savienojums šim `clientId` (jāaizver — viens socket). */
      readonly replacedConnectionId: string | undefined;
    }
  | { readonly ok: false; readonly reason: "token_mismatch" };

export interface SessionManagerOptions {
  readonly displayIds: DisplayIdRegistry;
  readonly createSessionId?: () => string;
  readonly createReconnectToken?: () => string;
  readonly durableStore?: DurableSessionStore;
  readonly clock?: () => number;
}

export type MaybePromise<T> = T | Promise<T>;

/**
 * Durable sesiju pārvaldnieks (Fāze 9.1). Atšķirībā no agrākā `SessionRegistry`,
 * `reconnectToken` **saglabājas pāri atvienojumiem** (līdz `release`), tāpēc
 * refresh/reconnect var validēt token un atjaunot identitāti.
 *
 * Politikas:
 *  - **Viens aktīvs socket uz `clientId`**: jauns savienojums aizstāj veco
 *    (`replacedConnectionId` → gateway aizver veco). Novērš dubultu kontroli.
 *  - **Token validācija**: ja `clientId` jau ir zināms, jaunajam savienojumam
 *    jāuzrāda tieši tas pats `reconnectToken`, citādi noraida (`token_mismatch`).
 *  - `displayId` un `reconnectToken` ir **stabili** sesijā (līdz `release`).
 *
 * Zelta noteikums: te nav spēles loģikas — tikai identitāte/savienojumi.
 */
export class SessionManager {
  /** Durable: `playerId → reconnectToken` (saglabājas pāri atvienojumiem). */
  private readonly tokens = new Map<string, string>();
  /** Aktīvais savienojums katram spēlētājam (viens socket). */
  private readonly activeByPlayer = new Map<string, string>();
  /** Aktīvo savienojumu identitātes. */
  private readonly byConnection = new Map<string, SessionIdentity>();
  private readonly displayIds: DisplayIdRegistry;
  private readonly createSessionId: () => string;
  private readonly createReconnectToken: () => string;
  private readonly durableStore: DurableSessionStore | undefined;
  private readonly clock: () => number;

  constructor(options: SessionManagerOptions) {
    this.displayIds = options.displayIds;
    this.createSessionId = options.createSessionId ?? defaultToken;
    this.createReconnectToken = options.createReconnectToken ?? defaultToken;
    this.durableStore = options.durableStore;
    this.clock = options.clock ?? (() => Date.now());
  }

  /**
   * Piesaista identitāti savienojumam (HELLO). Jauns `clientId` → svaiga sesija
   * ar jaunu `reconnectToken`. Zināms `clientId` → jāsakrīt token (citādi noraida).
   * Ja `clientId` jau bija aktīvs citā savienojumā, tas tiek aizstāts.
   */
  register(connectionId: string, clientId: string, providedToken?: string): RegisterResult {
    const playerId = clientId.trim();
    if (playerId === "") {
      throw new Error("SessionManager.register requires a non-empty clientId.");
    }

    return this.registerLocal(connectionId, playerId, providedToken);
  }

  registerAsync(
    connectionId: string,
    clientId: string,
    providedToken?: string
  ): MaybePromise<RegisterResult> {
    const playerId = clientId.trim();
    if (playerId === "") {
      throw new Error("SessionManager.register requires a non-empty clientId.");
    }
    if (this.durableStore !== undefined) {
      return this.registerDurable(connectionId, playerId, providedToken);
    }
    return this.registerLocal(connectionId, playerId, providedToken);
  }

  private registerLocal(connectionId: string, playerId: string, providedToken?: string): RegisterResult {
    const existingToken = this.tokens.get(playerId);
    let reconnectToken: string;
    let isReconnect: boolean;
    if (existingToken !== undefined) {
      if (providedToken !== existingToken) {
        return { ok: false, reason: "token_mismatch" };
      }
      reconnectToken = existingToken;
      isReconnect = true;
    } else {
      reconnectToken = this.createReconnectToken();
      this.tokens.set(playerId, reconnectToken);
      isReconnect = false;
    }

    const bound = this.bindActiveConnection(connectionId, playerId, {
      reconnectToken,
      displayId: this.displayIds.assign(playerId)
    });

    return {
      ok: true,
      identity: bound.identity,
      isReconnect,
      replacedConnectionId: bound.replacedConnectionId
    };
  }

  private async registerDurable(
    connectionId: string,
    playerId: string,
    providedToken?: string
  ): Promise<RegisterResult> {
    if (this.durableStore === undefined) {
      throw new Error("Durable session store is not configured.");
    }

    const existing = await this.durableStore.getSession(playerId);
    if (existing !== undefined) {
      if (providedToken !== existing.reconnectToken) {
        return { ok: false, reason: "token_mismatch" };
      }
      const bound = this.bindActiveConnection(connectionId, playerId, existing);
      return {
        ok: true,
        identity: bound.identity,
        isReconnect: true,
        replacedConnectionId: bound.replacedConnectionId
      };
    }

    const now = this.clock();
    const reconnectToken = this.createReconnectToken();
    for (let salt = 0; salt < 100_000; salt += 1) {
      const displayId = deriveDisplayIdCandidate(playerId, salt);
      const result = await this.durableStore.createSessionIfAbsent({
        playerId,
        reconnectToken,
        displayId,
        createdAt: now,
        updatedAt: now
      });
      if (result === "display_id_taken") {
        continue;
      }
      if (result === "player_exists") {
        return this.registerDurable(connectionId, playerId, providedToken);
      }
      const bound = this.bindActiveConnection(connectionId, playerId, {
        reconnectToken,
        displayId
      });
      return {
        ok: true,
        identity: bound.identity,
        isReconnect: false,
        replacedConnectionId: bound.replacedConnectionId
      };
    }
    throw new Error("SessionManager exhausted the available displayId space.");
  }

  private bindActiveConnection(
    connectionId: string,
    playerId: string,
    session: { readonly reconnectToken: string; readonly displayId: string }
  ): { readonly identity: SessionIdentity; readonly replacedConnectionId: string | undefined } {
    const identity: SessionIdentity = {
      connectionId,
      sessionId: this.createSessionId(),
      playerId,
      displayId: session.displayId,
      reconnectToken: session.reconnectToken
    };

    const previous = this.activeByPlayer.get(playerId);
    const replacedConnectionId = previous !== undefined && previous !== connectionId ? previous : undefined;
    if (replacedConnectionId !== undefined) {
      this.byConnection.delete(replacedConnectionId);
    }
    this.byConnection.set(connectionId, identity);
    this.activeByPlayer.set(playerId, connectionId);
    return { identity, replacedConnectionId };
  }

  get(connectionId: string): SessionIdentity | undefined {
    return this.byConnection.get(connectionId);
  }

  /** Vai dotais savienojums pieder norādītajam spēlētājam (maršrutēšanai). */
  ownsPlayer(connectionId: string, playerId: string): boolean {
    return this.byConnection.get(connectionId)?.playerId === playerId;
  }

  /** Vai dotais savienojums joprojām ir spēlētāja AKTĪVAIS socket (ne aizstāts). */
  isActiveConnection(connectionId: string): boolean {
    const identity = this.byConnection.get(connectionId);
    return identity !== undefined && this.activeByPlayer.get(identity.playerId) === connectionId;
  }

  /** Vai spēlētājam ir kāds aktīvs socket (tiešsaistē). */
  hasActiveConnection(playerId: string): boolean {
    return this.activeByPlayer.has(playerId.trim());
  }

  /**
   * Noņem AKTĪVO savienojumu (socket close). Durable `reconnectToken` **paliek**
   * (reconnect validācijai), līdz `release`. Aizstātam (vecam) savienojumam
   * atgriež `undefined`, jo tas jau noņemts no aktīvajiem.
   */
  unregister(connectionId: string): SessionIdentity | undefined {
    const identity = this.byConnection.get(connectionId);
    if (!identity) {
      return undefined;
    }
    this.byConnection.delete(connectionId);
    if (this.activeByPlayer.get(identity.playerId) === connectionId) {
      this.activeByPlayer.delete(identity.playerId);
    }
    return identity;
  }

  /**
   * Atbrīvo durable sesiju (pēc istabas pamešanas / spēles beigām): `reconnectToken`
   * un `displayId`. Pēc tā tas pats `clientId` saņem svaigu sesiju.
   */
  release(playerId: string): MaybePromise<void> {
    const key = playerId.trim();
    this.tokens.delete(key);
    this.displayIds.release(key);
    return this.durableStore?.deleteSession(key);
  }

  /** Unikālu tiešsaistes (ar aktīvu socket) spēlētāju skaits. */
  onlineCount(): number {
    return this.activeByPlayer.size;
  }
}

function defaultToken(): string {
  return globalThis.crypto.randomUUID();
}
