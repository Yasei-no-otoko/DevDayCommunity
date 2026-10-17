import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDecision,
  chooseLocalAction,
  createState,
  sabotage,
  tick,
  type SabotageType,
} from "./simulation.ts";

test("autonomous agent collects objectives and escapes in a playable time window", () => {
  const state = createState();
  state.status = "running";
  for (let second = 0; second < 180 && state.status === "running"; second++)
    tick(state, 1);
  assert.equal(state.status, "escaped");
  assert.equal(state.keycard, true);
  assert.equal(state.power, true);
  assert.equal(state.roomId, "exit");
  assert.ok(
    state.elapsed >= 45 && state.elapsed <= 100,
    `baseline took ${state.elapsed}s`,
  );
  assert.ok(state.clues.length >= 4);
  assert.ok(state.decisions.length <= 40);
});

test("interventions spend energy, respect cooldowns, expire, and cannot win instantly", () => {
  const state = createState();
  state.status = "running";
  assert.equal(sabotage(state, "apparition", "reception"), true);
  assert.equal(state.energy, 60);
  assert.equal(state.interventions, 1);
  assert.equal(state.fear, 25);
  assert.equal(state.status, "running");
  assert.equal(sabotage(state, "apparition", "reception"), false);
  assert.equal(state.energy, 60);
  assert.equal(sabotage(state, "lock", "archive"), true);
  assert.ok(state.locks.archive! > 0);
  tick(state, 13);
  assert.equal(state.locks.archive, undefined);
  assert.ok(state.energy > 40);
  assert.equal(state.effects.length, 0);
  assert.equal(
    sabotage(state, "__proto__" as SabotageType, "reception"),
    false,
  );
  assert.ok(Number.isFinite(state.energy));
});

test("validator rejects malformed API decisions, nonadjacent moves, and premature exit", () => {
  const state = createState();
  state.status = "running";
  state.controller = "api";
  for (const decision of [
    null,
    {},
    { action: "teleport", target: "exit", reason: "hack" },
    { action: "move", target: "exit", reason: "skip rooms" },
    { action: "restore", target: "generator", reason: "skip travel" },
    { action: "move", target: "ward", reason: 12 },
  ]) {
    assert.equal(applyDecision(state, decision, "api"), false);
  }
  assert.equal(state.currentAction, null);
  assert.equal(state.decisions.length, 0);
  tick(state, 2);
  assert.equal(state.currentAction, null);
  assert.equal(
    applyDecision(
      state,
      { action: "move", target: "ward", reason: "Read archive note" },
      "api",
    ),
    true,
  );
  tick(state, 7);
  assert.equal(state.roomId, "ward");
  assert.equal(state.decisions[0].source, "api");
});

test("locks provoke a legal override or safer route rather than an impossible move", () => {
  const state = createState();
  state.status = "running";
  assert.equal(sabotage(state, "lock", "ward"), true);
  const decision = chooseLocalAction(state);
  assert.equal(decision.action, "move");
  assert.equal(decision.target, "corridor");
  assert.equal(applyDecision(state, decision), true);
  tick(state, 180);
  assert.equal(state.status, "escaped");
});

test("panic response reduces stress and avoids repeated blind progress", () => {
  const state = createState();
  state.status = "running";
  state.fear = 60;
  assert.equal(chooseLocalAction(state).action, "wait");
  tick(state, 6.1);
  assert.ok(state.fear < 40);
  assert.equal(state.status, "running");
});

test("terminal and paused states do not drift and reset creates fresh state", () => {
  const state = createState();
  state.status = "running";
  state.controller = "api";
  tick(state, 180);
  assert.equal(state.status, "contained");
  assert.equal(state.timeRemaining, 0);
  const frozen = JSON.stringify(state);
  tick(state, 50);
  assert.equal(JSON.stringify(state), frozen);
  assert.equal(sabotage(state, "whisper", "reception"), false);
  const fresh = createState();
  assert.equal(fresh.status, "waiting");
  assert.equal(fresh.timeRemaining, 180);
  fresh.status = "running";
  fresh.paused = true;
  const paused = JSON.stringify(fresh);
  tick(fresh, 50);
  assert.equal(JSON.stringify(fresh), paused);
  assert.equal(fresh.inventory.length, 0);
  assert.equal(fresh.effects.length, 0);
});

test("a player can win by saving energy and sealing the next doorway", () => {
  const state = createState();
  state.status = "running";
  for (let frame = 0; frame < 1801 && state.status === "running"; frame++) {
    // Door timing matters: save energy for the escape route rather than spam every effect.
    sabotage(state, "lock", state.targetRoomId ?? state.roomId);
    tick(state, 0.1);
  }
  assert.equal(state.status, "contained");
  assert.equal(state.timeRemaining, 0);
  assert.ok(state.interventions >= 10);
  assert.ok(
    state.fear < 100,
    "the route-denial strategy should win through the deadline",
  );
});
