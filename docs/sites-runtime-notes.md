# ChatGPT Sites runtime notes

Checked 2026-10-17 against the installed Sites 1.0.0 skill, Vinext starter, native tool contracts and the existing application. Site project: `appgprj_6ad3640b01408191b9802dafaaa61c9d`. The registered origin is `https://blacksite-escape-experiment.yasei-no-otoko.chatgpt.site`; registration alone does not establish publication.

## Runtime migration

Sites hosts server code on Cloudflare Workers. The supplied Vinext starter is the supported default for server behavior. The existing Vite static page plus localhost Node HTTP proxy was replaced by a Vinext app with the same Phaser UI and same-origin Web Request/Response API routes. The source manifest retains its exact project ID, has no `static` field, and leaves unused D1/R2 bindings null. The supplied `sites()` Vite plugin and Worker build integration are retained.

The app imports Phaser only after browser hydration. During Vite 8/Rolldown SSR bundling, Phaser's ESM entry has named exports and no default export; its import is now a namespace import. The old Node HTTP server and standalone HTML entry were removed. The mount function owns animation/listener/audio cleanup and removes late-created API sessions after reset or unmount.

The starter dependency versions are Vinext `1.0.0-beta.5`, Vite `8.0.13`, Next `16.3.4`, React `19.2.6`, Cloudflare Vite plugin `1.37.1`, Wrangler `4.92.0`. Versions are locked. Worker types are imported explicitly instead of added globally because their HTMLRewriter `Element` and Web Response types otherwise collide with browser DOM types.

## Identity, secrets, and session continuity

Sites supplies ChatGPT identity headers after authentication. As of 2026-10-18, the public dynamic page permits anonymous local simulation; it no longer redirects all visitors to sign-in. `GET /api/status` returns `authenticated: false`, `configured: false`, and `mode: sign-in-required` to anonymous visitors without making an upstream request. Session creation, decisions, and deletion still require the trusted user ID. Sign-in uses Sites' top-level `/signin-with-chatgpt` route. The local preview uses the starter's sign-in emulation. All API routes enforce exact same-origin requests and bounded JSON bodies.

`OPENAI_API_KEY` is read server-side at request time with `nodejs_compat` and a 2026-05-15 compatibility date. The source, client bundle and hosting manifest contain no secret values. Hosted configuration uses the native Sites secret tool; local configuration uses ignored `.env.local`.

The previous in-memory session Set would fail across Worker isolates. Session creation now returns an expiring HMAC capability bound to the provider session and Sites user. Decisions and deletion must present that capability; a new isolate can verify it without local memory. Tokens last 60 minutes and rotate with the API key. Provider deletion ends the underlying session; stateless tokens themselves remain verifiable until expiry. The three-minute game stays browser-local and does not require a database.

## Publication and evidence

The current audience was verified as `public` by native `get_site` on 2026-10-18; preserve it using `save_site_version` and `deploy_site_version`. The earlier owner-only audience described the initial creation state. The Sites source helper receives its short-lived source credential through hidden stdin, pushes the source state, and packages the matching build. Archives and source snapshots exclude local env files and credential/runtime data. A successful deployment result with its literal URL establishes publication; local preview and API-key configuration alone do not.

The original API contracts and successful provider smoke tests are recorded in [OpenAI API notes](openai-api-notes.md). Worker migration adds tests for independent isolates, identity, exact origin, modified/expired/cross-user capabilities and input limits.

## SDK documentation review — 2026-10-18

Before integrating the latest GitHub gameplay changes and bundled audio, reviewed the current [Vinext Cloudflare guide](https://vinext.dev/docs/deploying/cloudflare), [Vinext releases](https://github.com/cloudflare/vinext/releases), [Cloudflare Vite plugin documentation](https://developers.cloudflare.com/workers/vite-plugin/), [plugin API reference](https://developers.cloudflare.com/workers/vite-plugin/reference/api/), and [Phaser releases](https://github.com/phaserjs/phaser/releases).

The current general-purpose Vinext guide describes platform initialization and deployment through `@vinext/cloudflare`, which differs from this project's Sites starter and native source/version/archive workflow. Upstream releases also extend beyond the pinned starter versions; Phaser 4 requires a major-version migration. This publication updates application source while retaining the tested Sites starter dependency versions and `sites()` integration. No dependency migration is required by the current Sites skill or native deployment contracts. Future SDK upgrades must be validated separately against Worker output and game behavior.

The latest gameplay merge removed required peer and optional platform entries from `package-lock.json` without changing dependency declarations. A clean `npm run install:ci` failed with `EUSAGE`, including missing `webpack@5.112.0` and its dependencies. Restored the complete lockfile from the audio integration commit before repeating clean installation, tests, and build.
