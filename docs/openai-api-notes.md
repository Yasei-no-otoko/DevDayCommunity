# OpenAI API notes (checked 2026-10-17)

This note records the current official API contracts for the demo's requested Agents API and Decisions API. The source of truth is the linked OpenAI documentation and OpenAPI spec; beta status and SDK surface can change.

## Agents API

- Docs: [Agents API overview](https://developers.openai.com/api/docs/guides/agents-api/overview), [quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart), [sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions), [API reference](https://developers.openai.com/api/reference/resources/beta/subresources/agents).
- REST base is `https://api.openai.com/v1`. Session create is `POST /agents/sessions`; requests require `OpenAI-Beta: agents=v1` (SDK adds it). Follow-up input goes to the existing session as turns/messages; turns run asynchronously and the app follows progress using streaming or webhooks.
- Current JS SDK example uses `npm install openai` and `client.beta.agents.sessions.create({agent:{model,instructions}, environment:{type:"none"}, input, stream:true})`; `environment.type` can be `none` for an agent that answers/calls tools without sandboxing, or `openai_hosted` for managed execution. Stream events, collect results via `events.withResultCollection()`, then `await events.finalResult()` and read `output_text` and `session_id`.
- Official quickstart says create an application API key and grant `api.agents.read`, `api.agents.write` for session operations, and `api.responses.write` for inference. Keep the key server-side/out of browser code. API permissions can return 403; missing auth/project context 401. Do not assume the project has these scopes or Agents API access until a live call confirms it.
- Model shown by the current Agents API quickstart is `gpt-6-astra`. Pricing is model token rates plus any OpenAI tool or hosted sandbox charges.

## Decisions API

- Docs: [Decisions guide](https://developers.openai.com/api/docs/guides/decisions), [create endpoint reference](https://developers.openai.com/api/reference/resources/decisions/methods/create). The guide says public beta, only `gpt-6-luna` supported currently, and JS OpenAI SDK version `7.30.0` or later is required for the SDK examples.
- Dedicated endpoint: `POST https://api.openai.com/v1/decisions`, JSON body with `model`, `input` (text or messages), and `questions` (unique `name`, `type`, `instructions`, plus options/levels for applicable types). Supported decision types documented include `predicate` (probability), `choice` (fixed option plus confidence/probabilities), and `score` (rubric score); answers can also be `refusal`.
- SDK call: `client.decisions.create({model:"gpt-6-luna", input:"...", questions:[{type:"choice", name:"...", instructions:"...", choices:[{value:"...",description:"..."}]}]})`. The `choice` answer is `decision.answers[0]`; check its `type` before reading `.choice` / `.confidence`.
- Example REST contract:

```http
POST /v1/decisions
Authorization: Bearer $OPENAI_API_KEY
Content-Type: application/json

{"model":"gpt-6-luna","input":"The door is locked; the player has the brass key.","questions":[{"type":"choice","name":"action","instructions":"Which listed action is supported by the evidence?","choices":[{"value":"unlock","description":"Use brass key on door"},{"value":"search","description":"Look for another clue"}]}]}
```

Example response shape (illustrative values):

```json
{"model":"gpt-6-luna","answers":[{"type":"choice","name":"action","choice":"unlock","confidence":0.94}],"usage":{"input_tokens":42,"output_tokens":0,"total_tokens":42}}
```

## Adapter guidance for this game

Use a Node server adapter with the official `openai` SDK, keeping the API key on the server. For narrative turns, create/reuse an Agents session with `environment: {type:"none"}` and a narrowly scoped horror-game storyteller instruction; persist session IDs server-side per game session and stream or collect the final turn. For mechanical action classification, call `client.decisions.create` with a small fixed choice set and the current authoritative game state in the evidence. Validate the answer against server-owned state/rules before applying effects. The Decisions API returns classifications/scores, not game-state mutations; never trust model output as the source of truth. Browser clients should call the game server, not OpenAI directly.

The APIs are complementary rather than interchangeable: Agents sessions manage an ongoing configured agent and turn lifecycle, while each Decisions request returns typed answers for one classification/scoring request. Verify Agents scopes/API permission and model access with an authorized project key rather than inferring availability from documentation. The successful live checks for this project are recorded below.

## Implementation choices and verified differences

This demo uses Node.js 24 built-in `fetch` against the documented REST endpoints, rather than depending on a locally cached SDK that may predate these beta APIs. Agents API is distinct from the Agents SDK; Decisions API is a dedicated typed-choice endpoint, not a Responses API JSON prompt. The strategy is generated by Agents once per experiment, then supplied alongside current game state to Decisions for each action. Local simulation owns and validates the mechanics; server endpoints validate request size, allowed choices, local origins, and game session IDs.

For SSE, `agent.session.turn.completed` for the root agent establishes success. A completed item, subagent completion, `idle`, or end-of-stream is insufficient. Text deltas, done events and completed item snapshots share item/content identity; snapshots must replace accumulated deltas rather than duplicate them. See the [official event guide](https://developers.openai.com/api/docs/guides/agents-api/sessions/events#handle-updates).

Phaser 3.90.0 is pinned with its bundled TypeScript declarations. Installation and project setup were checked against [Phaser's installation documentation](https://docs.phaser.io/phaser/getting-started/installation) before implementation. Dependency versions are reproducible through `package-lock.json`.

## Live verification on 2026-10-17

The securely provisioned project key successfully called both APIs. Agents returned model `gpt-6-astra`, completed root turn, 194 characters of text, session `sess_0f9962afac52a235006ad361c869d88194b5e7ba6988964828`, request `req_e8b306a7b2f4414098206b7dd304aec2`. That smoke-test session was deleted successfully (request `req_f1fe97a136664a49ba118178812cbce5`).

Decisions returned model `gpt-6-luna`, an allowed `unlock_door` choice, confidence 0.98, and request `req_9e912ab1217e46d1a8e1f5d24f8f45df`. It returned no decision object ID; the adapter preserves that absence. An earlier call returned provider 503, `Decision admission timed out`, request `req_b553c49d02f0463a94cd386b724cc947`; one retry succeeded.

Safari integration testing also observed an Agents-generated Japanese escape plan, Decisions-selected moves into the archive, a player-triggered archive lock consuming 20 energy and interrupting movement, subsequent re-planning, and reset to the initial state. API latency freezes game time, and errors pause explicitly. These observations establish live integration, not a guarantee of ongoing provider availability.
