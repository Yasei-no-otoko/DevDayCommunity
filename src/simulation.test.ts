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

test("action completion and effect expiry are independent of rendering frame size", () => {
  function run(frameSize: number) {
    const state = createState();
    state.status = "running";
    sabotage(state, "blackout", "archive");
    while (state.status === "running") tick(state, frameSize);
    return state;
  }
  const coarse = run(1);
  const smooth = run(1 / 60);
  assert.equal(coarse.status, "escaped");
  assert.equal(smooth.status, coarse.status);
  assert.deepEqual(smooth.inventory, coarse.inventory);
  assert.deepEqual(smooth.visited, coarse.visited);
  assert.ok(Math.abs(smooth.elapsed - coarse.elapsed) < 1e-6);
  assert.ok(Math.abs(smooth.fear - coarse.fear) < 1e-6);
  assert.equal(smooth.decisions.length, coarse.decisions.length);
  smooth.decisions.forEach((decision, index) => {
    const expected = coarse.decisions[index];
    assert.equal(decision.action, expected.action);
    assert.equal(decision.target, expected.target);
    assert.ok(Math.abs(decision.time - expected.time) < 1e-6);
  });
});

test("overriding a seal that expires during the action never authenticates the exit", () => {
  for (const target of ["corridor", "exit"] as const) {
    const state = createState();
    state.status = "running";
    state.controller = "api";
    state.roomId = "exit";
    state.keycard = true;
    state.power = true;
    state.locks[target] = 1;
    assert.equal(applyDecision(state, { action: "unlock", target, reason: "封鎖を解除する" }), true);
    tick(state, 6);
    assert.equal(state.currentAction, null);
    assert.equal(state.status, "running");
    assert.equal(applyDecision(state, { action: "unlock", target: "exit", reason: "出口で認証する" }), true);
    tick(state, 5);
    assert.equal(state.status, "escaped");
  }
});

test("sealing a destination interrupts movement and still applies its fear impact", () => {
  const state = createState();
  state.status = "running";
  assert.equal(applyDecision(state, { action: "move", target: "ward", reason: "進む" }), true);
  const fear = state.fear;
  assert.equal(sabotage(state, "lock", "ward"), true);
  assert.equal(state.currentAction, null);
  assert.equal(state.targetRoomId, null);
  assert.equal(state.fear, fear + 2);
  assert.deepEqual(state.interventionHistory, [{
    id: 1,
    time: 0,
    type: "lock",
    roomId: "ward",
    affectedSubject: true,
    interruptedMove: true,
    fearDelta: 2,
  }]);
});

test("intervention history distinguishes an empty-room placement from a subject hit", () => {
  const state = createState();
  state.status = "running";
  state.controller = "api";
  tick(state, 2);
  assert.equal(sabotage(state, "blackout", "archive"), true);
  assert.deepEqual(state.interventionHistory[0], {
    id: 1,
    time: 2,
    type: "blackout",
    roomId: "archive",
    affectedSubject: false,
    interruptedMove: false,
    fearDelta: 0,
  });
  assert.equal(sabotage(state, "whisper", "reception"), true);
  assert.deepEqual(state.interventionHistory[0], {
    id: 2,
    time: 2,
    type: "whisper",
    roomId: "reception",
    affectedSubject: true,
    interruptedMove: false,
    fearDelta: 8,
  });
  const recorded = structuredClone(state.interventionHistory);
  tick(state, 15);
  assert.equal(state.effects.length, 0);
  assert.deepEqual(state.interventionHistory, recorded);
});

test("destination hits record fear without implying that every effect stops movement", () => {
  const state = createState();
  state.status = "running";
  assert.equal(applyDecision(state, { action: "move", target: "ward", reason: "進む" }), true);
  const action = state.currentAction;
  state.fear = 98;
  assert.equal(sabotage(state, "apparition", "ward"), true);
  assert.equal(state.currentAction, action);
  assert.equal(state.targetRoomId, "ward");
  assert.equal(state.fear, 99);
  assert.deepEqual(state.interventionHistory[0], {
    id: 1,
    time: 0,
    type: "apparition",
    roomId: "ward",
    affectedSubject: true,
    interruptedMove: false,
    fearDelta: 1,
  });
  assert.equal(sabotage(state, "lock", "reception"), true);
  assert.equal(state.currentAction, action);
  assert.equal(state.interventionHistory[0].affectedSubject, true);
  assert.equal(state.interventionHistory[0].interruptedMove, false);
  assert.equal(state.interventionHistory[0].fearDelta, 0);
});

test("rejected interventions never create history or consume an intervention id", () => {
  for (const blocked of ["waiting", "paused", "thinking", "energy", "cooldown", "escaped", "contained"] as const) {
    const state = createState();
    state.status = "running";
    // Preserve an existing successful record to prove failed input cannot change it.
    assert.equal(sabotage(state, "whisper", "archive"), true);
    state.cooldowns.whisper = 0;
    if (blocked === "waiting" || blocked === "escaped" || blocked === "contained") state.status = blocked;
    if (blocked === "paused") state.paused = true;
    if (blocked === "thinking") state.thinking = true;
    if (blocked === "energy") state.energy = 0;
    if (blocked === "cooldown") state.cooldowns.whisper = state.elapsed + 1;
    const before = JSON.stringify(state);
    assert.equal(sabotage(state, "whisper", "reception"), false, blocked);
    assert.equal(JSON.stringify(state), before, blocked);
  }
});

test("intervention history retains the latest twelve successful records and resets cleanly", () => {
  const state = createState();
  state.status = "running";
  state.controller = "api";
  for (let index = 0; index < 14; index++) {
    assert.equal(sabotage(state, "whisper", "archive"), true);
    tick(state, 10.1);
  }
  assert.equal(state.interventions, 14);
  assert.equal(state.interventionHistory.length, 12);
  assert.deepEqual(state.interventionHistory.map((record) => record.id),
    [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  for (const record of state.interventionHistory) {
    assert.ok(Math.abs(record.time - (record.id - 1) * 10.1) < 1e-6);
    assert.equal(record.affectedSubject, false);
    assert.equal(record.interruptedMove, false);
    assert.equal(record.fearDelta, 0);
  }
  const fresh = createState();
  assert.deepEqual(fresh.interventionHistory, []);
  assert.equal(fresh.interventions, 0);
  fresh.status = "running";
  assert.equal(sabotage(fresh, "lock", "reception"), true);
  assert.equal(fresh.interventionHistory[0].id, 1);
  assert.equal(state.interventionHistory[0].id, 14);
});
