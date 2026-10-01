from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
source=Path(r'C:\Users\User\.codex\generated_images\01a0b26d-99e2-72a1-a918-c9892a090180')
out=root/'src/art/assets/race';out.mkdir(exist_ok=True)
bg=Image.open(source/'exec-6ecc285e-ec16-4a9f-8fd4-6624d68d825d.png').convert('RGB')
bg.resize((800,1280),Image.Resampling.LANCZOS).quantize(colors=256,method=Image.Quantize.MEDIANCUT).save(out/'toy-landscape-v1.png',optimize=True)
cars=Image.open(source/'exec-f21f399d-42ce-47b0-8ddb-c2c58a386ce5.png').convert('RGBA');w,h=cars.size
for i,name in enumerate(['teal-car','pink-car','yellow-car']):
 cell=cars.crop((i*w//3,0,(i+1)*w//3,h));cell=cell.crop(cell.getchannel('A').point(lambda a:255 if a>128 else 0).getbbox());cell.thumbnail((360,260),Image.Resampling.LANCZOS);cell.save(out/(name+'-v1.webp'),quality=84,method=6)
