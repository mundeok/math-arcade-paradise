const names=['rabbit','puppy','sprout','closed','open','gem'];
const assets=new Map();
export function treasureImage(name){
  if(typeof Image==='undefined'||!names.includes(name))return null;
  if(!assets.has(name)){
    const image=new Image(),entry={image,status:'loading'};assets.set(name,entry);
    image.onload=()=>{entry.status=image.naturalWidth?'ready':'error';};
    image.onerror=()=>{entry.status='error';};image.decoding='async';
    image.src=new URL(`./assets/treasure/${name}-v1.webp`,import.meta.url).href;
  }
  const entry=assets.get(name);return entry.status==='ready'?entry.image:null;
}
export function preloadTreasureAssets(){names.forEach(treasureImage);}
export function treasureAssetStatus(){return Object.fromEntries(names.map(n=>[n,assets.get(n)?.status??'idle']));}
export function drawTreasureSprite(c,name,x,y,w,h){
  const image=treasureImage(name);if(!image)return false;
  const scale=Math.min(w/image.naturalWidth,h/image.naturalHeight);
  const dw=image.naturalWidth*scale,dh=image.naturalHeight*scale;
  c.drawImage(image,x-dw/2,y-dh/2,dw,dh);return true;
}
