from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]/'src/art/assets'
source=Path(r'C:\Users\User\.codex\generated_images\01a0b26d-99e2-72a1-a918-c9892a090180')
out=root/'delivery';out.mkdir(exist_ok=True)
im=Image.open(source/'exec-8ebf0ecf-83af-4a55-a4d6-443c87dee4ff.png').convert('RGBA')
w,h=im.size
for i,name in enumerate(['mint','peach','truck','depart']):
 x=i%2*w//2;y=i//2*h//2
 cell=im.crop((x,y,x+w//2,y+h//2))
 bounds=cell.getchannel('A').point(lambda a:255 if a>128 else 0).getbbox()
 cell=cell.crop(bounds);cell.thumbnail((400,360),Image.Resampling.LANCZOS)
 cell.save(out/(name+'-v1.webp'),quality=84,method=6)
bg=Image.open(source/'exec-ab802b76-62d7-4f33-8a0e-6e458190eb39.png').convert('RGB')
bg.resize((800,1280),Image.Resampling.LANCZOS).save(out/'background-v1.webp',quality=76,method=6)
