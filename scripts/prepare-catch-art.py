from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]/'src/art/assets'
source=Path(r'C:\Users\User\.codex\generated_images\01a0b26d-99e2-72a1-a918-c9892a090180')
out=root/'catch';out.mkdir(exist_ok=True)
im=Image.open(source/'exec-c03024c1-9c2f-41bd-92bb-50f487457e99.png').convert('RGBA');w,h=im.size
for name,rect in [('mint',(0,0,.5,.45)),('peach',(.5,0,1,.445)),('yellow',(0,.5,.5,1)),('bear',(.5,.45,1,1))]:
 cell=im.crop(tuple(round(v*(w if i%2==0 else h)) for i,v in enumerate(rect)))
 bounds=cell.getchannel('A').point(lambda a:255 if a>128 else 0).getbbox()
 cell=cell.crop(bounds);cell.thumbnail((320,360),Image.Resampling.LANCZOS)
 cell.save(out/(name+'-v1.webp'),quality=84,method=6)
Image.open(source/'exec-809408ef-942b-4c1d-9e51-387e1df2a2ce.png').convert('RGB').resize((800,1280),Image.Resampling.LANCZOS).save(root/'world/catch-bg-v1.webp',quality=76,method=6)
