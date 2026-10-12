/* Original Web Audio sound effects, synthesized at play time so the game ships no effect files.
   Every cue is built from short tones and filtered noise bursts routed through one compressed bus. */

export type SfxCue =
  | 'select' | 'confirm' | 'error' | 'turn' | 'coin' | 'build' | 'scroll' | 'evidence' | 'march' | 'meow' | 'rewind' | 'toll'
  | 'drums' | 'horn' | 'clash' | 'hit' | 'arrow' | 'charge' | 'fall' | 'rout' | 'rally' | 'order' | 'victory' | 'defeat';

/** Minimum gap between repeats of one cue, so a busy combat tick does not stack into noise. */
const throttleMs: Partial<Record<SfxCue, number>> = { clash: 110, hit: 110, arrow: 160, fall: 200, rout: 300, select: 40, turn: 400, coin: 120, build: 250, scroll: 250, march: 300, order: 60 };

type Bus = { context: AudioContext; input: GainNode; noise: AudioBuffer };
let bus: Bus | undefined;
const lastPlayed = new Map<SfxCue, number>();

function getBus(context: AudioContext): Bus {
  if (bus?.context === context) return bus;
  const input = context.createGain();
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -18; compressor.knee.value = 12; compressor.ratio.value = 5; compressor.attack.value = 0.003; compressor.release.value = 0.2;
  input.connect(compressor).connect(context.destination);
  const noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  bus = { context, input, noise };
  return bus;
}

type ToneOptions = { type?: OscillatorType; to?: number; attack?: number; vibrato?: number; filter?: number };
function tone(b: Bus, frequency: number, start: number, duration: number, volume: number, options: ToneOptions = {}) {
  const { context } = b;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = options.type ?? 'sine';
  oscillator.frequency.setValueAtTime(frequency, start);
  if (options.to) oscillator.frequency.exponentialRampToValueAtTime(options.to, start + duration);
  if (options.vibrato) {
    const lfo = context.createOscillator(); const depth = context.createGain();
    lfo.frequency.value = 5.5; depth.gain.value = options.vibrato;
    lfo.connect(depth).connect(oscillator.frequency); lfo.start(start); lfo.stop(start + duration + 0.05);
  }
  const attack = options.attack ?? 0.005;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  let node: AudioNode = oscillator.connect(gain);
  if (options.filter) { const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = options.filter; node = node.connect(filter); }
  node.connect(b.input);
  oscillator.start(start); oscillator.stop(start + duration + 0.05);
}

type NoiseOptions = { filter?: BiquadFilterType; frequency?: number; to?: number; q?: number; attack?: number };
function noise(b: Bus, start: number, duration: number, volume: number, options: NoiseOptions = {}) {
  const { context } = b;
  const source = context.createBufferSource();
  source.buffer = b.noise;
  source.playbackRate.value = 0.8 + Math.random() * 0.4;
  const filter = context.createBiquadFilter();
  filter.type = options.filter ?? 'bandpass';
  filter.frequency.setValueAtTime(options.frequency ?? 1200, start);
  if (options.to) filter.frequency.exponentialRampToValueAtTime(options.to, start + duration);
  filter.Q.value = options.q ?? 1;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + (options.attack ?? 0.004));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(b.input);
  source.start(start, Math.random() * 0.5); source.stop(start + duration + 0.05);
}

const thump = (b: Bus, at: number, volume: number, pitch = 70) => { tone(b, pitch, at, 0.16, volume, { to: pitch * 0.55 }); noise(b, at, 0.08, volume * 0.5, { filter: 'lowpass', frequency: 320 }); };
const horn = (b: Bus, at: number, notes: [number, number][], volume: number) => {
  let t = at;
  for (const [frequency, length] of notes) {
    tone(b, frequency, t, length, volume, { type: 'sawtooth', attack: 0.06, vibrato: 3, filter: 1100 });
    tone(b, frequency * 1.005, t, length, volume * 0.5, { type: 'sawtooth', attack: 0.08, filter: 800 });
    t += length * 0.92;
  }
};
const chord = (b: Bus, at: number, frequencies: number[], length: number, volume: number, type: OscillatorType = 'triangle') => frequencies.forEach((frequency) => tone(b, frequency, at, length, volume, { type, attack: 0.02, filter: 2600 }));

const recipes: Record<SfxCue, (b: Bus, t: number) => void> = {
  select: (b, t) => tone(b, 720, t, 0.07, 0.12, { type: 'triangle', to: 560 }),
  order: (b, t) => { tone(b, 520, t, 0.08, 0.13, { type: 'square', filter: 1800 }); tone(b, 780, t + 0.06, 0.1, 0.1, { type: 'square', filter: 1800 }); },
  confirm: (b, t) => { tone(b, 523, t, 0.14, 0.16, { type: 'triangle' }); tone(b, 784, t + 0.09, 0.22, 0.16, { type: 'triangle' }); },
  error: (b, t) => { tone(b, 150, t, 0.12, 0.16, { type: 'square', filter: 700 }); tone(b, 120, t + 0.13, 0.16, 0.16, { type: 'square', filter: 700 }); },
  coin: (b, t) => { tone(b, 1318, t, 0.22, 0.12); tone(b, 1760, t + 0.07, 0.3, 0.12); tone(b, 2637, t + 0.07, 0.18, 0.04); },
  build: (b, t) => { for (const at of [0, 0.17, 0.34]) { noise(b, t + at, 0.07, 0.35, { frequency: 1600, q: 3 }); tone(b, 210, t + at, 0.1, 0.12, { type: 'square', to: 160, filter: 1200 }); } },
  scroll: (b, t) => { noise(b, t, 0.32, 0.22, { frequency: 2200, to: 1400, q: 0.8, attack: 0.05 }); noise(b, t + 0.12, 0.2, 0.12, { frequency: 3200, q: 0.8 }); },
  evidence: (b, t) => { [784, 988, 1175, 1568].forEach((frequency, i) => tone(b, frequency, t + i * 0.08, 0.9, 0.09)); noise(b, t, 0.6, 0.05, { filter: 'highpass', frequency: 6000 }); },
  march: (b, t) => { for (let i = 0; i < 6; i += 1) noise(b, t + i * 0.16, 0.07, 0.25, { filter: 'lowpass', frequency: 260 + (i % 2) * 60 }); },
  turn: (b, t) => [0.5, 1, 1.19, 1.5, 2, 2.74].forEach((ratio, i) => tone(b, 330 * ratio, t, 2.4 - i * 0.25, 0.11 / (i + 1), { attack: 0.003 })),
  toll: (b, t) => { [0.5, 1, 1.2, 2].forEach((ratio, i) => tone(b, 147 * ratio, t, 3 - i * 0.4, 0.16 / (i + 1))); tone(b, 73, t, 3, 0.08, { type: 'triangle' }); },
  rewind: (b, t) => { noise(b, t, 0.9, 0.22, { frequency: 300, to: 5000, q: 2, attack: 0.5 }); [1568, 1175, 988, 784].forEach((frequency, i) => tone(b, frequency, t + 0.55 + i * 0.07, 0.6, 0.07)); },
  meow: (b, t) => {
    const { context } = b; const oscillator = context.createOscillator(); const formant = context.createBiquadFilter(); const gain = context.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(520, t); oscillator.frequency.linearRampToValueAtTime(820, t + 0.16); oscillator.frequency.exponentialRampToValueAtTime(430, t + 0.5);
    formant.type = 'bandpass'; formant.Q.value = 3; formant.frequency.setValueAtTime(900, t); formant.frequency.linearRampToValueAtTime(1700, t + 0.18); formant.frequency.linearRampToValueAtTime(800, t + 0.5);
    gain.gain.setValueAtTime(0.0001, t); gain.gain.linearRampToValueAtTime(0.32, t + 0.05); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    oscillator.connect(formant).connect(gain).connect(b.input); oscillator.start(t); oscillator.stop(t + 0.6);
  },
  drums: (b, t) => { [0, 0.32, 0.64, 0.8, 1.12].forEach((at, i) => thump(b, t + at, i === 4 ? 0.6 : 0.42, i % 2 ? 62 : 54)); },
  horn: (b, t) => horn(b, t, [[110, 0.55], [165, 1.1]], 0.1),
  clash: (b, t) => {
    noise(b, t, 0.09, 0.45, { filter: 'highpass', frequency: 2400 });
    [1240, 1873, 2731].forEach((frequency) => tone(b, frequency * (0.97 + Math.random() * 0.06), t, 0.35, 0.035, { type: 'triangle' }));
    tone(b, 130, t, 0.08, 0.15, { to: 70 });
  },
  hit: (b, t) => { noise(b, t, 0.07, 0.3, { frequency: 700, q: 1.5 }); tone(b, 95, t, 0.12, 0.18, { to: 50 }); },
  arrow: (b, t) => { noise(b, t, 0.26, 0.2, { frequency: 3600, to: 900, q: 4, attack: 0.03 }); tone(b, 190, t + 0.27, 0.07, 0.14, { to: 80 }); noise(b, t + 0.27, 0.05, 0.18, { filter: 'lowpass', frequency: 900 }); },
  charge: (b, t) => { for (let i = 0; i < 7; i += 1) thump(b, t + i * 0.085, 0.32 + i * 0.03, 64 + (i % 2) * 10); horn(b, t + 0.1, [[147, 0.45], [196, 0.5]], 0.08); },
  fall: (b, t) => { thump(b, t, 0.55, 80); noise(b, t + 0.03, 0.35, 0.2, { filter: 'lowpass', frequency: 500, to: 150 }); tone(b, 260, t, 0.4, 0.05, { type: 'triangle', to: 120 }); },
  rout: (b, t) => horn(b, t, [[220, 0.35], [196, 0.35], [147, 0.6]], 0.07),
  rally: (b, t) => { horn(b, t, [[196, 0.3], [262, 0.3], [392, 0.7]], 0.1); noise(b, t + 0.35, 1.0, 0.16, { frequency: 1100, q: 0.7, attack: 0.25 }); chord(b, t + 0.9, [392, 494, 587], 0.6, 0.04); },
  victory: (b, t) => {
    [[262, 0], [330, 0.16], [392, 0.32], [523, 0.48]].forEach(([frequency, at]) => tone(b, frequency, t + at, 0.32, 0.11, { type: 'sawtooth', filter: 2200, attack: 0.02 }));
    chord(b, t + 0.7, [523, 659, 784, 1047], 1.4, 0.07, 'sawtooth'); [0.7, 0.86, 1.02].forEach((at) => thump(b, t + at, 0.35, 60));
  },
  defeat: (b, t) => { [[294, 0], [233, 0.4], [196, 0.8], [147, 1.2]].forEach(([frequency, at]) => tone(b, frequency, t + at, 0.6, 0.1, { type: 'triangle', filter: 1400 })); thump(b, t + 1.2, 0.5, 48); },
};

/** Play a cue through the shared effects bus at the given 0–1 volume. */
export function playSfx(context: AudioContext, cue: SfxCue, volume: number) {
  if (volume <= 0) return;
  const now = performance.now();
  const gap = throttleMs[cue] ?? 0;
  if (gap && now - (lastPlayed.get(cue) ?? -Infinity) < gap) return;
  lastPlayed.set(cue, now);
  const b = getBus(context);
  b.input.gain.setValueAtTime(Math.min(1, volume) * 1.6, context.currentTime);
  recipes[cue](b, context.currentTime + 0.01);
}
