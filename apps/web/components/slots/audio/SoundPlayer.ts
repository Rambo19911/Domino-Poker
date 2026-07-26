/** Named game sound effects backed by the files in public/assets/slots/sounds. */
export type SoundName = 'spin' | 'payout' | 'bigWin';

const SOUND_URLS: Readonly<Record<SoundName, string>> = {
  /** Every accepted SPIN press. */
  spin: '/assets/slots/sounds/Coin_spend.mp3',
  /** Any settled win (totalWin > 0), together with the count-up. */
  payout: '/assets/slots/sounds/jackpot-payout.mp3',
  /** HUGE WIN / MEGA WIN / JACKPOT overlay panels. */
  bigWin: '/assets/slots/sounds/you-win-sequence.mp3',
};

const CLICK_DURATION_S = 0.06;
const CLICK_FREQUENCY_HZ = 1800;
const CLICK_GAIN = 0.12;

/**
 * Globālie skaņas iestatījumi no DominoPoker `useAudioSettings`. Slots negrib savu
 * atsevišķu mute pogu — tas respektē to pašu izvēli, ko visa pārējā lietotne.
 */
export interface SoundSettings {
  readonly muted: boolean;
  /** 0..1 efektu skaļums. */
  readonly volume: number;
}

/**
 * Plays the game sound effects over one shared Web Audio context. Sounds are
 * purely decorative (plan section 18 spirit): a missing file, a decode error
 * or a suspended context must never affect the game flow, so every failure is
 * contained here. The context starts suspended under browser autoplay policy
 * and is resumed on play; the first plays all happen inside user gestures
 * (button presses), which is exactly when resume() is allowed.
 */
export class SoundPlayer {
  private context: AudioContext | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private readonly getSettings: () => SoundSettings;

  /**
   * `getSettings` tiek lasīts pie KATRAS atskaņošanas, nevis saglabāts konstruktorā,
   * lai lietotāja mute/skaļuma maiņa lobija iestatījumos iedarbotos uzreiz, arī
   * kamēr spēle jau ir atvērta.
   */
  constructor(getSettings: () => SoundSettings = () => ({ muted: false, volume: 1 })) {
    this.getSettings = getSettings;
  }

  /** Fetches and decodes every effect; failures only log (non-blocking). */
  preload(): void {
    const context = this.ensureContext();
    if (context === null) return;
    for (const [name, url] of Object.entries(SOUND_URLS) as [SoundName, string][]) {
      void fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
          return response.arrayBuffer();
        })
        .then((data) => context.decodeAudioData(data))
        .then((buffer) => this.buffers.set(name, buffer))
        .catch((error: unknown) => console.error(`Sound ${name} failed to load`, error));
    }
  }

  /** Plays a loaded effect; silently a no-op until its buffer is ready. */
  play(name: SoundName): void {
    const buffer = this.buffers.get(name);
    if (buffer === undefined) return;
    const { muted, volume } = this.getSettings();
    if (muted || volume <= 0) return;
    this.whenRunning((context) => {
      try {
        const source = context.createBufferSource();
        source.buffer = buffer;
        const gain = context.createGain();
        gain.gain.value = Math.min(1, Math.max(0, volume));
        source.connect(gain).connect(context.destination);
        source.start();
      } catch (error) {
        console.error(`Sound ${name} failed to play`, error);
      }
    });
  }

  /** Short synthesized UI click for the non-Spin buttons (no asset needed). */
  click(): void {
    const { muted, volume } = this.getSettings();
    if (muted || volume <= 0) return;
    this.whenRunning((context) => {
      try {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const now = context.currentTime;
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(CLICK_FREQUENCY_HZ, now);
        gain.gain.setValueAtTime(CLICK_GAIN * Math.min(1, Math.max(0, volume)), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + CLICK_DURATION_S);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + CLICK_DURATION_S);
      } catch (error) {
        console.error('Click sound failed to play', error);
      }
    });
  }

  private ensureContext(): AudioContext | null {
    if (this.context !== null) return this.context;
    try {
      this.context = new AudioContext();
    } catch (error) {
      // No Web Audio support: the game simply stays silent.
      console.error('Web Audio is unavailable; sounds disabled', error);
    }
    return this.context;
  }

  /**
   * Runs the callback only on a running context so nothing is scheduled while
   * suspended (a queued sound would fire late, all at once, on a later
   * resume). Calls from user gestures resume within the same gesture, so the
   * sound still plays immediately.
   */
  /** Aizver audio kontekstu; dialogs tiek atvērts atkārtoti, konteksti nedrīkst krāties. */
  destroy(): void {
    const context = this.context;
    this.context = null;
    this.buffers.clear();
    if (context !== null) {
      void context.close().catch((error: unknown) => {
        console.error('Audio context close failed', error);
      });
    }
  }

  private whenRunning(playback: (context: AudioContext) => void): void {
    const context = this.ensureContext();
    if (context === null) return;
    if (context.state !== 'suspended') {
      playback(context);
      return;
    }
    void context.resume().then(
      () => playback(context),
      (error: unknown) => console.error('Audio context resume failed', error),
    );
  }
}
