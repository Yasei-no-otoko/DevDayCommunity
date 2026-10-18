# DevDay Community Hackathon demo notes (2026-10-18)

## Event requirements

The [Luma event page](https://luma.com/OpenAIDevDay2026CommunityHackathon) describes a hands-on build using features announced at OpenAI DevDay 2026. Its judging criteria are:

1. **Use of new features:** DevDay 2026 features are used in a way that fits their purpose.
2. **Usability:** Other people can use the product easily.
3. **Usefulness:** It could help other people in the future.
4. **Originality:** The idea or solution has an original angle.

The published schedule gives 14:00–17:30 for hacking, followed by pre-judging at 17:30 and demos for 10 teams from 17:45. The user provided **17:15 JST on 2026-10-18 as the submission deadline**. Use 17:15 as the working deadline and finish deployment and acceptance before then; the activity schedule is not evidence of a later submission deadline. The event page did not publish a separate submission form or submission URL when checked. Luma showed registration as closed when checked.

The rules require a web-published deliverable and allow ChatGPT Sites, Cloudflare Workers, Vercel, and similar hosts. Development during the event must use Codex CLI, Codex App, or ChatGPT Work. Prebuilt work is disallowed; an unpublished, new prototype is allowed. Updating an entry submitted to another hackathon is disallowed. Because the starting Blacksite site is already public, whether this particular site or its current state qualifies as the new hackathon deliverable is **unconfirmed**. The event page does not resolve that question.

## Ninety-second demo path

**Required before presenting:** complete the [live API acceptance gate](live-demo-check.md) against the deployed commit. Both `npm run test:live` and `npm run demo:ready` must succeed, and the published browser's live mode must be exercised. Local simulation, mock tests, configured status alone, and historical API receipts do not satisfy this requirement. A failed or skipped live check leaves the demo unaccepted.

Keep the demo to one short escape attempt and explain what the two APIs do while they run:

- **0:00–0:10 — Set the scene.** “You are the haunting; Sam Altman is the AI escape agent.” Point to Sam and Nuko's overhead sprites, the four interference buttons, and keycard → power → exit objectives. The player wins at fear 100 or after 180 simulation seconds of containment. Contact records Sam as caught and raises fear while play continues.
- **0:10–0:25 — Show the Agents plan.** Sign in and select OpenAI live mode before the presentation. Start the attempt, show the returned escape plan, and identify it as Agents API output. If the call is still pending, keep that state visible and narrate the wait.
- **0:25–0:45 — Change the situation.** Keep tracking on and seal Sam's destination while he is moving. Show the interrupted route and the next legal action selected by Decisions API. The player chooses interference; the model chooses Sam's action; the browser simulation validates and applies it.
- **0:45–1:00 — Let the camera answer.** The first successful interference queues a short camera cut after 1.7 seconds. Point out the actual room, time and interference echoed in the camera record. This is a labeled facility effect, not generated model speech. If Nuko enters Sam's room, show the immediate contact notice while play continues. Fear 100 after contact ends the attempt with a capture result; show it and reset when needed.
- **1:00–1:15 — Spot Tibo.** Tibo's large cut-in first appears after 18–30 simulation seconds and resets only the four cooldowns. Point out the remaining energy and choose a follow-up interference. API waits and pauses stop simulation time, so this event may occur later in wall-clock time.
- **1:15–1:30 — Show the evidence.** Open API details to show request metadata and confidence (not a win probability), then state the deployed URL. A completed escape or containment is welcome but is not required to demonstrate one meaningful interaction within 90 seconds.

If an API call is slow, leave the loading/paused indicator visible and narrate the wait. If a provider call fails or the demo switches to local simulation, say that clearly and identify the shown behavior as local; do not describe a local result as a live API response. The Agents stream is complete only on the root `agent.session.turn.completed` event; `idle` or a closed stream alone does not establish success. See the [Agents event guide](https://developers.openai.com/api/docs/guides/agents-api/sessions/events#handle-updates) and [Decisions guide](https://developers.openai.com/api/docs/guides/decisions).

## Sources

- [Luma: DevDay Community Hackathon](https://luma.com/OpenAIDevDay2026CommunityHackathon) — rules, schedule, criteria, prizes, registration state, and venue access.
- [OpenAI: DevDay 2026 Recap](https://openai.com/index/devday-2026-recap/) — official context for the announced features.
- [OpenAI API: Agents API quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart), [events and items](https://developers.openai.com/api/docs/guides/agents-api/sessions/events#handle-updates), and [Decisions](https://developers.openai.com/api/docs/guides/decisions) — current API behavior.
