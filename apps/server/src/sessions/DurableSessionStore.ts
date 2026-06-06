export interface DurableSessionRecord {
  readonly playerId: string;
  readonly reconnectToken: string;
  readonly displayId: string;
  readonly updatedAt: number;
}

export interface NewDurableSessionRecord extends DurableSessionRecord {
  readonly createdAt: number;
}

export type CreateDurableSessionResult = "created" | "player_exists" | "display_id_taken";

export interface DurableSessionStore {
  getSession(playerId: string): Promise<DurableSessionRecord | undefined>;
  createSessionIfAbsent(record: NewDurableSessionRecord): Promise<CreateDurableSessionResult>;
  deleteSession(playerId: string): Promise<void>;
}
