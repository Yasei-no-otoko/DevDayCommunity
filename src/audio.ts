import { CONNECTIONS, isHiding, type GameState, type SabotageType } from "./simulation.ts";

/** Locally bundled CC0 recordings; provenance is in public/audio/CREDITS.txt. */
export const AUDIO_SAMPLES = {
  ambience: "/audio/ambience.mp3",
  blackout: "/audio/blackout.mp3",
  lock: "/audio/lock.mp3",
  whisper: "/audio/whisper.mp3",
  apparition: "/audio/apparition.mp3",
  footstep: "/audio/footstep.mp3",
  support: "/audio/support.mp3",
  objective: "/audio/objective.mp3",
} as const;
type Sample = keyof typeof AUDIO_SAMPLES;
type Voice = { source: AudioBufferSourceNode; gain: GainNode };
type Snapshot = { encounters: number; support: number; keycard: boolean; power: boolean };

export function createGameAudio(options: { onError?: (message: string) => void } = {}) {
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let enabled = false;
  let disposed = false;
  let active = false;
  let epoch = 0;
  let loading: Promise<void> | undefined;
  let loadAbort: AbortController | undefined;
  const buffers = new Map<Sample, AudioBuffer>();
  const voices = new Set<Voice>();
  let ambience: Voice | undefined;
  let previous: Snapshot | undefined;
  let nextFootstep = 0;
  let nextThreat = 0;
  let wasMoving = false;

  function stopVoices() {
    for (const voice of voices) {
      voice.source.onended = null;
      try { voice.source.stop(); } catch { /* Already ended. */ }
      voice.source.disconnect();
      voice.gain.disconnect();
    }
    voices.clear();
    ambience = undefined;
  }
  function cancelLoad() {
    epoch++;
    loadAbort?.abort();
    loadAbort = undefined;
    loading = undefined;
  }
  function play(sample: Sample, volume: number, duration?: number, loop = false): Voice | undefined {
    const buffer = buffers.get(sample);
    if (!enabled || !active || disposed || !context || !master || !buffer || context.state !== "running" || voices.size >= 12) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = loop;
    const now = context.currentTime;
    const length = Math.min(duration ?? buffer.duration, buffer.duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + Math.min(0.04, length / 3));
    if (!loop) {
      gain.gain.setValueAtTime(volume, now + Math.max(0.04, length - 0.08));
      gain.gain.linearRampToValueAtTime(0, now + length);
    }
    source.connect(gain);
    gain.connect(master);
    const voice = { source, gain };
    voices.add(voice);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      voices.delete(voice);
      if (ambience === voice) ambience = undefined;
    };
    source.start();
    if (!loop) source.stop(now + length);
    return voice;
  }
  async function loadSamples(gen: number) {
    const controller = new AbortController();
    loadAbort = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
    const failed: Sample[] = [];
    await Promise.all((Object.keys(AUDIO_SAMPLES) as Sample[]).map(async (sample) => {
      if (buffers.has(sample)) return;
      try {
        const response = await fetch(AUDIO_SAMPLES[sample], { signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.arrayBuffer();
        if (disposed || gen !== epoch) return;
        const buffer = await context!.decodeAudioData(data);
        if (!disposed && gen === epoch) buffers.set(sample, buffer);
      } catch {
        if (!controller.signal.aborted && !disposed && gen === epoch) failed.push(sample);
      }
    }));
    if (failed.length && !disposed && gen === epoch) {
      options.onError?.("一部の音を読み込めませんでした。音をオフにしてからオンにすると再試行できます。");
    }
  }
  async function setEnabled(value: boolean): Promise<boolean> {
    if (disposed) return false;
    if (!value) {
      enabled = false;
      cancelLoad();
      stopVoices();
      if (context) void context.suspend().catch(() => {});
      return false;
    }
    if (enabled && loading) {
      const gen = epoch;
      await loading;
      return !disposed && gen === epoch && enabled && buffers.size > 0;
    }
    const gen = ++epoch;
    enabled = true;
    try {
      // Keep both creation and resume inside the user's synchronous click handler.
      if (!context || context.state === "closed") {
        context = new AudioContext();
        master = context.createGain();
        master.gain.value = 0.25;
        master.connect(context.destination);
      }
      const resumed = context.resume();
      const pending = loadSamples(gen);
      loading = pending;
      await Promise.all([resumed, pending]);
      if (disposed || gen !== epoch || !enabled) return false;
      loading = undefined;
      if (!buffers.size || context.state !== "running") throw new Error("Audio unavailable");
      return true;
    } catch {
      if (disposed || gen !== epoch) return false;
      enabled = false;
      cancelLoad();
      stopVoices();
      options.onError?.("音を再生できませんでした。音ボタンから再試行してください。");
      return false;
    }
  }
  function update(state: GameState, canPlay: boolean) {
    if (disposed) return;
    const snapshot: Snapshot = {
      encounters: state.killer.encounterCount,
      support: state.tibo.appearances,
      keycard: state.keycard,
      power: state.power,
    };
    active = canPlay && state.status === "running" && !state.paused && !state.thinking;
    if (!active || !enabled) {
      stopVoices();
      wasMoving = false;
      nextFootstep = state.elapsed;
      nextThreat = state.elapsed;
    } else {
      if (!ambience) ambience = play("ambience", 0.22, undefined, true);
      const hidden = isHiding(state);
      const sameRoom = !hidden && state.killer.roomId === state.roomId;
      const adjacent = !hidden && CONNECTIONS.some(([a, b]) =>
        (a === state.roomId && b === state.killer.roomId) || (b === state.roomId && a === state.killer.roomId));
      if (previous && snapshot.encounters > previous.encounters) {
        play("apparition", 0.3, 1.8);
        nextThreat = state.elapsed + 5;
      } else if (state.killer.encountered && (sameRoom || adjacent) && state.elapsed >= nextThreat) {
        play("whisper", sameRoom ? 0.15 : 0.08, 1.6);
        nextThreat = state.elapsed + (sameRoom ? 5 : 8);
      }
      const moving = state.currentAction?.action === "move";
      if (moving && (!wasMoving || state.elapsed >= nextFootstep)) {
        play("footstep", 0.18, 0.55);
        nextFootstep = state.elapsed + 0.65;
      }
      wasMoving = moving;
      if (previous && snapshot.support > previous.support) play("support", 0.24, 1.4);
      if (previous && ((!previous.keycard && snapshot.keycard) || (!previous.power && snapshot.power))) play("objective", 0.2, 1.4);
    }
    // Observe even silent frames, so resuming never replays events from a pause/load.
    previous = snapshot;
  }
  function playIntervention(type: SabotageType) {
    play(type, type === "apparition" ? 0.3 : 0.23, type === "lock" ? 1.2 : 2.2);
  }
  function reset() {
    enabled = false;
    active = false;
    cancelLoad();
    stopVoices();
    previous = undefined;
    nextFootstep = nextThreat = 0;
    wasMoving = false;
    if (context) void context.suspend().catch(() => {});
  }
  function dispose() {
    if (disposed) return;
    reset();
    disposed = true;
    buffers.clear();
    master?.disconnect();
    if (context) void context.close().catch(() => {});
  }
  return { setEnabled, update, playIntervention, reset, dispose };
}

export type GameAudio = ReturnType<typeof createGameAudio>;
