import type { AudioSettings } from "../lib/useAudioSettings";
import type { AppStrings } from "../lib/i18n";

export function AudioControls({
  audio,
  labels
}: {
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
}) {
  return (
    <div className="audioControls">
      <label>
        <span><VolumeIcon /> {labels.allSounds}</span>
        <input type="checkbox" checked={!audio.isMuted} onChange={audio.toggleMute} />
      </label>
      <label>
        <span><MusicIcon /> {labels.backgroundMusic}</span>
        <input
          type="checkbox"
          checked={audio.isMusicEnabled && !audio.isMuted}
          disabled={audio.isMuted}
          onChange={audio.toggleMusic}
        />
      </label>
      <label className="sliderLabel">
        <span>{labels.music}: {Math.round(audio.musicVolume * 100)}%</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={audio.musicVolume}
          disabled={audio.isMuted || !audio.isMusicEnabled}
          onChange={(event) => audio.setMusicVolume(Number(event.target.value))}
        />
      </label>
      <label className="sliderLabel">
        <span><VolumeIcon /> {labels.effects}: {Math.round(audio.effectsVolume * 100)}%</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={audio.effectsVolume}
          disabled={audio.isMuted}
          onChange={(event) => audio.setEffectsVolume(Number(event.target.value))}
        />
      </label>
    </div>
  );
}

export function VolumeIcon() {
  return (
    <svg className="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}

export function VolumeOffIcon() {
  return (
    <svg className="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="m17 9 4 4" />
      <path d="m21 9-4 4" />
    </svg>
  );
}

function MusicIcon() {
  return (
    <svg className="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  );
}
