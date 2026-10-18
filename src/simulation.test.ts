import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDecision,
  CONNECTIONS,
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
  assert.equal(state.killer.encountered, true);
  assert.ok(state.killer.encounterCount >= 1);
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

test("a seeded encounter allows the player to win by sealing the next doorway", () => {
  // Tibo varies the available sealing windows; this proves a winning route exists.
  const state = createState(123);
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

test("the pursuer starts opposite Sam, takes legal edges, and moves more slowly", () => {
  const state = createState(123);
  state.status = "running";
  assert.equal(state.roomId, "reception");
  assert.equal(state.killer.roomId, "laboratory");
  assert.equal(state.killer.encountered, false);
  assert.equal(state.killer.lastEncounterAt, null);
  let transitions = 0;
  for (let frame = 0; frame < 600 && state.status === "running"; frame++) {
    const previous = state.killer.roomId;
    tick(state, 0.1);
    const { roomId, targetRoomId, moveDuration } = state.killer;
    if (previous !== roomId) {
      assert.ok(CONNECTIONS.some(([a, b]) => (a === previous && b === roomId) || (b === previous && a === roomId)));
      transitions += 1;
    }
    if (targetRoomId) {
      const subject = createState(123);
      subject.status = "running";
      subject.roomId = roomId;
      assert.equal(applyDecision(subject, { action: "move", target: targetRoomId, reason: "compare speed" }), true);
      assert.ok(moveDuration > subject.currentAction!.duration);
    }
  }
  assert.ok(transitions >= 2);
  assert.equal(state.status, "escaped");
});

test("Sam cannot route around an unseen killer but avoids its room after first contact", () => {
  const state = createState(123);
  state.status = "running";
  const expected = chooseLocalAction(state);
  for (const roomId of ["corridor", "ward", "reception", "archive"] as const) {
    state.killer.roomId = roomId;
    state.killer.targetRoomId = "archive";
    assert.deepEqual(chooseLocalAction(state), expected);
  }
  state.killer.encountered = true;
  state.killer.encounterCount = 1;
  state.killer.roomId = "corridor";
  state.killer.targetRoomId = null;
  assert.equal(chooseLocalAction(state).target, "ward");
  assert.equal(state.keycard, false);
  assert.equal(state.power, false);
  state.roomId = "archive";
  state.killer.roomId = "archive";
  assert.equal(chooseLocalAction(state).action, "move");
  state.killer.roomId = "reception";
  assert.equal(chooseLocalAction(state).action, "search");
});

test("contact records first awareness and applies bounded fear only once per twelve seconds", () => {
  const state = createState(123);
  state.status = "running";
  state.controller = "api";
  state.killer.roomId = state.roomId;
  tick(state, 0.01);
  assert.equal(state.killer.encountered, true);
  assert.equal(state.killer.encounterCount, 1);
  assert.equal(state.killer.lastEncounterAt, 0);
  assert.ok(Math.abs(state.fear - 13.0012) < 1e-7);
  tick(state, 11.98);
  assert.equal(state.killer.encounterCount, 1);
  tick(state, 0.02);
  assert.equal(state.killer.encounterCount, 2);
  assert.ok(Math.abs(state.killer.lastEncounterAt! - 12) < 1e-7);
  assert.equal(state.status, "running");
});

test("first contact interrupts unfinished stationary work for a fresh API decision", () => {
  for (const action of ["search", "restore", "unlock", "wait"] as const) {
    const state = createState(123);
    state.status = "running";
    state.controller = "api";
    state.roomId = action === "search" ? "archive" : action === "restore" ? "generator" : action === "unlock" ? "exit" : "reception";
    if (action === "unlock") { state.keycard = true; state.power = true; }
    assert.equal(applyDecision(state, { action, target: state.roomId, reason: "unfinished work" }), true);
    tick(state, 0.5);
    assert.ok(state.progress > 0);
    state.killer.roomId = state.roomId;
    state.killer.targetRoomId = null;
    state.killer.moveElapsed = 0;
    state.killer.moveDuration = 0;
    state.killer.progress = 0;
    tick(state, 0.01);
    assert.equal(state.killer.encountered, true, action);
    assert.equal(state.currentAction, null, action);
    assert.equal(state.targetRoomId, null, action);
    assert.equal(state.progress, 0, action);
    assert.equal(state.status, "running", action);
    if (action === "search") assert.equal(state.keycard, false);
    if (action === "restore") assert.equal(state.power, false);
  }
});

test("first contact preserves movement and subsequent contact preserves stationary work", () => {
  const moving = createState(123);
  moving.status = "running";
  moving.controller = "api";
  assert.equal(applyDecision(moving, { action: "move", target: "ward", reason: "leave" }), true);
  tick(moving, 0.5);
  const move = moving.currentAction;
  const progress = moving.progress;
  moving.killer.roomId = moving.roomId;
  moving.killer.targetRoomId = null;
  tick(moving, 0.01);
  assert.equal(moving.killer.encounterCount, 1);
  assert.equal(moving.currentAction, move);
  assert.equal(moving.targetRoomId, "ward");
  assert.ok(moving.progress > progress);

  const waiting = createState(123);
  waiting.status = "running";
  waiting.controller = "api";
  waiting.killer.roomId = waiting.roomId;
  tick(waiting, 11.99);
  assert.equal(waiting.killer.encounterCount, 1);
  assert.equal(applyDecision(waiting, { action: "wait", target: waiting.roomId, reason: "breathe" }), true);
  const wait = waiting.currentAction;
  tick(waiting, 0.02);
  assert.equal(waiting.killer.encounterCount, 2);
  assert.equal(waiting.currentAction, wait);
  assert.ok(waiting.progress > 0);
});

test("a local first-contact interruption immediately leads to retreat and objective recovery", () => {
  const state = createState(123);
  state.status = "running";
  state.roomId = "archive";
  assert.equal(applyDecision(state, { action: "search", target: "archive", reason: "find key" }), true);
  tick(state, 0.5);
  state.killer.roomId = "archive";
  state.killer.targetRoomId = null;
  tick(state, 0.01);
  assert.equal(state.killer.encountered, true);
  assert.equal(state.keycard, false);
  assert.equal(state.currentAction?.action, "move");
  tick(state, 180);
  assert.equal(state.status, "escaped");
  assert.equal(state.keycard, true);
  assert.equal(state.power, true);
});

test("retreating after contact does not strand Sam away from an unfinished objective", () => {
  for (const roomId of ["archive", "generator", "exit"] as const) {
    const state = createState(123);
    state.status = "running";
    state.roomId = roomId;
    state.killer.roomId = roomId;
    if (roomId !== "archive") state.keycard = true;
    if (roomId === "exit") state.power = true;
    tick(state, 0.01);
    assert.equal(state.killer.encountered, true);
    assert.equal(state.currentAction?.action, "move", "contact prompts a retreat before working in the shared room");
    tick(state, 180);
    assert.equal(state.status, "escaped", roomId);
    assert.equal(state.keycard, true);
    assert.equal(state.power, true);
    assert.equal(state.roomId, "exit");
    assert.ok(state.elapsed < 100, "retreats must leave time to complete objectives");
  }
});

test("Sam retreats before calming down when the known killer shares an escapable room", () => {
  const state = createState(123);
  state.status = "running";
  state.fear = 60;
  state.killer.roomId = state.roomId;
  state.killer.encountered = true;
  const escape = chooseLocalAction(state);
  assert.equal(escape.action, "move");
  assert.equal(applyDecision(state, escape), true);
  state.currentAction = null;
  state.targetRoomId = null;
  state.locks.reception = 12;
  assert.equal(chooseLocalAction(state).action, "wait", "a sealed room preserves the existing fear response");
  delete state.locks.reception;
  state.locks.corridor = 12;
  state.locks.ward = 12;
  assert.equal(chooseLocalAction(state).action, "wait", "calming is still valid when no retreat is legal");
});

test("terminal fear crossing advances the pursuer to the same instant for every frame size", () => {
  function run(frameSize: number) {
    const state = createState(123);
    state.status = "running";
    state.controller = "api";
    state.fear = 99.99;
    while (state.status === "running") tick(state, frameSize);
    return state;
  }
  const coarse = run(180);
  const fine = run(0.01);
  assert.equal(coarse.status, "contained");
  assert.ok(Math.abs(coarse.elapsed - fine.elapsed) < 1e-7);
  assert.ok(Math.abs(coarse.killer.progress - fine.killer.progress) < 1e-7);
  assert.ok(Math.abs(coarse.killer.moveElapsed - coarse.elapsed) < 1e-7);
});

test("Tibo only resets the four intervention cooldowns and leaves active work intact", () => {
  const state = createState(123);
  state.status = "running";
  state.controller = "api";
  assert.equal(sabotage(state, "blackout", "archive"), true);
  assert.equal(sabotage(state, "lock", "archive"), true);
  assert.equal(sabotage(state, "whisper", "archive"), true);
  assert.equal(sabotage(state, "apparition", "archive"), true);
  assert.equal(applyDecision(state, { action: "move", target: "ward", reason: "continue moving" }), true);
  state.tibo.nextAppearanceAt = 0;
  const control = structuredClone(state);
  control.tibo.nextAppearanceAt = 1000;
  tick(state, 0.01);
  tick(control, 0.01);
  assert.deepEqual(state.cooldowns, { blackout: 0, lock: 0, whisper: 0, apparition: 0 });
  assert.equal(state.tibo.appearances, 1);
  assert.equal(state.tibo.lastAppearanceAt, 0);
  assert.ok(state.tibo.nextAppearanceAt >= 24 && state.tibo.nextAppearanceAt <= 42);
  for (const field of ["energy", "fear", "progress", "currentAction", "effects", "locks", "inventory", "interventionHistory", "interventions", "killer"] as const)
    assert.deepEqual(state[field], control[field], field);
  assert.equal(state.energy < 15, true);
  assert.equal(sabotage(state, "whisper", "archive"), false, "Tibo does not waive energy cost");
});

test("seeded appearances repeat, vary across seeds, and zero seed is nondegenerate", () => {
  assert.deepEqual(createState(123), createState(123));
  assert.deepEqual(createState(), createState());
  assert.notEqual(createState(123).tibo.nextAppearanceAt, createState(456).tibo.nextAppearanceAt);
  for (const seed of [0, 123, 456]) {
    const state = createState(seed);
    assert.ok(state.randomSeed !== 0);
    assert.ok(state.tibo.nextAppearanceAt >= 18 && state.tibo.nextAppearanceAt <= 30);
    state.status = "running";
    state.controller = "api";
    tick(state, state.tibo.nextAppearanceAt);
    assert.equal(state.tibo.appearances, 1, "appearance fires at the exact boundary");
  }
});

test("waiting, pause, thinking, and terminal states freeze pursuit, randomness, and appearances", () => {
  for (const mode of ["waiting", "paused", "thinking", "escaped", "contained"] as const) {
    const state = createState(123);
    state.status = "running";
    if (mode === "paused") state.paused = true;
    else if (mode === "thinking") state.thinking = true;
    else state.status = mode;
    const before = structuredClone(state);
    tick(state, 180);
    assert.deepEqual(state, before, mode);
  }
});

test("pursuit, encounters, seeded Tibo events, and objectives ignore incoming frame size", () => {
  function run(frameSize: number, controller: "local" | "api", interruptWork = false) {
    const state = createState(123);
    state.status = "running";
    state.controller = controller;
    if (interruptWork) {
      state.roomId = "archive";
      state.killer.roomId = "ward";
      state.killer.targetRoomId = "archive";
      state.killer.moveDuration = 2;
      assert.equal(applyDecision(state, { action: "search", target: "archive", reason: "interrupted search" }), true);
    }
    sabotage(state, "blackout", "archive");
    while (state.status === "running") tick(state, frameSize);
    return state;
  }
  function compare(actual: unknown, expected: unknown, path = "state"): void {
    if (typeof actual === "number" && typeof expected === "number") {
      assert.ok(Math.abs(actual - expected) < 1e-7, `${path}: ${actual} vs ${expected}`);
    } else if (actual && expected && typeof actual === "object" && typeof expected === "object") {
      assert.deepEqual(Object.keys(actual), Object.keys(expected), path);
      for (const key of Object.keys(actual)) compare(
        (actual as Record<string, unknown>)[key],
        (expected as Record<string, unknown>)[key], `${path}.${key}`,
      );
    } else assert.equal(actual, expected, path);
  }
  for (const interruptWork of [false, true]) {
    for (const controller of ["local", "api"] as const) {
      const expected = run(180, controller, interruptWork);
      assert.ok(expected.killer.encounterCount >= 1);
      assert.ok(expected.tibo.appearances >= (controller === "api" && !interruptWork ? 4 : 1));
      compare(run(0.1, controller, interruptWork), expected);
      compare(run(0.5, controller, interruptWork), expected);
      if (controller === "local") {
        assert.equal(expected.status, "escaped");
        assert.equal(expected.keycard, true);
        assert.equal(expected.power, true);
      }
    }
  }
});
