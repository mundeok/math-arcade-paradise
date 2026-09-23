from PIL import Image
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'src/art/assets'
src=Path(r'C:\Users\User\.codex\generated_images\01a0b26d-99e2-72a1-a918-c9892a090180')
for file,folder,names in [('exec-7a54458a-3688-49b7-a4c8-394434abd6c5.png','timing',['bear','teal','pink','yellow']),('exec-2598030f-32b9-490f-858e-03a1ed4135d2.png','shoot',['teal','purple','peach','ship'])]:
 im=Image.open(src/file).convert('RGBA');w,h=im.size
 (root/folder).mkdir(exist_ok=True)
 for i,name in enumerate(names):
  x=(i%2)*w//2;y=(i//2)*h//2
  cell=im.crop((x,y,x+w//2,y+h//2))
  # Ignore nearly invisible sheet residue when measuring the object bounds.
  bounds=cell.getchannel('A').point(lambda a:255 if a>128 else 0).getbbox()
  cell=cell.crop(bounds);cell.thumbnail((320,320),Image.Resampling.LANCZOS)
  cell.save(root/folder/(name+'-v1.webp'),quality=84,method=6)
Image.open(src/'exec-f387cb92-415c-415a-958d-1377aebfb4e1.png').convert('RGB').resize((800,1280),Image.Resampling.LANCZOS).save(root/'world/shoot-bg-v1.webp',quality=78,method=6)
