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

## Current SDK and contract check on 2026-10-18

The official [`openai/openai-node` releases](https://github.com/openai/openai-node/releases) list `v7.38.0` (released 2026-10-17) as the latest JavaScript SDK release checked for this note. The Decisions guide requires JavaScript SDK `7.30.0` or later for its SDK examples. The supported package is `openai`; the Agents API quickstart uses `client.beta.agents.sessions...`, while Decisions uses `client.decisions.create(...)`. `@openai/agents` is a separate Agents SDK and is not the package shown by these API examples.

This project does not currently install the `openai` SDK: `package.json` has no `openai` dependency. Its server-side adapter uses Node.js 24 built-in `fetch` against the Agents and Decisions REST endpoints. No SDK upgrade is needed for the current adapter. Comparing the current official Agents quickstart/events and Decisions guides with the contracts recorded above found no API contract differences for this implementation: endpoint paths, required request fields, allowed Decisions question/answer shapes, and the root-turn completion event remain as documented. The official guides remain the authority if beta behavior changes.

## Production Site live verification on 2026-10-18

At 13:38–13:40 JST, the published [BLACKSITE Site](https://blacksite-escape-experiment.yasei-no-otoko.chatgpt.site/) was exercised in Vivaldi with an existing authenticated visitor session. The tested deployment was version 2, source commit `bf582cacfdbb1289b3082190fe097e62fe7bf190`. The browser selected OpenAI live mode and used the deployed same-origin API routes. No provider responses, choices, or animation frames were mocked in this run; the normal `requestAnimationFrame` loop advanced the game once the browser window was brought to the foreground.

| Operation | Observed result |
| --- | --- |
| Runtime readiness | `/api/status` returned 200; the authenticated UI offered live API play. |
| Agents strategy | `/api/session` returned 201 in 9,309 ms. A Japanese escape plan was displayed; model `gpt-6-astra`, request `req_72a48b89b7b04406be5e24d4129b274c`. |
| Decisions actions | The completed first experiment made nine `/api/decision` requests, all returning 200, with browser-observed durations of 218–2,623 ms. Model `gpt-6-luna`; final request `req_a1fc55fd438145a3b4c715ab1b4b0430`, confidence 0.93. No decision object ID was returned, which remains valid. |
| Gameplay integration | ELIAS recovered the keycard, restored power, and unlocked the evacuation door. The result showed escape after 00:55 of simulation time, one player interference, and final fear 16/100. The player lock action spent energy and increased fear. |
| Pause during inference | A real Decisions response arriving during a pause was held as “次の行動を受信済み · 再開待ち” at 02:15 remaining. Resuming applied the received move toward the exit. |

The browser's Resource Timing entries established the HTTP results; the game's API details and activity log supplied the request IDs, returned confidence, plan, and applied actions. API errors were empty and the controller stayed in live mode. The source adapter separately requires a successful root Agents turn and validates the named Decisions choice before applying it. No application fix was needed for this verification. These are point-in-time production results, not an availability guarantee or a smartphone-device test. Credentials and session capability tokens are deliberately excluded from this record.

## Sam pursuit and ward hideout live verification on 2026-10-18

The public Site's version 5, source `aced606ab2f3606272e78b4267dc2b63eaccc444`, was tested in Vivaldi from 14:54–14:58 JST. The 1280×720 page showed Sam, the overhead sprites, the ward's hiding-space label, and the right-hand room picker with four icon buttons. Its document also measured 1280×720. The five runtime WebP requests returned 200. The published archive contained 66 files, content hash `sha256:ccffba8e260e5fd41dcee702239c080a1651ece548725be2391a0d4f0e36327f`.

No provider response, model choice, or animation frame was mocked. A browser fetch wrapper recorded only selected metadata while returning the original responses; a native animation-frame counter observed ordinary gameplay. The existing authenticated visitor session was used. API keys and signed session capability tokens are excluded from these records.

| Check | Observed result |
| --- | --- |
| Readiness | `/api/status` returned 200 with configured/authenticated both true. |
| First Agents plan | `/api/session` returned 201 in 13,945 ms, model `gpt-6-astra`, request `req_4006bf7166ea4a81b06f3917df7dceec`. The Japanese plan included the ward's bed hideout and resuming escape objectives. |
| First experiment | Nine Decisions requests all returned 200 in 236–1,906 ms, model `gpt-6-luna`. Sam collected the keycard, restored power, unlocked the exit and escaped after 00:54 of simulation time, fear 24, with no player interference. Final request `req_85666ef2395345b5a4cb2be47ce5730d`. |
| Pursuer knowledge | Requests omitted `knownKiller` before first contact and included it after contact. The request snapshots carried the new `hideout` contract. |
| Follow-up Agents plan | A reset created a new live plan: 201 in 10,339 ms, request `req_5f3573f5f75f4fdba29b75e2be36f947`. |
| Live ward choice | After four player lock actions interrupted movement, Decisions chose `move ward`, then `hide ward` from the legal choices. The hide response was 200 in 1,263 ms, request `req_f3d0db4ca549460b9646dedc37e6e0f6`, confidence 0.61. The UI showed “隠れる / 隔離病棟” at 02:16 remaining. |
| Counterplay | A player apparition in the ward produced “サムを隠れ場所から追い出しました”. The following live Decisions request reported the consumed hide cooldown, `completed: 0`, and no lost-trail time, then selected movement toward the archive. |
| Tibo | The live cut-in appeared at 02:34 remaining, measured 251.30×320px, with the referenced Tibo image loaded. |
| Follow-up completion | All 21 Decisions requests returned 200 in 211–1,696 ms. After the interrupted hide, Sam recovered both objectives and escaped at 01:47 elapsed, with five interventions and fear 71/100. Final request `req_62620416e353423ca4450b43acb32100`. The UI and browser reported no errors. |
| Cleanup | Reset deleted both tested provider sessions with 200 responses. The final cleanup request was `req_7d179e578b724e749efd98227009073f`. |

The follow-up's player side used bounded UI automation: at most four lock clicks, followed by one apparition click after observing the model-selected hide. It used the published buttons and did not change the simulation, legal choices, or API results. This is an integration test; it does not establish how enjoyable first-time human players find the game. API choices can choose a different valid escape route in another run.
