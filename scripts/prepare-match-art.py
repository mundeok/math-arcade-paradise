"""Resize generated originals for runtime; preserve alpha and source files."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = Path(r'C:\Users\User\.codex\generated_images\01a0b26d-99e2-72a1-a918-c9892a090180')
jobs = [
    ('exec-548ac9cb-4485-4ed5-9026-f56a7e598440.png', 'world/match-bg-v1.webp', (800, 1280), 76),
    ('exec-7afe3bc8-5160-4195-8366-1b5efece2002.png', 'match/animals-v1.webp', (804, 1068), 80),
    ('exec-54a2eb57-f5f7-460e-a371-57e08cf04eef.png', 'match/cookie-v1.webp', (160, 160), 82),
]
for original, destination, size, quality in jobs:
    im = Image.open(source / original)
    print(original, im.size, im.mode)
    out = root / 'src/art/assets' / destination
    out.parent.mkdir(parents=True, exist_ok=True)
    im = im.resize(size, Image.Resampling.LANCZOS)
    im.save(out, 'WEBP', quality=quality, method=6)
    print(out.name, out.stat().st_size, 'bytes', 'alpha:', im.getextrema()[-1] if im.mode == 'RGBA' else 'none')
