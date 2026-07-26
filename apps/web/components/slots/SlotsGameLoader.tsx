"use client";

import dynamic from "next/dynamic";

import type { SlotsGameProps } from "./SlotsGame";

/**
 * Domino Slots ielādes robeža.
 *
 * `ssr: false` ir OBLIGĀTS: `GameApp` aiztiek `window`, `document` un `ResizeObserver`
 * jau montāžas brīdī. Vienlīdz svarīgi — dinamiskais imports notur PixiJS (~376 KiB)
 * ārpus lobija sākotnējā bundle; kopā ar 4,5 MiB grafiku tas citādi apgrūtinātu ielādi
 * arī tiem, kas slotus nekad neatver.
 *
 * `next/dynamic` ar `ssr: false` drīkst dzīvot tikai Client Component iekšienē, tāpēc
 * šis fails ir atsevišķa robeža, nevis daļa no dialoga.
 */
const SlotsGame = dynamic(() => import("./SlotsGame"), {
  ssr: false,
  loading: () => <div className="slotsGameLoading">Loading…</div>
});

export default function SlotsGameLoader(props: SlotsGameProps): React.JSX.Element {
  return <SlotsGame {...props} />;
}
