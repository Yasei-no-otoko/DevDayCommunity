import { execFileSync, spawn } from "node:child_process";
import { readFile, writeFile, mkdir, rm, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { resolve, dirname } from "node:path";
import { createState, applyDecision, applyKillerDecision, killerDecisions, sabotage, tick } from "../src/simulation.ts";
import { legalDecisions, createSessionRequest, createDecisionRequest, createKillerDecisionRequest } from "../src/live-contract.ts";

export const SITE_ORIGIN = "https://blacksite-escape-experiment.yasei-no-otoko.chatgpt.site";
export const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 65_000;
const RUN_TIMEOUT_MS = 180_000;
const root = fileURLToPath(new URL("../", import.meta.url));
const receiptPath = resolve(root, ".sites-runtime/live-demo-receipt.json");
const requestId = (value) => typeof value === "string" && /^req_[A-Za-z0-9_-]{8,160}$/.test(value);
function requireValue(ok, code) { if (!ok) throw new Error(code); }
function verifyRelease(release, identity) {
  requireValue(release?.projectId === identity.projectId && release?.commitSha === identity.commitSha, "deployed_release_mismatch");
}
function summary(state) {
  return { room: state.roomId, elapsed: state.elapsed, timeRemaining: state.timeRemaining, energy: state.energy, fear: state.fear, keycard: state.keycard, power: state.power, status: state.status };
}
function validIdentity(identity) {
  return typeof identity?.projectId === "string" && /^appgprj_[A-Za-z0-9]+$/.test(identity.projectId) && /^[a-f0-9]{40}$/.test(identity.commitSha);
}

export function validateBrowserTarget(target) {
  requireValue(target && Object.keys(target).sort().join(",") === "browser,tabId,windowId" && ["Google Chrome", "Vivaldi"].includes(target.browser) && Number.isSafeInteger(target.windowId) && target.windowId > 0 && Number.isSafeInteger(target.tabId) && target.tabId > 0, "browser_target_invalid");
}

function runAppleScript(script) {
  return new Promise((resolveOutput, reject) => {
    // AppleScript, including any in-memory capability, travels exclusively over stdin.
    const child = spawn("/usr/bin/osascript", ["-"], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "", size = 0, finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      error ? reject(new Error("browser_script_failed")) : resolveOutput(output.trim());
    };
    const timeout = setTimeout(() => { child.kill("SIGKILL"); finish(true); }, 10_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > 256 * 1024) { child.kill("SIGKILL"); finish(true); }
      else output += chunk;
    });
    // Never forward AppleScript diagnostics: source text can contain a capability.
    child.stderr.resume();
    child.on("error", () => finish(true));
    child.on("close", (code) => finish(code !== 0));
    child.stdin.on("error", () => finish(true));
    child.stdin.end(script);
  });
}

/** Real same-origin browser fetch; does not inspect or export browser cookies. */
export function createBrowserTransport(target, { executeScript = runAppleScript, delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms)) } = {}) {
  validateBrowserTarget(target);
  const active = new Set();
  async function evaluate(javascript) {
    const errorResult = JSON.stringify(JSON.stringify({ error: "browser_tab_unavailable" }));
    const wrongOrigin = JSON.stringify(JSON.stringify({ error: "browser_origin_mismatch" }));
    const script = `tell application ${JSON.stringify(target.browser)}
  if not (exists window id ${target.windowId}) then return ${errorResult}
  set targetWindow to window id ${target.windowId}
  set matchingTabs to (tabs of targetWindow whose id is ${target.tabId})
  if (count of matchingTabs) is not 1 then return ${errorResult}
  set targetTab to item 1 of matchingTabs
  set targetURL to URL of targetTab
  if targetURL is not ${JSON.stringify(SITE_ORIGIN)} and targetURL does not start with ${JSON.stringify(`${SITE_ORIGIN}/`)} then return ${wrongOrigin}
  execute targetTab javascript ${JSON.stringify(javascript)}
end tell`;
    let result;
    try { result = JSON.parse(await executeScript(script)); }
    catch { throw new Error("browser_script_failed"); }
    requireValue(result && typeof result === "object", "browser_script_failed");
    if (result.error) throw new Error(["browser_tab_unavailable", "browser_origin_mismatch", "browser_fetch_failed"].includes(result.error) ? result.error : "browser_script_failed");
    return result;
  }
  function program(key, operation) {
    return `(() => {
      if (window.location.origin !== ${JSON.stringify(SITE_ORIGIN)}) return JSON.stringify({error:"browser_origin_mismatch"});
      const bridgeKey = ${JSON.stringify(key)};
      ${operation}
    })()`;
  }
  async function clear(key) {
    try {
      await evaluate(program(key, `const bridge = window[bridgeKey]; if (bridge?.controller) bridge.controller.abort(); delete window[bridgeKey]; return JSON.stringify({cleared:true});`));
    } finally { active.delete(key); }
  }
  return {
    async fetchImpl(url, options) {
      requireValue(new URL(url).origin === SITE_ORIGIN && new URL(url).pathname.startsWith("/api/"), "browser_origin_mismatch");
      requireValue(options?.credentials === "same-origin" && options.redirect === "error", "browser_fetch_options_invalid");
      const key = `__blacksiteLiveCheck_${randomUUID().replaceAll("-", "")}`;
      active.add(key);
      try {
        const request = { method: options.method, credentials: "same-origin", redirect: "error", headers: options.headers, ...(options.body ? { body: options.body } : {}) };
        await evaluate(program(key, `
          const controller = new AbortController();
          window[bridgeKey] = {state:"pending",controller};
          fetch(${JSON.stringify(new URL(url).pathname)}, {...${JSON.stringify(request)}, signal:controller.signal}).then(async response => {
            const body = await response.text();
            if (window[bridgeKey]) window[bridgeKey] = {state:"done",status:response.status,url:response.url,redirected:response.redirected,body};
          }).catch(() => { if (window[bridgeKey]) window[bridgeKey] = {state:"failed"}; });
          return JSON.stringify({state:"pending"});`));
        const deadline = Date.now() + REQUEST_TIMEOUT_MS;
        for (;;) {
          requireValue(!options.signal?.aborted && Date.now() < deadline, "browser_fetch_timeout");
          const result = await evaluate(program(key, `const bridge = window[bridgeKey]; return JSON.stringify(bridge?.state === "done" ? bridge : bridge?.state === "failed" ? {error:"browser_fetch_failed"} : bridge?.state === "pending" ? {state:"pending"} : {error:"browser_bridge_missing"});`));
          if (result.state === "done") {
            requireValue(result.url && new URL(result.url).origin === SITE_ORIGIN && result.redirected === false && Number.isInteger(result.status) && typeof result.body === "string", "browser_response_invalid");
            // Mimic only the Web Response fields required by the gate; raw JSON stays in memory.
            return { status: result.status, url: result.url, redirected: result.redirected, json: async () => JSON.parse(result.body) };
          }
          await delay(100);
        }
      } finally { await clear(key); }
    },
    async close() {
      for (const key of active) await clear(key);
    },
  };
}

/** Injectable transport is for offline tests; the CLI uses a signed-in browser tab. */
export async function runLiveDemo({ identity, fetchImpl, now = Date.now }) {
  requireValue(typeof fetchImpl === "function", "authenticated_browser_transport_required");
  requireValue(validIdentity(identity), "invalid_source_identity");
  const startedAt = now();
  const state = createState();
  state.status = "running";
  state.controller = "api";
  let sessionId, sessionToken;
  let failure, receipt;
  const decisions = [];
  const killerDecisionsApplied = [];
  let intervention;
  let postInterventionDecision = false;
  let moved = false;
  function advance(dt) {
    tick(state, dt);
    for (const trace of killerDecisionsApplied) {
      if (!trace.completed && state.killer.roomId === trace.target && state.killer.targetRoomId === null) {
        trace.completed = { room: state.killer.roomId, elapsed: state.elapsed };
      }
    }
  }
  async function request(path, { method = "GET", body, cleanup = false } = {}) {
    const budget = cleanup ? REQUEST_TIMEOUT_MS : Math.min(REQUEST_TIMEOUT_MS, RUN_TIMEOUT_MS - (now() - startedAt));
    requireValue(budget > 0, "live_run_timeout");
    const begin = now();
    let response;
    try {
      response = await fetchImpl(`${SITE_ORIGIN}${path}`, {
        method, credentials: "same-origin", redirect: "error", signal: AbortSignal.timeout(budget),
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(cleanup ? { "x-blacksite-session-token": sessionToken } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new Error(cleanup ? "cleanup_transport_failed" : "hosted_request_failed"); }
    requireValue(!response.redirected, "redirect_forbidden");
    requireValue(response.url === "" || new URL(response.url).origin === SITE_ORIGIN, "unexpected_response_origin");
    let data;
    try { data = await response.json(); } catch { throw new Error("invalid_hosted_json"); }
    return { status: response.status, data, latencyMs: Math.max(0, now() - begin) };
  }
  try {
    const release = await request("/api/release");
    requireValue(release.status === 200, "release_unavailable");
    verifyRelease(release.data, identity);
    const status = await request("/api/status");
    requireValue(status.status === 200 && status.data?.mode === "live" && status.data.authenticated === true && status.data.configured === true, "hosted_live_authentication_required");
    const session = await request("/api/session", { method: "POST", body: createSessionRequest() });
    // Retain a returned capability before other validation so malformed success can still be cleaned up.
    if (typeof session.data?.sessionId === "string" && typeof session.data?.sessionToken === "string") {
      sessionId = session.data.sessionId;
      sessionToken = session.data.sessionToken;
    }
    requireValue(session.status === 201 && session.data?.mode === "live" && session.data.terminalSuccess === true && sessionId && sessionToken && typeof session.data.outputText === "string" && session.data.outputText.trim() && requestId(session.data.requestId), "agents_live_response_invalid");
    const plan = session.data.outputText;
    for (let index = 0; index < 12 && state.status === "running"; index++) {
      const choices = legalDecisions(state);
      requireValue(choices.length > 0, "no_legal_live_choices");
      if (choices.length === 1) {
        requireValue(applyDecision(state, { ...choices[0], reason: "強制行動（API選択なし）" }, "system"), "forced_decision_not_applied");
        for (let steps = 0; state.currentAction && state.status === "running" && steps < 600; steps++) advance(0.1);
        continue;
      }
      const body = createDecisionRequest(state, plan, choices, sessionId, sessionToken);
      const followsLock = Boolean(intervention && body.snapshot.locks[intervention.room] > state.elapsed);
      const before = summary(state);
      const response = await request("/api/decision", { method: "POST", body });
      const result = response.data;
      requireValue(response.status === 200 && result?.mode === "live" && result.actor === "escape" && requestId(result.requestId), "decisions_live_response_invalid");
      requireValue(result.confidence === null || (typeof result.confidence === "number" && Number.isFinite(result.confidence) && result.confidence >= 0 && result.confidence <= 1), "decision_confidence_invalid");
      const choiceIndex = body.allowedDecisions.findIndex((choice) => choice.id === result.action?.id);
      requireValue(choiceIndex >= 0, "decision_outside_legal_choices");
      const choice = choices[choiceIndex];
      requireValue(applyDecision(state, choice, "api"), "decision_not_applied");
      requireValue(state.decisions[0]?.source === "api", "decision_source_invalid");
      const pursuitChoices = killerDecisions(state);
      if (pursuitChoices.length > 1) {
        requireValue(state.keycard === true && state.killer.spawned === true, "killer_spawn_condition_invalid");
        const killerBody = createKillerDecisionRequest(state, pursuitChoices, sessionId, sessionToken);
        const killerBefore = { room: state.killer.roomId, target: state.killer.targetRoomId, elapsed: state.elapsed, keycard: state.keycard, spawned: state.killer.spawned };
        const killerResponse = await request("/api/decision", { method: "POST", body: killerBody });
        const killerResult = killerResponse.data;
        requireValue(killerResponse.status === 200 && killerResult?.mode === "live" && killerResult.actor === "killer" && requestId(killerResult.requestId), "killer_live_response_invalid");
        requireValue(killerResult.confidence === null || (typeof killerResult.confidence === "number" && Number.isFinite(killerResult.confidence) && killerResult.confidence >= 0 && killerResult.confidence <= 1), "killer_confidence_invalid");
        const killerIndex = killerBody.allowedDecisions.findIndex((candidate) => candidate.id === killerResult.action?.id);
        requireValue(killerIndex >= 0, "killer_decision_outside_choices");
        const killerChoice = pursuitChoices[killerIndex];
        requireValue(applyKillerDecision(state, killerChoice), "killer_decision_not_legal_optimal");
        requireValue(state.decisions[0]?.source === "api" && state.decisions[0]?.actor === "killer", "killer_decision_source_invalid");
        killerDecisionsApplied.push({ actor: "killer", requestId: killerResult.requestId, requestedModel: "gpt-6-luna", httpStatus: killerResponse.status, action: killerChoice.action, target: killerChoice.target, latencyMs: killerResponse.latencyMs, legalOptimal: true, before: killerBefore, after: { room: state.killer.roomId, target: state.killer.targetRoomId } });
      }
      // Advance the real deterministic rules; inference itself consumes no game time.
      advance(1);
      if (!intervention && choice.action === "move" && state.status === "running" && state.currentAction?.action === "move") {
        const lockBefore = summary(state);
        const target = state.currentAction.target;
        requireValue(sabotage(state, "lock", target), "player_lock_failed");
        const event = state.interventionHistory[0];
        requireValue(event?.type === "lock" && event.interruptedMove && state.locks[target] > state.elapsed && state.energy < lockBefore.energy && !state.currentAction, "player_lock_not_applied");
        intervention = { type: "lock", room: target, interruptedMove: true, before: lockBefore, after: summary(state) };
      }
      for (let steps = 0; state.currentAction && state.status === "running" && steps < 600; steps++) advance(0.1);
      requireValue(!state.currentAction || state.status !== "running", "simulation_action_timeout");
      // Finish this API-approved edge with normal rules; never invent a next leg.
      if (decisions.length >= 2 && (postInterventionDecision || followsLock) && !killerDecisionsApplied.some((trace) => trace.completed)) {
        for (let steps = 0; state.killer.targetRoomId && state.status === "running" && steps < 600; steps++) advance(0.1);
        requireValue(!state.killer.targetRoomId || state.status !== "running", "killer_movement_timeout");
      }
      const after = summary(state);
      if (before.room !== after.room) moved = true;
      if (followsLock) postInterventionDecision = true;
      decisions.push({ actor: "escape", requestId: result.requestId, requestedModel: "gpt-6-luna", httpStatus: response.status, action: choice.action, target: choice.target, latencyMs: response.latencyMs, before, after, followsIntervention: followsLock });
      if (decisions.length >= 3 && killerDecisionsApplied.some((trace) => trace.completed) && moved && postInterventionDecision && state.elapsed > 0) break;
    }
    requireValue(decisions.length >= 3 && killerDecisionsApplied.some((trace) => trace.completed) && moved && intervention && postInterventionDecision && state.elapsed > 0 && state.timeRemaining < 180, "meaningful_live_gameplay_incomplete");
    receipt = {
      schemaVersion: 2, completed: true, origin: SITE_ORIGIN,
      projectId: identity.projectId, commitSha: identity.commitSha,
      checkedAt: new Date(now()).toISOString(),
      agents: { requestId: session.data.requestId, requestedModel: "gpt-6-astra", httpStatus: session.status, latencyMs: session.latencyMs, terminalSuccess: true },
      decisions, killerDecisions: killerDecisionsApplied, intervention, finalState: summary(state),
    };
  } catch (error) { failure = error; }
  finally {
    if (sessionId && sessionToken) {
      try {
        const cleanup = await request(`/api/session/${encodeURIComponent(sessionId)}`, { method: "DELETE", cleanup: true });
        requireValue(cleanup.status === 200 && cleanup.data?.mode === "live" && requestId(cleanup.data.requestId), "provider_session_cleanup_failed");
        if (receipt) receipt.cleanup = { completed: true, httpStatus: 200, requestId: cleanup.data.requestId, latencyMs: cleanup.latencyMs };
      } catch { failure = new Error("provider_session_cleanup_failed"); }
    }
  }
  if (failure) throw failure;
  requireValue(receipt?.cleanup?.completed === true, "provider_session_cleanup_missing");
  const finalRelease = await request("/api/release");
  requireValue(finalRelease.status === 200, "release_unavailable");
  verifyRelease(finalRelease.data, identity);
  return receipt;
}

export function validateReceipt(receipt, identity, now = Date.now()) {
  requireValue(validIdentity(identity), "invalid_source_identity");
  requireValue(receipt?.schemaVersion === 2 && receipt.completed === true && receipt.origin === SITE_ORIGIN, "live_receipt_missing_or_invalid");
  verifyRelease(receipt, identity);
  const checkedAt = Date.parse(receipt.checkedAt);
  requireValue(Number.isFinite(checkedAt) && checkedAt <= now && now - checkedAt <= MAX_AGE_MS, "live_receipt_expired");
  requireValue(receipt.agents?.httpStatus === 201 && receipt.agents.terminalSuccess === true && receipt.agents.requestedModel === "gpt-6-astra" && requestId(receipt.agents.requestId), "agents_receipt_invalid");
  requireValue(Array.isArray(receipt.decisions) && receipt.decisions.length >= 3 && receipt.decisions.length <= 12 && receipt.decisions.every((d) => d.actor === "escape" && d.httpStatus === 200 && d.requestedModel === "gpt-6-luna" && requestId(d.requestId) && ["move", "search", "restore", "unlock", "wait", "hide"].includes(d.action)), "decisions_receipt_invalid");
  requireValue(Array.isArray(receipt.killerDecisions) && receipt.killerDecisions.length >= 1 && receipt.killerDecisions.length <= 12 && receipt.killerDecisions.every((d) => d.actor === "killer" && d.httpStatus === 200 && d.requestedModel === "gpt-6-luna" && requestId(d.requestId) && d.action === "move" && d.legalOptimal === true && d.before?.keycard === true && d.before?.spawned === true && Number.isFinite(d.before.elapsed) && d.before.elapsed > 0 && d.before?.target === null && typeof d.before?.room === "string" && typeof d.target === "string" && d.before.room !== d.target && d.after?.target === d.target && d.after?.room === d.before.room), "killer_receipt_invalid");
  requireValue(receipt.killerDecisions.every((d) => receipt.decisions.some((sam) => sam.after?.keycard === true && sam.after.elapsed <= d.before.elapsed)), "killer_spawn_receipt_invalid");
  requireValue(receipt.killerDecisions.some((d) => d.completed?.room === d.target && d.completed.room !== d.before.room && Number.isFinite(d.completed.elapsed) && d.completed.elapsed > 0 && d.completed.elapsed <= receipt.finalState?.elapsed), "killer_movement_receipt_incomplete");
  requireValue(receipt.decisions.some((d) => d.action === "move" && d.before?.room !== d.after?.room) && receipt.decisions.some((d) => d.followsIntervention === true) && receipt.finalState?.elapsed > 0 && receipt.finalState.timeRemaining < 180 && receipt.intervention?.type === "lock" && receipt.intervention.interruptedMove === true, "gameplay_receipt_incomplete");
  requireValue(receipt.cleanup?.completed === true && receipt.cleanup.httpStatus === 200 && requestId(receipt.cleanup.requestId), "cleanup_receipt_incomplete");
  return true;
}

function sourceIdentity() {
  let dirty, commitSha;
  try {
    dirty = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
    commitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch { throw new Error("git_source_unavailable"); }
  requireValue(!dirty.trim(), "commit_changes_before_live_demo_check");
  return commitSha;
}
async function readBrowserInput() {
  process.stderr.write("Ready for live demo JSON on stdin (input is hidden).\n");
  const input = await new Promise((resolveInput, reject) => {
    let value = "", finished = false;
    const terminal = process.stdin.isTTY;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      process.stdin.removeListener("data", onData);
      process.stdin.removeListener("end", onEnd);
      if (terminal) process.stdin.setRawMode(false);
      process.stdin.pause();
      error ? reject(error) : resolveInput(value);
    };
    const onData = (chunk) => {
      value += chunk;
      if (value.includes("\u0003")) finish(new Error("browser_input_cancelled"));
      else if (value.length > 32768) finish(new Error("browser_input_too_large"));
      else if (value.includes("\n") || value.includes("\r")) finish();
    };
    const onEnd = () => finish();
    if (terminal) process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", onData);
    process.stdin.once("end", onEnd);
    process.stdin.resume();
  });
  let data;
  try { data = JSON.parse(input); } catch { throw new Error("browser_input_invalid"); }
  validateBrowserTarget(data);
  return data;
}
async function cli() {
  const checkOnly = process.argv.slice(2).join(" ") === "--check-only";
  requireValue(checkOnly || process.argv.length === 2, "unsupported_arguments");
  if (!checkOnly) await rm(receiptPath, { force: true });
  const commitSha = sourceIdentity();
  const hosting = JSON.parse(await readFile(resolve(root, ".openai/hosting.json"), "utf8"));
  const identity = { projectId: hosting.project_id, commitSha };
  if (checkOnly) {
    let receipt;
    try { receipt = JSON.parse(await readFile(receiptPath, "utf8")); } catch { throw new Error("live_receipt_missing_or_invalid"); }
    validateReceipt(receipt, identity);
    let response;
    try { response = await fetch(`${SITE_ORIGIN}/api/release`, { redirect: "error", signal: AbortSignal.timeout(15_000) }); } catch { throw new Error("release_unavailable"); }
    requireValue(response.status === 200 && !response.redirected, "release_unavailable");
    let release;
    try { release = await response.json(); } catch { throw new Error("release_unavailable"); }
    verifyRelease(release, identity);
    requireValue(sourceIdentity() === commitSha, "source_changed_during_check");
    process.stdout.write(`Live demo ready: ${commitSha}\n`);
    return;
  }
  const target = await readBrowserInput();
  const transport = createBrowserTransport(target);
  let receipt;
  try { receipt = await runLiveDemo({ identity, fetchImpl: transport.fetchImpl }); }
  finally { await transport.close(); }
  requireValue(sourceIdentity() === commitSha, "source_changed_during_check");
  validateReceipt(receipt, identity);
  await mkdir(dirname(receiptPath), { recursive: true });
  const pending = `${receiptPath}.pending`;
  try {
    await writeFile(pending, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    await rename(pending, receiptPath);
  } finally { await rm(pending, { force: true }); }
  process.stdout.write(`Hosted live API test passed: ${receipt.decisions.length} applied Decisions; provider session deleted.\n`);
  process.stdout.write("Run npm run demo:ready before presenting.\n");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch((error) => {
    // Never print provider, response, auth or capability contents.
    const code = /^[a-z_]+$/.test(error?.message ?? "") ? error.message : "live_demo_check_failed";
    process.stderr.write(`Live demo gate failed: ${code}.\n`);
    process.exitCode = 1;
  });
}
