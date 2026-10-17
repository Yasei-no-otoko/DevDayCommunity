# ChatGPT Sites runtime notes

Checked 2026-10-17 against the installed Sites 1.0.0 skill, Vinext starter, native tool contracts and the existing application. Site project: `appgprj_6ad3640b01408191b9802dafaaa61c9d`. The registered origin is `https://blacksite-escape-experiment.yasei-no-otoko.chatgpt.site`; registration alone does not establish publication.

## Runtime migration

Sites hosts server code on Cloudflare Workers. The supplied Vinext starter is the supported default for server behavior. The existing Vite static page plus localhost Node HTTP proxy was replaced by a Vinext app with the same Phaser UI and same-origin Web Request/Response API routes. The source manifest retains its exact project ID, has no `static` field, and leaves unused D1/R2 bindings null. The supplied `sites()` Vite plugin and Worker build integration are retained.

The app imports Phaser only after browser hydration. During Vite 8/Rolldown SSR bundling, Phaser's ESM entry has named exports and no default export; its import is now a namespace import. The old Node HTTP server and standalone HTML entry were removed. The mount function owns animation/listener/audio cleanup and removes late-created API sessions after reset or unmount.

The starter dependency versions are Vinext `1.0.0-beta.5`, Vite `8.0.13`, Next `16.3.4`, React `19.2.6`, Cloudflare Vite plugin `1.37.1`, Wrangler `4.92.0`. Versions are locked. Worker types are imported explicitly instead of added globally because their HTMLRewriter `Element` and Web Response types otherwise collide with browser DOM types.

## Identity, secrets, and session continuity

Sites supplies ChatGPT identity headers after authentication. The dynamic page uses the starter's `requireChatGPTUser`, and every API route checks the trusted user ID. The local preview uses the starter's sign-in emulation. All API routes enforce exact same-origin requests and bounded JSON bodies.

`OPENAI_API_KEY` is read server-side at request time with `nodejs_compat` and a 2026-05-15 compatibility date. The source, client bundle and hosting manifest contain no secret values. Hosted configuration uses the native Sites secret tool; local configuration uses ignored `.env.local`.

The previous in-memory session Set would fail across Worker isolates. Session creation now returns an expiring HMAC capability bound to the provider session and Sites user. Decisions and deletion must present that capability; a new isolate can verify it without local memory. Tokens last 60 minutes and rotate with the API key. Provider deletion ends the underlying session; stateless tokens themselves remain verifiable until expiry. The three-minute game stays browser-local and does not require a database.

## Publication and evidence

Use the native private publication flow and preserve the owner-only audience. The Sites source helper receives its short-lived source credential through hidden stdin, pushes the source state, and packages the matching build. Archives and source snapshots exclude local env files and credential/runtime data. A successful deployment result with its literal URL establishes publication; local preview and API-key configuration alone do not.

The original API contracts and successful provider smoke tests are recorded in [OpenAI API notes](openai-api-notes.md). Worker migration adds tests for independent isolates, identity, exact origin, modified/expired/cross-user capabilities and input limits.
