import type { GameState } from './gameState';

export type StoreListener = (state: GameState) => void;

/** Immutable state container; rendering subscribes, only the controller writes. */
export class GameStore {
  private state: GameState;
  private readonly listeners = new Set<StoreListener>();

  constructor(initial: GameState) {
    this.state = initial;
  }

  getState(): GameState {
    return this.state;
  }

  patch(partial: Partial<GameState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (error) {
        // A failing renderer must never unwind the transaction (plan section 18).
        console.error('Store listener failed', error);
      }
    }
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
