import { createFacility } from "./facility";
import {
  ROOMS,
  CONNECTIONS,
  SABOTAGE,
  createState,
  tick,
  sabotage,
  applyDecision,
  chooseLocalAction,
  type RoomId,
  type SabotageType,
  type Decision,
} from "./simulation";

const svg = (name: string, size = 20) => {
  const paths: Record<string, string> = {
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    sound:
      '<path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    mute: '<path d="m11 5-6 4H2v6h3l6 4V5Zm5 4 5 6m0-6-5 6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>',
    bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
    whisper:
      '<path d="M4 12a8 8 0 0 1 16 0M7 12a5 5 0 0 1 10 0M10 12a2 2 0 0 1 4 0m-2 3v6M5 17h2m10 0h2"/>',
    ghost:
      '<path d="M5 21V9a7 7 0 0 1 14 0v12l-4-3-3 3-3-3-4 3Z"/><path d="M9 9v3m6-3v3"/>',
    play: '<path d="m8 4 13 8-13 8V4Z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    signal: '<path d="M4 18v3m5-8v8m5-13v13m5-18v18"/>',
    key: '<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-4-4 3-3m-6 0 3-3"/>',
    close: '<path d="m5 5 14 14M19 5 5 19"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.eye}</svg>`;
};
const interventions: {
  type: SabotageType;
  icon: string;
  name: string;
  en: string;
  detail: string;
}[] = [
  {
    type: "blackout",
    icon: "bolt",
    name: "停電",
    en: "BLACKOUT",
    detail: "視界を奪い、探索を遅らせる",
  },
  {
    type: "lock",
    icon: "lock",
    name: "扉を封鎖",
    en: "LOCKDOWN",
    detail: "進路を遮断し、再判断を迫る",
  },
  {
    type: "whisper",
    icon: "whisper",
    name: "囁き",
    en: "WHISPER",
    detail: "見えない気配で恐怖を高める",
  },
  {
    type: "apparition",
    icon: "ghost",
    name: "怪異を出現",
    en: "MANIFEST",
    detail: "強い恐怖を与え、行動を乱す",
  },
];
export function mountBlacksite(root: HTMLElement): () => void {
  let disposed = false;
  const events = new AbortController();
  type BrowserEventMap = HTMLElementEventMap & DocumentEventMap & WindowEventMap;
  function listen<K extends keyof BrowserEventMap>(
    target: EventTarget,
    type: K,
    listener: (event: BrowserEventMap[K]) => void,
  ) {
    target.addEventListener(type, listener as EventListener, { signal: events.signal });
  }
  root.innerHTML = `
    <header class="header"><a class="brand" href="/" aria-label="BLACKSITE ホーム"><span class="brand-symbol">${svg("ghost", 23)}</span>BLACKSITE<span class="brand-divider"></span><span class="brand-sub">THE ESCAPE EXPERIMENT</span></a><div class="header-right"><span class="connection"><i></i><span id="connection">LOCAL SIMULATION</span></span><button class="icon-button" id="audio" aria-label="環境音をオン">${svg("mute")}</button><button class="icon-button" id="help" aria-label="遊び方">${svg("help")}</button></div></header>
    <main><section class="intro"><div><div class="eyebrow"><span></span> EXPERIMENT 007 <b>/</b> CONTAINMENT PROTOCOL</div><h1>You are the <em>haunting.</em></h1><p>AIは脱出を目指す。あなたは、その場所に棲む存在。</p></div><div class="session-info"><span>ST. ORISON INSTITUTE</span><strong>03:14 <small>AM</small></strong><span>NO ONE LEAVES UNAFFECTED.</span></div></section>
    <section class="console"><div class="facility-panel"><div class="panel-heading"><div><span class="tiny-square"></span> FACILITY OVERVIEW <span class="subtle">/ B1</span></div><div class="camera-tag"><i></i> LIVE FEED <span>CAM_07</span></div></div><div class="map-area"><div class="map-coordinate">N <span>↑</span><br><small>35° 42′ 18″ N</small></div><div id="facility"></div><div class="map-grain"></div><div class="map-title"><span>RESTRICTED ACCESS</span><b>BASEMENT — LEVEL 01</b></div><div class="map-legend"><span><i class="agent-dot"></i> SUBJECT</span><span><i class="effect-dot"></i> INTERFERENCE</span><span>⌖ SELECT A ROOM</span></div><div id="result" class="result hidden"></div></div><div class="room-bar"><div><span class="room-number" id="room-number">01</span><div><span class="micro">TARGET ROOM</span><strong id="room-name">RECEPTION</strong></div><span class="room-hint" id="room-hint">マップ上の部屋を選んで干渉</span></div><button class="text-button" id="follow">${svg("eye", 16)} エージェントを追跡</button></div><div class="experiment-bar"><div class="timer"><span class="micro">TIME TO CONTAIN</span><b id="timer">03:00</b></div><div class="small-stat"><span class="micro">INTERVENTIONS</span><b id="interventions">00</b></div><div class="experiment-actions"><button class="icon-button" id="reset" aria-label="実験をリセット">${svg("reset", 17)}</button><button class="start-button" id="start">${svg("play", 15)}<span>実験を開始</span></button></div></div></div>
    <aside class="control-panel"><section class="subject-panel"><div class="section-title"><span>SUBJECT MONITOR</span><span class="micro">ENTITY_01</span></div><div class="subject-identity"><div class="subject-avatar"><span></span>${svg("signal", 13)}</div><div><h2>ELIAS</h2><span id="subject-status"><i></i> AWAITING ACTIVATION</span></div><span class="subject-id">S—014</span></div><div class="fear-header"><span>恐怖レベル <small>/ FEAR</small></span><strong><span id="fear">08</span><small>/100</small></strong></div><div class="fear-track"><div id="fear-fill"></div><span></span><span></span><span></span><span></span></div><div class="fear-labels"><span>CALM</span><span>UNSTABLE</span><span>PANIC</span></div><div class="thought"><div class="micro">${svg("signal", 12)} AGENT INTENT</div><p id="thought">「ここは、どこだ。<br>……出口を探さないと。」</p><div class="action-progress"><i id="action-progress"></i></div><span id="action-label">WAITING FOR EXPERIMENT</span></div><div class="objectives"><div id="objective-key">${svg("key", 14)}<span>キーカードを回収</span><i></i></div><div id="objective-power">${svg("bolt", 14)}<span>非常用電源を復旧</span><i></i></div><div id="objective-exit">${svg("arrow", 14)}<span>施設から脱出</span><i></i></div></div></section><section class="interference-panel"><div class="section-title"><span>YOUR INTERFERENCE</span><span class="live-red">THE ENTITY</span></div><div class="energy-row"><span>${svg("bolt", 14)} エネルギー</span><strong><span id="energy">100</span><small>/100</small></strong></div><div class="energy-track"><i id="energy-fill"></i></div><div class="sabotage-grid">${interventions.map((item, i) => `<button class="sabotage" data-type="${item.type}" title="${item.detail}"><span class="sabotage-top"><span class="sabotage-icon">${svg(item.icon, 23)}</span><span class="cost">${svg("bolt", 10)} ${SABOTAGE[item.type].cost}</span></span><strong>${item.name}</strong><span class="sabotage-bottom"><span>${item.en}</span><kbd>${i + 1}</kbd></span><span class="cooldown"></span></button>`).join("")}</div><p class="interference-note">部屋を選択 → 干渉を実行<br><span>恐怖を100にするか、180秒間閉じ込めろ。</span></p></section></aside></section>
    <section class="event-console"><div class="log-heading"><span><i></i> ACTIVITY LOG</span><button class="text-button" id="toggle-log">ログを開く <span>↗</span></button></div><div id="activity-log"><div class="log-entry"><time>00:00</time><span class="log-tag system">SYSTEM</span><p>施設の監視システムに接続。実験の開始を待機しています。</p><span class="log-end">_</span></div></div></section>
    <footer><span>BUILT WITH <a href="https://developers.openai.com/api/docs/guides/agents-api/overview" target="_blank" rel="noreferrer">Agents API</a><span class="footer-plus">+</span><a href="https://developers.openai.com/api/docs/guides/decisions" target="_blank" rel="noreferrer">Decisions API</a></span><div><label for="mode">CONTROLLER</label><select id="mode"><option value="local">LOCAL SIMULATION</option><option value="api">OPENAI LIVE APIs</option></select><span class="footer-experiment">EXPERIMENT / 007</span></div></footer>
    </main><dialog id="help-dialog"><button class="dialog-close icon-button" id="close-help" aria-label="閉じる">${svg("close")}</button><div class="eyebrow">CONTAINMENT PROTOCOL</div><h2>出口を、与えるな。</h2><p>エージェント「ELIAS」は自ら判断し、鍵と電源を確保して脱出を目指します。あなたは建物に棲む怪異。マップの部屋を選び、干渉してください。</p><ol><li><b>停電</b> — 部屋を暗くし、探索と装置の操作を遅らせます。</li><li><b>扉を封鎖</b> — 進路を遮断します。AIは迂回や解錠を試みます。</li><li><b>囁き・怪異</b> — 同じ部屋のAIの恐怖を高めます。</li></ol><p>恐怖が100、または制限時間180秒であなたの勝利。AIは深呼吸で恐怖を抑えるため、部屋とタイミングの選択が鍵です。</p><p class="dialog-fine">1〜4: 干渉 / Space: 開始・一時停止 / R: リセット。音は初期状態でオフです。実APIモードはAgents APIの脱出方針とDecisions APIの行動選択を使い、APIの応答待ち中はゲーム時間が止まります。</p><button class="start-button" id="understood">理解した ${svg("arrow", 16)}</button></dialog><div id="toast" role="status"></div>`;

  const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
  const controllerMenu = document.createElement("div");
  controllerMenu.className = "controller-menu";
  controllerMenu.append(root.querySelector('label[for="mode"]')!, $("mode"));
  root.querySelector(".header-right")!.prepend(controllerMenu);
  const experimentBar = $("timer").closest(".experiment-bar")!;
  root
    .querySelector(".facility-panel")!
    .insertBefore(experimentBar, root.querySelector(".map-area"));
  let state = createState();
  let selectedRoom: RoomId = "reception";
  let following = false;
  let sessionId = "";
  let sessionToken = "";
  let generation = 0;
  let apiError = "";
  let plan = "";
  let lastLogKey = "";
  let expandedLog = false;
  let audio: AudioContext | undefined;
  let drone: OscillatorNode | undefined;
  let master: GainNode | undefined;
  let soundOn = false;
  let lastStatus: string = "waiting";
  let apiPending = false;
  let liveConfigured = false;
  let pendingDecision: Decision | null = null;
  let toastTimer: ReturnType<typeof setTimeout>;
  const facility = createFacility($("facility"), (id) => {
    selectedRoom = id;
    following = false;
    render();
  });
  const formatTime = (n: number) =>
    `${Math.floor(n / 60)
      .toString()
      .padStart(2, "0")}:${Math.floor(n % 60)
      .toString()
      .padStart(2, "0")}`;
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
          c
        ]!,
    );
  function toast(message: string) {
    if (disposed) return;
    $("toast").textContent = message;
    $("toast").classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 3600);
  }
  function tone(type: string) {
    if (!soundOn || !audio || !master) return;
    const osc = audio.createOscillator(),
      gain = audio.createGain();
    osc.type = type === "lock" ? "square" : "sine";
    osc.frequency.setValueAtTime(
      type === "apparition" ? 190 : type === "blackout" ? 75 : 330,
      audio.currentTime,
    );
    osc.frequency.exponentialRampToValueAtTime(32, audio.currentTime + 0.7);
    gain.gain.setValueAtTime(0.09, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.8);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(audio.currentTime + 0.8);
  }
  function toggleAudio() {
    if (!audio) {
      audio = new AudioContext();
      master = audio.createGain();
      master.gain.value = 0.19;
      master.connect(audio.destination);
      drone = audio.createOscillator();
      drone.type = "sine";
      drone.frequency.value = 43;
      const g = audio.createGain();
      g.gain.value = 0.28;
      drone.connect(g);
      g.connect(master);
      drone.start();
    }
    soundOn = !soundOn;
    if (soundOn) void audio.resume();
    else void audio.suspend();
    $("audio").innerHTML = svg(soundOn ? "sound" : "mute");
    $("audio").setAttribute(
      "aria-label",
      soundOn ? "環境音をオフ" : "環境音をオン",
    );
  }
  async function request(path: string, body?: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(90000),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.error?.message || data.error || `API error ${response.status}`,
      );
    return data;
  }
  function closeSession(id = sessionId, token = sessionToken) {
    if (!id || !token) return;
    void fetch(`/api/session/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-blacksite-session-token": token },
      keepalive: true,
    }).catch(() => {});
  }
  function legalDecisions(): Decision[] {
    const candidates: Decision[] = [
      chooseLocalAction(state),
      ...CONNECTIONS.flatMap(([a, b]) =>
        a === state.roomId ? [b] : b === state.roomId ? [a] : [],
      ).map((target) => ({
        action: "move" as const,
        target,
        reason: `Move carefully to ${target}.`,
      })),
      {
        action: "search",
        target: state.roomId,
        reason: "Inspect this room for useful clues.",
      },
      {
        action: "restore",
        target: "generator",
        reason: "Restore emergency power.",
      },
      { action: "unlock", target: "exit", reason: "Open the evacuation door." },
      {
        action: "wait",
        target: state.roomId,
        reason: "Take a breath and reduce stress.",
      },
      ...ROOMS.map((r) => ({
        action: "unlock" as const,
        target: r.id,
        reason: "Override the sealed door.",
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
  async function startLive() {
    if (!liveConfigured) {
      toast("APIサーバーとキーの設定を確認してください。");
      return;
    }
    const gen = generation;
    state.thinking = true;
    apiPending = true;
    apiError = "";
    render();
    try {
      const result = await request("/api/session", {
        facilityDescription: JSON.stringify({
          rooms: ROOMS.map(({ id, clue }) => ({ id, clue })),
          connections: CONNECTIONS,
          goal: "Find keycard in archive, restore generator, unlock exit. Avoid fear100 and deadline180. Player sabotages rooms.",
        }),
        strategicPlan:
          "You are ELIAS. In Japanese, give a concise 2-sentence escape plan grounded in this facility. Your plan will guide Decisions API action selection.",
      });
      if (gen !== generation) {
        closeSession(result.sessionId, result.sessionToken);
        return;
      }
      sessionId = result.sessionId;
      sessionToken = result.sessionToken;
      plan = result.outputText;
      state.status = "running";
      state.controller = "api";
      state.decisions.unshift({
        time: 0,
        action: "plan",
        target: state.roomId,
        reason: plan,
        source: "api",
      });
      toast("Agents APIに接続しました。ELIASが脱出を開始します。");
    } catch (error) {
      if (gen === generation) {
        apiError = error instanceof Error ? error.message : String(error);
        toast(apiError);
        state.status = "waiting";
      }
    } finally {
      if (gen === generation) {
        state.thinking = false;
        apiPending = false;
        render();
      }
    }
  }
  async function nextLiveDecision() {
    if (
      apiPending ||
      pendingDecision ||
      state.paused ||
      state.status !== "running" ||
      state.currentAction
    )
      return;
    const choices = legalDecisions();
    if (!choices.length) return;
    const gen = generation;
    apiPending = true;
    state.thinking = true;
    render();
    try {
      const result = await request("/api/decision", {
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
          recentActions: state.decisions.slice(0, 6),
        },
        allowedDecisions: choices.map((d, i) => ({
          id: `choice_${i}`,
          label: `${d.action} ${d.target}`,
          description: d.reason,
          targetId: d.target,
        })),
      });
      if (gen !== generation) return;
      const id = String(result.action?.id);
      const index = /^choice_\d+$/.test(id) ? Number(id.slice(7)) : -1;
      const d = choices[index];
      if (!d) throw new Error("APIが無効な行動IDを返しました。");
      if (state.paused) pendingDecision = d;
      else if (!applyDecision(state, d, "api"))
        throw new Error("状況が変化しました。判断を更新します。");
      apiError = "";
      $("connection").title =
        `Agents: ${sessionId}\nDecision: ${result.decisionId || "—"}\nRequest: ${result.requestId || "—"}`;
    } catch (error) {
      if (gen === generation) {
        apiError = error instanceof Error ? error.message : String(error);
        state.paused = true;
        toast(`実APIを一時停止: ${apiError}`);
      }
    } finally {
      if (gen === generation) {
        apiPending = false;
        state.thinking = false;
        render();
      }
    }
  }
  function startPause() {
    if (apiPending) return;
    if (state.status === "escaped" || state.status === "contained") {
      reset();
      return;
    }
    if (state.status === "waiting") {
      if (($("mode") as HTMLSelectElement).value === "api") {
        void startLive();
        return;
      }
      state.status = "running";
      state.controller = "local";
      tone("start");
    } else {
      state.paused = !state.paused;
      apiError = "";
      if (!state.paused && pendingDecision) {
        applyDecision(state, pendingDecision, "api");
        pendingDecision = null;
      }
    }
    render();
  }
  function reset() {
    generation++;
    closeSession();
    sessionId = "";
    sessionToken = "";
    plan = "";
    state = createState();
    apiPending = false;
    pendingDecision = null;
    apiError = "";
    following = false;
    $("follow").classList.remove("active");
    $("connection").title = "";
    lastStatus = "waiting";
    selectedRoom = "reception";
    lastLogKey = "";
    render();
  }
  function interfere(type: SabotageType) {
    if (state.thinking) {
      toast("AIの判断後に干渉できます。");
      return;
    }
    if (sabotage(state, type, selectedRoom)) {
      tone(type);
      toast(
        `${ROOMS.find((r) => r.id === selectedRoom)!.name} — ${interventions.find((i) => i.type === type)!.name}`,
      );
      render();
    } else if (state.status === "waiting")
      toast("実験を開始して、エージェントに干渉してください。");
  }
  function render() {
    if (disposed) return;
    if (following) selectedRoom = state.targetRoomId || state.roomId;
    const room = ROOMS.find((r) => r.id === selectedRoom)!;
    const running = state.status === "running";
    $("room-number").textContent = room.label;
    $("room-name").textContent = room.name;
    $("room-hint").textContent = state.effects.some(
      (e) => e.roomId === selectedRoom,
    )
      ? "干渉が発生しています"
      : selectedRoom === state.roomId
        ? "エージェントがこの部屋にいます"
        : "この部屋に干渉できます";
    $("timer").textContent = formatTime(Math.ceil(state.timeRemaining));
    $("timer").classList.toggle("urgent", state.timeRemaining < 30);
    $("fear").textContent = Math.round(state.fear).toString().padStart(2, "0");
    $("fear-fill").style.width = `${state.fear}%`;
    $("fear-fill").style.background = state.fear > 60 ? "#e57463" : "#a1c4ae";
    $("energy").textContent = Math.floor(state.energy).toString();
    $("energy-fill").style.width = `${state.energy}%`;
    $("interventions").textContent = state.interventions
      .toString()
      .padStart(2, "0");
    $("subject-status").innerHTML =
      `<i></i> ${state.thinking ? "MAKING A DECISION" : state.paused ? "EXPERIMENT PAUSED" : state.status === "waiting" ? "AWAITING ACTIVATION" : state.status === "escaped" ? "SUBJECT ESCAPED" : state.status === "contained" ? "SUBJECT CONTAINED" : "SEARCHING FOR AN EXIT"}`;
    $("thought").textContent = state.thinking
      ? "「状況を確認して、次の行動を考える。」"
      : apiError
        ? apiError
        : state.currentAction?.reason ||
          state.decisions[0]?.reason ||
          "「ここは、どこだ。……出口を探さないと。」";
    $("action-progress").style.width = `${state.progress * 100}%`;
    $("action-label").textContent = state.thinking
      ? "AWAITING OPENAI"
      : state.currentAction
        ? `${state.currentAction.action.toUpperCase()} / ${state.currentAction.target.toUpperCase()}`
        : state.status === "waiting"
          ? "WAITING FOR EXPERIMENT"
          : state.status.toUpperCase();
    $("objective-key").classList.toggle("complete", state.keycard);
    $("objective-power").classList.toggle("complete", state.power);
    $("objective-exit").classList.toggle("complete", state.status === "escaped");
    $("start").innerHTML =
      svg(
        apiPending
          ? "signal"
          : state.status === "waiting"
            ? "play"
            : state.status === "running" && !state.paused
              ? "pause"
              : "play",
        15,
      ) +
      `<span>${apiPending ? "AIに接続中" : state.status === "waiting" ? "実験を開始" : state.status === "running" ? (state.paused ? "実験を再開" : "一時停止") : "もう一度"}</span>`;
    ($("start") as HTMLButtonElement).disabled = apiPending;
    ($("mode") as HTMLSelectElement).disabled =
      state.status !== "waiting" || apiPending;
    $("connection").textContent =
      state.controller === "api" && sessionId
        ? "OPENAI APIs CONNECTED"
        : ($("mode") as HTMLSelectElement).value === "api"
          ? "OPENAI APIs · READY"
          : "LOCAL SIMULATION";
    root
      .querySelectorAll<HTMLButtonElement>(".sabotage")
      .forEach((button) => {
        const type = button.dataset.type as SabotageType;
        const cd = Math.max(0, Math.ceil(state.cooldowns[type] - state.elapsed));
        button.disabled =
          !running ||
          state.paused ||
          state.thinking ||
          cd > 0 ||
          state.energy < SABOTAGE[type].cost;
        button.querySelector(".cooldown")!.textContent = cd ? `${cd}s` : "";
      });
    const logs = state.decisions.slice(0, expandedLog ? 10 : 2);
    const logKey = JSON.stringify(logs) + expandedLog;
    if (logs.length && lastLogKey !== logKey) {
      lastLogKey = logKey;
      $("activity-log").innerHTML = logs
        .map(
          (l) =>
            `<div class="log-entry"><time>${formatTime(l.time)}</time><span class="log-tag ${l.source}">${l.source === "api" ? "OPENAI" : l.source === "system" ? "ENTITY" : "AGENT"}</span><p>${escape(l.reason)}</p><span class="log-end">${l.source === "system" ? "↳" : "↗"}</span></div>`,
        )
        .join("");
    }
    if (!logs.length) {
      $("activity-log").innerHTML =
        '<div class="log-entry"><time>00:00</time><span class="log-tag system">SYSTEM</span><p>施設の監視システムに接続。実験の開始を待機しています。</p><span class="log-end">_</span></div>';
    }
    const ended = state.status === "escaped" || state.status === "contained";
    $("result").classList.toggle("hidden", !ended);
    if (ended) {
      $("result").innerHTML =
        `<span class="eyebrow">EXPERIMENT COMPLETE</span><h2>${state.status === "contained" ? "CONTAINMENT<br><em>SUCCESSFUL.</em>" : "THE SUBJECT<br><em>ESCAPED.</em>"}</h2><p>${state.status === "contained" ? "施設は、また静けさを取り戻した。" : "扉は開いた。次は、逃がすな。"}</p><button class="start-button" id="result-retry">もう一度 ${svg("arrow", 16)}</button>`;
    }
    if (state.status !== lastStatus) {
      lastStatus = state.status;
      if (ended) tone("apparition");
    }
    facility.update(state, selectedRoom);
  }
  listen($("start"), "click", startPause);
  listen($("reset"), "click", reset);
  listen($("audio"), "click", toggleAudio);
  listen($("follow"), "click", () => {
    following = !following;
    $("follow").classList.toggle("active", following);
    render();
  });
  root.querySelectorAll<HTMLButtonElement>(".sabotage").forEach((button) => {
    listen(button, "click", () => interfere(button.dataset.type as SabotageType));
  });
  listen($("result"), "click", (event) => {
    if (event.target instanceof Element && event.target.closest("#result-retry")) reset();
  });
  const help = $<HTMLDialogElement>("help-dialog");
  listen($("help"), "click", () => {
    if (state.status === "running") state.paused = true;
    help.showModal();
    render();
  });
  listen($("close-help"), "click", () => help.close());
  listen($("understood"), "click", () => help.close());
  listen(help, "click", (event) => {
    if (event.target === help) help.close();
  });
  listen($("toggle-log"), "click", () => {
    expandedLog = !expandedLog;
    $("toggle-log").innerHTML = expandedLog
      ? "ログを閉じる <span>↙</span>"
      : "ログを開く <span>↗</span>";
    render();
  });
  listen(document, "keydown", (event) => {
    if (event.target instanceof HTMLSelectElement || help.open || event.repeat) return;
    if (event.code === "Space") {
      event.preventDefault();
      startPause();
    }
    if (event.key.toLowerCase() === "r") reset();
    const i = Number(event.key) - 1;
    if (i >= 0 && i < 4) interfere(interventions[i].type);
  });
  listen($("mode"), "change", render);
  fetch("/api/status", { signal: events.signal })
    .then((response) => response.json())
    .then((data) => {
      if (disposed) return;
      liveConfigured = data.configured;
      if (liveConfigured) {
        $("mode").querySelector('option[value="api"]')!.textContent =
          "OPENAI LIVE APIs · READY";
        ($("mode") as HTMLSelectElement).value = "api";
        render();
      }
    })
    .catch(() => {});
  let last = performance.now(),
    lastRender = 0;
  let frameId = 0;
  function frame(now: number) {
    if (disposed) return;
    const dt = Math.min((now - last) / 1000, 0.15);
    last = now;
    if (!state.thinking) tick(state, dt);
    if (now - lastRender > 80) {
      render();
      lastRender = now;
    }
    if (state.controller === "api" && sessionId && !apiError)
      void nextLiveDecision();
    frameId = requestAnimationFrame(frame);
  }
  listen(document, "visibilitychange", () => {
    if (document.hidden && state.status === "running") {
      state.paused = true;
      render();
    }
  });
  function dispose() {
    if (disposed) return;
    disposed = true;
    generation++;
    cancelAnimationFrame(frameId);
    clearTimeout(toastTimer);
    events.abort();
    closeSession();
    sessionId = "";
    sessionToken = "";
    pendingDecision = null;
    if (help.open) help.close();
    facility.destroy();
    if (audio) {
      drone?.stop();
      void audio.close().catch(() => {});
    }
    root.replaceChildren();
  }
  listen(window, "pagehide", dispose);
  render();
  frameId = requestAnimationFrame(frame);
  return dispose;
}
