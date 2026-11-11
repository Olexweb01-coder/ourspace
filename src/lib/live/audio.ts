// Music and sounds for the games, composed live on the phone with Web Audio.
// No recordings and no downloads: original, free, and never exactly the same twice.

export type TrackId = "candle" | "strings" | "rhodes" | "guitar";
export const TRACKS: { id: TrackId; name: string; mood: string }[] = [
  { id: "candle", name: "Candlelight piano", mood: "soft, slow piano" },
  { id: "strings", name: "Slow strings", mood: "warm, solemn pads" },
  { id: "rhodes", name: "Rainy Rhodes", mood: "late night, gentle rain" },
  { id: "guitar", name: "Lagos night guitar", mood: "easy highlife picking" },
];
export type Sfx = "dice" | "hop" | "card" | "capture" | "win" | "turn" | "tap";
export type AudioPrefs = { track: TrackId; music: number; sfx: boolean; playing: boolean };
const PREFS_KEY = "ourspace:game-audio";
export function loadPrefs(): AudioPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    return { track: TRACKS.some((t) => t.id === p.track) ? p.track : "candle", music: typeof p.music === "number" ? p.music : 0.55, sfx: p.sfx !== false, playing: p.playing !== false };
  } catch {
    return { track: "candle", music: 0.55, sfx: true, playing: true };
  }
}
export function savePrefs(p: AudioPrefs) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ } }

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

type Song = { bpm: number; chords: number[][]; scale: number[]; play: (e: Engine, chord: number[], beatTime: number, step: number, beat: number) => void };

export class Engine {
  ctx: BaseAudioContext;
  master: GainNode;
  music: GainNode;
  sfxBus: GainNode;
  reverb: ConvolverNode;
  wet: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private next = 0;
  private step = 0;
  private song: Song | null = null;
  private rain: AudioBufferSourceNode | null = null;
  sfxOn = true;

  constructor(ctx?: BaseAudioContext) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = ctx ?? new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 3.2;   // phone speakers: loud enough to hear, the compressor keeps peaks safe
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    this.master.connect(comp).connect(this.ctx.destination);
    this.music = this.ctx.createGain();
    this.music.gain.value = 0.55;
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.7;
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2);
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.35;
    this.music.connect(this.master);
    this.music.connect(this.wet).connect(this.reverb).connect(this.master);
    this.sfxBus.connect(this.master);
  }

  private impulse(seconds: number) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  private noise(seconds: number) {
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * seconds), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---------------- voices ----------------
  piano(midi: number, t: number, dur: number, vel = 0.5, out: AudioNode = this.music) {
    const f = hz(midi);
    const g = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1800 + vel * 1800;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel * 0.22, t + 0.008);
    g.gain.exponentialRampToValueAtTime(vel * 0.07, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 2.4 + 0.6);
    [[1, "triangle", 1], [2, "sine", 0.28], [3, "sine", 0.08]].forEach(([mul, type, amp]) => {
      const o = this.ctx.createOscillator();
      const a = this.ctx.createGain();
      o.type = type as OscillatorType; o.frequency.value = f * (mul as number);
      a.gain.value = amp as number;
      o.connect(a).connect(lp);
      o.start(t); o.stop(t + dur * 2.4 + 0.7);
    });
    lp.connect(g).connect(out);
  }

  pad(notes: number[], t: number, dur: number, vel = 0.4) {
    const g = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 850; lp.Q.value = 0.4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * 0.06, t + 1.6);
    g.gain.setValueAtTime(vel * 0.06, t + dur - 1.2);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.8);
    notes.forEach((n) => [-6, 6].forEach((cents) => {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth"; o.frequency.value = hz(n); o.detune.value = cents;
      o.connect(lp); o.start(t); o.stop(t + dur + 1);
    }));
    lp.connect(g).connect(this.music);
  }

  rhodes(midi: number, t: number, dur: number, vel = 0.45) {
    const f = hz(midi);
    const car = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const g = this.ctx.createGain();
    car.type = "sine"; mod.type = "sine";
    car.frequency.value = f; mod.frequency.value = f;
    modGain.gain.setValueAtTime(f * 1.4, t);
    modGain.gain.exponentialRampToValueAtTime(f * 0.08, t + 0.6);
    mod.connect(modGain).connect(car.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel * 0.17, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.4);
    car.connect(g).connect(this.music);
    car.start(t); mod.start(t); car.stop(t + dur + 1.5); mod.stop(t + dur + 1.5);
  }

  pluck(midi: number, t: number, vel = 0.5) {
    const f = hz(midi);
    const o = this.ctx.createOscillator();
    const lp = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o.type = "triangle"; o.frequency.value = f;
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(600, t + 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel * 0.2, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o.connect(lp).connect(g).connect(this.music);
    o.start(t); o.stop(t + 1.4);
  }

  private startRain() {
    if (this.rain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise(4); src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 2600; bp.Q.value = 0.6;
    const g = this.ctx.createGain(); g.gain.value = 0.035;
    src.connect(bp).connect(g).connect(this.music);
    src.start();
    this.rain = src;
  }
  private stopRain() { try { this.rain?.stop(); } catch { /* already stopped */ } this.rain = null; }

  // ---------------- songs ----------------
  private songs: Record<TrackId, Song> = {
    // I – vi – IV – V in C, flowing arpeggios, a soft melody now and then.
    candle: {
      bpm: 66, scale: [72, 74, 76, 79, 81, 84],
      chords: [[48, 60, 64, 67], [45, 57, 60, 64], [41, 53, 57, 60], [43, 55, 59, 62]],
      play: (e, ch, t, step, beat) => {
        const pattern = [ch[1], ch[2], ch[3], ch[2] + 12, ch[3], ch[2]];
        e.piano(pattern[step % 6] + (step % 12 > 5 ? 0 : 0), t, 0.5, 0.3 + Math.random() * 0.08);
        if (step % 16 === 0) e.piano(ch[0], t, 2, 0.45);
        if (step % 8 === 4 && Math.random() < 0.55) e.piano(e.pick(this.songs.candle.scale), t, 1.4, 0.38);
        void beat;
      },
    },
    // vi – IV – I – V: long string pads under a slow, solemn melody.
    strings: {
      bpm: 54, scale: [69, 71, 72, 76, 79, 81],
      chords: [[45, 57, 60, 64], [41, 53, 57, 60], [48, 55, 60, 64], [43, 55, 59, 62]],
      play: (e, ch, t, step) => {
        if (step % 16 === 0) { e.pad(ch.slice(1), t, (16 * 30) / 54, 0.8); e.piano(ch[0] - 12, t, 3, 0.35); }
        if (step % 4 === 0 && Math.random() < 0.6) e.piano(e.pick(this.songs.strings.scale), t, 1.6, 0.28);
      },
    },
    // ii7 – V7 – Imaj7 – vi7 in F, electric piano and soft rain.
    rhodes: {
      bpm: 70, scale: [72, 74, 76, 77, 79, 81, 84],
      chords: [[43, 55, 58, 62, 65], [36, 52, 55, 58, 62], [41, 57, 60, 64, 65], [38, 53, 57, 60, 62]],
      play: (e, ch, t, step) => {
        if (step % 16 === 0) e.startRain();
        if (step % 16 === 0 || step % 16 === 6 || step % 16 === 11) ch.slice(1).forEach((n) => e.rhodes(n, t, 0.9, 0.32));
        if (step % 16 === 0) e.rhodes(ch[0], t, 2.4, 0.5);
        if (step % 4 === 2 && Math.random() < 0.45) e.rhodes(e.pick(this.songs.rhodes.scale), t, 0.6, 0.3);
      },
    },
    // I – IV – V – IV in G, light highlife-style picking.
    guitar: {
      bpm: 76, scale: [67, 69, 71, 74, 76, 79],
      chords: [[43, 55, 59, 62], [48, 55, 60, 64], [50, 57, 62, 66], [48, 55, 60, 64]],
      play: (e, ch, t, step) => {
        const pat = [ch[1], ch[3], ch[2], ch[3] + 12, ch[2], ch[3]];
        if (step % 16 === 0 || step % 16 === 10) e.pluck(ch[0], t, 0.6);
        e.pluck(pat[step % 6], t, 0.32 + (step % 2 ? 0 : 0.1));
        if (step % 8 === 6 && Math.random() < 0.5) e.pluck(e.pick(this.songs.guitar.scale), t, 0.42);
      },
    },
  };

  pick(list: number[]) { return list[Math.floor(Math.random() * list.length)]; }

  start(track: TrackId) {
    this.stopMusic();
    this.song = this.songs[track];
    this.step = 0;
    this.next = this.ctx.currentTime + 0.15;
    const eighth = () => 30 / this.song!.bpm;
    this.timer = setInterval(() => {
      if (!this.song) return;
      while (this.next < this.ctx.currentTime + 0.25) {
        const chord = this.song.chords[Math.floor(this.step / 16) % this.song.chords.length];
        this.song.play(this, chord, this.next, this.step, Math.floor(this.step / 2));
        this.step++;
        this.next += eighth();
      }
    }, 60);
  }

  stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.song = null;
    this.stopRain();
  }

  // ---------------- sound effects ----------------
  sfx(name: Sfx) {
    if (!this.sfxOn) return;
    const t = this.ctx.currentTime + 0.01;
    const burst = (at: number, len: number, freq: number, q: number, amp: number) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise(len);
      const bp = this.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(amp, at); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      src.connect(bp).connect(g).connect(this.sfxBus);
      src.start(at); src.stop(at + len);
    };
    const tone = (at: number, midi: number, len: number, amp = 0.2, type: OscillatorType = "sine") => {
      const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
      o.type = type; o.frequency.value = hz(midi);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(amp, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      o.connect(g).connect(this.sfxBus); o.start(at); o.stop(at + len + 0.05);
    };
    switch (name) {
      case "dice": for (let i = 0; i < 6; i++) burst(t + i * 0.07 + Math.random() * 0.03, 0.05, 1800 + Math.random() * 2200, 4, 0.5); break;
      case "hop": tone(t, 84, 0.08, 0.08); break;
      case "card": burst(t, 0.12, 3500, 0.8, 0.35); break;
      case "capture": [79, 74, 67].forEach((m, i) => tone(t + i * 0.08, m, 0.2, 0.12, "triangle")); break;
      case "turn": tone(t, 76, 0.25, 0.08); tone(t + 0.12, 83, 0.4, 0.07); break;
      case "tap": tone(t, 88, 0.05, 0.05); break;
      case "win": [72, 76, 79, 84, 88].forEach((m, i) => this.piano(m, t + i * 0.13, 1.2, 0.55, this.sfxBus)); break;
    }
  }

  setMusicVolume(v: number) { this.music.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime, 0.1); }
}

let engine: Engine | null = null;
/** Must first be called from a tap (browsers only allow sound after one). */
export function audio(): Engine | null {
  if (typeof window === "undefined") return null;
  try {
    if (!engine) engine = new Engine();
    if (engine.ctx.state === "suspended") void (engine.ctx as AudioContext).resume();
    return engine;
  } catch {
    return null;
  }
}
export function stopAll() { engine?.stopMusic(); if (engine) void (engine.ctx as AudioContext).suspend(); }
