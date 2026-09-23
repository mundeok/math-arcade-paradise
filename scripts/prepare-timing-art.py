from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parents[1]
source = Path(r'C:\Users\User\.codex\generated_images\01a0b26d-99e2-72a1-a918-c9892a090180')
out = root / 'src/art/assets/timing'
out.mkdir(parents=True, exist_ok=True)
im = Image.open(source / 'exec-74586a70-5f28-471d-9d82-100cabf9d6bc.png').convert('RGBA')
im = im.crop(im.getbbox())
im.thumbnail((400, 400), Image.Resampling.LANCZOS)
im.save(out / 'drum-v1.webp', quality=84, method=6)
bg = Image.open(source / 'exec-22857b3c-5da5-4121-926a-377b5bd3d030.png').convert('RGB')
bg.resize((800,1280),Image.Resampling.LANCZOS).save(root / 'src/art/assets/world/timing-bg-v1.webp',quality=78,method=6)
