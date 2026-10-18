import test from "node:test";
import assert from "node:assert/strict";
import { createWorkerApiHandler } from "./worker-api.mjs";
import { OpenAIHttpError, OpenAIStreamError } from "./openai.mjs";

const apiKey = "fake-test-key-not-an-external-credential";
const action = { id: "inspect", label: "Inspect", description: "Inspect the panel" };

function fixture(options = {}) {
  const calls = [];
  const adapter = {
    configured: true,
    async createSession(input) { calls.push(["session", input]); return { sessionId: "sess_test", outputText: "Inspect the panel.", model: "gpt-6-astra", requestId: "req_agents" }; },
    async decide(input) { calls.push(["decision", input]); return { action: input.allowedDecisions[0], model: "gpt-6-luna", requestId: "req_decision" }; },
    async deleteSession(sessionId) { calls.push(["delete", sessionId]); return { requestId: "req_delete" }; },
    ...options.adapter,
  };
  const handler = createWorkerApiHandler({ apiKey, ...options, adapter });
  return { handler, calls, adapter };
}

async function invoke(handler, { path = "/api/status", method = "GET", user = "user-one", origin = "https://blacksite.example", headers = {}, body, rawBody } = {}) {
  const response = await handler(new Request(`https://blacksite.example${path}`, {
    method,
    headers: { ...(user === null ? {} : { "oai-authenticated-user-id": user }), ...(origin === null ? {} : { origin }), ...(body === undefined && rawBody === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(body === undefined && rawBody === undefined ? {} : { body: rawBody ?? JSON.stringify(body) }),
  }));
  return { response, status: response.status, json: await response.json() };
}
async function createSession(handler, options = {}) {
  return invoke(handler, { method: "POST", path: "/api/session", body: { facilityDescription: "A sealed facility", strategicPlan: "Find the exit" }, ...options });
}
function decide(handler, session, options = {}) {
  return invoke(handler, { method: "POST", path: "/api/decision", body: { sessionId: session.sessionId, sessionToken: session.sessionToken, snapshot: { room: "entrance" }, allowedDecisions: [action] }, ...options });
}

test("status reports runtime configuration and security response headers", async () => {
  const { handler } = fixture();
  const ready = await invoke(handler);
  assert.equal(ready.status, 200);
  assert.equal(ready.json.configured, true);
  assert.equal(ready.json.authenticated, true);
  assert.equal(ready.json.mode, "live");
  assert.deepEqual(ready.json.models, { agents: "gpt-6-astra", decisions: "gpt-6-luna" });
  assert.equal(ready.response.headers.get("cache-control"), "no-store");
  assert.equal(ready.response.headers.get("x-content-type-options"), "nosniff");
  const missing = fixture({ apiKey: undefined });
  assert.equal((await invoke(missing.handler)).json.configured, false);
  const denied = await createSession(missing.handler);
  assert.equal(denied.status, 503);
  assert.equal(missing.calls.length, 0);
});

test("anonymous status permits local play without exposing runtime configuration", async () => {
  for (const options of [{}, { apiKey: undefined }]) {
    const { handler, calls } = fixture(options);
    const result = await invoke(handler, { user: null });
    assert.equal(result.status, 200);
    assert.equal(result.json.authenticated, false);
    assert.equal(result.json.configured, false);
    assert.equal(result.json.mode, "sign-in-required");
    assert.equal(calls.length, 0);
  }
});

test("live API routes require the platform identity, ignoring client body identity", async () => {
  const { handler, calls } = fixture();
  for (const request of [
    { path: "/api/session", method: "POST", body: { owner: "user-one" } },
    { path: "/api/decision", method: "POST", body: { owner: "user-one" } },
    { path: "/api/session/sess_test", method: "DELETE" },
  ]) {
    const result = await invoke(handler, { ...request, user: null });
    assert.equal(result.status, 401);
    assert.equal(result.json.error.code, "authentication_required");
  }
  assert.equal(calls.length, 0);
});

test("same-origin HTTPS and exact localhost origin are permitted; cross-site origins are rejected", async () => {
  const { handler } = fixture();
  assert.equal((await invoke(handler, { origin: null })).status, 200);
  for (const options of [
    { origin: "https://attacker.example" },
    { origin: "null" },
    { headers: { "sec-fetch-site": "cross-site" } },
    { origin: "https://blacksite.example:444" },
  ]) assert.equal((await invoke(handler, options)).status, 403);
  const local = (url, origin) => handler(new Request(url, { headers: { "oai-authenticated-user-id": "local-user", origin } }));
  assert.equal((await local("http://localhost:3000/api/status", "http://localhost:3000")).status, 200);
  assert.equal((await local("http://localhost:3000/api/status", "http://localhost:3001")).status, 403);
  assert.equal((await local("http://example.com/api/status", "http://example.com")).status, 403);
});

test("create-session issues a bounded capability used across separate handler instances", async () => {
  const first = fixture();
  const session = await createSession(first.handler);
  assert.equal(session.status, 201);
  assert.equal(session.json.sessionId, "sess_test");
  assert.equal(typeof session.json.sessionToken, "string");
  assert.equal(session.json.sessionToken.includes(apiKey), false);
  assert.ok(Date.parse(session.json.sessionExpiresAt) > Date.now());
  const otherIsolate = fixture();
  const decision = await decide(otherIsolate.handler, session.json);
  assert.equal(decision.status, 200);
  assert.equal(decision.json.action.id, "inspect");
  assert.equal(otherIsolate.calls[0][0], "decision");
  const deletion = await invoke(otherIsolate.handler, { method: "DELETE", path: "/api/session/sess_test", headers: { "x-blacksite-session-token": session.json.sessionToken } });
  assert.equal(deletion.status, 200);
  assert.equal(deletion.json.requestId, "req_delete");
});

test("capability rejects cross-user, changed session, wrong secret, and malformed or modified tokens before upstream calls", async () => {
  const issuer = fixture();
  const session = (await createSession(issuer.handler)).json;
  const other = fixture();
  const variants = [
    { session: session, options: { user: "user-two" } },
    { session: { ...session, sessionId: "sess_other" } },
    { session: { ...session, sessionToken: undefined } },
    { session: { ...session, sessionToken: "not-a-token" } },
    { session: { ...session, sessionToken: "a".repeat(4097) } },
    { session: { ...session, sessionToken: `${session.sessionToken.split(".")[0]}.fake` } },
    { session: { ...session, sessionToken: `e30.${session.sessionToken.split(".")[1]}` } },
  ];
  for (const variant of variants) {
    const result = await decide(other.handler, variant.session, variant.options);
    assert.equal(result.status, 403);
    assert.equal(result.json.error.code, "session_not_found");
  }
  assert.equal(other.calls.length, 0);
  const differentSecret = fixture({ apiKey: "another-fake-secret" });
  assert.equal((await decide(differentSecret.handler, session)).status, 403);
  assert.equal(differentSecret.calls.length, 0);
});

test("expiry is enforced across isolates for decisions and deletes", async () => {
  const issuer = fixture({ now: () => 1000, sessionTtlMs: 1000 });
  const session = (await createSession(issuer.handler)).json;
  const stillValid = fixture({ now: () => 1999 });
  assert.equal((await decide(stillValid.handler, session)).status, 200);
  const expired = fixture({ now: () => 2000 });
  assert.equal((await decide(expired.handler, session)).status, 410);
  const deletion = await invoke(expired.handler, { method: "DELETE", path: "/api/session/sess_test", headers: { "x-blacksite-session-token": session.sessionToken } });
  assert.equal(deletion.status, 410);
  assert.equal(deletion.json.error.code, "session_expired");
  assert.equal(expired.calls.length, 0);
});

test("delete requires the same user's capability and never sends a bare session ID upstream", async () => {
  const { handler, calls } = fixture();
  const session = (await createSession(handler)).json;
  for (const options of [
    {},
    { headers: { "x-blacksite-session-token": session.sessionToken }, user: "user-two" },
    { headers: { "x-blacksite-session-token": "bad.token" } },
  ]) assert.equal((await invoke(handler, { method: "DELETE", path: "/api/session/sess_test", ...options })).status, 403);
  assert.equal(calls.length, 1);
});

test("invalid JSON, media type, body length and fields fail before session creation", async () => {
  const { handler, calls } = fixture();
  for (const [options, expected] of [
    [{ rawBody: "{" }, 400],
    [{ rawBody: "[]" }, 400],
    [{ headers: { "content-type": "text/plain" } }, 415],
    [{ body: { facilityDescription: "facility", strategicPlan: " " } }, 400],
    [{ body: { facilityDescription: "x".repeat(2001), strategicPlan: "exit" } }, 400],
    [{ rawBody: JSON.stringify({ value: "x".repeat(33 * 1024) }) }, 413],
    [{ headers: { "content-length": "40000" } }, 413],
  ]) assert.equal((await createSession(handler, options)).status, expected);
  assert.equal(calls.length, 0);
});

test("snapshot byte limits and decision option validation precede upstream decision calls", async () => {
  const { handler, calls } = fixture();
  const session = (await createSession(handler)).json;
  const base = { sessionId: session.sessionId, sessionToken: session.sessionToken, snapshot: {}, allowedDecisions: [action] };
  for (const [change, expected] of [
    [{ snapshot: [] }, 400],
    [{ snapshot: { text: "あ".repeat(4000) } }, 413],
    [{ allowedDecisions: [] }, 400],
    [{ allowedDecisions: [action, action] }, 400],
    [{ allowedDecisions: [{ ...action, id: "space id" }] }, 400],
    [{ allowedDecisions: [{ ...action, description: "x".repeat(301) }] }, 400],
  ]) assert.equal((await invoke(handler, { method: "POST", path: "/api/decision", body: { ...base, ...change } })).status, expected);
  assert.equal(calls.length, 1);
});

test("provider HTTP and stream errors preserve request IDs and timeouts remain explicit", async () => {
  for (const [error, status, code] of [
    [new OpenAIHttpError(403, "Project permission denied.", "req_denied"), 502, "openai_error"],
    [new OpenAIStreamError("Stream ended early.", "req_stream"), 502, "openai_stream_error"],
    [new DOMException("Timed out", "TimeoutError"), 504, "openai_timeout"],
    [new Error("sensitive internal detail"), 500, "internal_error"],
  ]) {
    const { handler } = fixture({ adapter: { async createSession() { throw error; } } });
    const result = await createSession(handler);
    assert.equal(result.status, status);
    assert.equal(result.json.error.code, code);
    if (error.requestId) assert.equal(result.json.error.requestId, error.requestId);
    if (error instanceof OpenAIHttpError) assert.equal(result.json.error.providerStatus, 403);
    assert.equal(JSON.stringify(result.json).includes("sensitive internal detail"), false);
  }
});

test("unknown endpoints and malformed delete paths fail without adapter calls", async () => {
  const { handler, calls } = fixture();
  assert.equal((await invoke(handler, { path: "/api/unknown" })).status, 404);
  assert.equal((await invoke(handler, { path: "/api/session/%E0%A4%A", method: "DELETE" })).status, 400);
  assert.equal(calls.length, 0);
});
