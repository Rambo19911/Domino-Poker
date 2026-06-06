import { describe, expect, it } from "vitest";

import {
  applyDisableAutoPlay,
  applyPlayerActivity,
  applyPlayerResume,
  applyTimeoutInactivity,
  createInitialMultiplayerGameState,
  createMultiplayerGameSetup,
  type MultiplayerGameState
} from "../../src/multiplayer";

function createState(): MultiplayerGameState {
  const setup = createMultiplayerGameSetup({
    gameId: "game-1",
    seed: "inactivity-seed"
  });
  return createInitialMultiplayerGameState(setup);
}

function playerState(state: MultiplayerGameState, playerId: string) {
  const player = state.players.find((candidate) => candidate.playerId === playerId);
  if (!player) {
    throw new Error(`Expected multiplayer player ${playerId} to exist.`);
  }
  return player;
}

describe("multiplayer inactivity", () => {
  it("advances a human player through warning, inactive, and auto-play timeout states", () => {
    const firstTimeout = applyTimeoutInactivity(createState(), "1");
    const secondTimeout = applyTimeoutInactivity(firstTimeout, "1");
    const thirdTimeout = applyTimeoutInactivity(secondTimeout, "1");

    expect(playerState(firstTimeout, "1")).toMatchObject({
      inactiveScore: 1,
      status: "active_with_warning",
      autoPlayEnabled: false
    });
    expect(playerState(secondTimeout, "1")).toMatchObject({
      inactiveScore: 2,
      status: "inactive",
      autoPlayEnabled: false
    });
    expect(playerState(thirdTimeout, "1")).toMatchObject({
      inactiveScore: 3,
      status: "auto_play",
      autoPlayEnabled: true
    });
  });

  it("keeps timeout inactivity separate from core domino scoring", () => {
    const state = createState();
    const nextState = applyTimeoutInactivity(state, "1");

    expect(nextState.coreState.players[0]?.totalScore).toBe(
      state.coreState.players[0]?.totalScore
    );
    expect(nextState.coreState.players[0]?.tricksWon).toBe(
      state.coreState.players[0]?.tricksWon
    );
    expect(playerState(nextState, "1").inactiveScore).toBe(1);
  });

  it("does not convert existing bot seats into human inactivity states", () => {
    const state = createState();
    const nextState = applyTimeoutInactivity(state, "2");

    expect(playerState(nextState, "2")).toMatchObject({
      inactiveScore: 0,
      status: "bot",
      autoPlayEnabled: false
    });
  });

  it("reduces human inactivity after a normal action without going below zero", () => {
    const warned = applyTimeoutInactivity(createState(), "1");
    const active = applyPlayerActivity(warned, "1");
    const stillActive = applyPlayerActivity(active, "1");

    expect(playerState(active, "1")).toMatchObject({
      inactiveScore: 0,
      status: "active",
      autoPlayEnabled: false
    });
    expect(playerState(stillActive, "1")).toMatchObject({
      inactiveScore: 0,
      status: "active",
      autoPlayEnabled: false
    });
  });

  it("keeps auto-play enabled until an explicit resume or disable command exists", () => {
    const autoPlay = applyTimeoutInactivity(
      applyTimeoutInactivity(applyTimeoutInactivity(createState(), "1"), "1"),
      "1"
    );
    const afterActivity = applyPlayerActivity(autoPlay, "1");

    expect(playerState(afterActivity, "1")).toMatchObject({
      inactiveScore: 2,
      status: "auto_play",
      autoPlayEnabled: true
    });
  });

  it("resumes a human player by disabling auto-play and clearing inactivity", () => {
    const autoPlay = applyTimeoutInactivity(
      applyTimeoutInactivity(applyTimeoutInactivity(createState(), "1"), "1"),
      "1"
    );
    const resumed = applyPlayerResume(autoPlay, "1");

    expect(playerState(resumed, "1")).toMatchObject({
      inactiveScore: 0,
      status: "active",
      autoPlayEnabled: false,
      connectionState: "connected"
    });
  });

  it("disables auto-play without hiding the remaining inactivity risk", () => {
    const autoPlay = applyTimeoutInactivity(
      applyTimeoutInactivity(applyTimeoutInactivity(createState(), "1"), "1"),
      "1"
    );
    const disabled = applyDisableAutoPlay(autoPlay, "1");

    expect(playerState(disabled, "1")).toMatchObject({
      inactiveScore: 3,
      status: "inactive",
      autoPlayEnabled: false
    });
  });
});
