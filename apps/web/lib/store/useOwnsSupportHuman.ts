"use client";

import { useEffect, useState } from "react";

import { ownsSupportHuman } from "@domino-poker/shared";

import { apiFetchOwned } from "./storeApi";

/**
 * Vai ielogotais lietotājs pieder "supportHuman" bota palīgam (B daļa; UI vārti padoma
 * pogai). Atvasināts no `/store/owned` (ledger-atvasināts; serveris paliek autoritatīvs —
 * arī bez īpašumtiesībām serveris noraida `REQUEST_HINT` ar `not_owned`). Anonīmam → false.
 * Atspoguļo SP `DominoPokerGame` owned-fetch, lai UI konsekventi rāda/slēpj pogu.
 */
export function useOwnsSupportHuman(
  authToken: string | null | undefined,
  getToken?: () => string | undefined
): boolean {
  const [owns, setOwns] = useState(false);

  useEffect(() => {
    if (authToken === null || authToken === undefined) {
      setOwns(false);
      return;
    }
    const token = getToken?.() ?? authToken;
    if (!token) {
      setOwns(false);
      return;
    }
    // Tokena/lietotāja maiņa: sākam ar `false` (nezināms līdz apstiprinājumam) — citādi
    // iepriekšējā īpašnieka `true` noplūstu jaunam lietotājam, kamēr `/store/owned` vēl nav
    // atbildējis vai atgriež kļūdu. Serveris tik un tā paliek autoritatīvs (noraida `not_owned`).
    setOwns(false);
    let cancelled = false;
    void apiFetchOwned(token).then((result) => {
      if (cancelled || !result.ok) return;
      setOwns(ownsSupportHuman(result.data.owned));
    });
    return () => {
      cancelled = true;
    };
  }, [authToken, getToken]);

  return owns;
}
