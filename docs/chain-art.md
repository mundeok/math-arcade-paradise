# 배수 젤리 이미지 적용

Built-in GPT image generation used, with `src/art/assets/menu/cards/g08_chain.png` as style reference. Generated originals remain in the Codex generated_images folder; all runtime images are in the repository.

## Assets

- `src/art/assets/chain/background-v1.webp`: 800×1280, 82,070 bytes.
- `src/art/assets/chain/jellies-v1.webp`: 640×640 transparent 2×2 atlas, 71,634 bytes.
- Total 153,704 bytes before any future base64 packaging.
- `scripts/prepare-chain-art.py` preserves source files and alpha and prepares runtime WebP images.

## Final prompts

Background: Use case: stylized-concept. Asset type: portrait static underwater game background for a children's multiplication jelly-linking game. Image 1 is STYLE REFERENCE ONLY: match rounded polished 3D toy-storybook illustration, friendly sea palette, gentle glow. Create a calm aquarium world with a large quiet central open area for a 4x4 gameplay board; no focal objects in center. Coral, sea plants, tiny fish silhouettes, bubbles, and a small treasure chest only around outer edges and lower corners. Clear turquoise water, soft rays from above, muted contrast in central 70 percent so numbers and connection lines remain readable. Leave top middle calm for HUD. Portrait 5:8 composition. No characters, no jellies, no text, no numbers, no logos, no UI frame, no buttons, no watermark. Background plate only, not menu poster.

Sprites: Use case stylized-concept. Production transparent game sprite sheet. Reference image1 STYLE ONLY. Exactly four adorable glossy jelly blob characters on genuinely transparent alpha background, equal size in strict 2x2 grid with large transparent gutters. Top left pink, top right yellow, bottom left cyan blue, bottom right lime green. Each has identical rounded dome silhouette, little scalloped jelly feet, soft toy-like gel volume, glossy upper-left highlight, small cute smiling face placed near LOWER edge of body. Large central upper belly completely blank and softly colored for code-drawn number overlay. Front view, each whole character fully visible and isolated within own cell; no tilted poses, no accessories, no cast shadows outside silhouettes. Match polished 3D toy children's storybook rendering of reference. No digits, no text, no marks, no scenery, no connecting lines, no printed checkerboard, no borders. Four separate equally sized sprites, not a scene.

## Integration

`chainAssets.js` loads once on game entry. Individual image errors retain procedural fallback. Board support stays opaque; footer gains a cream readability panel when the background is loaded. Number badges, paths, selection outline, bouncing, particles and keyboard cursor remain dynamic Canvas drawings. The sprite variant depends only on board slot, never correctness. Gameplay and collision dimensions are unchanged.

## Verification

- `node --test tests/chain.test.mjs`: 9 passed.
- `node tests/chain-browser-check.mjs`: pointer/touch, cancel, wrong, fever restore, pure render, result passed.
- `node tests/chain-art-live.mjs`: separate browser sessions, external requests blocked; actual RAF and repeated mouse drags, wrong/recovery, sound enabled/disabled, pause/resume, fever entry/exit, phone, timed result/retry, failed image fallback and all 11 games start/fever render checks passed; no page exceptions.
- `test-output/chain-toy/`: desktop, phone, fever and fallback screenshots inspected.
- No physical Galaxy Tab performance measurement or listening test; browser audio enabled/disabled behavior was exercised.
