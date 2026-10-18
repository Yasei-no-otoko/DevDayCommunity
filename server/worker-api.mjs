import { createOpenAIAdapter, OpenAIHttpError, OpenAIStreamError } from "./openai.mjs";

const MAX_BODY_BYTES = 32 * 1024;
const MAX_SNAPSHOT_BYTES = 10 * 1024;
const SESSION_TTL_MS = 60 * 60 * 1000;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** A Web API handler shared by local Vinext and hosted Cloudflare Workers. */
export function createWorkerApiHandler({
  apiKey,
  adapter = createOpenAIAdapter({ apiKey }),
  now = Date.now,
  sessionTtlMs = SESSION_TTL_MS,
} = {}) {
  const configured = typeof apiKey === "string" && apiKey.trim().length > 0;
  let signingKey;
  function getSigningKey() {
    if (!configured) throw new HttpError(503, "not_configured", "OpenAI is not configured. Set the OPENAI_API_KEY Site secret.");
    // Domain separation prevents this derived key from serving as an API credential.
    signingKey ??= crypto.subtle.digest("SHA-256", encoder.encode(`blacksite/session-capability/v1\0${apiKey}`))
      .then((key) => crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]));
    return signingKey;
  }

  async function issueSessionToken(sessionId, owner) {
    const expiresAt = now() + sessionTtlMs;
    const payload = base64Url(encoder.encode(JSON.stringify({ v: 1, sid: sessionId, sub: owner, exp: expiresAt })));
    const signature = await crypto.subtle.sign("HMAC", await getSigningKey(), encoder.encode(payload));
    return { sessionToken: `${payload}.${base64Url(new Uint8Array(signature))}`, sessionExpiresAt: new Date(expiresAt).toISOString() };
  }

  async function authorizeSession(token, sessionId, owner) {
    const denied = () => new HttpError(403, "session_not_found", "Start a game session before requesting this operation.");
    if (typeof token !== "string" || token.length > 4096) throw denied();
    const parts = token.split(".");
    if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) throw denied();
    let payload;
    try {
      const valid = await crypto.subtle.verify("HMAC", await getSigningKey(), fromBase64Url(parts[1]), encoder.encode(parts[0]));
      if (!valid) throw denied();
      payload = JSON.parse(decoder.decode(fromBase64Url(parts[0])));
    } catch (error) {
      if (error instanceof HttpError && error.code === "not_configured") throw error;
      throw denied();
    }
    if (payload?.v !== 1 || payload.sid !== sessionId || payload.sub !== owner || !Number.isSafeInteger(payload.exp)) throw denied();
    if (payload.exp <= now()) throw new HttpError(410, "session_expired", "The game session has expired. Start a new session.");
  }

  return async (request) => {
    try {
      const url = new URL(request.url);
      if (!isSameOriginRequest(request, url)) throw new HttpError(403, "forbidden_origin", "Requests must come from this Site.");
      // Public visitors may try the local controller; live operations require
      // the identity supplied by Sites after ChatGPT sign-in.
      // Never accept identity from query parameters or request bodies.
      const owner = request.headers.get("oai-authenticated-user-id");
      const authenticated = Boolean(owner?.trim() && owner.length <= 256);

      if (request.method === "GET" && url.pathname === "/api/status") {
        const ready = authenticated && configured && adapter.configured;
        return json(200, { authenticated, configured: ready, mode: !authenticated ? "sign-in-required" : ready ? "live" : "not-configured", models: { agents: "gpt-6-astra", decisions: "gpt-6-luna" } });
      }
      if (!authenticated) throw new HttpError(401, "authentication_required", "Sign in with ChatGPT to use the game API.");

      if (request.method === "POST" && url.pathname === "/api/session") {
        const body = await readJsonBody(request);
        const facilityDescription = boundedText(body.facilityDescription, "facilityDescription", 2000);
        const strategicPlan = boundedText(body.strategicPlan, "strategicPlan", 2000);
        await getSigningKey();
        const result = await adapter.createSession({ facilityDescription, strategicPlan });
        const sessionId = boundedText(result.sessionId, "sessionId", 160);
        const capability = await issueSessionToken(sessionId, owner);
        return json(201, { mode: "live", ...result, sessionId, ...capability });
      }

      if (request.method === "POST" && url.pathname === "/api/decision") {
        const body = await readJsonBody(request);
        const sessionId = boundedText(body.sessionId, "sessionId", 160);
        await authorizeSession(body.sessionToken, sessionId, owner);
        const snapshot = body.snapshot;
        if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new HttpError(400, "invalid_snapshot", "snapshot must be a JSON object.");
        if (encoder.encode(JSON.stringify(snapshot)).byteLength > MAX_SNAPSHOT_BYTES) throw new HttpError(413, "snapshot_too_large", "snapshot must be 10 KB or smaller.");
        const allowedDecisions = validateDecisions(body.allowedDecisions);
        const result = await adapter.decide({ sessionId, snapshot, allowedDecisions });
        return json(200, { mode: "live", ...result });
      }

      const deleteMatch = request.method === "DELETE" && url.pathname.match(/^\/api\/session\/([^/]+)$/);
      if (deleteMatch) {
        let sessionId;
        try { sessionId = decodeURIComponent(deleteMatch[1]); }
        catch { throw new HttpError(400, "invalid_field", "sessionId must be valid URL-encoded text."); }
        sessionId = boundedText(sessionId, "sessionId", 160);
        await authorizeSession(request.headers.get("x-blacksite-session-token"), sessionId, owner);
        const result = await adapter.deleteSession(sessionId);
        return json(200, { mode: "live", sessionId, requestId: result.requestId });
      }
      return errorResponse(404, "not_found", "API route not found.");
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error.status, error.code, error.message);
      if (error?.code === "not_configured") return errorResponse(503, error.code, "OpenAI is not configured. Set the OPENAI_API_KEY Site secret.");
      if (error instanceof OpenAIHttpError) return json(502, { error: { code: "openai_error", message: error.message, providerStatus: error.status, requestId: error.requestId } });
      if (error instanceof OpenAIStreamError) return json(502, { error: { code: "openai_stream_error", message: error.message, requestId: error.requestId } });
      if (error?.name === "AbortError" || error?.name === "TimeoutError") return errorResponse(504, "openai_timeout", "OpenAI did not respond within 60 seconds.");
      return errorResponse(500, "internal_error", "The game API could not complete the request.");
    }
  };
}

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

function isSameOriginRequest(request, url) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname))) return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).origin === url.origin; } catch { return false; }
}

async function readJsonBody(request) {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") throw new HttpError(415, "unsupported_media_type", "Request body must use application/json.");
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_BODY_BYTES) throw new HttpError(413, "body_too_large", "Request body exceeds the 32 KB limit.");
  let bodyText = "";
  let size = 0;
  const textDecoder = new TextDecoder();
  const reader = request.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel();
          throw new HttpError(413, "body_too_large", "Request body exceeds the 32 KB limit.");
        }
        bodyText += textDecoder.decode(value, { stream: true });
      }
      bodyText += textDecoder.decode();
    } finally { reader.releaseLock(); }
  }
  try {
    const body = JSON.parse(bodyText);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Object required");
    return body;
  } catch { throw new HttpError(400, "invalid_json", "Request body must be a valid JSON object."); }
}

function boundedText(value, name, maxLength) {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, "invalid_field", `${name} must be a non-empty string.`);
  const text = value.trim();
  if (text.length > maxLength) throw new HttpError(400, "field_too_large", `${name} must be ${maxLength} characters or fewer.`);
  return text;
}

function validateDecisions(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) throw new HttpError(400, "invalid_decisions", "allowedDecisions must contain 1 to 12 options.");
  const seen = new Set();
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new HttpError(400, "invalid_decision", `Decision ${index + 1} must be an object.`);
    const id = boundedText(item.id, `allowedDecisions[${index}].id`, 48);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || seen.has(id)) throw new HttpError(400, "invalid_decision_id", "Decision IDs must be unique letters, numbers, underscores, or hyphens.");
    seen.add(id);
    const label = boundedText(item.label, `allowedDecisions[${index}].label`, 100);
    const description = boundedText(item.description, `allowedDecisions[${index}].description`, 300);
    const targetId = item.targetId === undefined ? undefined : boundedText(item.targetId, `allowedDecisions[${index}].targetId`, 100);
    return { id, label, description, ...(targetId ? { targetId } : {}) };
  });
}

function base64Url(bytes) {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(text) {
  const bytes = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bytes, (char) => char.charCodeAt(0));
}
function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
}
function errorResponse(status, code, message) { return json(status, { error: { code, message } }); }
