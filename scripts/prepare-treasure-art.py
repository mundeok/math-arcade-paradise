from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]/'src/art/assets'
source=Path(r'C:\Users\User\.codex\generated_images\01a0b26d-99e2-72a1-a918-c9892a090180')
(root/'treasure').mkdir(parents=True,exist_ok=True)
bg=Image.open(source/'exec-5be164b2-4d88-4448-af03-2ec6096c397a.png')
bg.resize((800,1280),Image.Resampling.LANCZOS).save(root/'world/treasure-bg-v1.webp','WEBP',quality=76,method=6)
sheet=Image.open(source/'exec-36b3a77b-60f5-47ae-80b4-09fc4cfe4e0f.png')
assert sheet.mode=='RGBA'
cells={'rabbit':(50,0,520,587),'puppy':(540,95,1020,590),'sprout':(1030,0,1536,596),
       'closed':(50,605,520,1024),'open':(555,587,1015,1024),'gem':(1090,655,1450,980)}
for name,box in cells.items():
    im=sheet.crop(box)
    im=im.crop(im.getchannel('A').getbbox())
    im.thumbnail((256,288) if name!='gem' else (96,96),Image.Resampling.LANCZOS)
    im.save(root/f'treasure/{name}-v1.webp','WEBP',quality=84,method=6)
files=list((root/'treasure').glob('*.webp'))+[root/'world/treasure-bg-v1.webp']
for p in files: print(p.name,p.stat().st_size)
print('Total',sum(p.stat().st_size for p in files))
