import { ROOMS, CONNECTIONS, HIDEOUT, isHiding, chooseLocalAction, applyDecision, type GameState, type Decision, type RoomId } from "./simulation.ts";

const roomNames: Record<RoomId, string> = {
  reception: "受付", corridor: "中央ホール", ward: "隔離病棟",
  archive: "書庫", laboratory: "研究室", generator: "非常用電源室", exit: "避難口",
};
export const roomName = (id: RoomId) => roomNames[id];

export function legalDecisions(state: GameState): Decision[] {
  const candidates: Decision[] = [
    chooseLocalAction(state),
    ...CONNECTIONS.flatMap(([a, b]) =>
      a === state.roomId ? [b] : b === state.roomId ? [a] : [],
    ).map((target) => ({
      action: "move" as const,
      target,
      reason: `${roomName(target)}へ慎重に移動する。`,
    })),
    {
      action: "search",
      target: state.roomId,
      reason: "この部屋を調べて、脱出に必要な手掛かりを探す。",
    },
    {
      action: "restore",
      target: "generator",
      reason: "非常用電源を復旧する。",
    },
    { action: "unlock", target: "exit", reason: "避難口の扉を開ける。" },
    {
      action: "wait",
      target: state.roomId,
      reason: "深呼吸して恐怖を抑える。",
    },
    {
      action: "hide",
      target: "ward",
      reason: "隔離病棟のベッドの陰で14秒息を潜め、キラーをやり過ごして脱出準備へ戻る。隠れ場所は42秒間隔で使える。",
    },
    ...ROOMS.map((r) => ({
      action: "unlock" as const,
      target: r.id,
      reason: `${roomName(r.id)}の封鎖を解除する。`,
    })),
  ];
  const seen = new Set<string>();
  return candidates.filter((d) => {
    if (d.action === "search" && (d.target !== "archive" || state.keycard))
      return false;
    const k = `${d.action}:${d.target}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return applyDecision(structuredClone(state), d);
  });
}

export function createSessionRequest() {
  return {
    facilityDescription: JSON.stringify({
      rooms: ROOMS.map(({ id, clue }) => ({ id, clue })),
      connections: CONNECTIONS,
      goal: "AI-controlled game avatar Sam Altman finds keycard in archive, restores generator, unlocks exit. Avoid fear100 and deadline180. Player is the building entity and sabotages rooms.",
      killerRules: "Nuko Nuko pursues Sam through connected rooms. Sam does not know her location until their first contact. Contact marks Sam as caught and raises fear, but the simulation continues. Fear reaching 100 after contact ends the run with Sam captured; fear 100 without contact is a player win.",
      helperRules: "Tibo occasionally resets the cooldowns of the four player interventions. Energy, progress and active effects are unchanged.",
      hideoutRules: "Room contact with Nuko Nuko marks Sam as caught but does not immediately end the run. Sam can keep moving and working; fear reaching 100 after contact ends the run with Sam captured.",
    }),
    strategicPlan:
      "You control the fictional game avatar Sam Altman. In Japanese, give a concise 2-sentence escape plan grounded in this facility. You cannot know the killer location before the first contact. Avoid Nuko Nuko because contact marks you as caught and raises fear; keep moving and complete the keycard, power and exit objectives. The run ends in capture failure if fear reaches 100 after contact.",
  };
}

export function createDecisionRequest(state: GameState, plan: string, choices: Decision[], sessionId: string, sessionToken: string) {
  return {
    sessionId,
    sessionToken,
    snapshot: {
      room: state.roomId,
      keycard: state.keycard,
      power: state.power,
      fear: Math.round(state.fear),
      timeRemaining: Math.round(state.timeRemaining),
      locks: state.locks,
      elapsed: state.elapsed,
      effects: state.effects,
      clues: state.clues,
      strategy: plan,
      recentActions: state.decisions.filter((entry) => entry.source !== "system" && entry.action !== "plan").slice(0, 6),
      hideout: {
        roomId: "ward",
        active: isHiding(state),
        available: choices.some((choice) => choice.action === "hide"),
        cooldownRemaining: Math.max(0, state.hideout.availableAt - state.elapsed),
        completed: state.hideout.completed,
        trailLostFor: Math.max(0, state.hideout.lostUntil - state.elapsed),
        ...HIDEOUT,
      },
      ...(state.killer.encountered ? { knownKiller: {
        name: "ぬこぬこさん",
        roomId: state.killer.roomId,
        targetRoomId: state.killer.targetRoomId,
        encounterCount: state.killer.encounterCount,
        lastEncounterAt: state.killer.lastEncounterAt,
      } } : {}),
    },
    allowedDecisions: choices.map((d, i) => ({
      id: `choice_${i}`,
      label: `${d.action} ${d.target}`,
      description: d.reason,
      targetId: d.target,
    })),
  };
}
