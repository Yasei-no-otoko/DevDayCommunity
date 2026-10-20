# BLACKSITE portrait UI and Reels research

Research checked 2026-10-20 before UI/API changes. Phaser is pinned to 3.90.0 in `package.json`; the versioned official Phaser 3.90 docs are used below.

## Current implementation and implications

- `src/facility.ts` draws the facility into a fixed 1000×680 Phaser scene and configures `Phaser.Scale.FIT` with `CENTER_BOTH`. Phaser FIT preserves the scene ratio and can leave unused parent space. `RESIZE` instead changes the canvas dimensions to fill its parent and therefore requires scene geometry/layout to respond to new dimensions; it is not a drop-in portrait fit. Existing code listens for the scale `RESIZE` event and aligns the HTML labels to the rendered canvas.
- Phaser input unifies touch and mouse. Phaser distinguishes screen `pointer.x/y` from camera/world `pointer.worldX/worldY`; validate room taps after any scene/DOM resizing and keep tap targets usable without hover.
- `src/style.css` already uses `100dvh`, a <=650px stacked layout, 44px minimum mobile controls, and a responsive facility area. The small-screen facility is currently assigned a fixed 520px height, and the existing stacked panels can make the complete play loop very long on a phone. The page uses `overflow:auto` at <=1150px. `app/layout.tsx` sets only `themeColor` in its explicit viewport metadata; it does not explicitly request `viewport-fit=cover`.
- The social kit currently describes vertical footage as a crop/reframing of the landscape game capture. Meta’s Reels ads guidance favors 9:16 vertical video, audio, and keeping key creative in its safe zone. Its page links a safe-zone checker; the guidance is ad-oriented and does not establish universal organic-post requirements. Use the checker/template for exact overlays instead of hard-coding guessed top/bottom percentages.

## Design and behavior recommendations

- Treat portrait as a responsive game interface: keep the facility map, mode, timer, current agent status, and at least the primary interference actions visible in the first phone viewport. Use a compact order such as title/mode and timer, facility map, status, then primary actions; put logs, narrative detail, and less frequent actions below or behind a clear disclosure. Avoid shrinking the whole desktop dashboard to fit.
- Preserve the facility’s intended 1000:680 composition in portrait with a contained canvas unless the Phaser scene is intentionally redesigned for a tall composition. If using a portrait-specific map scene, adapt the room geometry, labels, actor markers, selection graphics, and overlays together. Keep keyboard/mouse behavior on desktop and verify touch selection at the displayed scale.
- Add explicit viewport sizing only where needed by the app shell. If `viewport-fit=cover` is used, pad interactive content with `env(safe-area-inset-top/right/bottom/left)`; retain a fallback value. Use dynamic viewport sizing for browser chrome changes and reflow when the visual viewport changes, especially after orientation change. Do not put essential buttons beneath notches, rounded corners, or the home indicator.
- For Reels capture, compose a native-looking 9:16 recording with the gameplay area framed for a phone rather than simply enlarging a landscape crop. Keep captions and key interface evidence within Meta’s safe-zone template, and inspect the final upload preview because platform UI overlays vary by placement/device.

## Portrait QA matrix

| Surface | Viewports to cover | Evidence to record |
| --- | --- | --- |
| Phone portrait | 320×568, 360×800, 390×844, 430×932 CSS px | No horizontal overflow; safe-area clearance; title/mode/timer and map readable; controls at least 44 CSS px; no clipping of dialogs, result, watchback, Tibo banner, or toasts. |
| Phone landscape and rotation | 844×390 and 932×430; rotate during a running round | Canvas/labels stay aligned, no stale dimensions, game state and timer continue, no stuck scroll/fullscreen state. |
| Tablet portrait | 768×1024 | Check breakpoint transition, map readability, panel ordering, and action reach without desktop-width assumptions. |
| Desktop regression | 1280×720 and 1920×1080 | Existing map layout and visible interaction state remain intact; pointer selection still hits intended room. |
| Reels composition | 1080×1920 frame with Meta safe-zone checker | Critical game action, title/subtitle, and captions remain clear of Reels UI overlays; verify at normal phone viewing size. |

## Official references

- [Phaser Scale Manager guide](https://docs.phaser.io/phaser/concepts/scale-manager): FIT, RESIZE, parent sizing, scale events, and fullscreen behavior.
- [Phaser 3.90.0 ScaleManager API](https://docs.phaser.io/api-documentation/3.90.0/class/scale-scalemanager): version-matched API details for scale modes, parent bounds, resize, and `RESIZE` event.
- [Phaser Input guide](https://docs.phaser.io/phaser/concepts/input): touch/mouse input and screen/world pointer coordinates.
- [MDN viewport meta reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport): viewport-fit behavior, dynamic viewport and safe-area guidance.
- [MDN env() reference](https://developer.mozilla.org/en-US/docs/Web/CSS/env): CSS environment variables including safe-area insets.
- [Meta for Business: Instagram and Facebook Reels ads](https://www.facebook.com/business/ads/facebook-instagram-reels-ads): 9:16, audio, key-message safe zones, and link to the Reels safe-zone checker. This is advertising guidance.

