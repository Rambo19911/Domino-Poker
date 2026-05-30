"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readLocalStorage, writeLocalStorage } from "./safeStorage";

const audioPaths = {
  tilePlaced: "/assets/sounds/tile_placed.mp3",
  bidClick: "/assets/sounds/bid_click.mp3",
  trickComplete: "/assets/sounds/trick_complete.mp3",
  roundWin: "/assets/sounds/round_win.mp3",
  uiClick: "/assets/sounds/mixkit-typewriter-soft-click.wav",
  backgroundMusic: "/assets/sounds/background_music.mp3"
} as const;

type EffectName = keyof Omit<typeof audioPaths, "backgroundMusic">;
type EffectPools = Partial<Record<EffectName, HTMLAudioElement[]>>;

const effectNames = [
  "tilePlaced",
  "bidClick",
  "trickComplete",
  "roundWin",
  "uiClick"
] as const satisfies readonly EffectName[];
const effectPoolSize = 3;

export function useAudioSettings() {
  const [isMuted, setIsMuted] = useStoredBoolean("domino-poker-muted", false);
  const [isMusicEnabled, setIsMusicEnabled] = useStoredBoolean(
    "domino-poker-music-enabled",
    true
  );
  const [effectsVolume, setEffectsVolume] = useStoredNumber(
    "domino-poker-effects-volume",
    0.7
  );
  const [musicVolume, setMusicVolume] = useStoredNumber("domino-poker-music-volume", 0.5);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const effectPoolsRef = useRef<EffectPools>({});
  const effectPoolCursorRef = useRef<Partial<Record<EffectName, number>>>({});

  useEffect(() => {
    const audio = new Audio(audioPaths.backgroundMusic);
    audio.loop = true;
    audio.volume = isMuted ? 0 : musicVolume;
    musicRef.current = audio;
    return () => {
      audio.pause();
      musicRef.current = null;
    };
  }, []);

  useEffect(() => {
    effectPoolsRef.current = createEffectPools();
    return () => {
      for (const pool of Object.values(effectPoolsRef.current)) {
        for (const audio of pool ?? []) {
          audio.pause();
          audio.currentTime = 0;
        }
      }
      effectPoolsRef.current = {};
      effectPoolCursorRef.current = {};
    };
  }, []);

  useEffect(() => {
    const audio = musicRef.current;
    if (!audio) return;
    audio.volume = isMuted ? 0 : musicVolume;
    if (!isMuted && isMusicEnabled) {
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [isMuted, isMusicEnabled, musicVolume]);

  const play = useCallback(
    (name: EffectName) => {
      if (isMuted) return;
      const pool =
        effectPoolsRef.current[name] ??
        (effectPoolsRef.current[name] = createEffectPool(name));
      const cursor = effectPoolCursorRef.current[name] ?? 0;
      const audio = pool[cursor % pool.length];
      if (!audio) return;
      effectPoolCursorRef.current[name] = cursor + 1;
      audio.pause();
      audio.currentTime = 0;
      audio.volume = effectsVolume;
      void audio.play().catch(() => undefined);
    },
    [effectsVolume, isMuted]
  );

  return useMemo(
    () => ({
      isMuted,
      isMusicEnabled,
      effectsVolume,
      musicVolume,
      setEffectsVolume,
      setMusicVolume,
      toggleMute: () => setIsMuted((value) => !value),
      toggleMusic: () => setIsMusicEnabled((value) => !value),
      play
    }),
    [
      effectsVolume,
      isMuted,
      isMusicEnabled,
      musicVolume,
      play,
      setEffectsVolume,
      setIsMuted,
      setIsMusicEnabled,
      setMusicVolume
    ]
  );
}

export type AudioSettings = ReturnType<typeof useAudioSettings>;

function createEffectPools(): EffectPools {
  return Object.fromEntries(
    effectNames.map((name) => [name, createEffectPool(name)])
  ) as EffectPools;
}

function createEffectPool(name: EffectName): HTMLAudioElement[] {
  return Array.from({ length: effectPoolSize }, () => {
    const audio = new Audio(audioPaths[name]);
    audio.preload = "auto";
    return audio;
  });
}

function useStoredBoolean(key: string, defaultValue: boolean) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const stored = readLocalStorage(key);
    if (stored === "true" || stored === "false") {
      setValue(stored === "true");
    }
  }, [key]);

  const update = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      setValue((current) => {
        const resolved = typeof next === "function" ? next(current) : next;
        writeLocalStorage(key, String(resolved));
        return resolved;
      });
    },
    [key]
  );

  return [value, update] as const;
}

function useStoredNumber(key: string, defaultValue: number) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const stored = readLocalStorage(key);
    if (stored !== null) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed)) setValue(clampVolume(parsed));
    }
  }, [key]);

  const update = useCallback(
    (next: number | ((current: number) => number)) => {
      setValue((current) => {
        const resolved = typeof next === "function" ? next(current) : next;
        const clamped = clampVolume(resolved);
        writeLocalStorage(key, String(clamped));
        return clamped;
      });
    },
    [key]
  );

  return [value, update] as const;
}

function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}
