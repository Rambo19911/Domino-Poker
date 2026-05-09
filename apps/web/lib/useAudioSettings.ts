"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const audioPaths = {
  tilePlaced: "/assets/sounds/tile_placed.mp3",
  bidClick: "/assets/sounds/bid_click.mp3",
  trickComplete: "/assets/sounds/trick_complete.mp3",
  roundWin: "/assets/sounds/round_win.mp3",
  uiClick: "/assets/sounds/mixkit-typewriter-soft-click.wav",
  backgroundMusic: "/assets/sounds/background_music.mp3"
} as const;

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
    (name: keyof Omit<typeof audioPaths, "backgroundMusic">) => {
      if (isMuted) return;
      const audio = new Audio(audioPaths[name]);
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

function useStoredBoolean(key: string, defaultValue: boolean) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) {
      setValue(stored === "true");
    }
  }, [key]);

  const update = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      setValue((current) => {
        const resolved = typeof next === "function" ? next(current) : next;
        window.localStorage.setItem(key, String(resolved));
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
    const stored = window.localStorage.getItem(key);
    if (stored !== null) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed)) setValue(parsed);
    }
  }, [key]);

  const update = useCallback(
    (next: number | ((current: number) => number)) => {
      setValue((current) => {
        const resolved = typeof next === "function" ? next(current) : next;
        const clamped = Math.max(0, Math.min(1, resolved));
        window.localStorage.setItem(key, String(clamped));
        return clamped;
      });
    },
    [key]
  );

  return [value, update] as const;
}
