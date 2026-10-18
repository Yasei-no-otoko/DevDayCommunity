const API_BASE = "https://api.openai.com/v1";
const AGENT_MODEL = "gpt-6-astra";
const DECISION_MODEL = "gpt-6-luna";
const AGENT_INSTRUCTIONS = `You are the narrative guide for a fictional horror escape game set in a decommissioned research facility. Give concise, atmospheric observations and strategic plans grounded only in the supplied facility details. Do not claim that the player performed an action or that game state changed. Never invent inventory, exits, clues, or completed objectives. The game simulation is authoritative for mechanics.`;
const MAX_STREAM_BYTES = 512 * 1024;

export class OpenAIHttpError extends Error {
  constructor(status, message, requestId) {
    super(message);
    this.name = "OpenAIHttpError";
    this.status = status;
    this.requestId = requestId;
  }
}

export class OpenAIStreamError extends Error {
  constructor(message, requestId) {
    super(message);
    this.name = "OpenAIStreamError";
    this.requestId = requestId;
  }
}

export function createOpenAIAdapter({
  apiKey = process.env.OPENAI_API_KEY,
  fetchImpl = fetch,
} = {}) {
  const configured = typeof apiKey === "string" && apiKey.trim().length > 0;

  async function request(path, body, { stream = false, method = "POST" } = {}) {
    if (!configured) {
      const error = new Error(
        "OpenAI is not configured. Set OPENAI_API_KEY in .env.local.",
      );
      error.code = "not_configured";
      throw error;
    }

    const response = await fetchImpl(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(path.startsWith("/agents/") ? { "OpenAI-Beta": "agents=v1" } : {}),
        ...(stream ? { Accept: "text/event-stream" } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(60_000),
    });
    const requestId = response.headers.get("x-request-id") ?? undefined;

    if (!response.ok) {
      const message = await readProviderError(response);
      throw new OpenAIHttpError(response.status, message, requestId);
    }

    if (stream) return { response, requestId };
    const data = response.status === 204 ? undefined : await response.json();
    return { data, requestId };
  }

  return {
    get configured() {
      return configured;
    },

    async createSession({ facilityDescription, strategicPlan }) {
      const input = [
        "Prepare the opening narrative and a strategic plan for the player.",
        `Facility description:\n${facilityDescription}`,
        `Strategic objective:\n${strategicPlan}`,
        "State the immediate situation, then give a short plan with practical next steps. Do not resolve any action.",
      ].join("\n\n");
      const { response, requestId } = await request(
        "/agents/sessions",
        {
          agent: { model: AGENT_MODEL, instructions: AGENT_INSTRUCTIONS },
          environment: { type: "none" },
          input,
          stream: true,
        },
        { stream: true },
      );

      const result = await readAgentEventStream(response, requestId);
      if (!result.sessionId) {
        throw new OpenAIStreamError(
          "Agents API completed without a session ID.",
          requestId,
        );
      }
      if (!result.terminalSuccess) {
        throw new OpenAIStreamError(
          "Agents API stream ended before a successful turn completion.",
          requestId,
        );
      }
      if (!result.outputText.trim()) {
        throw new OpenAIStreamError(
          "Agents API completed without narrative text.",
          requestId,
        );
      }
      return { ...result, model: AGENT_MODEL, requestId };
    },

    async decide({ sessionId, snapshot, allowedDecisions }) {
      const input = JSON.stringify({
        session_id: sessionId,
        current_state: snapshot,
        allowed_decisions: allowedDecisions.map(
          ({ id, label, description }) => ({ id, label, description }),
        ),
      });
      const { data, requestId } = await request("/decisions", {
        model: DECISION_MODEL,
        input,
        questions: [
          {
            type: "choice",
            name: "action",
            instructions:
              "Choose the allowed action that best advances the player's escape objective, using the current strategy and state when provided. Prefer actions that use relevant clues, keycards, or power resources when the state supports them. Avoid repeating recent searches or waiting unless necessary. Return the exact supplied action id. Never invent an option, and do not claim an action has already happened.",
            choices: allowedDecisions.map(({ id, label, description }) => ({
              value: id,
              description: `${label}: ${description}`,
            })),
          },
        ],
      });
      const actionAnswers = Array.isArray(data?.answers)
        ? data.answers.filter((item) => item?.name === "action")
        : [];
      const answer = actionAnswers.length === 1 ? actionAnswers[0] : undefined;
      if (!answer || answer.type === "refusal") {
        throw new OpenAIStreamError(
          "Decisions API did not return an action choice.",
          requestId ?? data?.id,
        );
      }
      if (answer.type !== "choice" || typeof answer.choice !== "string") {
        throw new OpenAIStreamError(
          "Decisions API returned an unexpected answer type.",
          requestId ?? data.id,
        );
      }
      const action = allowedDecisions.find((item) => item.id === answer.choice);
      if (!action) {
        throw new OpenAIStreamError(
          "Decisions API chose an action outside the supplied options.",
          requestId ?? data.id,
        );
      }
      return {
        action,
        model: DECISION_MODEL,
        confidence:
          typeof answer.confidence === "number" ? answer.confidence : null,
        requestId,
        decisionId: typeof data.id === "string" ? data.id : undefined,
      };
    },

    async deleteSession(sessionId) {
      const { data, requestId } = await request(
        `/agents/sessions/${encodeURIComponent(sessionId)}`,
        undefined,
        { method: "DELETE" },
      );
      return { data, requestId };
    },
  };
}

async function readProviderError(response) {
  let detail = "OpenAI API request failed.";
  try {
    const payload = await response.json();
    if (typeof payload?.error?.message === "string")
      detail = payload.error.message;
  } catch {
    // Keep the default message when the provider does not return JSON.
  }
  return detail.slice(0, 500);
}

async function readAgentEventStream(response, requestId) {
  if (!response.body)
    throw new OpenAIStreamError(
      "Agents API returned an empty stream.",
      requestId,
    );
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let bytesRead = 0;
  let sessionId;
  const outputParts = new Map();
  let finalText;
  let terminalSuccess = false;

  async function consumeFrame(frame) {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    const isRootTurn =
      event.subagent_id == null && event.turn?.subagent_id == null;
    if (!isRootTurn) return;
    if (typeof event.session_id === "string") sessionId = event.session_id;
    if (typeof event.session?.id === "string") sessionId = event.session.id;
    if (typeof event.id === "string" && event.object === "agent.session")
      sessionId = event.id;

    const type = typeof event.type === "string" ? event.type : "";
    if (type === "agent.session.turn.completed") {
      terminalSuccess = true;
    }
    if (
      [
        "agent.session.turn.failed",
        "agent.session.turn.cancelled",
        "agent.session.failed",
        "agent.session.environment.failed",
        "error",
      ].includes(type)
    ) {
      const message =
        typeof event.error?.message === "string"
          ? event.error.message
          : typeof event.message === "string"
            ? event.message
            : "Agents API turn did not complete successfully.";
      throw new OpenAIStreamError(message.slice(0, 500), requestId);
    }

    if (typeof event.output_text === "string") finalText = event.output_text;
    if (typeof event.result?.output_text === "string")
      finalText = event.result.output_text;
    if (
      type === "agent.session.turn.output_text.delta" ||
      type === "agent.session.turn.output_text.done"
    ) {
      const key = outputPartKey(
        event.item_id,
        event.output_index,
        event.content_index,
      );
      if (type.endsWith(".delta") && typeof event.delta === "string") {
        const previous = outputParts.get(key);
        if (!previous || previous.priority === 0)
          outputParts.set(key, {
            text: (previous?.text ?? "") + event.delta,
            priority: 0,
          });
      }
      if (type.endsWith(".done") && typeof event.text === "string") {
        outputParts.set(key, { text: event.text, priority: 1 });
      }
    }
    const item = event.item ?? event;
    if (item.type === "message" && Array.isArray(item.content)) {
      item.content.forEach((part, index) => {
        if (part.type !== "output_text" || typeof part.text !== "string") return;
        outputParts.set(
          outputPartKey(
            item.id ?? event.item_id,
            event.output_index,
            index,
          ),
          { text: part.text, priority: 2 },
        );
      });
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_STREAM_BYTES)
        throw new OpenAIStreamError(
          "Agents API stream exceeded the response size limit.",
          requestId,
        );
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const frame = buffer.slice(0, boundary);
        const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)[0];
        buffer = buffer.slice(boundary + separator.length);
        await consumeFrame(frame);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) await consumeFrame(buffer);
  } finally {
    reader.releaseLock();
  }
  return {
    sessionId,
    outputText:
      finalText ??
      [...outputParts.values()].map((part) => part.text).join("\n"),
    terminalSuccess,
  };
}

function outputPartKey(itemId, outputIndex, contentIndex) {
  return `${itemId ?? `output-${outputIndex ?? 0}`}:${contentIndex ?? 0}`;
}
