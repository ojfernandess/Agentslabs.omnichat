import { useCallback, useRef } from 'react';

const STORAGE_KEY = 'agentslabs_sound_enabled';
const STORAGE_TONE = 'agentslabs_sound_tone';

export type SoundTone = 'ding' | 'chime' | 'bell' | 'soft' | 'pop' | 'notification' | 'alert';

const TONE_PRESETS: Record<
  SoundTone,
  { freq: number; freqEnd?: number; type: OscillatorType; gain: number; duration: number }
> = {
  ding: { freq: 880, freqEnd: 1100, type: 'sine', gain: 0.15, duration: 0.2 },
  chime: { freq: 523, freqEnd: 659, type: 'sine', gain: 0.12, duration: 0.25 },
  bell: { freq: 440, freqEnd: 880, type: 'sine', gain: 0.1, duration: 0.35 },
  soft: { freq: 660, type: 'sine', gain: 0.08, duration: 0.15 },
  pop: { freq: 800, type: 'square', gain: 0.06, duration: 0.1 },
  notification: { freq: 587, freqEnd: 784, type: 'sine', gain: 0.12, duration: 0.2 },
  alert: { freq: 880, freqEnd: 1760, type: 'sine', gain: 0.18, duration: 0.15 },
};

function playTone(tone: SoundTone) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const preset = TONE_PRESETS[tone] ?? TONE_PRESETS.ding;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(preset.freq, ctx.currentTime);
    if (preset.freqEnd) {
      osc.frequency.exponentialRampToValueAtTime(preset.freqEnd, ctx.currentTime + 0.05);
    }
    osc.type = preset.type;
    gain.gain.setValueAtTime(preset.gain, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + preset.duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + preset.duration);
  } catch {
    /* browser not supported */
  }
}

export function useNotificationSound() {
  const audioContextRef = useRef<AudioContext | null>(null);

  const isEnabled = (): boolean => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v !== 'false';
    } catch {
      return true;
    }
  };

  const getTone = (): SoundTone => {
    try {
      const v = localStorage.getItem(STORAGE_TONE);
      if (v && Object.keys(TONE_PRESETS).includes(v)) return v as SoundTone;
    } catch {}
    return 'ding';
  };

  const setTone = useCallback((tone: SoundTone) => {
    try {
      localStorage.setItem(STORAGE_TONE, tone);
    } catch {}
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {}
  }, []);

  const play = useCallback(() => {
    if (!isEnabled()) return;
    playTone(getTone());
  }, []);

  /** Reproduz o som atual (ignorando se está desativado). Para pré-visualização nas definições. */
  const playPreview = useCallback(() => {
    playTone(getTone());
  }, []);

  return { play, playPreview, isEnabled, setEnabled, getTone, setTone };
}

export { TONE_PRESETS };
export const SOUND_TONE_OPTIONS: { value: SoundTone; label: string }[] = [
  { value: 'ding', label: 'Ding' },
  { value: 'chime', label: 'Chime' },
  { value: 'bell', label: 'Bell' },
  { value: 'soft', label: 'Soft' },
  { value: 'pop', label: 'Pop' },
  { value: 'notification', label: 'Notification' },
  { value: 'alert', label: 'Alert' },
];
