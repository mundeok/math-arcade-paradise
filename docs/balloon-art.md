# Balloon toy art

Generated with built-in GPT image generation, using approved preview `exec-99402ec1-b9d2-434d-84dd-6dc927c7cfb8.png` as style reference.

Runtime files:
- `src/art/assets/world/balloon-bg-v1.webp` — 800×1280, 25,686 bytes.
- `src/art/assets/balloon/balloons-v1.webp` — 768×512 RGBA, 56,498 bytes.
- Total 82,184 bytes. Originals preserved; preparation script: `scripts/prepare-balloon-art.py`.

Final background prompt: Portrait 5:8 game background only. Reference is approved STYLE reference. Recreate soft pastel toy storybook carnival with pale blue empty sky occupying central 80%, faint clouds edges, bunting only top corners, pink cream tents bottom 15% corners. Remove ALL foreground balloons, numbers, strings and pop effects. Quiet low contrast center for game sprites. Warm daylight, soft polished 3D toy aesthetic. No text, numbers, UI, characters, logos or watermark.

Final selected sprite prompt: Production transparent sprite sheet, reference STYLE only. Exactly SIX blank glossy pastel balloons in strict THREE columns TWO rows, all upright identical egg-shaped silhouette, fully separated by generous transparent gutters. Row1 pink, cyan blue, golden yellow. Row2 lavender, mint green, peach orange. Each balloon body with small knot directly beneath, NO strings. Upper-left perimeter highlight, center clear for code-drawn digits. Match approved reference soft polished 3D toy storybook style. Genuinely transparent alpha background; no backdrop, no checkerboard, no text, numbers, faces, UI, shadows outside object, labels or watermark. Whole objects within individual equal cells.

Generated sprite transparency included unwanted glow. Two further generation attempts did not improve this sufficiently; runtime uses measured body source rectangles from the first sheet, clipped to existing ellipse geometry. Existing procedural bodies underlay images, with Canvas knots/strings/faces and live navy numeric labels plus cream outlines. No changes to collision/answer logic; failed images use procedural fallback. The approved preview is art direction, not an exact layout replacement.

Verification: 10 balloon unit tests passed. Existing browser regression passed simulated 60 seconds, wrong/recovery, idle, fever restore, pause/resume, result/restart and real 35-second mouse play (5 boards, 174 records, no wrong answers, running audio, no page errors). Additional `tests/balloon-art-check.mjs` checks image-ready desktop/phone screenshots, blocked-image fallback with actual clicks, and 11-game startup/fever transitions. No physical mobile device performance measurement. Screenshots in `test-output/balloon-toy/`.
