import { playSfx, type SfxCue } from './sfx';

export type AudioCue = SfxCue;
export type Ambience = 'menu' | 'castle' | 'council' | 'map' | 'battle' | 'none';

export type AudioSettings = { muted: boolean; musicEnabled: boolean; ambience: number; effects: number };

const STORAGE_KEY = 'game-of-cat-audio-v1';
const defaults: AudioSettings = { muted: false, musicEnabled: true, ambience: 0.32, effects: 0.55 };

export function loadAudioSettings(): AudioSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return parsed && typeof parsed.muted === 'boolean' ? {
      muted: parsed.muted,
      musicEnabled: typeof parsed.musicEnabled === 'boolean' ? parsed.musicEnabled : defaults.musicEnabled,
      ambience: typeof parsed.ambience === 'number' ? parsed.ambience : defaults.ambience,
      effects: typeof parsed.effects === 'number' ? parsed.effects : defaults.effects,
    } : defaults;
  } catch { return defaults; }
}

class GameAudio {
  private context?: AudioContext;
  private ambienceGain?: GainNode;
  private ambienceNodes: AudioNode[] = [];
  private music?: HTMLAudioElement;
  private musicStartPending = false;
  private settings = loadAudioSettings();
  private mode: Ambience = 'none';

  setSettings(settings: AudioSettings) {
    this.settings = settings;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    if (settings.muted || !settings.musicEnabled) this.stopMusic();
    else void this.startMusic();
    if (this.ambienceGain) this.ambienceGain.gain.setTargetAtTime(settings.muted ? 0 : settings.ambience, this.context!.currentTime, 0.08);
    if (!settings.muted && this.mode !== 'none' && !this.ambienceGain) void this.ensure().then(() => this.startAmbience(this.mode));
  }

  private async ensure() {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
    return this.context;
  }

  async startMusic() {
    if (this.settings.muted || !this.settings.musicEnabled) return;
    const music = this.music ??= this.createMusicElement();
    music.loop = true;
    music.volume = 0.45;
    if (!music.paused || this.musicStartPending) return;
    this.musicStartPending = true;
    try { await music.play(); }
    catch { /* Browsers wait for a user gesture before playing media. */ }
    finally { this.musicStartPending = false; }
  }

  stopMusic() {
    this.music?.pause();
  }

  private createMusicElement() {
    const music = document.createElement('audio');
    music.dataset.testid = 'background-music';
    music.src = '/assets/audio/game-of-cat-theme.mp3';
    music.preload = 'auto';
    music.hidden = true;
    document.body.append(music);
    return music;
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
    try { playSfx(await this.ensure(), cue, this.settings.effects); }
    catch { /* Audio is optional; a blocked or unavailable context must never break play. */ }
  }
}

export const gameAudio = new GameAudio();
