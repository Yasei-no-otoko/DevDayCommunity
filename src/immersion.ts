import { isHiding, type GameState, type RoomId } from "./simulation.ts";

// Presentation only. These descriptions never enter model prompts or decision logs.
const names: Record<RoomId, string> = {
  reception: "受付", corridor: "中央ホール", ward: "隔離病棟", archive: "書庫",
  laboratory: "研究室", generator: "非常用電源室", exit: "避難口",
};
export function sceneCue(state: GameState): { text: string; kind: string } {
  if (state.status === "waiting") return { text: "誰もいないはずの病院に、ひとつの呼吸。", kind: "idle" };
  if (state.status === "escaped") return { text: "扉の向こうへ、足音が遠ざかる。", kind: "quiet" };
  if (state.status === "contained") return { text: "足音が、止まった。病院だけが残っている。", kind: "quiet" };
  const latest = state.interventionHistory[0];
  if (latest && state.elapsed - latest.time >= 0 && state.elapsed - latest.time < 4.5) {
    const room = names[latest.roomId];
    const lines = {
      blackout: `${room}の蛍光灯が落ちた。残ったのは、呼吸だけ。`,
      lock: `${room}の錠が鳴る。向こう側で、誰かが取っ手を引いた。`,
      whisper: `${room}の壁の内側から、声にならない声。`,
      apparition: `${room}の暗がりに、さっきまで無かった輪郭。`,
    };
    return { text: lines[latest.type], kind: "interference" };
  }
  if (isHiding(state)) return { text: "ベッドの陰。息を殺す。廊下の足音が、近づいてくる。", kind: "hiding" };
  if (state.killer.roomId === state.roomId) return { text: "同じ部屋にいる。まだ、こちらを向いていない。", kind: "danger" };
  if (state.fear > 65) return { text: "呼吸が速い。自分の足音さえ、誰かのものに聞こえる。", kind: "danger" };
  if (state.currentAction?.action === "move") return { text: "廊下に響く足音。その少し後から、もうひとつ。", kind: "moving" };
  if (state.currentAction?.action === "restore") return { text: "配線の向こうで火花が散る。背後の気配には、振り向かない。", kind: "working" };
  if (state.currentAction?.action === "unlock") return { text: "鍵が、うまく入らない。背後で、床が軋む。", kind: "working" };
  if (state.currentAction?.action === "wait") return { text: "吸って、吐く。次の呼吸まで、何も起きなければいい。", kind: "quiet" };
  return { text: "引き出しを開ける音が、静けさの中で大きすぎる。", kind: "working" };
}
