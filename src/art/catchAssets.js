const assets=new Map();
export function catchImage(name){
 if(typeof Image==='undefined')return null;
 if(!assets.has(name)){
  const image=new Image(),entry={image,ready:false};assets.set(name,entry);
  image.onload=()=>{entry.ready=!!image.naturalWidth;};image.onerror=()=>{entry.ready=false;};
  image.decoding='async';image.src=new URL(`./assets/catch/${name}-v1.webp`,import.meta.url).href;
 }
 const entry=assets.get(name);return entry.ready?entry.image:null;
}
export function preloadCatch(){['mint','peach','yellow','bear'].forEach(catchImage);}
export function drawGift(c,x,y,r,variant){
 const image=catchImage(['mint','peach','yellow'][variant%3]);if(!image)return false;
 const h=r*2.4,w=h*image.naturalWidth/image.naturalHeight;
 c.drawImage(image,x-w/2,y-h*.62,w,h);return true;
}
