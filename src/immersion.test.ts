import assert from "node:assert/strict";
import test from "node:test";
import { createState, sabotage, tick } from "./simulation.ts";
import { sceneCue, subjectAcoustics } from "./immersion.ts";

test("scene descriptions reflect an actual interference without mutating game or API history", () => {
  const state = createState(314);state.status = "running";
  sabotage(state, "lock", "archive");
  const before = structuredClone(state), cue = sceneCue(state);
  assert.match(cue.text, /書庫.*錠/);assert.equal(cue.kind, "interference");
  subjectAcoustics(state);assert.deepEqual(state, before);
  tick(state, 5);assert.notEqual(sceneCue(state).kind, "interference");
});
test("acoustics stay finite and bounded through an entire run, including terminal state", () => {
  const state = createState(714);state.status = "running";
  for (let i = 0; i < 2200; i++) {
    tick(state, .1);const a = subjectAcoustics(state);
    assert.ok(Number.isFinite(a.pan) && Math.abs(a.pan) <= .85);
    assert.ok(Number.isFinite(a.killerPan) && Math.abs(a.killerPan) <= .85);
    assert.ok(a.tension >= 0 && a.tension <= 1);
    assert.ok(a.proximity >= 0 && a.proximity <= 1);
  }
  assert.equal(state.status, "escaped");assert.equal(sceneCue(state).kind, "quiet");
});
test("terminal and waiting scenes do not reuse a recent active interference", () => {
  const state = createState();assert.equal(sceneCue(state).kind, "idle");
  state.status = "running";sabotage(state, "apparition", "reception");state.status = "contained";
  assert.equal(sceneCue(state).kind, "quiet");assert.match(sceneCue(state).text, /足音が、止まった/);
});
