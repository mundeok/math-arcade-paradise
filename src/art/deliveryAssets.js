const assets=new Map();
export function deliveryImage(name){
 if(typeof Image==='undefined')return null;
 if(!assets.has(name)){
  const image=new Image(),entry={image,ready:false};assets.set(name,entry);
  image.onload=()=>{entry.ready=!!image.naturalWidth;};image.onerror=()=>{entry.ready=false;};
  image.decoding='async';image.src=new URL(`./assets/delivery/${name}-v1.webp`,import.meta.url).href;
 }
 const entry=assets.get(name);return entry.ready?entry.image:null;
}
export function preloadDelivery(){['mint','peach','truck','depart','background'].forEach(deliveryImage);}
export function deliverySprite(c,name,x,y,w,h){
 const im=deliveryImage(name);if(!im)return false;
 const scale=Math.min(w/im.naturalWidth,h/im.naturalHeight),dw=im.naturalWidth*scale,dh=im.naturalHeight*scale;
 c.drawImage(im,x-dw/2,y-dh/2,dw,dh);return true;
}
