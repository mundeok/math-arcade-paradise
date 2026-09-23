const assets=new Map();
export function shootImage(name){
 if(typeof Image==='undefined')return null;
 if(!assets.has(name)){
  const image=new Image(),entry={image,ready:false};assets.set(name,entry);
  image.onload=()=>{entry.ready=!!image.naturalWidth;};image.onerror=()=>{entry.ready=false;};
  image.decoding='async';image.src=new URL(`./assets/shoot/${name}-v1.webp`,import.meta.url).href;
 }
 const entry=assets.get(name);return entry.ready?entry.image:null;
}
export function preloadShoot(){['teal','purple','peach','ship'].forEach(shootImage);}
