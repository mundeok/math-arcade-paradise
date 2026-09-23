// Sea-jelly art: colour/face depends ONLY on slot, never on correctness.
import { L } from '../core/layout.js';
import { font, roundRect } from '../core/ui.js';
import { chainImage } from './chainAssets.js';
const INK='#3f526f',COLORS=['#ffd29d','#b8e6d3','#e8c9f0','#b7ddf5'];
function oval(c,x,y,rx,ry,color){c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=color;c.fill();}
function panel(c,x,y,w,h,color,r=L.gu(.5)){
  roundRect(c,x,y,w,h,r);c.fillStyle=color;c.fill();c.lineWidth=L.gu(.07);c.strokeStyle=INK;c.stroke();
}
function txt(c,t,x,y,size,color=INK){c.fillStyle=color;c.font=font(size);c.textAlign='center';c.textBaseline='middle';c.fillText(t,x,y);}
function jelly(c,x,y,r,value,color,selected,t,variant){
  c.save();c.translate(x,y);const bounce=selected?1.04+Math.sin(t*11)*.025:1+Math.sin(t*2.2+x)*.012;
  c.scale(bounce,1/bounce);
  const image=chainImage('jellies');
  if(image){
    const sw=image.naturalWidth/2,sh=image.naturalHeight/2;
    c.drawImage(image,(variant%2)*sw,Math.floor(variant/2)*sh,sw,sh,-r*1.23,-r*1.23,r*2.46,r*2.46);
    // Keep the badge above the eyes; retain the readable numeric type size.
    roundRect(c,-r*.62,-r*.72,r*1.24,r*.68,r*.2);c.fillStyle='#fffdf3';c.fill();
    txt(c,String(value),0,-r*.36,L.font(.043));
  }else{
  oval(c,0,r*.92,r*.82,r*.14,'#68b9bc');
  for(const s of [-1,0,1])oval(c,s*r*.5,r*.71,r*.22,r*.25,color);
  panel(c,-r,-r,r*2,r*1.8,color,r*.65);
  oval(c,-r*.56,-r*.62,r*.2,r*.09,'#fff8ee');
  // A light number label protects contrast on every jelly colour.
  roundRect(c,-r*.83,-r*.53,r*1.66,r*.95,r*.26);c.fillStyle='#fffdf3';c.fill();
  txt(c,String(value),0,-r*.045,L.font(.043));
  for(const s of [-1,1]){
    oval(c,s*r*.19,r*.58,r*.036,r*.054,INK);
    oval(c,s*r*.4,r*.65,r*.12,r*.048,'#ef9caa');
  }
  c.beginPath();c.arc(0,r*.6,r*.09,0,Math.PI);c.lineWidth=L.gu(.045);c.strokeStyle=INK;c.stroke();
  }
  if(selected){roundRect(c,-r-L.gu(.1),-r-L.gu(.1),r*2+L.gu(.2),r*2+L.gu(.2),r*.7);c.lineWidth=L.gu(.09);c.strokeStyle='#fff0a0';c.stroke();}
  c.restore();
}
export function drawChainScene(c,g){
  c.save();try{
    const bg=c.createLinearGradient(0,L.zone.hudBottom,0,L.H);
    bg.addColorStop(0,g.wasFever?'#ffecb3':'#abe5ed');bg.addColorStop(1,g.wasFever?'#ade1d3':'#58b9ce');
    c.fillStyle=bg;c.fillRect(0,0,L.W,L.H);
    const image=chainImage('background');
    if(image){
      c.drawImage(image,0,0,L.W,L.H);
      if(g.wasFever){c.fillStyle='rgba(255,233,155,.24)';c.fillRect(0,0,L.W,L.H);}
    }
    for(let i=0;i<10;i++){
      const x=i%2?L.W-L.safe*.6:L.safe*.6,y=L.zone.playTop+(L.gu(i*3.9)-g.time*L.gu(.25)+L.H)%L.H;
      c.beginPath();c.arc(x,y,L.gu(.14+(i%3)*.05),0,Math.PI*2);c.strokeStyle='#e4f7ef';c.lineWidth=L.gu(.035);c.stroke();
    }
    if(!image)oval(c,L.W/2,L.H+L.gu(2),L.W*.8,L.gu(5),'#e9e4bf');
    g.engine.fever?.renderGauge(c,{x:L.safe,y:L.zone.gauge,w:L.W-L.safe*2,h:L.gu(.5)});
    panel(c,L.safe,L.zone.problem-L.gu(.8),L.W-L.safe*2,L.gu(4.35),'#fff9e9');
    txt(c,g.divWave?`${g.D}로 나누어떨어지는 수!`:`${g.D}단 배수를 이어봐!`,L.W/2,L.zone.problem+L.gu(.1),L.font(.043));
    txt(c,`${Math.ceil(g.remaining)}초  ·  ${g.poppedCount}개 팡!  ·  최고 ${g.longest}연결`,L.W/2,L.zone.problem+L.gu(1.55),L.font(.026));
    const n=g.path.length;
    const instruction=g.cue>0?(g.wasFever?'피버! 길게 쓸어 담아봐!':'숫자를 보고 출발!'):
      n?`${n}개 연결 · 모두 맞히면 ×${g._mult(n)}!`:'쭉 연결하고, 손을 떼면 팡!';
    txt(c,instruction,L.W/2,L.zone.problem+L.gu(2.75),L.font(.025),'#716278');
    const r=g._layout();
    const boardY=r.top-L.gu(.1),boardH=r.step*4+L.gu(.2),boardW=L.W-L.safe*2;
    // An opaque quiet surface with a shallow molded rim, not scenery between tiles.
    panel(c,L.safe,boardY+L.gu(.1),boardW,boardH,'#80b6b1',L.gu(.75));
    const surface=c.createLinearGradient(0,boardY,0,boardY+boardH);
    surface.addColorStop(0,'#eaf8ef');surface.addColorStop(.5,'#dcefe6');surface.addColorStop(1,'#c6e2d9');
    panel(c,L.safe,boardY,boardW,boardH,surface,L.gu(.75));
    roundRect(c,L.safe+L.gu(.12),boardY+L.gu(.12),boardW-L.gu(.24),boardH-L.gu(.24),L.gu(.64));
    c.strokeStyle='rgba(255,255,255,.75)';c.lineWidth=L.gu(.07);c.stroke();
    if(n){
      c.beginPath();g.path.forEach((i,j)=>{const p=r.points[i];if(j)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y);});
      c.lineJoin='round';c.lineCap='round';c.strokeStyle='#5989a3';c.lineWidth=L.gu(n>=8?.48:n>=5?.35:.23);c.stroke();
      c.strokeStyle='#ffdc86';c.lineWidth=L.gu(n>=8?.28:.12);c.stroke();
    }
    g.board.forEach((b,i)=>{
      const variant=(i*7+Math.floor(i/4))%4;
      const p=r.points[i];jelly(c,p.x,p.y,r.r,b.value,COLORS[variant],g.path.includes(i),g.time,variant);
      if(g.keyboardMode&&g.cursor===i){
        roundRect(c,p.x-r.r-L.gu(.1),p.y-r.r-L.gu(.1),r.r*2+L.gu(.2),r.r*2+L.gu(.2),L.gu(.5));
        c.setLineDash([L.gu(.12),L.gu(.1)]);c.lineWidth=L.gu(.06);c.strokeStyle=INK;c.stroke();c.setLineDash([]);
      }
      if(g.path.includes(i)){
        oval(c,p.x+r.r*.78,p.y-r.r*.72,L.gu(.25),L.gu(.25),'#fff2b4');
        txt(c,String(g.path.indexOf(i)+1),p.x+r.r*.78,p.y-r.r*.72,L.font(.016));
      }
    });
    for(const p of g.pops){
      const age=p.t-p.delay;if(age<0||age>.14)continue;const f=age/.14;
      c.save();c.globalAlpha=1-f;c.strokeStyle='#fff8c5';c.lineWidth=L.gu(.11)*(1-f);
      c.beginPath();c.arc(p.x,p.y,r.r*(.7+f*.7),0,Math.PI*2);c.stroke();c.restore();
    }
    const footerY=boardY+boardH+L.gu(.12),footerH=L.H-L.gu(.22)-footerY;
    const fy=footerY+footerH*.3;
    if(image)panel(c,L.safe,footerY,L.W-L.safe*2,footerH,'rgba(255,249,233,.97)',L.gu(.35));
    txt(c,g.feedback?.text||(g.wasFever?'무적! 함정 실수도 괜찮아':'3개 ×1.5  ·  5개 ×2  ·  8개 ×3'),L.W/2,fy,L.font(.027),g.feedback?.bad?'#8b4358':INK);
    txt(c,g.keyboardMode?'방향키 이동 · Space 연결 · Enter 팡!':'대각선 OK · 되짚으면 취소',L.W/2,footerY+footerH*.73,L.font(.023),'#567581');
  }finally{c.restore();}
}
