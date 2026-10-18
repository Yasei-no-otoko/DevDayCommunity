# DevDay Community Hackathon demo notes (2026-10-18)

## Event requirements

The [Luma event page](https://luma.com/OpenAIDevDay2026CommunityHackathon) describes a hands-on build using features announced at OpenAI DevDay 2026. Its judging criteria are:

1. **Use of new features:** DevDay 2026 features are used in a way that fits their purpose.
2. **Usability:** Other people can use the product easily.
3. **Usefulness:** It could help other people in the future.
4. **Originality:** The idea or solution has an original angle.

The published schedule gives 14:00–17:30 for hacking, followed by pre-judging at 17:30 and demos for 10 teams from 17:45. The user provided **17:15 JST on 2026-10-18 as the submission deadline**. Use 17:15 as the working deadline and finish deployment and acceptance before then; the activity schedule is not evidence of a later submission deadline. The event page did not publish a separate submission form or submission URL when checked. Luma showed registration as closed when checked.

The rules require a web-published deliverable and allow ChatGPT Sites, Cloudflare Workers, Vercel, and similar hosts. Development during the event must use Codex CLI, Codex App, or ChatGPT Work. Prebuilt work is disallowed; an unpublished, new prototype is allowed. Updating an entry submitted to another hackathon is disallowed. Because the starting Blacksite site is already public, whether this particular site or its current state qualifies as the new hackathon deliverable is **unconfirmed**. The event page does not resolve that question.

## Three-minute demo path

Keep the demo to one short escape attempt and explain what the two APIs do while they run:

- **0:00–0:25 — Set the scene.** Open the deployed game: “You are the haunting; ELIAS is the escape agent.” Point to the player’s win condition (fear 100 or containment for 180 simulation seconds) and the agent’s keycard → power → exit objectives. Select OpenAI live mode after sign-in; the default local trial is available to visitors without sign-in.
- **0:25–1:10 — Show the Agents API.** Start or reset the scenario and request the agent’s escape plan. Show the response in the game and identify it as generated narrative/strategy. Give the provider time to respond; keep the game’s waiting or paused state visible instead of implying the turn completed early.
- **1:10–2:15 — Show the Decisions API.** Seal ELIAS’s destination to interrupt movement, then show the next typed decision selecting among the agent’s legal actions. The API selects the escape agent’s action; the player chooses the interference. The authoritative browser simulation validates the returned action and applies its effects. Open “接続・判断の詳細” to show the actual request metadata and confidence (not a win probability).
- **2:15–2:40 — Show the result.** Point out the changed state and one follow-up choice, or reset if the run took a different valid branch.
- **2:40–3:00 — Map to judging.** Name the DevDay features used, the player problem the interaction solves, and the original horror-game angle. State the deployed URL.

If an API call is slow, leave the loading/paused indicator visible and narrate the wait. If a provider call fails or the demo switches to local simulation, say that clearly and identify the shown behavior as local; do not describe a local result as a live API response. The Agents stream is complete only on the root `agent.session.turn.completed` event; `idle` or a closed stream alone does not establish success. See the [Agents event guide](https://developers.openai.com/api/docs/guides/agents-api/sessions/events#handle-updates) and [Decisions guide](https://developers.openai.com/api/docs/guides/decisions).

## Sources

- [Luma: DevDay Community Hackathon](https://luma.com/OpenAIDevDay2026CommunityHackathon) — rules, schedule, criteria, prizes, registration state, and venue access.
- [OpenAI: DevDay 2026 Recap](https://openai.com/index/devday-2026-recap/) — official context for the announced features.
- [OpenAI API: Agents API quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart), [events and items](https://developers.openai.com/api/docs/guides/agents-api/sessions/events#handle-updates), and [Decisions](https://developers.openai.com/api/docs/guides/decisions) — current API behavior.
