import test from "node:test";
import assert from "node:assert/strict";
import {
  createOpenAIAdapter,
  OpenAIHttpError,
  OpenAIStreamError,
} from "./openai.mjs";

function sseResponse(
  events,
  { requestId = "req_agents_123", status = 201 } = {},
) {
  const payload = events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new Response(payload, {
    status,
    headers: { "content-type": "text/event-stream", "x-request-id": requestId },
  });
}

test("Agents session creates a no-environment strategy session and collects terminal result", async () => {
  let sent;
  const adapter = createOpenAIAdapter({
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      sent = { url, options, body: JSON.parse(options.body) };
      return sseResponse([
        { type: "agent.session.created", session_id: "sess_hallway" },
        {
          type: "agent.session.turn.output_text.delta",
          item_id: "msg_1",
          output_index: 0,
          content_index: 0,
          delta: "The lights ",
        },
        {
          type: "agent.session.turn.output_text.delta",
          item_id: "msg_1",
          output_index: 0,
          content_index: 0,
          delta: "are failing.",
        },
        {
          type: "agent.session.turn.output_text.done",
          item_id: "msg_1",
          output_index: 0,
          content_index: 0,
          text: "The lights are failing. Check the security desk.",
        },
        { type: "agent.session.turn.completed", session_id: "sess_hallway" },
      ]);
    },
  });

  const result = await adapter.createSession({
    facilityDescription: "A dark research facility with a security desk.",
    strategicPlan: "Find a keycard and reach the loading bay.",
  });
  assert.equal(sent.url, "https://api.openai.com/v1/agents/sessions");
  assert.equal(sent.options.headers.Authorization, "Bearer test-key");
  assert.equal(sent.options.headers["OpenAI-Beta"], "agents=v1");
  assert.equal(sent.body.agent.model, "gpt-6-astra");
  assert.equal(sent.body.environment.type, "none");
  assert.equal(sent.body.stream, true);
  assert.match(sent.body.input, /Find a keycard/);
  assert.equal(result.sessionId, "sess_hallway");
  assert.equal(result.model, "gpt-6-astra");
  assert.equal(
    result.outputText,
    "The lights are failing. Check the security desk.",
  );
  assert.equal(result.requestId, "req_agents_123");
  assert.equal(result.terminalSuccess, true);
});

test("Decisions request uses fixed stable choices and maps only a supplied answer", async () => {
  let sent;
  const allowedDecisions = [
    {
      id: "inspect_panel",
      label: "Inspect panel",
      description: "Read the status lights.",
      targetId: "panel",
    },
    {
      id: "open_door",
      label: "Open door",
      description: "Try the brass key.",
      targetId: "door",
    },
  ];
  const adapter = createOpenAIAdapter({
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      sent = { url, options, body: JSON.parse(options.body) };
      return Response.json(
        {
          id: "decision_456",
          model: "gpt-6-luna",
          answers: [
            {
              type: "choice",
              name: "action",
              choice: "open_door",
              confidence: 0.91,
            },
          ],
          usage: { input_tokens: 80, output_tokens: 0, total_tokens: 80 },
        },
        { headers: { "x-request-id": "req_decisions_456" } },
      );
    },
  });

  const result = await adapter.decide({
    sessionId: "sess_hallway",
    snapshot: { inventory: ["brass_key"], location: "corridor" },
    allowedDecisions,
  });
  assert.equal(sent.url, "https://api.openai.com/v1/decisions");
  assert.equal(sent.options.headers["OpenAI-Beta"], undefined);
  assert.equal(sent.body.model, "gpt-6-luna");
  assert.deepEqual(
    sent.body.questions[0].choices.map((choice) => choice.value),
    ["inspect_panel", "open_door"],
  );
  assert.match(sent.body.input, /brass_key/);
  assert.deepEqual(result.action, allowedDecisions[1]);
  assert.equal(result.model, "gpt-6-luna");
  assert.equal(result.confidence, 0.91);
  assert.equal(result.requestId, "req_decisions_456");
  assert.equal(result.decisionId, "decision_456");
});

test("Decisions rejects a model choice outside the server-provided options", async () => {
  const adapter = createOpenAIAdapter({
    apiKey: "test-key",
    fetchImpl: async () =>
      Response.json({
        answers: [
          { type: "choice", name: "action", choice: "invented_action" },
        ],
      }),
  });
  await assert.rejects(
    adapter.decide({
      sessionId: "sess_1",
      snapshot: {},
      allowedDecisions: [
        { id: "left", label: "Go left", description: "Follow the left hall." },
        {
          id: "right",
          label: "Go right",
          description: "Follow the right hall.",
        },
      ],
    }),
    (error) =>
      error instanceof OpenAIStreamError &&
      /outside the supplied options/.test(error.message),
  );
});

test("Agents ignores completed item events and idle state without a completed root turn", async () => {
  const adapter = createOpenAIAdapter({
    apiKey: "test-key",
    fetchImpl: async () =>
      sseResponse([
        { type: "agent.session.created", session_id: "sess_partial" },
        {
          type: "agent.session.turn.output_text.done",
          item_id: "msg_1",
          text: "Partial response",
        },
        { type: "agent.session.item.completed", status: "completed" },
        { type: "agent.session.idle" },
      ]),
  });
  await assert.rejects(
    adapter.createSession({
      facilityDescription: "Facility",
      strategicPlan: "Escape",
    }),
    (error) =>
      error instanceof OpenAIStreamError &&
      /before a successful turn completion/.test(error.message),
  );
});

test("Agents ignores subagent completion when checking root turn completion", async () => {
  const adapter = createOpenAIAdapter({
    apiKey: "test-key",
    fetchImpl: async () =>
      sseResponse([
        { type: "agent.session.created", session_id: "sess_subagent" },
        {
          type: "agent.session.turn.output_text.done",
          item_id: "msg_1",
          text: "Partial response",
        },
        {
          type: "agent.session.turn.completed",
          turn: { subagent_id: "agent_helper" },
        },
      ]),
  });
  await assert.rejects(
    adapter.createSession({
      facilityDescription: "Facility",
      strategicPlan: "Escape",
    }),
    (error) =>
      error instanceof OpenAIStreamError &&
      /before a successful turn completion/.test(error.message),
  );
});

test("Agents deduplicates text deltas, done events, and completed item snapshots", async () => {
  const expected = "廊下の照明が点滅している。まず制御盤を調べよう。";
  const adapter = createOpenAIAdapter({
    apiKey: "test-key",
    fetchImpl: async () =>
      sseResponse([
        { type: "agent.session.created", session_id: "sess_dedup" },
        {
          type: "agent.session.turn.output_text.delta",
          item_id: "msg_1",
          output_index: 0,
          content_index: 0,
          delta: expected,
        },
        {
          type: "agent.session.turn.output_text.done",
          item_id: "msg_1",
          output_index: 1,
          content_index: 0,
          text: expected,
        },
        {
          type: "agent.session.item.completed",
          item: {
            id: "msg_1",
            type: "message",
            content: [{ type: "output_text", text: expected }],
          },
        },
        { type: "agent.session.turn.completed" },
      ]),
  });
  const result = await adapter.createSession({
    facilityDescription: "Facility",
    strategicPlan: "Escape",
  });
  assert.equal(result.outputText, expected);
});

test("upstream errors retain status and request ID without hiding the failure", async () => {
  const adapter = createOpenAIAdapter({
    apiKey: "test-key",
    fetchImpl: async () =>
      Response.json(
        {
          error: { message: "The project lacks api.agents.write permission." },
        },
        {
          status: 403,
          headers: { "x-request-id": "req_forbidden" },
        },
      ),
  });
  await assert.rejects(
    adapter.createSession({
      facilityDescription: "Facility",
      strategicPlan: "Escape",
    }),
    (error) =>
      error instanceof OpenAIHttpError &&
      error.status === 403 &&
      error.requestId === "req_forbidden" &&
      /api.agents.write/.test(error.message),
  );
});
