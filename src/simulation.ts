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
export type ActionType = "move" | "search" | "restore" | "unlock" | "wait" | "hide";
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
    clue: "職員のメモが資料室を示している。警備用キーカードを探そう。",
  },
  {
    id: "corridor",
    name: "CENTRAL HALL",
    label: "02",
    x: 365,
    y: 370,
    w: 260,
    h: 150,
    clue: "出口の制御盤にはキーカードと非常電源が必要だ。",
  },
  {
    id: "ward",
    name: "ISOLATION WARD",
    label: "03",
    x: 120,
    y: 160,
    w: 220,
    h: 200,
    clue: "隔離病棟か中央ホールを通れば、資料室へ行ける。",
  },
  {
    id: "archive",
    name: "ARCHIVE",
    label: "04",
    x: 400,
    y: 130,
    w: 210,
    h: 170,
    clue: "記録保管庫に警備用キーカードが隠されている。",
  },
  {
    id: "laboratory",
    name: "LABORATORY",
    label: "05",
    x: 700,
    y: 130,
    w: 210,
    h: 200,
    clue: "実験室の通用口は非常用発電機へ続いている。",
  },
  {
    id: "generator",
    name: "GENERATOR",
    label: "06",
    x: 700,
    y: 410,
    w: 210,
    h: 170,
    clue: "非常用発電機を復旧すれば、出口の錠に電源を送れる。",
  },
  {
    id: "exit",
    name: "EXIT",
    label: "07",
    x: 470,
    y: 565,
    w: 150,
    h: 75,
    clue: "電源とキーカードがそろえば、最後の警備扉を開けられる。",
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
  /** Seal overrides never substitute for the final keycard authentication. */
  opensExit?: boolean;
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
export interface InterventionRecord {
  id: number;
  time: number;
  type: SabotageType;
  roomId: RoomId;
  affectedSubject: boolean;
  interruptedMove: boolean;
  fearDelta: number;
}
export interface KillerState {
  roomId: RoomId;
  targetRoomId: RoomId | null;
  progress: number;
  encountered: boolean;
  encounterCount: number;
  lastEncounterAt: number | null;
  moveElapsed: number;
  moveDuration: number;
}
export interface TiboState {
  appearances: number;
  lastAppearanceAt: number | null;
  nextAppearanceAt: number;
}
/** A short concealment breaks pursuit, but the same hiding place needs time to reuse. */
export const HIDEOUT = { duration: 14, cooldown: 42, lostDuration: 10 } as const;
export interface HideoutState {
  availableAt: number;
  completed: number;
  lostUntil: number;
}
export interface GameState {
  status: "waiting" | "running" | "escaped" | "contained";
  terminalReason: "fear" | "deadline" | "escaped" | null;
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
  /** Successful interventions, newest first, retained independently of effect expiry. */
  interventionHistory: InterventionRecord[];
  effects: Effect[];
  locks: Partial<Record<RoomId, number>>;
  cooldowns: Record<SabotageType, number>;
  visited: RoomId[];
  clues: string[];
  outcome: string;
  killer: KillerState;
  tibo: TiboState;
  hideout: HideoutState;
  randomSeed: number;
}
function random(state: { randomSeed: number }): number {
  let value = state.randomSeed;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.randomSeed = value >>> 0;
  return state.randomSeed / 0x100000000;
}
export function createState(seed = 0x53414d): GameState {
  const state: GameState = {
    status: "waiting",
    terminalReason: null,
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
    interventionHistory: [],
    effects: [],
    locks: {},
    cooldowns: { blackout: 0, lock: 0, whisper: 0, apparition: 0 },
    visited: ["reception"],
    clues: [ROOMS[0].clue],
    outcome: "",
    killer: {
      roomId: "laboratory",
      targetRoomId: null,
      progress: 0,
      encountered: false,
      encounterCount: 0,
      lastEncounterAt: null,
      moveElapsed: 0,
      moveDuration: 0,
    },
    tibo: { appearances: 0, lastAppearanceAt: null, nextAppearanceAt: 0 },
    hideout: { availableAt: 0, completed: 0, lostUntil: 0 },
    randomSeed: (seed >>> 0) || 0x9e3779b9,
  };
  state.tibo.nextAppearanceAt = 18 + random(state) * 12;
  return state;
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
function route(from: RoomId, goal: RoomId): RoomId[] {
  const queue: RoomId[][] = [[from]];
  const visited = new Set<RoomId>([from]);
  while (queue.length) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    if (current === goal) return path;
    for (const room of ROOMS) {
      if (!visited.has(room.id) && adjacent(current, room.id)) {
        visited.add(room.id);
        queue.push([...path, room.id]);
      }
    }
  }
  return [from];
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
        (affected(state, room.id) ? 9 : 0) +
        // The subject cannot use the unseen pursuer's position before first contact.
        (state.killer.encountered && room.id === state.killer.roomId ? 14 : 0) +
        (state.killer.encountered && room.id === state.killer.targetRoomId ? 7 : 0);
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
export function isHiding(state: GameState): boolean {
  return state.currentAction?.action === "hide";
}
/** Public legality contract shared by the local policy and API option builder. */
export function canHide(state: GameState): boolean {
  return state.status === "running" && !state.paused && !state.currentAction &&
    state.roomId === "ward" && state.killer.encountered &&
    !locked(state, "ward") && state.elapsed >= state.hideout.availableAt - 1e-8;
}
export function chooseLocalAction(state: GameState): Decision {
  // One planned refuge visit is enough; later decisions keep advancing the escape.
  // Before first contact no unseen killer location influences this choice.
  const seeksHideout = state.killer.encountered && state.hideout.completed === 0 &&
    state.elapsed >= state.hideout.availableAt - 1e-8;
  if (canHide(state) && seeksHideout) return {
    action: "hide", target: "ward",
    reason: "隔離病棟のベッドの陰で息を潜め、追跡をやり過ごして脱出準備へ戻ろう。",
  };
  const canRetreat = state.killer.encountered && state.killer.roomId === state.roomId &&
    !locked(state, state.roomId) &&
    ROOMS.some((room) => adjacent(state.roomId, room.id) && !locked(state, room.id));
  if (state.fear >= 53 && !canRetreat)
    return {
      action: "wait",
      target: state.roomId,
      reason: "恐怖が強すぎる。いったん立ち止まり、呼吸を整えよう。",
    };
  if (locked(state, state.roomId))
    return {
      action: "unlock",
      target: state.roomId,
      reason: "扉を封鎖された。ここのロックを解除しよう。",
    };
  if (seeksHideout && !locked(state, state.roomId)) {
    const next = nextRoom(state, "ward");
    return {
      action: locked(state, next) ? "unlock" : "move", target: next,
      reason: "ぬこぬこさんに追われている。隔離病棟のベッドの陰に隠れて撒こう。",
    };
  }
  if (canRetreat) {
    const goal = !state.keycard ? "archive" : !state.power ? "generator" : "exit";
    const retreat = ROOMS.filter((room) => adjacent(state.roomId, room.id) && !locked(state, room.id))
      .sort((a, b) =>
        Number(a.id === state.killer.targetRoomId) - Number(b.id === state.killer.targetRoomId) ||
        route(a.id, goal).length - route(b.id, goal).length,
      )[0];
    if (retreat) return {
      action: "move", target: retreat.id,
      reason: "ぬこぬこさんが近い。距離を取り、脱出の準備を続けよう。",
    };
  }
  if (!state.keycard && state.roomId === "archive")
    return {
      action: "search",
      target: "archive",
      reason: "記録保管庫を調べて、職員のキーカードを探そう。",
    };
  if (state.keycard && !state.power && state.roomId === "generator")
    return {
      action: "restore",
      target: "generator",
      reason: "非常電源を復旧して、出口の扉に電源を送ろう。",
    };
  if (state.keycard && state.power && state.roomId === "exit")
    return {
      action: "unlock",
      target: "exit",
      reason: "キーカードで認証し、避難口を開けよう。",
    };
  const goal: RoomId = !state.keycard
    ? "archive"
    : !state.power
      ? "generator"
      : "exit";
  const goalName = { archive: "資料室", generator: "発電機", exit: "避難口" }[goal];
  const next = nextRoom(state, goal);
  if (locked(state, next))
    return {
      action: "unlock",
      target: next,
      reason: "進路が封鎖されている。先に扉のロックを解除しよう。",
    };
  return {
    action: "move",
    target: next,
    reason: affected(state, next)
      ? `${goalName}へ進もう。異変には警戒が必要だ。`
      : `安全な経路を選んで${goalName}へ向かおう。`,
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
    !["move", "search", "restore", "unlock", "wait", "hide"].includes(
      candidate.action ?? "",
    ) ||
    !ROOMS.some((r) => r.id === candidate.target) ||
    typeof candidate.reason !== "string"
  )
    return false;
  const decision: Decision = {
    action: candidate.action!,
    target: candidate.target!,
    reason: candidate.reason.trim().slice(0, 240) || "慎重に進もう。",
  };
  let duration = 0;
  let opensExit = false;
  switch (decision.action) {
    case "move":
      if (!adjacent(state.roomId, decision.target)) return false;
      {
        const blockedExit = locked(state, state.roomId);
        const blockedEntry = locked(state, decision.target);
        if (blockedExit || blockedEntry) {
          const sourceName = ROOMS.find((room) => room.id === state.roomId)!.name;
          const targetName = ROOMS.find((room) => room.id === decision.target)!.name;
          const reason = blockedExit && blockedEntry
            ? `扉の封鎖：${sourceName}からの退室と${targetName}への入室はできない。`
            : blockedExit
              ? `扉の封鎖：${sourceName}から退室できない。`
              : `扉の封鎖：${targetName}へ入室できない。`;
          log(state, { ...decision, reason }, "system");
          return false;
        }
      }
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
      ) {
        duration = 5;
        opensExit = true;
      } else if (
        locked(state, decision.target) &&
        (decision.target === state.roomId ||
          adjacent(state.roomId, decision.target))
      )
        duration = 6;
      else return false;
      break;
    case "hide":
      if (decision.target !== "ward" || !canHide(state)) return false;
      duration = HIDEOUT.duration;
      state.hideout.availableAt = state.elapsed + HIDEOUT.cooldown;
      state.hideout.lostUntil = state.elapsed + HIDEOUT.duration + HIDEOUT.lostDuration;
      // Drop the old trail immediately; the pursuer searches toward the laboratory.
      state.killer.targetRoomId = null;
      state.killer.moveElapsed = 0;
      state.killer.moveDuration = 0;
      state.killer.progress = 0;
      break;
    case "wait":
      if (decision.target !== state.roomId) return false;
      duration = 6;
      break;
  }
  state.currentAction = { ...decision, elapsed: 0, duration, opensExit };
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
          "警備用キーカードを確保した。次は発電機へ向かおう。",
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
        reason: "非常電源が復旧した。避難口へ向かおう。",
      },
      "system",
    );
  } else if (action.action === "unlock") {
    if (locked(state, action.target)) {
      delete state.locks[action.target];
      state.effects = state.effects.filter(
        (e) => !(e.type === "lock" && e.roomId === action.target),
      );
    } else if (
      action.opensExit &&
      action.target === "exit" &&
      state.roomId === "exit" &&
      state.keycard &&
      state.power
    ) {
      state.status = "escaped";
      state.terminalReason = "escaped";
      state.outcome = "被験者が脱出した。封じ込め失敗。";
    }
  } else if (action.action === "hide") {
    state.hideout.completed += 1;
    state.fear = Math.max(0, state.fear - 12);
    log(state, {
      ...action,
      reason: "追跡者が実験室の方へ離れた。隠れ場所を出て、脱出の準備を続けよう。",
    }, "system");
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
    state.thinking ||
    !Object.hasOwn(SABOTAGE, type) ||
    !ROOMS.some((r) => r.id === targetRoom)
  )
    return false;
  const rule = SABOTAGE[type];
  if (state.energy < rule.cost || state.cooldowns[type] > state.elapsed)
    return false;
  const affectsSubject =
    targetRoom === state.roomId || targetRoom === state.targetRoomId;
  const interruptedMove =
    type === "lock" &&
    state.currentAction?.action === "move" &&
    (state.roomId === targetRoom || state.targetRoomId === targetRoom);
  const fearBefore = state.fear;
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
    if (interruptedMove) {
      state.currentAction = null;
      state.targetRoomId = null;
      state.progress = 0;
    }
  }
  const interruptedHide = type === "apparition" && targetRoom === "ward" && isHiding(state);
  if (interruptedHide) {
    // A visible apparition forces Sam out; the spent hiding cooldown stays spent.
    state.currentAction = null;
    state.targetRoomId = null;
    state.progress = 0;
    state.hideout.lostUntil = state.elapsed;
    state.killer.targetRoomId = null;
    state.killer.moveElapsed = 0;
    state.killer.moveDuration = 0;
    state.killer.progress = 0;
  }
  if (affectsSubject)
    state.fear = Math.min(99, state.fear + rule.fear);
  state.interventionHistory.unshift({
    id: state.interventions,
    time: state.elapsed,
    type,
    roomId: targetRoom,
    affectedSubject: affectsSubject,
    interruptedMove,
    fearDelta: state.fear - fearBefore,
  });
  state.interventionHistory.length = Math.min(state.interventionHistory.length, 12);
  log(
    state,
    {
      action: "wait",
      target: targetRoom,
      reason: type === "lock"
        ? `${ROOMS.find((r) => r.id === targetRoom)!.name}の扉を封鎖。${targetRoom === state.roomId ? "サムを室内に閉じ込め、退室を阻止。" : "サムの入室を阻止。"}`
        : `${{ blackout: "停電", whisper: "囁き", apparition: "幻影", lock: "扉の封鎖" }[type]}が発生：${ROOMS.find((r) => r.id === targetRoom)!.name}。${interruptedHide ? "サムが隠れ場所から飛び出し、追跡が再開した。" : ""}`,
    },
    "system",
  );
  return true;
}
function encounter(state: GameState): void {
  const killer = state.killer;
  if (isHiding(state) || killer.roomId !== state.roomId ||
      (killer.lastEncounterAt !== null && state.elapsed < killer.lastEncounterAt + 12 - 1e-8)) return;
  const firstContact = !killer.encountered;
  killer.encountered = true;
  killer.encounterCount += 1;
  killer.lastEncounterAt = state.elapsed;
  const fearIncrease = firstContact ? 25 + Math.floor(random(state) * 11) : 5;
  state.fear = Math.max(state.fear, Math.min(99, state.fear + fearIncrease));
  state.outcome = "ぬこぬこさんがサムに接触。恐怖100に達すると実験終了。";
  log(state, {
    action: "wait",
    target: state.roomId,
    reason: firstContact
      ? `ぬこぬこさんがサムに接触。恐怖+${fearIncrease}、捕獲状態を記録。恐怖100まで実験続行。`
      : `ぬこぬこさんがサムに再接触。恐怖+${fearIncrease}。`,
  }, "system");
}
function worldEvents(state: GameState): void {
  if (state.elapsed >= state.tibo.nextAppearanceAt - 1e-8) {
    state.tibo.appearances += 1;
    state.tibo.lastAppearanceAt = state.elapsed;
    state.tibo.nextAppearanceAt = state.elapsed + 24 + random(state) * 18;
    for (const type of Object.keys(SABOTAGE) as SabotageType[]) state.cooldowns[type] = 0;
  }
  encounter(state);
}
function beginPursuit(state: GameState): void {
  const killer = state.killer;
  const goal = state.hideout.lostUntil > state.elapsed + 1e-8 ? "laboratory" : state.roomId;
  if (killer.targetRoomId || killer.roomId === goal) return;
  killer.targetRoomId = route(killer.roomId, goal)[1] ?? null;
  if (killer.targetRoomId) {
    killer.moveElapsed = 0;
    killer.progress = 0;
    killer.moveDuration = movementDuration(killer.roomId, killer.targetRoomId) * 1.8 + 1;
  }
}
function advancePursuit(state: GameState, step: number): void {
  const killer = state.killer;
  if (!killer.targetRoomId) return;
  killer.moveElapsed += step;
  killer.progress = Math.min(1, killer.moveElapsed / killer.moveDuration);
  if (killer.moveDuration - killer.moveElapsed <= 1e-8) {
    killer.roomId = killer.targetRoomId;
    killer.targetRoomId = null;
    killer.moveElapsed = 0;
    killer.moveDuration = 0;
    killer.progress = 0;
  }
}
/** Split at rule boundaries so frame size cannot discard action time or effect duration. */
export function tick(state: GameState, dt: number): void {
  if (
    state.status !== "running" ||
    state.paused ||
    state.thinking ||
    !Number.isFinite(dt) ||
    dt <= 0
  )
    return;
  let remaining = Math.min(dt, 360);
  while (remaining > 0.000001 && state.status === "running") {
    worldEvents(state);
    if (state.status !== "running") break;
    if (!state.currentAction && state.controller === "local" && !state.thinking)
      applyDecision(state, chooseLocalAction(state));
    beginPursuit(state);
    const dark = affected(state, state.roomId, "blackout");
    const haunted = affected(state, state.roomId, "apparition");
    const whispers = affected(state, state.roomId, "whisper");
    const calming = state.currentAction?.action === "wait" || isHiding(state);
    const speed =
      dark &&
      state.currentAction &&
      ["search", "restore", "unlock"].includes(state.currentAction.action)
        ? 0.6
        : 1;
    const fearRate = dark
      ? 1.5
      : haunted
        ? 1.15
        : whispers
          ? 0.8
          : calming
            ? -0.4
            : 0.12;
    const nextExpiry = Math.min(
      ...state.effects
        .map((effect) => effect.expiresAt - state.elapsed)
        .filter((time) => time > 1e-8),
      ...Object.values(state.locks)
        .map((expiresAt) => expiresAt! - state.elapsed)
        .filter((time) => time > 1e-8),
    );
    const step = Math.min(
      remaining,
      0.1,
      state.timeRemaining,
      nextExpiry,
      state.tibo.nextAppearanceAt - state.elapsed,
      state.hideout.lostUntil > state.elapsed + 1e-8
        ? state.hideout.lostUntil - state.elapsed : Infinity,
      state.killer.targetRoomId
        ? state.killer.moveDuration - state.killer.moveElapsed
        : Infinity,
      !isHiding(state) && state.killer.roomId === state.roomId && state.killer.lastEncounterAt !== null
        ? state.killer.lastEncounterAt + 12 - state.elapsed
        : Infinity,
      state.currentAction
        ? (state.currentAction.duration - state.currentAction.elapsed) / speed
        : Infinity,
      fearRate > 0 ? (100 - state.fear) / fearRate : Infinity,
    );
    remaining -= step;
    state.elapsed += step;
    if (state.elapsed >= 180 - 1e-8) state.elapsed = 180;
    state.timeRemaining = Math.max(0, 180 - state.elapsed);
    state.energy = Math.min(100, state.energy + step * 1.45);
    state.effects = state.effects.filter((e) => e.expiresAt > state.elapsed + 1e-8);
    for (const room of ROOMS)
      if ((state.locks[room.id] ?? Infinity) <= state.elapsed + 1e-8)
        delete state.locks[room.id];
    state.fear = Math.max(0, Math.min(100, state.fear + step * fearRate));
    advancePursuit(state, step);
    if (state.fear >= 100 - 1e-8 || state.timeRemaining <= 0) {
      if (state.fear >= 100 - 1e-8) state.fear = 100;
      state.status = "contained";
      state.terminalReason = state.fear >= 100 ? "fear" : "deadline";
      state.outcome =
        state.fear >= 100
          ? state.killer.encountered
            ? "恐怖100に達し、ぬこぬこさんがサムを捕獲。封じ込め成功。"
            : "被験者は恐怖に屈した。封じ込め成功。"
          : "避難の制限時間を過ぎた。封じ込め成功。";
      state.currentAction = null;
      state.targetRoomId = null;
      state.progress = 0;
      state.thinking = false;
      break;
    }
    if (state.currentAction) {
      state.currentAction.elapsed += step * speed;
      state.progress = Math.min(
        1,
        state.currentAction.elapsed / state.currentAction.duration,
      );
      if (state.currentAction.duration - state.currentAction.elapsed <= 1e-8)
        finishAction(state);
    }
    if (state.status === "running") worldEvents(state);
  }
}
