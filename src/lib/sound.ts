const SOUND_KEY = 'os-flow:sound-enabled';

export function isSoundEnabled(): boolean {
  try {
    const raw = localStorage.getItem(SOUND_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, String(enabled));
  } catch {
    // ignore storage errors
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  return new Ctor();
}

export function playBeep(kind: 'dispatch' | 'urgent' | 'complete' = 'dispatch'): void {
  if (!isSoundEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    const playTone = (startAt: number, freqStart: number, freqEnd: number, duration: number, type: OscillatorType = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, startAt);
      osc.frequency.exponentialRampToValueAtTime(freqEnd, startAt + duration * 0.7);
      gain.gain.setValueAtTime(0.14, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + duration);
    };

    if (kind === 'urgent') {
      playTone(now, 880, 1320, 0.16, 'triangle');
      playTone(now + 0.2, 880, 1760, 0.2, 'triangle');
    } else if (kind === 'complete') {
      playTone(now, 660, 990, 0.14, 'sine');
      playTone(now + 0.12, 990, 1480, 0.22, 'sine');
    } else {
      playTone(now, 740, 1046, 0.18, 'sine');
    }
  } catch {
    // AudioContext may be blocked before first user gesture
  }
}
