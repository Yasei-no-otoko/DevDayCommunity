import type { SabotageType } from "./simulation";

type SoundFrame = {
  active: boolean; moving: boolean; killerMoving: boolean; hiding: boolean;
  fear: number; pan: number; killerPan: number; proximity: number;
  power: boolean; watchback: boolean; tibo: number;
};

/** Browser-local procedural sound. No fetches, speech generation, or game mutations. */
export class HospitalSoundscape {
  private context?: AudioContext;
  private master?: GainNode;
  private roomTone?: GainNode;
  private noise?: AudioBuffer;
  private sources = new Set<AudioScheduledSourceNode>();
  private enabled = false;
  private active = false;
  private disposed = false;
  private footClock = 0;
  private killerClock = 0;
  private heartClock = 0;
  private silence = 0;
  private previousWatchback = false;
  private tibo = 0;

  private init() {
    if (this.context || this.disposed) return;
    this.context = new AudioContext();
    const c = this.context;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.master.connect(c.destination);
    this.roomTone = c.createGain();
    this.roomTone.gain.value = 0.6;
    this.roomTone.connect(this.master);
    const length = Math.floor(c.sampleRate * 3);
    this.noise = c.createBuffer(1, length, c.sampleRate);
    const data = this.noise.getChannelData(0);
    let low = 0;
    for (let i = 0; i < length; i++) {
      low = (low + (Math.random() * 2 - 1) * 0.02) / 1.02;
      data[i] = low * 3.5;
    }
    for (const [frequency, level] of [[43, 0.045], [86.3, 0.009]]) {
      const osc = c.createOscillator(), gain = c.createGain();
      osc.frequency.value = frequency;gain.gain.value = level;
      osc.connect(gain);gain.connect(this.roomTone);this.track(osc);osc.start();
    }
    const air = c.createBufferSource(), airGain = c.createGain(), filter = c.createBiquadFilter();
    air.buffer = this.noise;air.loop = true;filter.type = "lowpass";filter.frequency.value = 430;
    airGain.gain.value = 0.05;air.connect(filter);filter.connect(airGain);airGain.connect(this.roomTone);
    this.track(air);air.start();
  }
  private track(source: AudioScheduledSourceNode) {
    this.sources.add(source);
    source.onended = () => { this.sources.delete(source);source.disconnect(); };
  }
  async setEnabled(enabled: boolean) {
    if (this.disposed) return false;
    if (enabled) {
      try { this.init();await this.context!.resume(); }
      catch { this.enabled = false;return false; }
      if (this.disposed) return false;
    }
    this.enabled = enabled;
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(enabled && this.active ? 0.42 : 0, this.context.currentTime, 0.025);
    }
    return this.enabled;
  }
  private bus(pan: number) {
    const c = this.context!, panner = c.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));panner.connect(this.master!);
    return panner;
  }
  private thump(frequency: number, duration: number, level: number, pan = 0, delay = 0) {
    if (!this.context || !this.enabled || !this.active || this.disposed) return;
    const c = this.context, start = c.currentTime + delay, osc = c.createOscillator(), gain = c.createGain(), bus = this.bus(pan);
    osc.type = "sine";osc.frequency.setValueAtTime(frequency, start);osc.frequency.exponentialRampToValueAtTime(Math.max(20, frequency * 0.35), start + duration);
    gain.gain.setValueAtTime(0, start);gain.gain.linearRampToValueAtTime(level, start + 0.012);gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);gain.connect(bus);this.track(osc);
    osc.addEventListener("ended", () => { gain.disconnect();bus.disconnect(); }, { once: true });
    osc.start(start);osc.stop(start + duration + 0.04);
  }
  private rustle(duration: number, frequency: number, level: number, pan = 0) {
    if (!this.context || !this.noise || !this.enabled || !this.active || this.disposed) return;
    const c = this.context, source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain(), bus = this.bus(pan), now = c.currentTime;
    source.buffer = this.noise;filter.type = "bandpass";filter.frequency.value = frequency;filter.Q.value = 1.8;
    gain.gain.setValueAtTime(0, now);gain.gain.linearRampToValueAtTime(level, now + Math.min(0.09, duration / 3));gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);filter.connect(gain);gain.connect(bus);this.track(source);
    source.addEventListener("ended", () => {filter.disconnect();gain.disconnect();bus.disconnect();}, { once: true });
    source.start();source.stop(now + duration + 0.04);
  }
  cue(type: SabotageType | "start" | "tibo" | "watchback", pan = 0) {
    if (!this.active || !this.enabled) return;
    if (type === "blackout") {
      this.thump(210, 0.15, 0.15, pan);this.silence = 1.25;
    } else if (type === "lock") {
      this.thump(130, 0.15, 0.2, pan);this.thump(81, 0.3, 0.14, pan, 0.17);this.rustle(0.4, 850, 0.14, pan);
    } else if (type === "whisper") {
      this.rustle(1.5, 970, 0.19, pan);this.thump(58, 0.8, 0.035, -pan, 0.2);
    } else if (type === "apparition") {
      this.rustle(0.9, 240, 0.3, pan);this.thump(51, 1.1, 0.14, pan);
    } else if (type === "watchback") {
      this.silence = 1;this.rustle(0.5, 1350, 0.14, 0);this.thump(38, 1.8, 0.08);
    } else if (type === "tibo") {
      this.thump(660, 0.18, 0.035, 0.2);this.thump(880, 0.3, 0.025, 0.2, 0.14);
    } else this.thump(70, 0.9, 0.1);
  }
  update(frame: SoundFrame, dt: number) {
    this.active = frame.active;
    if (!this.context || !this.master || !this.roomTone || this.disposed) return;
    const c = this.context;
    this.master.gain.setTargetAtTime(this.enabled && frame.active ? 0.42 : 0, c.currentTime, 0.025);
    if (!frame.active || !this.enabled) {
      this.footClock = this.killerClock = this.heartClock = 0;
      this.previousWatchback = frame.watchback;this.tibo = frame.tibo;
      return;
    }
    this.silence = Math.max(0, this.silence - dt);
    this.roomTone.gain.setTargetAtTime(this.silence > 0 ? 0.015 : frame.power ? 0.85 : 0.45, c.currentTime, 0.15);
    if (frame.watchback && !this.previousWatchback) this.cue("watchback");
    if (frame.tibo > this.tibo) this.cue("tibo");
    this.previousWatchback = frame.watchback;this.tibo = frame.tibo;
    if (frame.watchback) return;
    this.footClock += dt;this.killerClock += dt;this.heartClock += dt;
    if (frame.moving && !frame.hiding && this.footClock > 0.58) {
      this.footClock = 0;this.thump(96, 0.18, 0.075, frame.pan);this.rustle(0.13, 660, 0.025, frame.pan);
    }
    if (frame.killerMoving && !frame.hiding && this.killerClock > 1.05) {
      this.killerClock = 0;this.thump(61, 0.38, 0.018 + frame.proximity * 0.075, frame.killerPan);
    }
    if (frame.fear > 42 && this.heartClock > 1.1 - Math.min(frame.fear, 100) / 200) {
      this.heartClock = 0;const level = 0.012 + Math.max(0, frame.fear - 40) / 1600;
      this.thump(48, 0.17, level);this.thump(43, 0.15, level * 0.6, 0, 0.19);
    }
  }
  destroy() {
    this.disposed = true;this.enabled = false;
    for (const source of this.sources) {try {source.stop();}catch{/* Already stopped. */}}
    this.sources.clear();if (this.context) void this.context.close().catch(() => {});
  }
}
