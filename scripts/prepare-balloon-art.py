from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parents[1] / 'src/art/assets'
source = Path(r'C:\Users\User\.codex\generated_images\01a0b26d-99e2-72a1-a918-c9892a090180')
(root/'balloon').mkdir(parents=True, exist_ok=True)
jobs = [('exec-c84a74a9-4f65-4b21-b930-0ab400644108.png','world/balloon-bg-v1.webp',(800,1280)),
        ('exec-2114263a-2102-4eb5-884e-51ed0309a6a9.png','balloon/balloons-v1.webp',(768,512))]
for name,dest,size in jobs:
    im=Image.open(source/name)
    im.resize(size,Image.Resampling.LANCZOS).save(root/dest,'WEBP',quality=82,method=6)
    print(dest,(root/dest).stat().st_size)
