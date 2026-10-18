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

test("a created Agents session is deleted when its stream fails before a browser capability exists", async () => {
  const calls = [];
  const adapter = createOpenAIAdapter({
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method });
      if (options.method === "DELETE") return new Response(null, { status: 204 });
      return sseResponse([
        { type: "agent.session.created", session_id: "sess_unfinished" },
        { type: "agent.session.turn.output_text.done", text: "Incomplete plan" },
      ]);
    },
  });
  await assert.rejects(adapter.createSession({ facilityDescription: "Facility", strategicPlan: "Escape" }), /before a successful turn completion/);
  assert.deepEqual(calls.map((call) => call.method), ["POST", "DELETE"]);
  assert.equal(calls[1].url, "https://api.openai.com/v1/agents/sessions/sess_unfinished");
});

test("Agents cleanup failure is explicit and retains the original provider request identifier", async () => {
  const adapter = createOpenAIAdapter({
    apiKey: "test-key",
    fetchImpl: async (_url, options) => options.method === "DELETE"
      ? Response.json({ error: { message: "Unavailable" } }, { status: 503 })
      : sseResponse([
        { type: "agent.session.created", session_id: "sess_failed" },
        { type: "agent.session.turn.failed", error: { message: "Turn failed" } },
      ]),
  });
  await assert.rejects(adapter.createSession({ facilityDescription: "Facility", strategicPlan: "Escape" }), (error) =>
    error instanceof OpenAIStreamError && /could not be deleted/.test(error.message) && error.requestId === "req_agents_123");
});

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

test("Decisions rejects missing, malformed, or ambiguous action answers", async () => {
  for (const payload of [
    null,
    { answers: {} },
    { answers: [null] },
    { answers: [{ type: "choice", name: "unrelated", choice: "left" }] },
    { answers: [{ type: "choice", choice: "left" }] },
    { answers: [
      { type: "choice", name: "action", choice: "left" },
      { type: "choice", name: "action", choice: "right" },
    ] },
  ]) {
    const adapter = createOpenAIAdapter({
      apiKey: "test-key",
      fetchImpl: async () => Response.json(payload),
    });
    await assert.rejects(
      adapter.decide({
        sessionId: "sess_1",
        snapshot: {},
        allowedDecisions: [
          { id: "left", label: "Left", description: "Left hall" },
          { id: "right", label: "Right", description: "Right hall" },
        ],
      }),
      (error) => error instanceof OpenAIStreamError && /did not return an action choice/.test(error.message),
    );
  }
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

test("Agents keeps root session identity and narrative when a helper emits output", async () => {
  const adapter = createOpenAIAdapter({
    apiKey: "test-key",
    fetchImpl: async () => sseResponse([
      { type: "agent.session.created", session_id: "sess_root" },
      { type: "agent.session.turn.output_text.done", item_id: "root_text", text: "出口を探そう。" },
      { type: "agent.session.turn.completed" },
      {
        type: "agent.session.turn.completed",
        session_id: "sess_helper",
        subagent_id: "helper",
        output_text: "内部の補助情報",
      },
    ]),
  });
  const result = await adapter.createSession({ facilityDescription: "Facility", strategicPlan: "Escape" });
  assert.equal(result.sessionId, "sess_root");
  assert.equal(result.outputText, "出口を探そう。");
});

test("Agents completed snapshots replace each content part without duplicating deltas", async () => {
  const adapter = createOpenAIAdapter({
    apiKey: "test-key",
    fetchImpl: async () => sseResponse([
      { type: "agent.session.created", session_id: "sess_parts" },
      { type: "agent.session.turn.output_text.delta", item_id: "msg", content_index: 0, delta: "照明が消えた。" },
      { type: "agent.session.turn.output_text.delta", item_id: "msg", content_index: 1, delta: "扉を調べよう。" },
      {
        type: "agent.session.item.completed",
        item: {
          id: "msg", type: "message", content: [
            { type: "output_text", text: "照明が消えた。" },
            { type: "output_text", text: "扉を調べよう。" },
          ],
        },
      },
      { type: "agent.session.turn.completed" },
    ]),
  });
  const result = await adapter.createSession({ facilityDescription: "Facility", strategicPlan: "Escape" });
  assert.equal(result.outputText, "照明が消えた。\n扉を調べよう。");
});

test("Agents rejects environment and stream errors even after root turn completion", async () => {
  for (const completed of [false, true]) {
    for (const failure of [
      { type: "agent.session.environment.failed", error: { message: "Environment failed." } },
      { type: "error", message: "Stream failed." },
    ]) {
      const adapter = createOpenAIAdapter({
        apiKey: "test-key",
        fetchImpl: async () => sseResponse([
          { type: "agent.session.created", session_id: "sess_error" },
          { type: "agent.session.turn.output_text.done", item_id: "msg", text: "出口を探そう。" },
          ...(completed ? [{ type: "agent.session.turn.completed" }] : []),
          failure,
        ]),
      });
      await assert.rejects(
        adapter.createSession({ facilityDescription: "Facility", strategicPlan: "Escape" }),
        (error) => error instanceof OpenAIStreamError &&
          error.message === (failure.error?.message ?? failure.message),
      );
    }
  }
});
