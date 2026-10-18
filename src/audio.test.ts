import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AUDIO_SAMPLES, createGameAudio } from "./audio.ts";
import { createState, type GameState } from "./simulation.ts";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

// Exercise asynchronous browser boundaries without an audio device or API access.
function browserAudio(t: TestContext) {
  const contexts: FakeContext[] = [];
  const requests: string[] = [];
  const failures = new Set<string>();
  let fetchGate: Promise<void> | undefined;
  let resumeFailure = false;
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} });
  class FakeSource {
    buffer?: { url: string; duration: number };
    loop = false;
    onended: (() => void) | null = null;
    started = false;
    stopped = false;
    disconnected = false;
    connect() {}
    disconnect() { this.disconnected = true; }
    start() {
      assert.equal(this.started, false, "a source cannot start twice");
      this.started = true;
    }
    stop(at?: number) {
      if (at === undefined) this.stopped = true;
    }
  }
  class FakeContext {
    state = "suspended";
    currentTime = 0;
    destination = {};
    sources: FakeSource[] = [];
    constructor() { contexts.push(this); }
    createGain() { return { gain: param(), connect() {}, disconnect() {} }; }
    createBufferSource() {
      const source = new FakeSource();
      this.sources.push(source);
      return source;
    }
    async resume() {
      if (resumeFailure) throw new Error("device unavailable");
      this.state = "running";
    }
    async suspend() { this.state = "suspended"; }
    async close() { this.state = "closed"; }
    async decodeAudioData(data: ArrayBuffer) {
      return { url: new TextDecoder().decode(data), duration: 3 };
    }
  }
  const originalContext = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: FakeContext });
  t.after(() => {
    if (originalContext) Object.defineProperty(globalThis, "AudioContext", originalContext);
    else Reflect.deleteProperty(globalThis, "AudioContext");
  });
  t.mock.method(globalThis, "fetch", async (url: string) => {
    requests.push(String(url));
    if (fetchGate) await fetchGate;
    return new Response(String(url), { status: failures.has(String(url)) ? 404 : 200 });
  });
  const state = createState(123);
  state.status = "running";
  return {
    state, contexts, requests, failures,
    gate(promise: Promise<void>) { fetchGate = promise; },
    failResume() { resumeFailure = true; },
    played(sample: keyof typeof AUDIO_SAMPLES) {
      return contexts.flatMap((c) => c.sources).filter((s) => s.started && s.buffer?.url === AUDIO_SAMPLES[sample]);
    },
    playing() { return contexts.flatMap((c) => c.sources).filter((s) => s.started && !s.stopped); },
  };
}

test("all bundled audio URLs have a nonempty local MP3 and documented provenance", async () => {
  const credits = await readFile(new URL("../public/audio/CREDITS.txt", import.meta.url), "utf8");
  for (const url of Object.values(AUDIO_SAMPLES)) {
    const bytes = await readFile(new URL(`../public${url}`, import.meta.url));
    assert.ok(bytes.length > 1000, url);
    assert.match(credits, new RegExp(url.split("/").at(-1)!.replace(".", "\\.")));
  }
  assert.match(credits, /CC0/);
});

test("audio starts off and loads only after explicit enable; one ambient loop survives repeated frames", async (t) => {
  const env = browserAudio(t);
  const audio = createGameAudio();
  t.after(() => audio.dispose());
  audio.update(env.state, true);
  audio.playIntervention("lock");
  assert.equal(env.contexts.length, 0);
  assert.equal(env.requests.length, 0);
  assert.equal(await audio.setEnabled(true), true);
  audio.update(env.state, true);
  audio.update(env.state, true);
  assert.equal(env.requests.length, 8);
  assert.equal(env.played("ambience").length, 1);
  assert.equal(env.played("ambience")[0].loop, true);
  audio.playIntervention("lock");
  assert.equal(env.played("lock").length, 1);
});

test("muting while fetch is pending prevents a stale load from starting sound", async (t) => {
  const env = browserAudio(t);
  const gate = deferred();
  env.gate(gate.promise);
  const audio = createGameAudio();
  t.after(() => audio.dispose());
  audio.update(env.state, true);
  const pending = audio.setEnabled(true);
  await audio.setEnabled(false);
  gate.resolve();
  assert.equal(await pending, false);
  audio.update(env.state, true);
  audio.playIntervention("apparition");
  assert.equal(env.playing().length, 0);
});

test("reset invalidates pending work and dispose is final and idempotent", async (t) => {
  const env = browserAudio(t);
  const gate = deferred();
  env.gate(gate.promise);
  const audio = createGameAudio();
  const pending = audio.setEnabled(true);
  audio.reset();
  env.state.status = "waiting";
  audio.update(env.state, false);
  audio.dispose();
  audio.dispose();
  gate.resolve();
  assert.equal(await pending, false);
  assert.equal(await audio.setEnabled(true), false);
  audio.update(env.state, true);
  assert.equal(env.playing().length, 0);
  assert.equal(env.contexts[0].state, "closed");
});

test("pause, API wait, and presentation gates stop voices and consume stale event counters", async (t) => {
  const env = browserAudio(t);
  const audio = createGameAudio();
  t.after(() => audio.dispose());
  await audio.setEnabled(true);
  audio.update(env.state, true);
  for (const reason of ["pause", "thinking", "presentation"] as const) {
    audio.playIntervention("lock");
    env.state.paused = reason === "pause";
    env.state.thinking = reason === "thinking";
    env.state.killer.encounterCount++;
    env.state.tibo.appearances++;
    audio.update(env.state, reason !== "presentation");
    assert.equal(env.playing().length, 0, reason);
    env.state.paused = env.state.thinking = false;
    audio.update(env.state, true);
  }
  assert.equal(env.played("apparition").length, 0);
  assert.equal(env.played("support").length, 0);
});

test("movement, encounter, support and objective cues follow simulated changes once", async (t) => {
  const env = browserAudio(t);
  const audio = createGameAudio();
  t.after(() => audio.dispose());
  await audio.setEnabled(true);
  audio.update(env.state, true);
  env.state.currentAction = { action: "move", target: "corridor", reason: "test", duration: 4, elapsed: 0 } as GameState["currentAction"];
  audio.update(env.state, true);
  audio.update(env.state, true);
  assert.equal(env.played("footstep").length, 1);
  env.state.elapsed = 0.7;
  audio.update(env.state, true);
  assert.equal(env.played("footstep").length, 2);
  env.state.currentAction = null;
  env.state.killer.encounterCount++;
  env.state.tibo.appearances++;
  env.state.keycard = true;
  audio.update(env.state, true);
  audio.update(env.state, true);
  assert.equal(env.played("apparition").length, 1);
  assert.equal(env.played("support").length, 1);
  assert.equal(env.played("objective").length, 1);
});

test("missing samples report a recoverable error and retry only missing files", async (t) => {
  const env = browserAudio(t);
  const errors: string[] = [];
  env.failures.add(AUDIO_SAMPLES.lock);
  const audio = createGameAudio({ onError: (message) => errors.push(message) });
  t.after(() => audio.dispose());
  assert.equal(await audio.setEnabled(true), true);
  assert.equal(errors.length, 1);
  await audio.setEnabled(false);
  env.failures.clear();
  assert.equal(await audio.setEnabled(true), true);
  assert.equal(env.requests.length, 9);
  audio.update(env.state, true);
  audio.playIntervention("lock");
  assert.equal(env.played("lock").length, 1);
});

test("audio device rejection leaves the visual game usable and reports the failure", async (t) => {
  const env = browserAudio(t);
  env.failResume();
  const errors: string[] = [];
  const audio = createGameAudio({ onError: (message) => errors.push(message) });
  t.after(() => audio.dispose());
  assert.equal(await audio.setEnabled(true), false);
  assert.equal(errors.length, 1);
  assert.doesNotThrow(() => audio.update(env.state, true));
  assert.equal(env.playing().length, 0);
});
