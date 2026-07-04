"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { tileKey } from "@domino-poker/core";
import { HINTS_PER_ROUND, type HintDeniedEvent, type HintGrantedEvent } from "@domino-poker/shared";

import { computeMpHint } from "./botView";
import type { GameSnapshot } from "./clientView";

/** MP padoma UI stāvoklis (dala poga + izgaismošana). */
export interface MpHint {
  readonly hintsRemaining: number;
  readonly hintComputing: boolean;
  readonly recommendedTileKey: string | null;
  readonly recommendedDeclaredNumber: number | undefined;
  readonly hintEnabled: boolean;
  readonly useHint: () => void;
}

export interface UseMpHintParams {
  readonly snapshot: GameSnapshot | undefined;
  readonly turnId: string | undefined;
  readonly currentRound: number | undefined;
  readonly isViewerMoveTurn: boolean;
  readonly owned: boolean;
  /** Sūta `REQUEST_HINT`; atgriež `requestId` (vai `undefined`, ja nav aktīva turna). */
  readonly requestHint: () => string | undefined;
  /** Reģistrē servera padoma atbildes apstrādātāju `MultiplayerClient`-am. */
  readonly registerHintResponse: (
    handler: ((event: HintGrantedEvent | HintDeniedEvent) => void) | undefined
  ) => void;
}

/**
 * MP "supportHuman" padoma slānis (B daļa). Serveris ir kvotas autoritāte; klients rēķina
 * pašu padomu (D8). Plūsma: `useHint()` → `REQUEST_HINT` → serveris atbild `HINT_GRANTED`
 * (kvota atskaitīta) → lokāli palaiž epic worker (`computeMpHint`) → izgaismo ieteikto kauliņu.
 *
 * Korektuma sargi:
 *  - **D9 idempotence:** atbildi pieņem tikai, ja tās `requestId` sakrīt ar pēdējo pieprasījumu.
 *  - **D11 atcelšana:** izgaismojumu pielieto tikai, ja `turnId` kopš granta NAV mainījies;
 *    ieteikumu notīra pie turna/raunda maiņas (worker var atgriezties par vecu pozīciju).
 *  - Kvotu atiestata katrā jaunā raundā (atspoguļo servera efemēro reset).
 */
export function useMpHint(params: UseMpHintParams): MpHint {
  const { snapshot, turnId, currentRound, isViewerMoveTurn, owned, requestHint, registerHintResponse } =
    params;

  const [hintsRemaining, setHintsRemaining] = useState(HINTS_PER_ROUND);
  const [hintComputing, setHintComputing] = useState(false);
  const [recommended, setRecommended] = useState<{
    readonly tileKey: string;
    readonly declaredNumber: number | undefined;
  } | null>(null);

  // Jaunākās vērtības async atbildes/klikšķa apstrādei (bez stale closures).
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const turnIdRef = useRef(turnId);
  turnIdRef.current = turnId;
  const requestHintRef = useRef(requestHint);
  requestHintRef.current = requestHint;
  const gateRef = useRef({ owned, isViewerMoveTurn, hintsRemaining });
  gateRef.current = { owned, isViewerMoveTurn, hintsRemaining };
  /** Pēdējais gaidošais pieprasījums (korelācijai; tikai jaunākais tiek pieņemts). */
  const pendingRef = useRef<{ readonly requestId: string; readonly turnId: string | undefined } | null>(
    null
  );
  /**
   * Sinhrons "pieprasījums ceļā" sargs (klikšķis → atbilde → aprēķins). Vajadzīgs, jo
   * `hintComputing` state parādās refā tikai NĀKAMAJĀ renderī — bez šī divi ātri klikšķi
   * tajā pašā tickā abi izietu cauri un sadedzinātu DIVAS kvotas (serveris atskaita abas).
   */
  const inFlightRef = useRef(false);

  // Kvota atjaunojas katrā raundā (serveris to atiestata efemēri); notīra ieteikumu + ceļā-sargu.
  useEffect(() => {
    setHintsRemaining(HINTS_PER_ROUND);
    setRecommended(null);
    setHintComputing(false);
    pendingRef.current = null;
    inFlightRef.current = false;
  }, [currentRound]);

  // D11: turna maiņa → ieteikums novecojis, notīram; atbrīvojam ceļā-sargu jaunam turnam
  // (pendingRef paliek, lai novēlots grants joprojām sinhronizē skaitītāju; D9 sargā korelāciju).
  useEffect(() => {
    setRecommended(null);
    inFlightRef.current = false;
  }, [turnId]);

  const handleResponse = useCallback((event: HintGrantedEvent | HintDeniedEvent) => {
    const pending = pendingRef.current;
    if (!pending || pending.requestId !== event.requestId) return; // D9: tikai jaunākā pieprasījuma atbilde

    if (event.type === "HINT_DENIED") {
      // Tikai kvotas izsmelšana atspoguļojas skaitītājā; citi iemesli (svešs turns / nepieder)
      // ir pārejoši — skaitītāju nemainām, tikai apturam ielādi.
      if (event.reason === "no_quota") setHintsRemaining(0);
      setHintComputing(false);
      pendingRef.current = null;
      inFlightRef.current = false;
      return;
    }

    // HINT_GRANTED: serveris atskaitīja kvotu → sinhronizējam skaitītāju un rēķinam lokāli.
    setHintsRemaining(event.hintsRemaining);
    const grantTurnId = pending.turnId;
    pendingRef.current = null;
    const snap = snapshotRef.current;
    if (!snap) {
      setHintComputing(false);
      inFlightRef.current = false;
      return;
    }
    void computeMpHint(snap)
      .then((move) => {
        inFlightRef.current = false;
        if (turnIdRef.current !== grantTurnId) {
          setHintComputing(false); // D11: turns nomainījies, kamēr rēķināja → izmetam
          return;
        }
        setRecommended({ tileKey: tileKey(move.tile), declaredNumber: move.declaredNumber });
        setHintComputing(false);
      })
      .catch(() => {
        inFlightRef.current = false;
        setHintComputing(false);
      });
  }, []);

  useEffect(() => {
    registerHintResponse(handleResponse);
    return () => registerHintResponse(undefined);
  }, [registerHintResponse, handleResponse]);

  const useHint = useCallback(() => {
    const gate = gateRef.current;
    // `inFlightRef` ir SINHRONS sargs (state atjaunojas tikai nākamajā renderī) — novērš
    // dubultu kvotas tēriņu no diviem klikšķiem vienā tickā.
    if (inFlightRef.current || !gate.owned || !gate.isViewerMoveTurn || gate.hintsRemaining <= 0) {
      return;
    }
    const requestId = requestHintRef.current();
    if (requestId === undefined) return;
    inFlightRef.current = true;
    pendingRef.current = { requestId, turnId: turnIdRef.current };
    setRecommended(null);
    setHintComputing(true);
  }, []);

  return {
    hintsRemaining,
    hintComputing,
    recommendedTileKey: recommended?.tileKey ?? null,
    recommendedDeclaredNumber: recommended?.declaredNumber,
    hintEnabled: isViewerMoveTurn && hintsRemaining > 0 && !hintComputing,
    useHint
  };
}
