/**
 * AudioManager: all sounds are synthesized with WebAudio (no asset downloads),
 * with randomized pitch so repeated sounds don't feel robotic.
 * Categories: music, ui, customer, shop, upgrade, event, ambient — each has its own gain.
 */
export type SfxCategory = 'ui' | 'customer' | 'shop' | 'upgrade' | 'event' | 'ambient';
export type MusicMood = 'normal' | 'rush' | 'celebration' | 'night' | 'menu';

export type SfxName =
  | 'click'
  | 'coin'
  | 'register'
  | 'upgrade'
  | 'levelup'
  | 'newProduct'
  | 'expansion'
  | 'hammer'
  | 'hire'
  | 'achievement'
  | 'eventStart'
  | 'error'
  | 'pop'
  | 'restock'
  | 'angry'
  | 'crate'
  | 'swoosh';

const CATEGORY: Record<SfxName, SfxCategory> = {
  click: 'ui',
  pop: 'ui',
  swoosh: 'ui',
  error: 'ui',
  coin: 'shop',
  register: 'shop',
  restock: 'shop',
  hammer: 'shop',
  upgrade: 'upgrade',
  levelup: 'upgrade',
  newProduct: 'upgrade',
  expansion: 'upgrade',
  hire: 'upgrade',
  achievement: 'event',
  eventStart: 'event',
  crate: 'event',
  angry: 'customer',
};

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private cats = new Map<SfxCategory, GainNode>();
  private ambientGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  private lastPlay = new Map<SfxName, number>();
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private mood: MusicMood = 'normal';
  private seed = 1;

  sfxEnabled = true;
  musicEnabled = true;
  sfxVolume = 0.8;
  musicVolume = 0.5;

  /** Must be called from a user gesture (browser autoplay rules). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.musicGain = c.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain = c.createGain();
    this.sfxGain.connect(this.master);
    for (const k of ['ui', 'customer', 'shop', 'upgrade', 'event', 'ambient'] as SfxCategory[]) {
      const g = c.createGain();
      g.gain.value = k === 'ambient' ? 0.5 : 1;
      g.connect(this.sfxGain);
      this.cats.set(k, g);
    }
    this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // Ambient crowd murmur: filtered noise whose level follows the number of customers.
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.value = 500;
    lp.Q.value = 0.6;
    this.ambientGain = c.createGain();
    this.ambientGain.gain.value = 0;
    src.connect(lp).connect(this.ambientGain).connect(this.cats.get('ambient')!);
    src.start();
    this.applyVolumes();
    this.startMusic();
  }

  get ready(): boolean {
    return !!this.ctx;
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxGain.gain.setTargetAtTime(this.sfxEnabled ? this.sfxVolume : 0, t, 0.05);
    this.musicGain.gain.setTargetAtTime(this.musicEnabled ? this.musicVolume * 0.35 : 0, t, 0.2);
  }

  setAmbience(customers: number): void {
    if (!this.ctx) return;
    this.ambientGain.gain.setTargetAtTime(Math.min(0.06, customers * 0.004), this.ctx.currentTime, 0.5);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  // ------------------------------------------------------------------- SFX

  private tone(cat: SfxCategory, freq: number, start: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(this.cats.get(cat)!);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  private noise(cat: SfxCategory, start: number, dur: number, vol: number, freq = 2000, type: BiquadFilterType = 'bandpass'): void {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    s.connect(f).connect(g).connect(this.cats.get(cat)!);
    s.start(start, Math.random() * 0.5);
    s.stop(start + dur + 0.02);
  }

  play(name: SfxName): void {
    if (!this.ctx || !this.sfxEnabled || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // Rate-limit identical sounds so busy shops don't become noise.
    const minGap = name === 'coin' ? 0.06 : name === 'register' ? 0.12 : 0.04;
    if (now - (this.lastPlay.get(name) ?? -1) < minGap) return;
    this.lastPlay.set(name, now);
    const cat = CATEGORY[name];
    const v = 0.92 + Math.random() * 0.16; // pitch variation
    const t = now + 0.005;
    switch (name) {
      case 'click':
        this.tone(cat, 900 * v, t, 0.05, 'triangle', 0.15);
        break;
      case 'pop':
        this.tone(cat, 500 * v, t, 0.09, 'sine', 0.25, 900 * v);
        break;
      case 'swoosh':
        this.noise(cat, t, 0.18, 0.15, 1200, 'highpass');
        break;
      case 'error':
        this.tone(cat, 180, t, 0.12, 'square', 0.08);
        this.tone(cat, 140, t + 0.1, 0.15, 'square', 0.08);
        break;
      case 'coin':
        this.tone(cat, 1320 * v, t, 0.07, 'square', 0.06);
        this.tone(cat, 1760 * v, t + 0.06, 0.16, 'square', 0.06);
        break;
      case 'register':
        this.noise(cat, t, 0.06, 0.2, 3000);
        this.tone(cat, 2093 * v, t + 0.04, 0.35, 'triangle', 0.12);
        this.tone(cat, 2637 * v, t + 0.07, 0.3, 'triangle', 0.08);
        break;
      case 'restock':
        this.noise(cat, t, 0.08, 0.15, 800, 'lowpass');
        this.tone(cat, 600 * v, t + 0.05, 0.08, 'triangle', 0.12, 800 * v);
        break;
      case 'hammer':
        this.noise(cat, t, 0.08, 0.35, 400, 'lowpass');
        this.tone(cat, 120 * v, t, 0.1, 'sine', 0.3, 60);
        break;
      case 'upgrade':
        [0, 4, 7, 12].forEach((s, i) => this.tone(cat, NOTE(72 + s) * v, t + i * 0.06, 0.18, 'triangle', 0.14));
        this.noise(cat, t + 0.2, 0.3, 0.06, 6000, 'highpass');
        break;
      case 'levelup':
        [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => this.tone(cat, NOTE(67 + s), t + i * 0.08, 0.25, 'square', 0.07));
        this.tone(cat, NOTE(55), t, 0.6, 'triangle', 0.15);
        break;
      case 'newProduct':
        [12, 16, 19, 24].forEach((s, i) => this.tone(cat, NOTE(72 + s) * v, t + i * 0.05, 0.3, 'sine', 0.1));
        break;
      case 'expansion':
        for (let i = 0; i < 3; i++) {
          this.noise(cat, t + i * 0.15, 0.08, 0.35, 400, 'lowpass');
          this.tone(cat, 110, t + i * 0.15, 0.1, 'sine', 0.3, 55);
        }
        [0, 4, 7, 12, 16].forEach((s, i) => this.tone(cat, NOTE(60 + s), t + 0.5 + i * 0.09, 0.4, 'triangle', 0.13));
        break;
      case 'hire':
        this.tone(cat, NOTE(76) * v, t, 0.12, 'sine', 0.15);
        this.tone(cat, NOTE(81) * v, t + 0.12, 0.2, 'sine', 0.15);
        break;
      case 'achievement':
        [0, 7, 12, 16, 19].forEach((s, i) => this.tone(cat, NOTE(72 + s), t + i * 0.07, 0.4, 'sine', 0.1));
        break;
      case 'eventStart':
        this.tone(cat, NOTE(64), t, 0.15, 'sawtooth', 0.06);
        this.tone(cat, NOTE(69), t + 0.15, 0.3, 'sawtooth', 0.06);
        break;
      case 'crate':
        this.tone(cat, NOTE(79) * v, t, 0.1, 'square', 0.06);
        this.tone(cat, NOTE(84) * v, t + 0.08, 0.1, 'square', 0.06);
        this.tone(cat, NOTE(91) * v, t + 0.16, 0.25, 'square', 0.06);
        break;
      case 'angry':
        this.tone(cat, 220 * v, t, 0.18, 'sawtooth', 0.04, 160);
        break;
    }
  }

  // ----------------------------------------------------------------- music

  setMood(m: MusicMood): void {
    this.mood = m;
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.schedule(), 50);
  }

  /** Lookahead scheduler: a gentle chiptune loop. I–vi–IV–V in C, pentatonic melody. */
  private schedule(): void {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const bpm = this.mood === 'rush' ? 138 : this.mood === 'celebration' ? 124 : this.mood === 'night' ? 84 : 100;
    const sixteenth = 60 / bpm / 4;
    const chords = this.mood === 'night' ? [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]] : [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]];
    const penta = [0, 2, 4, 7, 9, 12, 14, 16];
    while (this.nextNoteTime < c.currentTime + 0.15) {
      const t = this.nextNoteTime;
      const bar = Math.floor(this.step / 16) % 4;
      const s = this.step % 16;
      const chord = chords[bar];
      const mg = this.musicGain;
      const play = (freq: number, dur: number, type: OscillatorType, vol: number) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(mg);
        o.start(t);
        o.stop(t + dur + 0.02);
      };
      // bass on beats
      if (s % 4 === 0) play(NOTE(chord[0] - 12), sixteenth * 3.5, 'triangle', 0.35);
      // chord plucks on off-beats
      if (s % 4 === 2) for (const n of chord) play(NOTE(n + 12), sixteenth * 1.5, 'square', 0.035);
      // melody (sparse random walk)
      if ((s % 2 === 0 && this.rand() < (this.mood === 'rush' ? 0.75 : 0.5)) || s === 0) {
        const n = 72 + penta[Math.floor(this.rand() * penta.length)] + (bar === 3 ? -1 : 0);
        play(NOTE(n), sixteenth * (this.rand() < 0.3 ? 3 : 1.6), 'triangle', 0.12);
      }
      // hi-hat
      if (s % 2 === 1 || this.mood === 'rush') {
        const src = c.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = c.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 7000;
        const g = c.createGain();
        g.gain.setValueAtTime(this.mood === 'rush' ? 0.05 : 0.025, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
        src.connect(f).connect(g).connect(mg);
        src.start(t, Math.random() * 0.5);
        src.stop(t + 0.05);
      }
      this.nextNoteTime += sixteenth;
      this.step++;
    }
  }
}
