let entry;
export function balloonImage(){
  if(typeof Image==='undefined')return null;
  if(!entry){
    const image=new Image();entry={image,status:'loading'};
    image.onload=()=>{entry.status=image.naturalWidth?'ready':'error';};
    image.onerror=()=>{entry.status='error';};image.decoding='async';
    image.src=new URL('./assets/balloon/balloons-v1.webp',import.meta.url).href;
  }
  return entry.status==='ready'?entry.image:null;
}
// Measured body bounds in the original 1536×1024 sheet, excluding knots/glow.
const bodies=[[101,24,386,421],[575,24,386,421],[1042,24,386,421],
  [101,532,386,421],[575,532,386,421],[1042,532,386,421]];
export function drawBalloonImage(c,x,y,rx,ry,variant){
  const image=balloonImage();if(!image)return false;
  const [sx,sy,sw,sh]=bodies[variant];
  c.save();c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.clip();
  c.drawImage(image,sx*image.naturalWidth/1536,sy*image.naturalHeight/1024,
    sw*image.naturalWidth/1536,sh*image.naturalHeight/1024,x-rx,y-ry,rx*2,ry*2);
  c.restore();return true;
}
