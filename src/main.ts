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
    detail: "探索・装置操作を遅くする · 14秒",
  },
  {
    type: "lock",
    icon: "lock",
    name: "扉を封鎖",
    en: "LOCKDOWN",
    detail: "進路を遮断し、移動を止める · 12秒",
  },
  {
    type: "whisper",
    icon: "whisper",
    name: "囁き",
    en: "WHISPER",
    detail: "恐怖 +8、気配を残す · 10秒",
  },
  {
    type: "apparition",
    icon: "ghost",
    name: "怪異を出現",
    en: "MANIFEST",
    detail: "恐怖 +17、怪異を残す · 6秒",
  },
];
const roomNames: Record<RoomId, string> = {
  reception: "受付", corridor: "中央ホール", ward: "隔離病棟",
  archive: "書庫", laboratory: "研究室", generator: "非常用電源室", exit: "避難口",
};
const roomName = (id: RoomId) => roomNames[id];
const actionNames = { move: "移動", search: "探索", restore: "電源復旧", unlock: "解錠", wait: "深呼吸" };

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
    <section class="quick-guide" aria-label="はじめての実験"><div><span class="guide-label">あなたは怪異</span><p>逃げるAI「ELIAS」を、施設に閉じ込めろ。</p></div><div><span class="guide-label">勝利条件</span><p>恐怖を100にするか、180秒間の脱出を阻止。</p></div><div><span class="guide-label">操作</span><p>① 実験を開始　② 部屋を選ぶ　③ 干渉する</p><span class="guide-note">ELIASが鍵・電源を確保して脱出すると、あなたの敗北。</span></div></section>
    <section class="runtime-status" aria-label="実験の状態"><div class="runtime-copy"><span class="status-kicker" id="mode-label">ローカル体験</span><strong id="runtime-title" role="status" aria-live="polite">サインイン不要ですぐに試せます</strong><p id="runtime-note">ルールに従う脱出者と対戦します。実APIはモードを切り替えて開始。</p><a id="sign-in" class="sign-in hidden" href="/signin-with-chatgpt?return_to=%2F">ChatGPTでサインインして実APIを使う ${svg("arrow", 14)}</a></div><details class="api-details" id="api-details"><summary>接続・判断の詳細</summary><p>方針生成：Agents API ／ 行動の選択：Decisions API。表示するのは返された方針と選択結果です。</p><dl><div><dt>動作</dt><dd id="detail-mode">ローカルルール</dd></div><div><dt>モデル</dt><dd id="detail-models">未取得</dd></div><div><dt>選択肢数</dt><dd id="detail-choices">—</dd></div><div><dt>API confidence</dt><dd id="detail-confidence">未受信（勝率ではありません）</dd></div><div><dt>応答時間</dt><dd id="detail-latency">—</dd></div><div><dt>Request ID</dt><dd id="detail-request">未受信</dd></div><div><dt>Decision ID</dt><dd id="detail-decision">未受信</dd></div></dl><p id="detail-error" class="detail-error"></p></details></section>
    <section class="console"><div class="facility-panel"><div class="panel-heading"><div><span class="tiny-square"></span> FACILITY OVERVIEW <span class="subtle">/ B1</span></div><div class="camera-tag"><i></i> LIVE FEED <span>CAM_07</span></div></div><div class="map-area"><div class="map-coordinate">N <span>↑</span><br><small>35° 42′ 18″ N</small></div><div id="facility"></div><div class="map-grain"></div><div class="map-title"><span>RESTRICTED ACCESS</span><b>BASEMENT — LEVEL 01</b></div><div class="map-legend"><span><i class="agent-dot"></i> SUBJECT</span><span><i class="effect-dot"></i> INTERFERENCE</span><span>⌖ SELECT A ROOM</span></div><div id="result" class="result hidden" role="region" aria-label="実験結果" aria-live="polite"></div></div><div class="room-bar"><div class="room-selection"><span class="room-number" id="room-number">01</span><div><label class="micro" for="room-select">干渉する部屋</label><select id="room-select">${ROOMS.map((room) => `<option value="${room.id}">${room.label} ${roomName(room.id)}</option>`).join("")}</select></div></div><button class="text-button active" id="follow" aria-pressed="true">${svg("eye", 16)}<span>追跡 ON</span></button><span class="room-hint" id="room-hint">ELIASを自動追跡します</span></div><div class="experiment-bar"><div class="timer"><span class="micro">残り時間</span><b id="timer">03:00</b></div><div class="small-stat"><span class="micro">干渉回数</span><b id="interventions">00</b></div><div class="experiment-actions"><button class="icon-button" id="reset" aria-label="実験をリセット">${svg("reset", 17)}</button><button class="start-button" id="start">${svg("play", 15)}<span>実験を開始</span></button></div></div></div>
    <aside class="control-panel"><section class="subject-panel"><div class="section-title"><span>SUBJECT MONITOR</span><span class="micro">脱出するAI</span></div><div class="subject-identity"><div class="subject-avatar"><span></span>${svg("signal", 13)}</div><div><h2>ELIAS</h2><span id="subject-status"><i></i> 実験の開始待ち</span></div><span class="subject-id">S—014</span></div><div class="fear-header"><span>恐怖レベル <small>/ FEAR</small></span><strong><span id="fear">08</span><small>/100</small></strong></div><div class="fear-track"><div id="fear-fill"></div><span></span><span></span><span></span><span></span></div><div class="fear-labels"><span>CALM</span><span>UNSTABLE</span><span>PANIC</span></div><div class="thought"><div class="micro">${svg("signal", 12)} ELIASの行動</div><p id="thought">「ここは、どこだ。<br>……出口を探さないと。」</p><div class="action-progress"><i id="action-progress"></i></div><span id="action-label">WAITING FOR EXPERIMENT</span></div><div class="objectives"><div id="objective-key">${svg("key", 14)}<span>キーカードを回収</span><i></i></div><div id="objective-power">${svg("bolt", 14)}<span>非常用電源を復旧</span><i></i></div><div id="objective-exit">${svg("arrow", 14)}<span>施設から脱出</span><i></i></div></div></section><section class="interference-panel"><div class="section-title"><span>あなたの干渉</span><span class="live-red">THE ENTITY</span></div><p id="target-summary" class="target-summary">対象：受付 · ELIASが在室</p><div class="energy-row"><span>${svg("bolt", 14)} エネルギー</span><strong><span id="energy">100</span><small>/100</small></strong></div><div class="energy-track"><i id="energy-fill"></i></div><div class="sabotage-grid">${interventions.map((item, i) => `<button class="sabotage" data-type="${item.type}" title="${item.detail}"><span class="sabotage-top"><span class="sabotage-icon">${svg(item.icon, 23)}</span><span class="cost">${svg("bolt", 10)} ${SABOTAGE[item.type].cost}</span></span><strong>${item.name}</strong><span class="sabotage-detail">${item.detail}</span><span class="sabotage-state" id="sabotage-state-${item.type}">実験を開始してください</span><span class="sabotage-bottom"><span>${item.en}</span><kbd>${i + 1}</kbd></span></button>`).join("")}</div><p id="interference-feedback" class="interference-feedback" role="status" aria-live="polite"></p><p class="interference-note">追跡ONでELIASの現在地・移動先を狙えます。<br><span>先回りするなら部屋を手動選択。恐怖はELIASが在室すると上昇します。</span></p></section></aside></section>
    <section class="event-console"><div class="log-heading"><span><i></i> ACTIVITY LOG</span><button class="text-button" id="toggle-log">ログを開く <span>↗</span></button></div><div id="activity-log"><div class="log-entry"><time>00:00</time><span class="log-tag system">SYSTEM</span><p>施設の監視システムに接続。実験の開始を待機しています。</p><span class="log-end">_</span></div></div></section>
    <footer><span>BUILT WITH <a href="https://developers.openai.com/api/docs/guides/agents-api/overview" target="_blank" rel="noreferrer">Agents API</a><span class="footer-plus">+</span><a href="https://developers.openai.com/api/docs/guides/decisions" target="_blank" rel="noreferrer">Decisions API</a></span><div><label for="mode">対戦モード</label><select id="mode"><option value="local">ローカル体験</option><option value="api">OpenAI 実API</option></select><span class="footer-experiment">EXPERIMENT / 007</span></div></footer>
    </main><dialog id="help-dialog"><button class="dialog-close icon-button" id="close-help" aria-label="閉じる">${svg("close")}</button><div class="eyebrow">CONTAINMENT PROTOCOL</div><h2>出口を、与えるな。</h2><p>エージェント「ELIAS」は自ら判断し、鍵と電源を確保して脱出を目指します。あなたは建物に棲む怪異。マップの部屋を選び、干渉してください。</p><ol><li><b>停電</b> — 部屋を暗くし、探索と装置の操作を遅らせます。</li><li><b>扉を封鎖</b> — 進路を遮断します。AIは迂回や解錠を試みます。</li><li><b>囁き・怪異</b> — 同じ部屋のAIの恐怖を高めます。</li></ol><p>恐怖が100、または制限時間180秒であなたの勝利。AIは深呼吸で恐怖を抑えるため、部屋とタイミングの選択が鍵です。</p><p class="dialog-fine">部屋はマップや選択メニューから指定できます。追跡ONでELIASの現在地・移動先を自動選択。1〜4: 干渉 / Space: 開始・一時停止 / R: リセット。音は初期状態でオフです。実APIモードはAgents APIの脱出方針とDecisions APIの行動選択を使い、APIの応答待ち中はゲーム時間が止まります。</p><button class="start-button" id="understood">理解した ${svg("arrow", 16)}</button></dialog><div id="toast" role="status"></div>`;

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
  let following = true;
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
  let authenticated: boolean | null = null;
  let statusChecked = false;
  let statusError = "";
  let models = { agents: "", decisions: "" };
  let requestPhase: "plan" | "decision" | "" = "";
  let requestStartedAt = 0;
  let lastRequestId = "";
  let lastDecisionId = "";
  let lastConfidence: number | null = null;
  let lastChoiceCount = 0;
  let lastLatency = 0;
  let lastResultKey = "";
  let lastFeedback = "まずは実験を開始。追跡ONなら、ELIASがいる場所を自動で選びます。";
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
  function setText(id: string, value: string) {
    if ($(id).textContent !== value) $(id).textContent = value;
  }
  function recordApiError(error: unknown) {
    const failure = error as Error & { status?: number; requestId?: string };
    apiError = failure instanceof Error ? failure.message : String(error);
    if (failure?.status === 401) {
      authenticated = false;
      liveConfigured = false;
    }
    if (failure?.requestId) lastRequestId = failure.requestId;
  }
  async function request(path: string, body?: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(90000),
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(
        data.error?.message || (typeof data.error === "string" ? data.error : `API error ${response.status}`),
      ) as Error & { status: number; requestId?: string };
      error.status = response.status;
      error.requestId = data.error?.requestId;
      throw error;
    }
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
  async function startLive() {
    if (authenticated === false) {
      toast("実APIにはChatGPTでのサインインが必要です。ローカル体験はそのまま遊べます。");
      render();
      return;
    }
    if (!liveConfigured) {
      toast("実APIの接続準備ができていません。ローカル体験を選ぶとすぐに遊べます。");
      return;
    }
    const gen = generation;
    state.status = "running";
    state.controller = "api";
    state.paused = false;
    state.thinking = true;
    requestPhase = "plan";
    requestStartedAt = performance.now();
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
      lastRequestId = result.requestId || "";
      lastLatency = performance.now() - requestStartedAt;
      if (result.model) models.agents = result.model;
      state.status = "running";
      state.controller = "api";
      state.decisions.unshift({
        time: 0,
        action: "plan",
        target: state.roomId,
        reason: plan,
        source: "api",
      });
      toast(state.paused ? "Agents APIの脱出方針を受信しました。再開するとELIASが動きます。" : "Agents APIに接続しました。ELIASが脱出を開始します。");
    } catch (error) {
      if (gen === generation) {
        recordApiError(error);
        toast("実APIへの接続に失敗しました。接続状態の案内を確認してください。ローカル体験も選べます。");
        state.status = "waiting";
        state.paused = false;
      }
    } finally {
      if (gen === generation) {
        state.thinking = false;
        apiPending = false;
        requestPhase = "";
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
    requestPhase = "decision";
    requestStartedAt = performance.now();
    lastChoiceCount = choices.length;
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
      lastRequestId = result.requestId || "";
      lastDecisionId = result.decisionId || "";
      lastConfidence = typeof result.confidence === "number" && Number.isFinite(result.confidence) ? result.confidence : null;
      lastLatency = performance.now() - requestStartedAt;
      if (result.model) models.decisions = result.model;
      if (!d) throw new Error("APIが無効な行動IDを返しました。");
      if (state.paused) pendingDecision = d;
      else if (!applyDecision(state, d, "api"))
        throw new Error("状況が変化しました。判断を更新します。");
      apiError = "";
      $("connection").title =
        `Agents: ${sessionId}\nDecision: ${result.decisionId || "—"}\nRequest: ${result.requestId || "—"}`;
    } catch (error) {
      if (gen === generation) {
        recordApiError(error);
        state.paused = true;
        toast("実APIを一時停止しました。接続状態を確認して、再試行できます。");
      }
    } finally {
      if (gen === generation) {
        apiPending = false;
        state.thinking = false;
        requestPhase = "";
        render();
      }
    }
  }
  function startPause() {
    if (($("mode") as HTMLSelectElement).value === "api" && authenticated === false && (state.status === "waiting" || state.paused)) {
      toast("実APIにはサインインが必要です。接続状態の案内から進んでください。");
      render();
      return;
    }
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
        const decision = pendingDecision;
        pendingDecision = null;
        if (!applyDecision(state, decision, "api")) {
          apiError = "一時停止中に状況が変わりました。再開すると次の行動を問い合わせます。";
          state.paused = true;
        }
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
    following = true;
    $("connection").title = "";
    requestPhase = "";
    lastRequestId = "";
    lastDecisionId = "";
    lastConfidence = null;
    lastChoiceCount = 0;
    lastLatency = 0;
    lastResultKey = "";
    lastFeedback = "実験をリセットしました。追跡ONでELIASを狙えます。";
    lastStatus = "waiting";
    selectedRoom = "reception";
    lastLogKey = "";
    render();
  }
  function interferenceBlock(type: SabotageType): string {
    if (state.status !== "running") return state.status === "waiting" ? "実験を開始してください" : "実験は終了しました";
    if (state.paused) return "一時停止中 · 再開すると使えます";
    if (state.thinking) return "AIの応答待ち · 時間も停止中";
    const cd = Math.max(0, Math.ceil(state.cooldowns[type] - state.elapsed));
    if (cd > 0) return `再使用まで ${cd}秒`;
    if (state.energy < SABOTAGE[type].cost) return `エネルギーがあと ${Math.ceil(SABOTAGE[type].cost - state.energy)} 必要`;
    return "";
  }
  function interfere(type: SabotageType) {
    const blocked = interferenceBlock(type);
    if (blocked) {
      toast(blocked);
      return;
    }
    const occupied = selectedRoom === state.roomId;
    const incoming = selectedRoom === state.targetRoomId;
    const stopped = type === "lock" && incoming;
    const before = state.fear;
    if (sabotage(state, type, selectedRoom)) {
      tone(type);
      const name = interventions.find((i) => i.type === type)!.name;
      const fearGain = Math.round(state.fear - before);
      lastFeedback = `${roomName(selectedRoom)}に${name}。${stopped ? "進路を遮断！ELIASの移動を止めました。" : occupied || incoming ? `${fearGain ? `恐怖 +${fearGain}。` : ""}この部屋に干渉が続きます。` : "先回りして配置。ELIASが来ると効果を発揮します。"}`;
      toast(lastFeedback);
      render();
    }
  }
  function renderRuntime() {
    const live = ($("mode") as HTMLSelectElement).value === "api";
    let title = "サインイン不要ですぐに試せます";
    let note = "ルールに従う脱出者と対戦します。OpenAIへの実通信は行いません。";
    if (live) {
      if (authenticated === false) {
        title = "実APIにはサインインが必要です";
        note = "ChatGPTでサインインして接続するか、ローカル体験に切り替えるとすぐに遊べます。";
      } else if (apiError) {
        title = "実APIを一時停止しました";
        note = state.status === "waiting" ? "開始ボタンで接続を再試行できます。ローカル体験への切り替えも可能です。" : "「接続を再試行」で再開できます。ローカル体験へ切り替えるには実験をリセットしてください。";
      } else if (apiPending) {
        title = state.paused ? "応答待ちのまま一時停止中" : requestPhase === "plan" ? "Agents APIから脱出方針を受信中" : "Decisions APIに次の行動を問い合わせ中";
        note = state.paused ? "届いた行動は保留し、再開したときに1回だけ実行します。" : "ゲーム時間と干渉は停止しています。一時停止ボタンはいつでも使えます。";
      } else if (!statusChecked) {
        title = "実APIの接続状態を確認中";
        note = "ローカル体験は確認を待たずに開始できます。";
      } else if (!liveConfigured) {
        title = "実APIの接続準備ができていません";
        note = statusError ? "接続状態を取得できませんでした。ページを再読込して確認するか、ローカル体験を選んでください。" : "サーバー側のAPI設定が必要です。ローカル体験はそのまま遊べます。";
      } else if (pendingDecision) {
        title = "受信した行動を保留しています";
        note = "再開すると、受信済みの行動を1回だけ実行します。";
      } else {
        title = state.status === "waiting" ? "OpenAI 実APIの準備ができています" : state.paused ? "実験を一時停止しています" : "OpenAI 実APIで対戦中";
        note = "Agents APIが脱出方針を生成し、Decisions APIが有効な選択肢から行動を選びます。応答待ちを含めると実時間は3分を超えます。";
      }
    } else if (state.status === "running") {
      title = state.paused ? "ローカル体験を一時停止しています" : "ローカルルールで対戦中";
      note = "ELIASの移動先を封鎖したり、在室する部屋に囁いて恐怖を高めてください。";
    }
    if (state.status === "escaped" || state.status === "contained") {
      title = state.status === "contained" ? "封じ込め成功 · あなたの勝利" : "ELIASが脱出 · あなたの敗北";
      note = "結果を振り返って、もう一度挑戦できます。";
    }
    setText("mode-label", live ? "OpenAI 実API" : "ローカル体験 · サインイン不要");
    setText("runtime-title", title);
    setText("runtime-note", note);
    $("runtime-title").classList.toggle("status-error", live && !!apiError);
    $("sign-in").classList.toggle("hidden", !(live && authenticated === false));
    setText("detail-mode", live ? (sessionId ? "実APIセッションあり" : "実APIを選択・未接続") : "ローカルルール（API通信なし）");
    setText("detail-models", models.agents || models.decisions ? `Agents: ${models.agents || "未取得"} / Decisions: ${models.decisions || "未取得"}` : "未取得");
    setText("detail-choices", lastChoiceCount ? `${lastChoiceCount}件（直近の問い合わせ）` : "未送信");
    setText("detail-confidence", lastConfidence === null ? "未受信（勝率ではありません）" : `${lastConfidence}（APIの返却値・勝率ではありません）`);
    setText("detail-latency", lastLatency ? `${(lastLatency / 1000).toFixed(1)}秒（直近の応答）` : "未受信");
    setText("detail-request", lastRequestId || "未受信");
    setText("detail-decision", lastDecisionId || "未受信");
    setText("detail-error", apiError || statusError);
  }
  function render() {
    if (disposed) return;
    if (following) selectedRoom = state.targetRoomId || state.roomId;
    const room = ROOMS.find((r) => r.id === selectedRoom)!;
    const running = state.status === "running";
    $("room-number").textContent = room.label;
    ($("room-select") as HTMLSelectElement).value = selectedRoom;
    $("follow").classList.toggle("active", following);
    $("follow").setAttribute("aria-pressed", String(following));
    setText("room-hint", selectedRoom === state.roomId ? "ELIASが在室" : selectedRoom === state.targetRoomId ? "ELIASが移動中 → この部屋へ" : "ELIASは別の部屋にいます · 先回りして配置");
    setText("target-summary", `対象：${roomName(selectedRoom)} · ${selectedRoom === state.roomId ? "ELIASが在室" : selectedRoom === state.targetRoomId ? "ELIASの移動先" : "現在は無人"}`);
    const followLabel = $("follow").querySelector("span")!;
    if (followLabel.textContent !== `追跡 ${following ? "ON" : "OFF"}`) followLabel.textContent = `追跡 ${following ? "ON" : "OFF"}`;
    setText("interference-feedback", lastFeedback);
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
    const subjectStatus = state.paused ? "実験を一時停止中" : state.thinking ? "OpenAIの応答待ち" : state.status === "waiting" ? "実験の開始待ち" : state.status === "escaped" ? "施設から脱出" : state.status === "contained" ? "封じ込め成功" : "脱出経路を探索中";
    if ($("subject-status").textContent?.trim() !== subjectStatus) $("subject-status").innerHTML = `<i></i> ${subjectStatus}`;
    setText("thought", state.thinking
      ? "OpenAIの応答を待っています。ゲーム時間は停止中です。"
      : apiError
        ? "通信を一時停止しました。上の接続状態を確認してください。"
        : state.currentAction?.reason || state.decisions[0]?.reason || "「ここは、どこだ。……出口を探さないと。」");
    $("action-progress").style.width = `${state.progress * 100}%`;
    setText("action-label", state.thinking
      ? "API 応答待ち"
      : pendingDecision
        ? "次の行動を受信済み · 再開待ち"
        : state.currentAction
          ? `${actionNames[state.currentAction.action]} / ${roomName(state.currentAction.target)}`
          : state.status === "waiting" ? "開始ボタンで実験を開始" : state.status === "contained" ? "封じ込め成功" : state.status === "escaped" ? "脱出完了" : "次の行動へ");
    $("objective-key").classList.toggle("complete", state.keycard);
    $("objective-power").classList.toggle("complete", state.power);
    $("objective-exit").classList.toggle("complete", state.status === "escaped");
    const liveMode = ($("mode") as HTMLSelectElement).value === "api";
    const cannotStartLive = liveMode && (authenticated === false || (state.status === "waiting" && !liveConfigured));
    const startLabel = state.status === "waiting"
      ? liveMode && authenticated === false ? "サインインが必要" : apiError ? "接続を再試行" : liveMode ? "実APIで実験を開始" : "ローカルで実験を開始"
      : running ? state.paused ? apiError ? "接続を再試行" : "実験を再開" : "一時停止" : "もう一度";
    const startIcon = state.status === "running" && !state.paused ? "pause" : "play";
    const startKey = `${startIcon}:${startLabel}`;
    if ($("start").dataset.label !== startKey) {
      $("start").innerHTML = svg(startIcon, 15) + `<span>${startLabel}</span>`;
      $("start").dataset.label = startKey;
    }
    ($("start") as HTMLButtonElement).disabled = cannotStartLive;
    ($("mode") as HTMLSelectElement).disabled = state.status !== "waiting" || apiPending;
    setText("connection", state.controller === "api" && sessionId ? "実API接続中" : liveMode ? authenticated === false ? "サインインが必要" : "実APIを選択中" : "ローカル体験");
    root.querySelectorAll<HTMLButtonElement>(".sabotage").forEach((button) => {
      const type = button.dataset.type as SabotageType;
      const blocked = interferenceBlock(type);
      const available = selectedRoom === state.roomId || selectedRoom === state.targetRoomId ? "ELIASを狙える · 実行可能" : "先回りして配置できます";
      button.disabled = !!blocked;
      setText(`sabotage-state-${type}`, blocked || available);
      button.setAttribute("aria-label", `${interventions.find((item) => item.type === type)!.name}、エネルギー${SABOTAGE[type].cost}、${roomName(selectedRoom)}。${blocked || available}`);
      button.title = blocked || interventions.find((item) => item.type === type)!.detail;
    });
    renderRuntime();
    const logs = state.decisions.slice(0, expandedLog ? 10 : 2);
    const logKey = JSON.stringify(logs) + expandedLog;
    if (logs.length && lastLogKey !== logKey) {
      lastLogKey = logKey;
      $("activity-log").innerHTML = logs
        .map(
          (l) =>
            `<div class="log-entry"><time>${formatTime(l.time)}</time><span class="log-tag ${l.source}">${l.source === "api" ? "OPENAI" : l.source === "system" ? (l.action === "wait" ? "ENTITY" : "FACILITY") : "LOCAL"}</span><p>${escape(l.reason)}</p><span class="log-end">${l.source === "system" ? "↳" : "↗"}</span></div>`,
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
      const resultKey = `${state.status}:${state.elapsed}:${state.interventions}`;
      if (resultKey !== lastResultKey) {
        lastResultKey = resultKey;
        const won = state.status === "contained";
        const reason = won ? state.fear >= 100 ? "恐怖が100に到達。ELIASは脱出を断念した。" : "180秒の脱出猶予が終了。施設への封じ込めに成功した。" : "ELIASは鍵と電源を確保し、避難口を解錠した。";
        $("result").innerHTML = `<span class="eyebrow">EXPERIMENT COMPLETE</span><h2>${won ? "あなたの勝利" : "ELIASが脱出"}</h2><strong class="result-verdict">${won ? "封じ込め成功" : "あなたの敗北"}</strong><p>${reason}</p><dl class="result-stats"><div><dt>経過時間</dt><dd>${formatTime(Math.ceil(state.elapsed))}</dd></div><div><dt>干渉</dt><dd>${state.interventions}回</dd></div><div><dt>最終恐怖</dt><dd>${Math.round(state.fear)}/100</dd></div><div><dt>ELIASの確保物</dt><dd>鍵 ${state.keycard ? "取得済" : "未取得"} ／ 電源 ${state.power ? "復旧済" : "未復旧"}</dd></div></dl><p class="result-tip">${won ? "施設は、また静けさを取り戻した。次は別の干渉を試してみよう。" : "次は移動先を封鎖して時間を稼ごう。ELIASがいる部屋への囁きも有効。"}</p><button class="start-button" id="result-retry">もう一度挑戦 ${svg("arrow", 16)}</button>`;
      }
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
    render();
  });
  listen($("room-select"), "change", () => {
    selectedRoom = ($("room-select") as HTMLSelectElement).value as RoomId;
    following = false;
    render();
  });
  root.querySelectorAll<HTMLButtonElement>(".sabotage").forEach((button) => {
    listen(button, "click", () => interfere(button.dataset.type as SabotageType));
  });
  listen($("result"), "click", (event) => {
    if (event.target instanceof Element && event.target.closest("#result-retry")) {
      reset();
      $("start").focus();
    }
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
    if (help.open || event.repeat || (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest("input, textarea, select, button, a, summary")))) return;
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
    .then(async (response) => {
      const data = await response.json();
      if (disposed) return;
      statusChecked = true;
      if (response.status === 401) {
        authenticated = false;
        liveConfigured = false;
      } else if (!response.ok) {
        throw new Error(`接続状態の取得に失敗しました（${response.status}）`);
      } else {
        authenticated = data.authenticated === true ? true : data.authenticated === false || data.mode === "sign-in-required" ? false : null;
        liveConfigured = data.configured === true;
        models = { agents: typeof data.models?.agents === "string" ? data.models.agents : "", decisions: typeof data.models?.decisions === "string" ? data.models.decisions : "" };
      }
      $("mode").querySelector('option[value="api"]')!.textContent = authenticated === false ? "OpenAI 実API · 要サインイン" : liveConfigured ? "OpenAI 実API · 接続可能" : "OpenAI 実API · 準備未完了";
      render();
    })
    .catch((error) => {
      if (disposed) return;
      statusChecked = true;
      statusError = error instanceof Error ? error.message : String(error);
      render();
    });
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
