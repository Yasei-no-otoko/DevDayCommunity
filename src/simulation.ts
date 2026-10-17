/** Serializable, deterministic game rules. The renderer never owns simulation state. */
export type RoomId =
  | "reception"
  | "corridor"
  | "ward"
  | "archive"
  | "laboratory"
  | "generator"
  | "exit";
export type SabotageType = "blackout" | "lock" | "whisper" | "apparition";
export type ActionType = "move" | "search" | "restore" | "unlock" | "wait";
export interface Room {
  id: RoomId;
  name: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  clue: string;
}
export const ROOMS: Room[] = [
  {
    id: "reception",
    name: "RECEPTION",
    label: "01",
    x: 120,
    y: 430,
    w: 220,
    h: 170,
    clue: "A staff note points to the archive. Find a security keycard.",
  },
  {
    id: "corridor",
    name: "CENTRAL HALL",
    label: "02",
    x: 365,
    y: 370,
    w: 260,
    h: 150,
    clue: "The exit panel needs a keycard and emergency power.",
  },
  {
    id: "ward",
    name: "ISOLATION WARD",
    label: "03",
    x: 120,
    y: 160,
    w: 220,
    h: 200,
    clue: "Archive access is possible through the ward or central hall.",
  },
  {
    id: "archive",
    name: "ARCHIVE",
    label: "04",
    x: 400,
    y: 130,
    w: 210,
    h: 170,
    clue: "A security keycard is hidden in the records cabinet.",
  },
  {
    id: "laboratory",
    name: "LABORATORY",
    label: "05",
    x: 700,
    y: 130,
    w: 210,
    h: 200,
    clue: "The laboratory service door leads to the emergency generator.",
  },
  {
    id: "generator",
    name: "GENERATOR",
    label: "06",
    x: 700,
    y: 410,
    w: 210,
    h: 170,
    clue: "Restore the emergency generator to power the exit lock.",
  },
  {
    id: "exit",
    name: "EXIT",
    label: "07",
    x: 470,
    y: 565,
    w: 150,
    h: 75,
    clue: "The final security door can be opened with power and a keycard.",
  },
];
export const CONNECTIONS: [RoomId, RoomId][] = [
  ["reception", "corridor"],
  ["reception", "ward"],
  ["ward", "archive"],
  ["archive", "corridor"],
  ["corridor", "laboratory"],
  ["corridor", "generator"],
  ["corridor", "exit"],
  ["laboratory", "generator"],
];
export const SABOTAGE: Record<
  SabotageType,
  { cost: number; cooldown: number; duration: number; fear: number }
> = {
  blackout: { cost: 25, cooldown: 14, duration: 14, fear: 3 },
  lock: { cost: 20, cooldown: 10, duration: 12, fear: 2 },
  whisper: { cost: 15, cooldown: 10, duration: 10, fear: 8 },
  apparition: { cost: 40, cooldown: 18, duration: 6, fear: 17 },
};
export interface Decision {
  action: ActionType;
  target: RoomId;
  reason: string;
}
export interface Action extends Decision {
  elapsed: number;
  duration: number;
}
export interface DecisionLog {
  time: number;
  action: string;
  target: RoomId;
  reason: string;
  source: "local" | "api" | "system";
}
export interface Effect {
  id: number;
  type: SabotageType;
  roomId: RoomId;
  expiresAt: number;
}
export interface GameState {
  status: "waiting" | "running" | "escaped" | "contained";
  paused: boolean;
  controller: "local" | "api";
  thinking: boolean;
  elapsed: number;
  timeRemaining: number;
  energy: number;
  fear: number;
  roomId: RoomId;
  targetRoomId: RoomId | null;
  currentAction: Action | null;
  progress: number;
  inventory: string[];
  keycard: boolean;
  power: boolean;
  decisions: DecisionLog[];
  interventions: number;
  effects: Effect[];
  locks: Partial<Record<RoomId, number>>;
  cooldowns: Record<SabotageType, number>;
  visited: RoomId[];
  clues: string[];
  outcome: string;
}
export function createState(): GameState {
  return {
    status: "waiting",
    paused: false,
    controller: "local",
    thinking: false,
    elapsed: 0,
    timeRemaining: 180,
    energy: 100,
    fear: 8,
    roomId: "reception",
    targetRoomId: null,
    currentAction: null,
    progress: 0,
    inventory: [],
    keycard: false,
    power: false,
    decisions: [],
    interventions: 0,
    effects: [],
    locks: {},
    cooldowns: { blackout: 0, lock: 0, whisper: 0, apparition: 0 },
    visited: ["reception"],
    clues: [ROOMS[0].clue],
    outcome: "",
  };
}
function log(
  state: GameState,
  decision: Decision,
  source: DecisionLog["source"],
): void {
  state.decisions.unshift({ ...decision, time: state.elapsed, source });
  state.decisions.length = Math.min(state.decisions.length, 40);
}
function adjacent(a: RoomId, b: RoomId): boolean {
  return CONNECTIONS.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}
function locked(state: GameState, id: RoomId): boolean {
  return (state.locks[id] ?? 0) > state.elapsed;
}
function affected(state: GameState, id: RoomId, type?: SabotageType): boolean {
  return state.effects.some(
    (e) =>
      e.roomId === id &&
      e.expiresAt > state.elapsed &&
      (!type || e.type === type),
  );
}
function movementDuration(a: RoomId, b: RoomId): number {
  const first = ROOMS.find((r) => r.id === a)!;
  const second = ROOMS.find((r) => r.id === b)!;
  return (
    Math.hypot(
      first.x + first.w / 2 - second.x - second.w / 2,
      first.y + first.h / 2 - second.y - second.h / 2,
    ) / 48
  );
}
/** Dijkstra favors safe routes, so a locked hall can lead to the laboratory detour. */
function nextRoom(state: GameState, goal: RoomId): RoomId {
  const distances = new Map<RoomId, number>([[state.roomId, 0]]);
  const previous = new Map<RoomId, RoomId>();
  const remaining = new Set(ROOMS.map((r) => r.id));
  while (remaining.size) {
    const current = [...remaining].sort(
      (a, b) => (distances.get(a) ?? Infinity) - (distances.get(b) ?? Infinity),
    )[0];
    remaining.delete(current);
    if (current === goal) break;
    for (const room of ROOMS) {
      if (!remaining.has(room.id) || !adjacent(current, room.id)) continue;
      const weight =
        movementDuration(current, room.id) +
        (locked(state, room.id) ? 7 : 0) +
        (affected(state, room.id) ? 9 : 0);
      const candidate = (distances.get(current) ?? Infinity) + weight;
      if (candidate < (distances.get(room.id) ?? Infinity)) {
        distances.set(room.id, candidate);
        previous.set(room.id, current);
      }
    }
  }
  let step = goal;
  while (previous.get(step) && previous.get(step) !== state.roomId)
    step = previous.get(step)!;
  return step;
}
export function chooseLocalAction(state: GameState): Decision {
  if (state.fear >= 53)
    return {
      action: "wait",
      target: state.roomId,
      reason: "Stress is critical. Ground myself and control my breathing.",
    };
  if (locked(state, state.roomId))
    return {
      action: "unlock",
      target: state.roomId,
      reason: "The door was sealed. Override the local locking mechanism.",
    };
  if (!state.keycard && state.roomId === "archive")
    return {
      action: "search",
      target: "archive",
      reason: "Search the records cabinet for a staff keycard.",
    };
  if (state.keycard && !state.power && state.roomId === "generator")
    return {
      action: "restore",
      target: "generator",
      reason: "Reconnect emergency power so the exit can open.",
    };
  if (state.keycard && state.power && state.roomId === "exit")
    return {
      action: "unlock",
      target: "exit",
      reason: "Authenticate with the keycard and open the evacuation door.",
    };
  const goal: RoomId = !state.keycard
    ? "archive"
    : !state.power
      ? "generator"
      : "exit";
  const next = nextRoom(state, goal);
  if (locked(state, next))
    return {
      action: "unlock",
      target: next,
      reason: "The route is blocked. Override the seal before continuing.",
    };
  return {
    action: "move",
    target: next,
    reason: affected(state, next)
      ? `Continue toward ${goal}; stay alert to interference.`
      : `Take the safest available route to ${goal}.`,
  };
}
/** Accept only bounded, legal actions. Untrusted API responses pass through the same validator. */
export function applyDecision(
  state: GameState,
  value: unknown,
  source: DecisionLog["source"] = "local",
): boolean {
  if (
    state.status !== "running" ||
    state.paused ||
    state.currentAction ||
    !value ||
    typeof value !== "object"
  )
    return false;
  const candidate = value as Partial<Decision>;
  if (
    !["move", "search", "restore", "unlock", "wait"].includes(
      candidate.action ?? "",
    ) ||
    !ROOMS.some((r) => r.id === candidate.target) ||
    typeof candidate.reason !== "string"
  )
    return false;
  const decision: Decision = {
    action: candidate.action!,
    target: candidate.target!,
    reason: candidate.reason.trim().slice(0, 240) || "Proceed cautiously.",
  };
  let duration = 0;
  switch (decision.action) {
    case "move":
      if (
        !adjacent(state.roomId, decision.target) ||
        locked(state, state.roomId) ||
        locked(state, decision.target)
      )
        return false;
      duration = movementDuration(state.roomId, decision.target);
      break;
    case "search":
      if (
        decision.target !== state.roomId ||
        (decision.target === "archive" && state.keycard)
      )
        return false;
      duration = 7;
      break;
    case "restore":
      if (
        state.roomId !== "generator" ||
        decision.target !== "generator" ||
        state.power
      )
        return false;
      duration = 10;
      break;
    case "unlock":
      if (
        decision.target === "exit" &&
        state.roomId === "exit" &&
        state.keycard &&
        state.power &&
        !locked(state, "exit")
      )
        duration = 5;
      else if (
        locked(state, decision.target) &&
        (decision.target === state.roomId ||
          adjacent(state.roomId, decision.target))
      )
        duration = 6;
      else return false;
      break;
    case "wait":
      if (decision.target !== state.roomId) return false;
      duration = 6;
      break;
  }
  state.currentAction = { ...decision, elapsed: 0, duration };
  state.targetRoomId = decision.action === "move" ? decision.target : null;
  state.progress = 0;
  log(state, decision, source);
  return true;
}
function finishAction(state: GameState): void {
  const action = state.currentAction!;
  if (action.action === "move") {
    state.roomId = action.target;
    if (!state.visited.includes(action.target)) {
      state.visited.push(action.target);
      state.clues.push(ROOMS.find((r) => r.id === action.target)!.clue);
    }
  } else if (action.action === "search" && action.target === "archive") {
    state.keycard = true;
    state.inventory.push("SECURITY KEYCARD");
    log(
      state,
      {
        ...action,
        reason:
          "Security keycard recovered. The generator is the next objective.",
      },
      "system",
    );
  } else if (action.action === "restore") {
    state.power = true;
    state.inventory.push("EMERGENCY POWER");
    log(
      state,
      {
        ...action,
        reason: "Emergency power restored. Reach the evacuation door.",
      },
      "system",
    );
  } else if (action.action === "unlock") {
    if (locked(state, action.target)) {
      delete state.locks[action.target];
      state.effects = state.effects.filter(
        (e) => !(e.type === "lock" && e.roomId === action.target),
      );
    } else if (state.roomId === "exit" && state.keycard && state.power) {
      state.status = "escaped";
      state.outcome = "The subject escaped. Containment has failed.";
    }
  } else if (action.action === "wait")
    state.fear = Math.max(0, state.fear - 21);
  state.currentAction = null;
  state.targetRoomId = null;
  state.progress = 0;
}
export function sabotage(
  state: GameState,
  type: SabotageType,
  targetRoom: RoomId,
): boolean {
  if (
    state.status !== "running" ||
    state.paused ||
    !Object.hasOwn(SABOTAGE, type) ||
    !ROOMS.some((r) => r.id === targetRoom)
  )
    return false;
  const rule = SABOTAGE[type];
  if (state.energy < rule.cost || state.cooldowns[type] > state.elapsed)
    return false;
  state.energy -= rule.cost;
  state.cooldowns[type] = state.elapsed + rule.cooldown;
  state.interventions += 1;
  state.effects = state.effects.filter(
    (e) => !(e.type === type && e.roomId === targetRoom),
  );
  state.effects.push({
    id: state.interventions,
    type,
    roomId: targetRoom,
    expiresAt: state.elapsed + rule.duration,
  });
  if (type === "lock") {
    state.locks[targetRoom] = state.elapsed + rule.duration;
    if (
      state.currentAction?.action === "move" &&
      state.targetRoomId === targetRoom
    ) {
      state.currentAction = null;
      state.targetRoomId = null;
      state.progress = 0;
    }
  }
  if (targetRoom === state.roomId || targetRoom === state.targetRoomId)
    state.fear = Math.min(99, state.fear + rule.fear);
  log(
    state,
    {
      action: "wait",
      target: targetRoom,
      reason: `INTERFERENCE: ${type.toUpperCase()} in ${ROOMS.find((r) => r.id === targetRoom)!.name}.`,
    },
    "system",
  );
  return true;
}
/** Real-time updates subdivide long frames to keep outcomes independent of rendering frame rate. */
export function tick(state: GameState, dt: number): void {
  if (
    state.status !== "running" ||
    state.paused ||
    !Number.isFinite(dt) ||
    dt <= 0
  )
    return;
  let remaining = Math.min(dt, 360);
  while (remaining > 0.000001 && state.status === "running") {
    const step = Math.min(remaining, 0.1, state.timeRemaining);
    remaining -= step;
    state.elapsed += step;
    if (state.elapsed >= 180 - 1e-8) state.elapsed = 180;
    state.timeRemaining = Math.max(0, 180 - state.elapsed);
    state.energy = Math.min(100, state.energy + step * 1.45);
    state.effects = state.effects.filter((e) => e.expiresAt > state.elapsed);
    for (const room of ROOMS)
      if ((state.locks[room.id] ?? Infinity) <= state.elapsed)
        delete state.locks[room.id];
    const dark = affected(state, state.roomId, "blackout");
    const haunted = affected(state, state.roomId, "apparition");
    const whispers = affected(state, state.roomId, "whisper");
    const calming = state.currentAction?.action === "wait";
    state.fear = Math.max(
      0,
      Math.min(
        100,
        state.fear +
          step *
            (dark
              ? 1.5
              : haunted
                ? 1.15
                : whispers
                  ? 0.8
                  : calming
                    ? -0.4
                    : 0.12),
      ),
    );
    if (state.fear >= 100 || state.timeRemaining <= 0) {
      state.status = "contained";
      state.outcome =
        state.fear >= 100
          ? "The subject broke under pressure. Containment successful."
          : "The evacuation window closed. Containment successful.";
      state.currentAction = null;
      state.targetRoomId = null;
      state.progress = 0;
      state.thinking = false;
      break;
    }
    if (!state.currentAction && state.controller === "local" && !state.thinking)
      applyDecision(state, chooseLocalAction(state));
    if (state.currentAction) {
      const speed =
        dark &&
        ["search", "restore", "unlock"].includes(state.currentAction.action)
          ? 0.6
          : 1;
      state.currentAction.elapsed += step * speed;
      state.progress = Math.min(
        1,
        state.currentAction.elapsed / state.currentAction.duration,
      );
      if (state.progress >= 1) finishAction(state);
    }
  }
}
