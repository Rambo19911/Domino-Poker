import type {
  MultiplayerGameState,
  MultiplayerPlayerState,
  MultiplayerPlayerStatus
} from "./types";

export function applyTimeoutInactivity(
  state: MultiplayerGameState,
  playerId: string
): MultiplayerGameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.playerId === playerId ? applyTimeoutToPlayer(player) : player
    )
  };
}

export function applyPlayerActivity(
  state: MultiplayerGameState,
  playerId: string
): MultiplayerGameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.playerId === playerId ? applyActivityToPlayer(player) : player
    )
  };
}

export function applyPlayerDisconnect(
  state: MultiplayerGameState,
  playerId: string
): MultiplayerGameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.playerId === playerId ? disconnectPlayer(player) : player
    )
  };
}

export function applyPlayerResume(
  state: MultiplayerGameState,
  playerId: string
): MultiplayerGameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.playerId === playerId ? resumePlayer(player) : player
    )
  };
}

/**
 * Spēlētājs apzināti pamet spēli: viņa sēdvieta kļūst par **botu** — turpmāk to
 * auto-spēlē dzinējs (kā jebkuru botu), un spēlētājs vairs nevar atgriezties.
 * Atšķirībā no `disconnect` (pagaidu), tas ir neatgriezenisks.
 */
export function applyPlayerForfeit(
  state: MultiplayerGameState,
  playerId: string
): MultiplayerGameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.playerId === playerId ? forfeitPlayer(player) : player
    )
  };
}

export function applyDisableAutoPlay(
  state: MultiplayerGameState,
  playerId: string
): MultiplayerGameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.playerId === playerId ? disableAutoPlayForPlayer(player) : player
    )
  };
}

function applyTimeoutToPlayer(
  player: MultiplayerPlayerState
): MultiplayerPlayerState {
  if (player.status === "bot") return player;

  const inactiveScore = player.inactiveScore + 1;
  const status = statusForInactiveScore(inactiveScore);
  return {
    ...player,
    inactiveScore,
    status,
    autoPlayEnabled: status === "auto_play"
  };
}

function applyActivityToPlayer(
  player: MultiplayerPlayerState
): MultiplayerPlayerState {
  if (player.status === "bot" || player.inactiveScore === 0) return player;

  const inactiveScore = Math.max(0, player.inactiveScore - 1);
  return {
    ...player,
    inactiveScore,
    status: player.autoPlayEnabled ? player.status : statusForInactiveScore(inactiveScore)
  };
}

function disconnectPlayer(player: MultiplayerPlayerState): MultiplayerPlayerState {
  if (player.status === "bot") return player;

  // Disconnect ietekmē tikai savienojuma stāvokli; inaktivitātes/auto-play
  // eskalācija notiek atsevišķi caur TURN_TIMEOUT, kad spēlētājs nepaspēj.
  return {
    ...player,
    connectionState: "disconnected"
  };
}

function resumePlayer(player: MultiplayerPlayerState): MultiplayerPlayerState {
  if (player.status === "bot") return player;

  return {
    ...player,
    inactiveScore: 0,
    status: "active",
    autoPlayEnabled: false,
    connectionState: "connected"
  };
}

function forfeitPlayer(player: MultiplayerPlayerState): MultiplayerPlayerState {
  if (player.status === "bot") return player;

  // Kļūst par botu: dzinējs to auto-spēlē uzreiz (bez timeout gaidīšanas).
  return {
    ...player,
    status: "bot",
    connectionState: "disconnected",
    autoPlayEnabled: true
  };
}

function disableAutoPlayForPlayer(
  player: MultiplayerPlayerState
): MultiplayerPlayerState {
  if (player.status === "bot") return player;

  return {
    ...player,
    status: statusForManualControl(player.inactiveScore),
    autoPlayEnabled: false
  };
}

function statusForInactiveScore(score: number): MultiplayerPlayerStatus {
  if (score >= 3) return "auto_play";
  if (score === 2) return "inactive";
  if (score === 0) return "active";
  return "active_with_warning";
}

function statusForManualControl(score: number): MultiplayerPlayerStatus {
  if (score >= 2) return "inactive";
  if (score === 1) return "active_with_warning";
  return "active";
}
