import test from "node:test";
import assert from "node:assert/strict";
import { createContext, runInContext } from "node:vm";
import { runLiveDemo, validateReceipt, createBrowserTransport, validateBrowserTarget, SITE_ORIGIN, MAX_AGE_MS } from "./verify-live-demo.mjs";
import { createState, applyDecision, applyKillerDecision, killerDecisions } from "../src/simulation.ts";
import { legalDecisions, createDecisionRequest, createSessionRequest } from "../src/live-contract.ts";

const identity = { projectId: "appgprj_test123", commitSha: "a".repeat(40) };
const instant = Date.parse("2026-10-18T07:00:00Z");
const capability = "private_capability_marker";
const providerSession = "sess_private_provider_marker";
const plan = "private_plan_marker";
function fixture({ auth = true, badChoice = false, decisionFailure = false, cleanupFailure = false, finalReleaseMismatch = false, noProgress = false, sessionInvalid = false, killerFailure = false, killerBadChoice = false, wrongActor = false, missingActor = false } = {}) {
  const calls = [];
  let decisionCount = 0, releaseCount = 0;
  return {
    calls,
    fetchImpl: async (url, options) => {
      assert.equal(new URL(url).origin, SITE_ORIGIN);
      assert.equal(options.redirect, "error");
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.headers["OAI-Sites-Authorization"], undefined);
      assert.equal(options.headers.Cookie, undefined);
      assert.equal(options.headers["oai-authenticated-user-id"], undefined);
      const path = new URL(url).pathname;
      const body = options.body ? JSON.parse(options.body) : undefined;
      calls.push({ path, method: options.method, body });
      if (path === "/api/release") {
        releaseCount++;
        return Response.json({ ...identity, ...(finalReleaseMismatch && releaseCount > 1 ? { commitSha: "b".repeat(40) } : {}) });
      }
      if (path === "/api/status") return Response.json({ authenticated: auth, configured: auth, mode: auth ? "live" : "sign-in-required" });
      if (path === "/api/session") return Response.json({ mode: "live", terminalSuccess: !sessionInvalid, outputText: plan, sessionId: providerSession, sessionToken: capability, requestId: "req_agents_success" }, { status: 201 });
      if (path.startsWith("/api/session/")) {
        assert.equal(options.method, "DELETE");
        assert.equal(options.headers["x-blacksite-session-token"], capability);
        return Response.json({ mode: "live", requestId: "req_cleanup_success" }, { status: cleanupFailure ? 502 : 200 });
      }
      if (path === "/api/decision") {
        assert.ok(["escape", "killer"].includes(body.actor));
        if (body.actor === "killer") {
          assert.equal(body.sessionId, providerSession);
          assert.equal(body.sessionToken, capability);
          if (killerFailure) return Response.json({ mode: "live" }, { status: 502 });
          const state = createState();
          state.status = "running";
          state.killer.spawned = true;
          state.keycard = true;
          state.killer.roomId = body.snapshot.room;
          state.targetRoomId = body.snapshot.goal;
          const optimal = killerDecisions(state).find((choice) => applyKillerDecision(structuredClone(state), choice));
          const action = killerBadChoice ? body.allowedDecisions.find((choice) => choice.label.startsWith("wait ")) : body.allowedDecisions.find((choice) => choice.label === `${optimal.action} ${optimal.target}`);
          return Response.json({ mode: "live", actor: missingActor ? undefined : wrongActor ? "escape" : "killer", action, requestId: "req_killer_success_1", confidence: 0.9 });
        }
        decisionCount++;
        assert.equal(body.sessionId, providerSession);
        assert.equal(body.sessionToken, capability);
        assert.equal(body.snapshot.strategy, plan);
        if (decisionFailure) return Response.json({ error: { message: "private_provider_error_marker" } }, { status: 502 });
        const desired = noProgress ? "wait reception" : ["move corridor", "move ward", "move archive", "search archive", "move corridor"][decisionCount - 1];
        const action = body.allowedDecisions.find((choice) => choice.label === desired) ?? body.allowedDecisions[0];
        return Response.json({ mode: "live", actor: "escape", action: badChoice ? { id: "invented" } : action, requestId: `req_decision_success_${decisionCount}`, confidence: 0.9 });
      }
      assert.fail(`Unexpected path ${path}`);
    },
  };
}
async function run(options) {
  const f = fixture(options);
  const receipt = await runLiveDemo({ identity, fetchImpl: f.fetchImpl, now: () => instant });
  return { ...f, receipt };
}

test("hosted live gate applies actual game choices, re-plans after lock, cleans up and emits only safe metadata", async () => {
  const { receipt, calls } = await run();
  assert.equal(receipt.decisions.length, 5);
  assert.equal(receipt.intervention.interruptedMove, true);
  assert.ok(receipt.intervention.after.energy < receipt.intervention.before.energy);
  assert.equal(receipt.decisions[1].followsIntervention, true);
  assert.equal(calls.filter((c) => c.path === "/api/decision" && c.body.actor === "escape")[1].body.snapshot.locks.corridor, 13);
  assert.ok(receipt.finalState.elapsed > 0);
  assert.equal(receipt.finalState.room, "corridor");
  assert.equal(receipt.finalState.keycard, true);
  assert.equal(receipt.killerDecisions.every((d) => d.before.keycard && d.before.spawned), true);
  const firstKiller = calls.findIndex((c) => c.body?.actor === "killer");
  assert.ok(calls.slice(0, firstKiller).some((c) => c.body?.actor === "escape" && c.body.snapshot.keycard === true));
  assert.equal(receipt.killerDecisions.length >= 1, true);
  assert.equal(receipt.killerDecisions[0].actor, "killer");
  assert.equal(receipt.killerDecisions[0].legalOptimal, true);
  assert.equal(receipt.killerDecisions[0].httpStatus, 200);
  assert.equal(receipt.killerDecisions.some((d) => d.completed?.room === d.target && d.completed.room !== d.before.room), true);
  assert.equal(receipt.cleanup.completed, true);
  assert.equal(calls.at(-2).method, "DELETE");
  assert.equal(calls.at(-1).path, "/api/release");
  assert.equal(validateReceipt(receipt, identity, instant), true);
  const serialized = JSON.stringify(receipt);
  for (const secret of [capability, providerSession, plan, "sessionToken", "sessionId"]) assert.ok(!serialized.includes(secret));
  assert.equal(receipt.agents.requestedModel, "gpt-6-astra");
  assert.equal(receipt.decisions[0].requestedModel, "gpt-6-luna");
});

test("missing browser transport and unauthenticated status cannot trigger paid provider requests", async () => {
  await assert.rejects(runLiveDemo({ identity }), /authenticated_browser_transport_required/);
  const anonymous = fixture({ auth: false });
  await assert.rejects(runLiveDemo({ identity, fetchImpl: anonymous.fetchImpl }), /hosted_live_authentication_required/);
  assert.deepEqual(anonymous.calls.map((c) => c.path), ["/api/release", "/api/status"]);
});

for (const [name, options, code] of [
  ["invalid provider choice", { badChoice: true }, "decision_outside_legal_choices"],
  ["missing killer actor", { missingActor: true }, "killer_live_response_invalid"],
  ["mismatched killer actor", { wrongActor: true }, "killer_live_response_invalid"],
  ["killer failure", { killerFailure: true }, "killer_live_response_invalid"],
  ["nonoptimal killer choice", { killerBadChoice: true }, "killer_decision_not_legal_optimal"],
  ["provider failure", { decisionFailure: true }, "decisions_live_response_invalid"],
  ["incomplete Agents root turn", { sessionInvalid: true }, "agents_live_response_invalid"],
]) test(`${name} fails and still deletes the provider session`, async () => {
  const f = fixture(options);
  await assert.rejects(runLiveDemo({ identity, fetchImpl: f.fetchImpl }), new RegExp(code));
  assert.equal(f.calls.at(-1).method, "DELETE");
});

test("cleanup failure and deployment changes fail a successful run", async () => {
  await assert.rejects(run({ cleanupFailure: true }), /provider_session_cleanup_failed/);
  const changed = fixture({ finalReleaseMismatch: true });
  await assert.rejects(runLiveDemo({ identity, fetchImpl: changed.fetchImpl }), /deployed_release_mismatch/);
  assert.equal(changed.calls.at(-2).method, "DELETE");
});

test("bounded successful wait responses and early capture cannot satisfy meaningful gameplay", async () => {
  const f = fixture({ noProgress: true });
  await assert.rejects(runLiveDemo({ identity, fetchImpl: f.fetchImpl }), /meaningful_live_gameplay_incomplete/);
  const count = f.calls.filter((c) => c.path === "/api/decision" && c.body.actor === "escape").length;
  assert.ok(count > 0 && count <= 12);
  assert.equal(f.calls.at(-1).method, "DELETE");
});

test("receipt acceptance rejects stale, future, wrong release and missing cleanup evidence", async () => {
  const { receipt } = await run();
  assert.throws(() => validateReceipt(receipt, identity, instant + MAX_AGE_MS + 1), /live_receipt_expired/);
  assert.throws(() => validateReceipt(receipt, identity, instant - 1), /live_receipt_expired/);
  assert.throws(() => validateReceipt(receipt, { ...identity, commitSha: "b".repeat(40) }, instant), /deployed_release_mismatch/);
  assert.throws(() => validateReceipt({ ...receipt, cleanup: undefined }, identity, instant), /cleanup_receipt_incomplete/);
  assert.throws(() => validateReceipt({ ...receipt, schemaVersion: 1 }, identity, instant), /live_receipt_missing_or_invalid/);
  assert.throws(() => validateReceipt({ ...receipt, killerDecisions: undefined }, identity, instant), /killer_receipt_invalid/);
  assert.throws(() => validateReceipt({ ...receipt, killerDecisions: [] }, identity, instant), /killer_receipt_invalid/);
  assert.throws(() => validateReceipt({ ...receipt, killerDecisions: receipt.killerDecisions.map(({ completed, ...trace }) => trace) }, identity, instant), /killer_movement_receipt_incomplete/);
  for (const change of [{ before: { ...receipt.killerDecisions[0].before, keycard: false } }, { before: { ...receipt.killerDecisions[0].before, spawned: false } }, { actor: "escape" }, { legalOptimal: false }, { httpStatus: 502 }, { requestId: null }, { after: { target: "invented" } }]) {
    assert.throws(() => validateReceipt({ ...receipt, killerDecisions: [{ ...receipt.killerDecisions[0], ...change }] }, identity, instant), /killer_receipt_invalid/);
  }
  assert.throws(() => validateReceipt({ ...receipt, decisions: receipt.decisions.slice(0, 2) }, identity, instant), /decisions_receipt_invalid/);
});

test("shared contract uses game validation and limits killer knowledge to encountered state", () => {
  const state = createState();
  state.status = "running";
  state.controller = "api";
  const choices = legalDecisions(state);
  assert.ok(choices.length >= 2);
  assert.ok(choices.every((choice) => applyDecision(structuredClone(state), choice, "api")));
  assert.equal(createDecisionRequest(state, "strategy", choices, "id", "token").snapshot.knownKiller, undefined);
  state.killer.encountered = true;
  assert.equal(createDecisionRequest(state, "strategy", choices, "id", "token").snapshot.knownKiller.roomId, state.killer.roomId);
  assert.match(createSessionRequest().strategicPlan, /Sam Altman/);
  assert.match(createSessionRequest("ja").strategicPlan, /In Japanese/);
  assert.match(createSessionRequest("en").strategicPlan, /In English/);
  assert.doesNotMatch(createSessionRequest("en").strategicPlan, /In Japanese/);
});

const browserTarget = { browser: "Google Chrome", windowId: 123, tabId: 456 };
function browserFixture({ origin = SITE_ORIGIN, failFetch = false } = {}) {
  const requests = [], scripts = [];
  const browserWindow = { location: { origin } };
  const context = createContext({
    window: browserWindow, AbortController,
    fetch: async (path, options) => {
      requests.push({ path, options });
      if (failFetch) throw new Error("private_browser_error_marker");
      return { status: 200, url: `${SITE_ORIGIN}${path}`, redirected: false, text: async () => JSON.stringify({ authenticated: true }) };
    },
  });
  const executeScript = async (script) => {
    scripts.push(script);
    assert.match(script, /exists window id 123/);
    assert.match(script, /tabs of targetWindow whose id is 456/);
    assert.match(script, /targetURL does not start with/);
    const quoted = script.match(/execute targetTab javascript (.+)\nend tell$/)?.[1];
    assert.ok(quoted);
    return runInContext(JSON.parse(quoted), context);
  };
  const transport = createBrowserTransport(browserTarget, { executeScript, delay: async () => {} });
  return { transport, browserWindow, requests, scripts };
}

test("browser transport targets exact tab and uses normal credentialed fetch without cookies or auth assertions", async () => {
  const f = browserFixture();
  const response = await f.transport.fetchImpl(`${SITE_ORIGIN}/api/status`, { method: "GET", credentials: "same-origin", redirect: "error", headers: {}, signal: AbortSignal.timeout(1000) });
  assert.deepEqual(await response.json(), { authenticated: true });
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].options.credentials, "same-origin");
  assert.deepEqual(Object.keys(f.requests[0].options.headers), []);
  assert.equal(Object.keys(f.browserWindow).filter((key) => key.startsWith("__blacksiteLiveCheck_")).length, 0);
  await f.transport.close();
});

test("browser transport refuses other origins, wrong targets and failed browser fetches with no residual bridge", async () => {
  assert.throws(() => validateBrowserTarget({ ...browserTarget, browser: "Safari" }), /browser_target_invalid/);
  assert.throws(() => validateBrowserTarget({ ...browserTarget, token: "not_accepted" }), /browser_target_invalid/);
  const f = browserFixture({ origin: "https://example.com" });
  const options = { method: "GET", credentials: "same-origin", redirect: "error", headers: {} };
  await assert.rejects(f.transport.fetchImpl(`${SITE_ORIGIN}/api/status`, options), /browser_origin_mismatch/);
  assert.equal(f.requests.length, 0);
  const failed = browserFixture({ failFetch: true });
  await assert.rejects(failed.transport.fetchImpl(`${SITE_ORIGIN}/api/status`, options), /browser_fetch_failed/);
  assert.equal(Object.keys(failed.browserWindow).filter((key) => key.startsWith("__blacksiteLiveCheck_")).length, 0);
});


test("browser transport supports only Google Chrome and Vivaldi with exact application targeting", async () => {
  validateBrowserTarget({ ...browserTarget, browser: "Vivaldi" });
  const scripts = [];
  const transport = createBrowserTransport({ ...browserTarget, browser: "Vivaldi" }, { executeScript: async (script) => {
    scripts.push(script);
    return JSON.stringify({ error: "browser_tab_unavailable" });
  } });
  await assert.rejects(transport.fetchImpl(`${SITE_ORIGIN}/api/status`, { method: "GET", credentials: "same-origin", redirect: "error", headers: {} }), /browser_tab_unavailable/);
  assert.ok(scripts.length > 0);
  assert.ok(scripts.every((script) => script.startsWith('tell application "Vivaldi"')));
  assert.throws(() => validateBrowserTarget({ ...browserTarget, browser: 'Vivaldi" malicious' }), /browser_target_invalid/);
});
