# UI language and playback notes (checked 2026-10-20)

This note records the official browser and Phaser contracts relevant to Japanese/English UI selection, 16:9 video layout, and starting an Agents session during the opening sequence. OpenAI integration here uses REST `fetch`, not an OpenAI SDK.

## Official references

- [Phaser 3.90.0 ScaleManager](https://docs.phaser.io/api-documentation/3.90.0/class/scale-scalemanager): the canvas uses a fixed game size scaled with CSS to the dimensions of its parent. `FIT` constrains the full game canvas to the available parent space while preserving its aspect ratio. Parent sizing and CSS determine the available area.
- [Navigator.language (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/language) and [Navigator.languages (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/languages): language tags are BCP 47 strings; the first preferred language is generally the value of `navigator.language`. Normalize case and match the primary subtag (`ja`) so variants such as `ja-JP` select Japanese; the requested two-language policy maps all other values to English.
- [CSS aspect ratios (MDN)](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Box_sizing/Aspect_ratios): `aspect-ratio: 16 / 9` defines a preferred box ratio when one dimension is automatic. Bound both width and height to the viewport/container; use `object-fit: contain` where all source video content must remain visible.
- [HTML video (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video): inline video behavior and intrinsic dimensions are browser media behavior; CSS can size the player inside the page.
- [Fullscreen API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen): fullscreen is an explicit asynchronous browser request requiring transient user activation and can fail. Avoid calling it when the desired experience is page-contained playback; simply size the video overlay to the viewport.
- [Agents API overview](https://developers.openai.com/api/docs/guides/agents-api/overview), [quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart), [sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions), and [events](https://developers.openai.com/api/docs/guides/agents-api/sessions/events): session creation begins an agent turn and streaming reports progress; require root `agent.session.turn.completed` for success. `idle` alone is not success. Sessions may be deleted with the documented DELETE endpoint.

## Pre-change observations

- `src/main.ts` currently contains Japanese-only UI text. It has no language selection layer or `lang` update.
- `src/facility.ts` already uses Phaser 3.90.0 `Scale.FIT` and parent-driven centering, so the map canvas preserves its fixed game ratio. Any page-level layout changes should keep a definite parent size and avoid overriding Phaser's canvas dimensions.
- `src/main.ts` exposes a custom fullscreen button and calls `requestFullscreen()` on the root. Video presentation is managed separately by `src/cinematics.ts`; inspect that module's DOM/CSS before removing any fullscreen behavior to preserve its sequencing and close handling.
- The current opening flow in `startPause()` calls `startLive()` only after `cinematics.play()` resolves (around lines 531-541). Starting the API while the opening video plays requires launching `startLive()` at the opening gesture and retaining an opening/video gate so game ticks and decisions do not begin before the video completes.
- `startLive()` snapshots `generation`; if reset/disposal races session creation, a late result is deleted through `closeSession(result.sessionId, result.sessionToken)`. `reset()` increments generation and closes any already assigned session. `dispose()` increments generation and does the same. Decisions have generation checks and `apiPending` guards; reset clears pending decision references, while in-flight fetches themselves are not aborted. This stale-result cleanup is a useful invariant to retain.

## Lifecycle implementation guidance

Run the opening visual and `startLive()` concurrently from the original user gesture, but gate simulation/decision advancement until both the opening sequence and the initial Agents result are ready. Keep pause state independent: if the player pauses during the opening, resolving either asynchronous branch must not silently resume gameplay. On reset or unmount, invalidate the generation immediately; any session returned afterward must be deleted with its returned capability. Do not discard an in-flight session-create promise without preserving that late-result cleanup. If abort signals are added, treat browser abort as cancellation only; it does not establish provider session deletion, so cleanup still needs a provider DELETE when an ID is known.

For video, retain the page overlay and fit the player within viewport bounds at 16:9. Do not request the Fullscreen API or invoke browser/OS-level fullscreen controls. Remove any shark loading fallback only after identifying whether it is a real asset or browser/video poster and ensuring failed playback still has a neutral, accessible status surface.

## Implemented behavior and local verification

The Japanese browser preference selects Japanese; English and other preferences select English. Legacy UA locale detection is a fallback when browser language fields are absent. UI copy is centralized in `src/i18n.ts`; simulation IDs and rules remain unchanged. Phaser writes translated labels directly on every frame. Session creation requests the strategy in the selected language. The shark title dialog and its unused image were removed.

Starting a live experiment now launches the opening and session request together. Existing cinematic and thinking gates prevent game time and Decisions from advancing until both are ready. Cinematics use an inline, contained 16:9 viewport frame with separate controls and never request native fullscreen. The explicit game fullscreen button remains user controlled.

On 2026-10-20, `npm test` passed all 105 tests and the production build passed. A Vivaldi browser harness loaded the real client modules and styles, intercepted only local API routes with dummy responses, and recorded 59 passing checks, including:

- `en-US` and `fr-FR` render English; `ja-JP` renders Japanese. Text and accessible-copy scans, including labels sampled after Phaser frames, found no Japanese residue in English UI.
- English header, briefing, panels and subject text fit actual 1280×720 and 1920×1080 iframe viewports, including clipping ancestors.
- Video frame ratios were 1.7778 at 1280×720, 1920×1080 and 390×844 for all three locales. Desktop frame sizes were 1146.7×645 and 1786.7×1005 respectively, reserving space for controls. No cinematic fullscreen calls occurred.
- Session creation starts while the opening exists. Movie-first and plan-first completion each wait for the other gate. Reset ignores the late plan and deletes that unique dummy session. A failed create returns to waiting; a simulated hidden document pauses a loaded playing video and preserves the game's pause after the response.

These are local UI and mocked lifecycle checks. This change has not been deployed or exercised through the hosted real API gate; generated plan language and production demo readiness remain unverified until deployment, `npm run test:live`, `npm run demo:ready`, and the public browser checks succeed.
