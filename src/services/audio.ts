export type AudioCue = 'select' | 'confirm' | 'turn' | 'arrow' | 'charge' | 'rally' | 'victory' | 'defeat';
export type Ambience = 'menu' | 'castle' | 'council' | 'map' | 'battle' | 'none';

export type AudioSettings = { muted: boolean; ambience: number; effects: number };

const STORAGE_KEY = 'game-of-cat-audio-v1';
const defaults: AudioSettings = { muted: true, ambience: 0.32, effects: 0.55 };

export function loadAudioSettings(): AudioSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return parsed && typeof parsed.muted === 'boolean' ? { ...defaults, ...parsed } : defaults;
  } catch { return defaults; }
}

class GameAudio {
  private context?: AudioContext;
  private ambienceGain?: GainNode;
  private ambienceNodes: AudioNode[] = [];
  private settings = loadAudioSettings();
  private mode: Ambience = 'none';

  setSettings(settings: AudioSettings) {
    this.settings = settings;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    if (this.ambienceGain) this.ambienceGain.gain.setTargetAtTime(settings.muted ? 0 : settings.ambience, this.context!.currentTime, 0.08);
    if (!settings.muted) { void this.ensure(); this.startAmbience(this.mode); }
  }

  private async ensure() {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
    return this.context;
  }

  async startAmbience(mode: Ambience) {
    this.mode = mode;
    if (this.settings.muted || mode === 'none') return this.stopAmbience();
    const context = await this.ensure();
    this.stopAmbience();
    const gain = context.createGain();
    gain.gain.value = this.settings.ambience;
    gain.connect(context.destination);
    this.ambienceGain = gain;

    const low = context.createOscillator();
    const lowGain = context.createGain();
    low.type = mode === 'battle' ? 'sawtooth' : 'sine';
    low.frequency.value = mode === 'battle' ? 48 : mode === 'castle' ? 74 : 58;
    lowGain.gain.value = mode === 'battle' ? 0.035 : 0.018;
    low.connect(lowGain).connect(gain); low.start();

    const length = context.sampleRate * 2;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (0.3 + Math.sin(i / 9000) * 0.15);
    const noise = context.createBufferSource(); noise.buffer = buffer; noise.loop = true;
    const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = mode === 'battle' ? 520 : 280;
    const noiseGain = context.createGain(); noiseGain.gain.value = mode === 'battle' ? 0.05 : 0.025;
    noise.connect(filter).connect(noiseGain).connect(gain); noise.start();
    this.ambienceNodes = [low, noise, lowGain, noiseGain, filter, gain];
  }

  stopAmbience() {
    this.ambienceNodes.forEach((node) => { try { if ('stop' in node) (node as AudioScheduledSourceNode).stop(); node.disconnect(); } catch { /* already stopped */ } });
    this.ambienceNodes = [];
    this.ambienceGain = undefined;
  }

  async cue(cue: AudioCue) {
    if (this.settings.muted) return;
    const context = await this.ensure();
    const frequencies: Record<AudioCue, [number, number]> = {
      select: [280, 220], confirm: [330, 440], turn: [165, 247], arrow: [920, 520], charge: [92, 64], rally: [220, 440], victory: [262, 523], defeat: [196, 98],
    };
    const [start, end] = frequencies[cue];
    const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.type = cue === 'arrow' ? 'sine' : cue === 'charge' ? 'sawtooth' : 'triangle';
    oscillator.frequency.setValueAtTime(start, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(end, context.currentTime + 0.18);
    gain.gain.setValueAtTime(Math.max(0.001, this.settings.effects * 0.12), context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + (cue === 'victory' ? 0.7 : 0.22));
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + (cue === 'victory' ? 0.72 : 0.24));
  }
}

export const gameAudio = new GameAudio();
