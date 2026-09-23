"""Resize generated game art, preserving genuine alpha and originals."""
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parents[1] / 'src/art/assets'
source = Path(r'C:\Users\User\.codex\generated_images\01a0b26d-99e2-72a1-a918-c9892a090180')
(root / 'chain').mkdir(parents=True, exist_ok=True)
bg = Image.open(source / 'exec-a2b6ba55-c1bf-477a-88fa-ee1da4e62f8c.png').convert('RGB')
bg.resize((800, 1280), Image.Resampling.LANCZOS).save(root / 'chain/background-v1.webp', 'WEBP', quality=76, method=6)
sheet = Image.open(source / 'exec-025e297e-8714-47e6-bd35-cd2d9d8c1be0.png')
assert sheet.mode == 'RGBA'
sheet.resize((640, 640), Image.Resampling.LANCZOS).save(root / 'chain/jellies-v1.webp', 'WEBP', quality=84, method=6)
for p in (root / 'chain').glob('*.webp'):
    print(p.name, p.stat().st_size)
