"""Pack generated, alpha-preserving dessert sprites for the existing game geometry."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = Path(r'C:\Users\User\.codex\generated_images\01a0b26d-99e2-72a1-a918-c9892a090180')
out = root / 'src/art/assets/stack'
out.mkdir(parents=True, exist_ok=True)

bg = Image.open(source / 'exec-09b61409-5dcd-4095-b6e9-4315c6923bd6.png').convert('RGB')
bg = bg.resize((800, 1280), Image.Resampling.LANCZOS)
bg.save(root / 'src/art/assets/world/stack-bg-v1.webp', 'WEBP', quality=76, method=6)

sheet = Image.open(source / 'exec-6d2fa2f9-5ebf-4cef-8a83-3d05a3381269.png')
assert sheet.mode == 'RGBA', 'Generated sprites must have genuine alpha'
names = ['unused', 'pudding', 'macaron', 'donut', 'cake', 'plate']
for i, name in enumerate(names):
    if name == 'unused':
        continue
    col, row = i % 2, i // 2
    crop = sheet.crop((col * sheet.width // 2, row * sheet.height // 3,
                       (col + 1) * sheet.width // 2, (row + 1) * sheet.height // 3))
    # Trim transparent cell padding, not the silhouette. Preserve all alpha pixels.
    crop = crop.crop(crop.getchannel('A').getbbox())
    crop.thumbnail((384, 192), Image.Resampling.LANCZOS)
    crop.save(out / f'{name}-v1.webp', 'WEBP', quality=84, method=6)
    print(name, crop.size, crop.getchannel('A').getextrema())

pancake = Image.open(source / 'exec-d5e958b2-1361-4bae-b1a0-21426d2e3e11.png')
assert pancake.mode == 'RGBA'
pancake = pancake.crop(pancake.getchannel('A').getbbox())
pancake.thumbnail((384, 192), Image.Resampling.LANCZOS)
pancake.save(out / 'pancake-v1.webp', 'WEBP', quality=84, method=6)
files = list(out.glob('*-v1.webp')) + [root / 'src/art/assets/world/stack-bg-v1.webp']
for file in files:
    print(file.name, file.stat().st_size)
print('Total bytes:', sum(file.stat().st_size for file in files))
