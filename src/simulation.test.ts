import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDecision,
  applyKillerDecision,
  killerDecisions,
  killerGoal,
  killerTravelCost,
  ROOMS,
  CONNECTIONS,
  HIDEOUT,
  canHide,
  isHiding,
  chooseLocalAction,
  createState,
  sabotage,
  tick,
  type SabotageType,
} from "./simulation.ts";

function keepKillerOutOfRoute(state: ReturnType<typeof createState>) {
  state.killer.spawned = true;
  state.killer.roomId = "laboratory";
  state.killer.targetRoomId = "laboratory";
  state.killer.moveElapsed = 0;
  state.killer.moveDuration = Number.POSITIVE_INFINITY;
  state.killer.progress = 0;
}

test("autonomous agent collects objectives and escapes in a playable time window", () => {
  const state = createState();
  state.status = "running";
  keepKillerOutOfRoute(state);
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
  assert.equal(state.terminalReason, "escaped");
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
  keepKillerOutOfRoute(state);
  assert.equal(sabotage(state, "lock", "ward"), true);
  const decision = chooseLocalAction(state);
  assert.equal(decision.action, "move");
  assert.equal(decision.target, "corridor");
  assert.equal(applyDecision(state, decision), true);
  tick(state, 180);
  assert.equal(state.status, "escaped");
});

test("a sealed room blocks Sam from entering or leaving and reports the blocked side", () => {
  const entering = createState();
  entering.status = "running";
  entering.controller = "api";
  entering.locks.ward = 12;
  assert.equal(applyDecision(entering, { action: "move", target: "ward", reason: "入る" }, "api"), false);
  assert.match(entering.decisions[0]!.reason, /入室できない/);

  const exiting = createState();
  exiting.status = "running";
  exiting.controller = "api";
  exiting.roomId = "ward";
  exiting.locks.ward = 12;
  assert.equal(applyDecision(exiting, { action: "move", target: "archive", reason: "出る" }, "api"), false);
  assert.match(exiting.decisions[0]!.reason, /退室できない/);
  assert.equal(exiting.roomId, "ward");
});

test("locking Sam's occupied room interrupts his exit and keeps him there until it opens", () => {
  const state = createState();
  state.status = "running";
  state.controller = "api";
  keepKillerOutOfRoute(state);
  assert.equal(applyDecision(state, { action: "move", target: "corridor", reason: "退室する" }), true);
  assert.equal(sabotage(state, "lock", "reception"), true);
  assert.equal(state.currentAction, null);
  assert.equal(state.roomId, "reception");
  assert.equal(state.interventionHistory[0]?.interruptedMove, true);
  assert.equal(applyDecision(state, { action: "move", target: "corridor", reason: "退室する" }), false);
  assert.equal(state.roomId, "reception");

  tick(state, 12);
  assert.equal(applyDecision(state, { action: "move", target: "corridor", reason: "扉が開いたので退室する" }), true);
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
  keepKillerOutOfRoute(state);
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
  const state = createState(1);
  state.status = "running";
  keepKillerOutOfRoute(state);
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
    keepKillerOutOfRoute(state);
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
  assert.equal(state.currentAction, null);
  assert.equal(state.targetRoomId, null);
  assert.equal(state.interventionHistory[0].affectedSubject, true);
  assert.equal(state.interventionHistory[0].type, "lock");
  assert.equal(state.interventionHistory[0].interruptedMove, true);
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
  keepKillerOutOfRoute(state);
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

test("the pursuer approaches Sam over legal edges and records contact", () => {
  const state = createState(123);
  state.status = "running";
  assert.equal(state.roomId, "reception");
  assert.equal(state.killer.roomId, "laboratory");
  assert.equal(state.killer.encountered, false);
  assert.equal(state.killer.lastEncounterAt, null);
  state.killer.spawned = true;
  let transitions = 0;
  for (let frame = 0; frame < 1200 && state.status === "running"; frame++) {
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
  assert.ok(transitions >= 1);
  assert.equal(state.killer.encountered, true);
  assert.ok(["contained", "escaped"].includes(state.status));
  assert.notEqual(state.terminalReason, null);
});

test("Sam cannot route around an unseen killer but avoids its room after first contact", () => {
  const state = createState(123);
  state.status = "running";
  const expected = chooseLocalAction(state);
  for (const roomId of ["corridor", "ward", "reception", "archive"] as const) {
    state.killer.spawned = true;
    state.killer.roomId = roomId;
    state.killer.targetRoomId = "archive";
    assert.deepEqual(chooseLocalAction(state), expected);
  }
  state.killer.spawned = true;
  state.killer.encountered = true;
  state.killer.encounterCount = 1;
  state.killer.spawned = true;
  state.killer.roomId = "corridor";
  state.killer.targetRoomId = null;
  assert.equal(chooseLocalAction(state).target, "ward");
  assert.equal(state.keycard, false);
  assert.equal(state.power, false);
  state.roomId = "archive";
  state.killer.spawned = true;
  state.killer.roomId = "archive";
  assert.equal(chooseLocalAction(state).action, "move");
  state.killer.spawned = true;
  state.killer.roomId = "reception";
  state.hideout.completed = 1; // After the refuge visit, ordinary objective work resumes.
  assert.equal(chooseLocalAction(state).action, "search");
});

test("first contact records capture and gameplay continues", () => {
  const state = createState(123);
  state.status = "running";
  state.controller = "api";
  state.killer.spawned = true;
  state.killer.roomId = state.roomId;
  tick(state, 0.01);
  assert.equal(state.killer.encountered, true);
  assert.equal(state.killer.encounterCount, 1);
  assert.equal(state.killer.lastEncounterAt, 0);
  assert.equal(state.status, "running");
  assert.equal(state.terminalReason, null);
  assert.equal(state.outcome, "ぬこぬこさんがサムに接触。恐怖100に達すると実験終了。");
  assert.ok(state.elapsed > 0);
  assert.equal(state.decisions[0]!.source, "system");
  const elapsed = state.elapsed;
  tick(state, 30);
  assert.equal(state.status, "running");
  assert.ok(state.elapsed > elapsed);
});

test("contact does not interrupt unfinished stationary work or movement", () => {
  for (const action of ["search", "restore", "unlock", "wait"] as const) {
    const state = createState(123);
    state.status = "running";
    state.controller = "api";
    state.roomId = action === "search" ? "archive" : action === "restore" ? "generator" : action === "unlock" ? "exit" : "reception";
    if (action === "unlock") { state.keycard = true; state.power = true; }
    assert.equal(applyDecision(state, { action, target: state.roomId, reason: "unfinished work" }), true);
    tick(state, 0.5);
    assert.ok(state.progress > 0);
    state.killer.spawned = true;
    state.killer.roomId = state.roomId;
    state.killer.targetRoomId = null;
    state.killer.moveElapsed = 0;
    state.killer.moveDuration = 0;
    state.killer.progress = 0;
    tick(state, 0.01);
    assert.equal(state.killer.encountered, true, action);
    assert.equal(state.currentAction?.action, action, action);
    assert.ok(state.progress > 0, action);
    assert.equal(state.status, "running", action);
    assert.equal(state.terminalReason, null, action);
    if (action === "search") assert.equal(state.keycard, false);
    if (action === "restore") assert.equal(state.power, false);
  }
  const moving = createState(123);
  moving.status = "running";
  moving.controller = "api";
  assert.equal(applyDecision(moving, { action: "move", target: "ward", reason: "leave" }), true);
  tick(moving, 0.5);
  const progress = moving.progress;
  moving.killer.spawned = true;
  moving.killer.roomId = moving.roomId;
  moving.killer.targetRoomId = null;
  tick(moving, 0.01);
  assert.equal(moving.killer.encounterCount, 1);
  assert.equal(moving.currentAction?.action, "move");
  assert.ok(moving.progress > progress);
  assert.equal(moving.status, "running");
  assert.equal(moving.terminalReason, null);
});

test("Sam entering the pursuer's room records contact and continues", () => {
  const state = createState(123);
  state.status = "running";
  state.controller = "api";
  state.roomId = "corridor";
  state.killer.spawned = true;
  state.killer.roomId = "archive";
  state.killer.targetRoomId = "archive";
  state.killer.moveDuration = Number.POSITIVE_INFINITY;
  assert.equal(applyDecision(state, { action: "move", target: "archive", reason: "enter killer room" }, "api"), true);
  tick(state, 10);
  assert.equal(state.killer.encountered, true);
  assert.equal(state.status, "running");
  assert.equal(state.terminalReason, null);
  assert.equal(state.roomId, "archive");
});

test("pursuer contact is recorded at the current room regardless of pending objective", () => {
  for (const roomId of ["archive", "generator", "exit"] as const) {
    const state = createState(123);
    state.status = "running";
    state.roomId = roomId;
    state.killer.spawned = true;
    state.killer.roomId = roomId;
    if (roomId !== "archive") state.keycard = true;
    if (roomId === "exit") state.power = true;
    tick(state, 0.01);
    assert.equal(state.killer.encountered, true);
    assert.equal(state.status, "running", roomId);
    assert.equal(state.terminalReason, null, roomId);
  }
});

test("fear reaching 100 ends the run, with captured outcome only after contact", () => {
  const caught = createState(123);
  caught.status = "running";
  caught.controller = "api";
  caught.fear = 99.5;
  caught.killer.spawned = true;
  caught.killer.roomId = caught.roomId;
  tick(caught, 0.01);
  assert.equal(caught.killer.encountered, true);
  assert.equal(caught.status, "running");
  assert.ok(caught.fear >= 99.5, "contact must not lower an already high fear level");
  tick(caught, 10);
  assert.equal(caught.status, "contained");
  assert.equal(caught.terminalReason, "fear");
  assert.equal(caught.fear, 100);
  assert.match(caught.outcome, /捕獲/);

  const uncaught = createState(123);
  uncaught.status = "running";
  uncaught.controller = "api";
  uncaught.fear = 99.9;
  uncaught.killer.spawned = true;
  uncaught.killer.roomId = "laboratory";
  tick(uncaught, 1);
  assert.equal(uncaught.killer.encountered, false);
  assert.equal(uncaught.status, "contained");
  assert.equal(uncaught.terminalReason, "fear");
  assert.match(uncaught.outcome, /恐怖/);
});

test("Sam retreats before calming down when the known killer shares an escapable room", () => {
  const state = createState(123);
  state.status = "running";
  state.fear = 60;
  state.killer.spawned = true;
  state.killer.roomId = state.roomId;
  state.killer.spawned = true;
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
    state.killer.spawned = true;
    const decision = killerDecisions(state).find((choice) => applyKillerDecision(structuredClone(state), choice))!;
    assert.equal(applyKillerDecision(state, decision), true);
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

test("Tibo restores energy to 100 and resets cooldowns while leaving active work intact", () => {
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
  for (const field of ["fear", "progress", "currentAction", "effects", "locks", "inventory", "interventionHistory", "interventions", "killer"] as const)
    assert.deepEqual(state[field], control[field], field);
  assert.equal(state.energy, 100);
  assert.equal(sabotage(state, "whisper", "archive"), true, "restored energy funds another intervention");
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

test("pursuit contact and seeded Tibo events ignore incoming frame size", () => {
  function run(frameSize: number, controller: "local" | "api", interruptWork = false) {
    const state = createState(123);
    state.status = "running";
    state.controller = controller;
    state.tibo.nextAppearanceAt = 0.1;
    if (interruptWork) {
      state.roomId = "archive";
      state.killer.spawned = true;
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
      if (controller === "local" || interruptWork) assert.ok(expected.killer.encounterCount >= 1);
      else assert.equal(expected.killer.encounterCount, 0, "API mode cannot invent pursuit choices");
      assert.ok(expected.tibo.appearances >= 1);
      compare(run(0.1, controller, interruptWork), expected);
      compare(run(0.5, controller, interruptWork), expected);
      if (controller === "local") {
        assert.ok(["contained", "escaped"].includes(expected.status));
        assert.ok(["fear", "deadline", "escaped"].includes(expected.terminalReason!));
      }
    }
  }
});

function wardRefugeState() {
  const state = createState(123);
  state.status = "running";
  state.controller = "local";
  state.roomId = "ward";
  state.killer.spawned = true;
  state.killer.roomId = "ward";
  state.killer.spawned = true;
  state.killer.encountered = true;
  state.killer.encounterCount = 1;
  state.killer.lastEncounterAt = 0;
  return state;
}
const hideDecision = { action: "hide", target: "ward", reason: "ベッドの陰で追跡をやり過ごす" } as const;

test("hide validator rejects unseen, distant, locked, busy, paused, or cooling-down refuge use without mutation", () => {
  for (const invalid of ["unseen", "distant", "target", "locked", "busy", "paused", "cooldown"] as const) {
    const state = wardRefugeState();
    if (invalid === "unseen") state.killer.encountered = false;
    if (invalid === "distant") state.roomId = "archive";
    if (invalid === "locked") state.locks.ward = 12;
    if (invalid === "paused") state.paused = true;
    if (invalid === "cooldown") state.hideout.availableAt = 42;
    if (invalid === "busy") assert.equal(applyDecision(state, { action: "wait", target: "ward", reason: "wait" }), true);
    const before = structuredClone(state);
    assert.equal(applyDecision(state, invalid === "target" ? { ...hideDecision, target: "archive" } : hideDecision, "api"), false, invalid);
    assert.deepEqual(state, before, invalid);
  }
  const valid = wardRefugeState();
  assert.equal(canHide(valid), true);
  assert.equal(applyDecision(valid, hideDecision, "api"), true);
  assert.equal(isHiding(valid), true);
  assert.equal(valid.currentAction!.duration, HIDEOUT.duration);
  assert.equal(valid.hideout.availableAt, HIDEOUT.cooldown);
  assert.equal(valid.decisions[0].source, "api");
});

test("ward concealment prevents contact and sends the pursuer away before Sam reappears", () => {
  const state = wardRefugeState();
  const fearBefore = state.fear;
  assert.equal(applyDecision(state, hideDecision), true);
  tick(state, HIDEOUT.duration);
  assert.equal(state.hideout.completed, 1);
  assert.equal(isHiding(state), false);
  assert.equal(state.killer.encounterCount, 1, "sharing the room while concealed never triggers another encounter");
  assert.notEqual(state.killer.roomId, "ward", "the killer really leaves before concealment ends");
  assert.notEqual(state.killer.targetRoomId, "ward");
  assert.ok(state.fear < fearBefore);
  assert.equal(state.hideout.lostUntil, HIDEOUT.duration + HIDEOUT.lostDuration);
  assert.equal(canHide(state), false, "the same spot cannot immediately hide Sam again");
  tick(state, HIDEOUT.lostDuration - 0.1);
  assert.notEqual(state.killer.targetRoomId, "ward", "the killer keeps searching elsewhere for the promised respite");
  keepKillerOutOfRoute(state);
  state.controller = "local";
  tick(state, 180);
  assert.equal(state.status, "escaped");
  assert.equal(state.keycard, true);
  assert.equal(state.power, true);
  assert.equal(state.hideout.completed, 1, "local policy returns to its escape objectives after one refuge visit");
});

test("eight known-threat seeds send Sam to the ward hideout and then complete the escape", () => {
  for (const seed of [1, 2, 3, 7, 42, 123, 0x53414d, 0xffffffff]) {
    const state = createState(seed);
    state.status = "running";
    state.killer.spawned = true;
    state.killer.encountered = true;
    state.killer.encounterCount = 1;
    keepKillerOutOfRoute(state);
    for (let frame = 0; frame < 1800 && state.status === "running"; frame++) {
      tick(state, 0.1);
      if (state.hideout.completed) keepKillerOutOfRoute(state);
    }
    assert.equal(state.status, "escaped", `seed ${seed}`);
    assert.equal(state.hideout.completed, 1, `seed ${seed}`);
    assert.ok(state.visited.includes("ward"), `seed ${seed}`);
    const hide = state.decisions.find((decision) => decision.action === "hide" && decision.source === "local");
    assert.ok(hide, `seed ${seed} chose the hiding action`);
    assert.ok(state.decisions.some((decision) => decision.time > hide.time + HIDEOUT.duration - 1e-7 && decision.action === "restore"));
    assert.equal(state.keycard && state.power, true);
    assert.ok(state.elapsed < 110, `seed ${seed}: ${state.elapsed}s leaves time for human interference`);
  }
});

test("blackout and a sealed ward still affect hidden Sam, and apparition flushes him out", () => {
  const state = wardRefugeState();
  state.fear = 20;
  assert.equal(applyDecision(state, hideDecision), true);
  assert.equal(sabotage(state, "blackout", "ward"), true);
  assert.equal(sabotage(state, "lock", "ward"), true);
  const fearAfterHits = state.fear;
  tick(state, 12);
  assert.equal(isHiding(state), true, "blackout and a door seal do not erase concealment");
  assert.ok(Math.abs(state.currentAction!.elapsed - 12) < 1e-7, "concealment keeps its fixed real duration in darkness");
  assert.ok(state.fear > fearAfterHits, "darkness still raises fear behind the bed");
  assert.equal(sabotage(state, "apparition", "archive"), true);
  assert.equal(isHiding(state), true, "an apparition in a different room cannot flush the hideout");
  state.cooldowns.apparition = 0;
  state.energy = 100;
  assert.equal(sabotage(state, "apparition", "ward"), true);
  assert.equal(isHiding(state), false);
  assert.equal(state.hideout.completed, 0);
  assert.equal(state.hideout.lostUntil, state.elapsed);
  assert.equal(state.hideout.availableAt, HIDEOUT.cooldown, "interruption cannot refund the hiding cooldown");
  assert.equal(state.currentAction, null);
  assert.match(state.decisions[0].reason, /隠れ場所から飛び出し/);
  tick(state, 0.1);
  assert.equal(state.killer.targetRoomId, "ward", "the pursuer immediately resumes Sam's trail");
});

test("hide timers freeze during pause and thinking, and large ticks preserve concealment boundaries", () => {
  for (const mode of ["paused", "thinking"] as const) {
    const state = wardRefugeState();
    assert.equal(applyDecision(state, hideDecision), true);
    tick(state, 2);
    state[mode] = true;
    const before = structuredClone(state);
    tick(state, 180);
    assert.deepEqual(state, before, mode);
    state[mode] = false;
    tick(state, HIDEOUT.duration - 2);
    assert.equal(state.hideout.completed, 1);
  }
  function run(frameSize: number) {
    const state = wardRefugeState();
    assert.equal(applyDecision(state, hideDecision), true);
    while (state.elapsed < 48 - 1e-7) tick(state, Math.min(frameSize, 48 - state.elapsed));
    return JSON.parse(JSON.stringify(state, (_key, value) => typeof value === "number" ? Math.round(value * 1e6) / 1e6 : value));
  }
  assert.deepEqual(run(48), run(1 / 60));
});


test("API killer never starts a local pursuit and only accepts a shortest adjacent move", () => {
  const state = createState(123);
  state.killer.spawned = true;
  state.status = "running";
  state.controller = "api";
  tick(state, 1);
  assert.equal(state.killer.targetRoomId, null);
  const choices = killerDecisions(state);
  assert.ok(choices.length >= 2);
  const shortest = choices.filter((choice) => applyKillerDecision(structuredClone(state), choice));
  assert.ok(shortest.length >= 1);
  for (const action of [{ action: "move", target: "ward" }, { action: "wait", target: state.killer.roomId }, { action: "move", target: "not-a-room" }]) {
    assert.equal(applyKillerDecision(state, { ...action, reason: "invalid" } as never), false);
  }
  const nonoptimal = choices.find((choice) => choice.action === "move" && !shortest.includes(choice));
  if (nonoptimal) assert.equal(applyKillerDecision(state, nonoptimal), false);
  assert.equal(applyKillerDecision(state, shortest[0]), true);
  assert.equal(state.decisions[0].actor, "killer");
  tick(state, state.killer.moveDuration);
  assert.equal(state.killer.targetRoomId, null, "no automatic next edge in API mode");
});

test("weighted routes use actual travel time and preserve equally optimal next steps", () => {
  const state = createState(); state.status = "running"; state.controller = "api";
  state.killer.spawned = true;
  state.killer.roomId = "corridor"; state.roomId = "ward";
  const positions = ROOMS.map((room) => ({ x: room.x, y: room.y, w: room.w, h: room.h }));
  try {
    for (const room of ROOMS) Object.assign(room, { x: 0, y: 0, w: 1, h: 1 });
    assert.equal(killerTravelCost("corridor", "ward"), 2);
    const optimal = killerDecisions(state).filter((choice) => applyKillerDecision(structuredClone(state), choice));
    assert.deepEqual(optimal.map((choice) => choice.target).sort(), ["archive", "reception"]);
    ROOMS.find((room) => room.id === "reception")!.x = 1000;
    const weighted = killerDecisions(state).filter((choice) => applyKillerDecision(structuredClone(state), choice));
    assert.deepEqual(weighted.map((choice) => choice.target), ["archive"]);
  } finally { ROOMS.forEach((room, index) => Object.assign(room, positions[index])); }
});

test("killer intercepts visible destinations but concealed Sam does not enter the request", async () => {
  const { createKillerDecisionRequest, createDecisionRequest, legalDecisions } = await import("./live-contract.ts");
  const state = createState(); state.status = "running"; state.controller = "api";
  state.targetRoomId = "ward";
  assert.equal(killerGoal(state), "ward");
  state.hideout.lostUntil = 10;
  assert.equal(killerGoal(state), "laboratory");
  state.killer.spawned = true;
  state.killer.roomId = "corridor";
  const request = createKillerDecisionRequest(state, killerDecisions(state), "session", "token");
  assert.equal(request.actor, "killer");
  assert.equal("samRoom" in request.snapshot, false);
  assert.equal("samTargetRoom" in request.snapshot, false);
  state.decisions.unshift({ time: 0, action: "move", target: "corridor", reason: "killer secret", source: "api", actor: "killer" });
  const sam = createDecisionRequest(state, "plan", legalDecisions(state), "session", "token");
  assert.equal(JSON.stringify(sam.snapshot).includes("killer secret"), false);
  assert.equal("knownKiller" in sam.snapshot, false);
});


test("Nuko is dormant until the exact keycard completion and resets absent", () => {
  for (const controller of ["local", "api"] as const) {
    const state = createState(123); state.status = "running"; state.controller = controller;
    assert.equal(state.killer.spawned, false);
    assert.equal(state.killer.roomId, "laboratory");
    state.roomId = "laboratory";
    tick(state, 0.1);
    assert.equal(state.killer.encountered, false, "dormant actor cannot contact Sam");
    assert.equal(state.killer.targetRoomId, null);
    assert.deepEqual(killerDecisions(state), []);
    assert.equal(applyKillerDecision(state, { action: "move", target: "corridor", reason: "premature" }), false);
    state.roomId = "archive"; state.currentAction = null; state.targetRoomId = null;
    assert.equal(applyDecision(state, { action: "search", target: "archive", reason: "collect keycard" }), true);
    const duration = state.currentAction!.duration;
    tick(state, duration - 0.01);
    assert.equal(state.keycard, false);
    assert.equal(state.killer.spawned, false);
    tick(state, 0.01);
    assert.equal(state.keycard, true);
    assert.equal(state.killer.spawned, true);
    assert.equal(state.killer.roomId, "laboratory");
    assert.equal(state.inventory.filter((item) => item === "SECURITY KEYCARD").length, 1);
    tick(state, 0.01);
    assert.equal(state.killer.spawned, true);
    assert.equal(createState(123).killer.spawned, false);
  }
});
