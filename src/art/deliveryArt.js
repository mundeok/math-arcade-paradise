// Original Canvas postal village. Pure decoration: no RNG or gameplay writes.
// Geometry comes from L or the supplied shape size; save/restore at the boundary.
import { L } from '../core/layout.js';
import { font, roundRect } from '../core/ui.js';

const INK='#4c4256', PAPER='#fff9e9', PEACH='#ffba94', MINT='#86d5bb';
const clamp=v=>Math.max(0,Math.min(1,v));
function oval(c,x,y,rx,ry,color,edge=false){
  c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=color;c.fill();
  if(edge){c.strokeStyle=INK;c.lineWidth=L.gu(.085);c.stroke();}
}
function box(c,x,y,w,h,color,r=L.gu(.45),edge=true){
  roundRect(c,x,y,w,h,r);c.fillStyle=color;c.fill();
  if(edge){c.strokeStyle=INK;c.lineWidth=L.gu(.085);c.stroke();}
}
function text(c,t,x,y,size,color=INK){
  c.font=font(size);c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.fillText(t,x,y);
}
function line(c,pts,color=INK,width=L.gu(.085)){
  c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();
}
function face(c,x,y,size,happy=false){
  for(const s of [-1,1]){
    oval(c,x+s*size*.36,y+size*.13,size*.15,size*.08,'#f493a1');
    if(happy)line(c,[[x+s*size*.22-size*.055,y],[x+s*size*.22,y-size*.04],[x+s*size*.22+size*.055,y]],INK,size*.04);
    else oval(c,x+s*size*.22,y,size*.047,size*.07,INK);
  }
  c.beginPath();c.arc(x,y+size*.04,size*.115,0,Math.PI);c.strokeStyle=INK;c.lineWidth=size*.035;c.stroke();
}
function buddy(c,x,y,size,color,kind='bun',happy=false){
  if(kind==='bun')for(const s of [-1,1])oval(c,x+s*size*.23,y-size*.47,size*.12,size*.27,color,true);
  else for(const s of [-1,1])oval(c,x+s*size*.28,y-size*.32,size*.19,size*.18,color,true);
  oval(c,x,y,size*.49,size*.4,color,true);face(c,x,y,size*.7,happy);
}
function cloud(c,x,y,w){
  oval(c,x,y,w*.48,w*.13,'#fffdf2');oval(c,x-w*.21,y-w*.06,w*.19,w*.15,'#fffdf2');
  oval(c,x+w*.07,y-w*.12,w*.21,w*.2,'#fffdf2');
}
function backdrop(c,t,fever){
  const grad=c.createLinearGradient(0,L.zone.hudBottom,0,L.H);grad.addColorStop(0,fever?'#ffe5a5':'#a4e3ef');grad.addColorStop(1,'#eff8d3');
  c.fillStyle=grad;c.fillRect(0,0,L.W,L.H);
  cloud(c,L.safe+L.gu(1),L.zone.playTop+L.gu(1),L.gu(4));
  cloud(c,L.W-L.gu(1.4),L.zone.playTop+L.gu(3),L.gu(4.8));
  oval(c,L.gu(1),L.zone.floor,L.gu(10),L.gu(14),'#c8e6ac');
  oval(c,L.W-L.gu(1),L.zone.floor,L.gu(10),L.gu(12),'#d8ecb5');
  // A two-branch cream path, without a moving countdown hidden in the art.
  c.beginPath();c.moveTo(L.W/2-L.gu(1.6),L.zone.playTop+L.gu(3));
  c.lineTo(L.W/2+L.gu(1.6),L.zone.playTop+L.gu(3));c.lineTo(L.W,L.H);c.lineTo(0,L.H);c.closePath();c.fillStyle='#fff5dc';c.fill();
  for(let i=0;i<6;i++){
    const x=i%2?L.W-L.safe-L.gu(.65):L.safe+L.gu(.65),y=L.zone.playTop+L.gu(4+i*3.1);
    line(c,[[x,y],[x,y+L.gu(.45)]],'#73a77d',L.gu(.055));
    for(let j=0;j<5;j++){const a=j*Math.PI*2/5;oval(c,x+Math.cos(a)*L.gu(.14),y+Math.sin(a)*L.gu(.14),L.gu(.13),L.gu(.13),i%2?'#fffef0':'#ffd2ca');}
    oval(c,x,y,L.gu(.075),L.gu(.075),'#edb952');
  }
  for(const s of [-1,1])buddy(c,L.W/2+s*L.gu(8.1),L.zone.floor+L.gu(1.1)+Math.sin(t*2+s)*L.gu(.035),L.gu(.65),s<0?MINT:PEACH,s<0?'bear':'bun');
}
function header(c,g){
  const x=L.safe,y=L.zone.problem-L.gu(.8),w=L.W-L.safe*2;
  box(c,x,y+L.gu(.1),w,L.gu(3.45),'#d5bda0',L.gu(.6),false);
  box(c,x,y,w,L.gu(3.45),PAPER,L.gu(.6));
  // Clock medallion: the round timer and per-card clock have separate labels.
  oval(c,x+L.gu(1.15),y+L.gu(1.05),L.gu(.62),L.gu(.62),'#ffd687',true);
  line(c,[[x+L.gu(1.15),y+L.gu(.63)],[x+L.gu(1.15),y+L.gu(1.05)],[x+L.gu(1.43),y+L.gu(1.15)]]);
  text(c,`${Math.ceil(g.remaining)}초`,x+L.gu(3.1),y+L.gu(1.05),L.font(.039));
  text(c,`${g.delivered}개 배송`,L.W-L.safe-L.gu(3.1),y+L.gu(1.05),L.font(.032));
  text(c,g.wasFever?'보너스 트럭 · 무적 배송!':`${g.loads+1}번째 트럭 출발 준비`,L.W/2,y+L.gu(2.55),L.font(.025),'#796579');
  for(let i=0;i<8;i++){
    const sx=L.W/2+(i-3.5)*L.gu(.88),sy=y+L.gu(4.02);
    box(c,sx-L.gu(.32),sy-L.gu(.3),L.gu(.64),L.gu(.6),i<g.inLoad?'#ffc578':'#fffdf0',L.gu(.13));
    if(i<g.inLoad)line(c,[[sx-L.gu(.15),sy],[sx-L.gu(.025),sy+L.gu(.12)],[sx+L.gu(.18),sy-L.gu(.14)]],INK,L.gu(.065));
  }
}
function parcel(c,r,label,preview=false,happy=false){
  const {x,y,w,h}=r;
  if(!preview){
    oval(c,x+w*.27,y+h+L.gu(.05),L.gu(.55),L.gu(.17),INK);
    oval(c,x+w*.73,y+h+L.gu(.05),L.gu(.55),L.gu(.17),INK);
  }
  box(c,x,y+L.gu(.12),w,h,'#c9af95',L.gu(.5),false);
  box(c,x,y,w,h,preview?'#ffdeb2':'#ffcb91',L.gu(.5));
  box(c,x+w*.46,y+L.gu(.02),w*.08,h-L.gu(.04),'#ffe8b8',L.gu(.02),false);
  const pad=preview?L.gu(.2):L.gu(.42),labelH=preview?h-L.gu(.35):h*.62;
  box(c,x+pad,y+pad,w-pad*2,labelH,PAPER,L.gu(.3),false);
  text(c,label,x+w/2,y+pad+labelH/2,L.font(preview?.031:.074));
  if(!preview)face(c,x+w/2,y+h*.84,L.gu(1.75),happy);
}
function house(c,g,b,i){
  const x=b.x,y=b.y,w=b.w,h=b.h,color=i===0?MINT:PEACH;
  const happy=g.flights.some(f=>f.side===i),pressed=g.armed===i;
  c.save();c.translate(0,pressed?L.gu(.1):happy?-L.gu(.05):0);
  oval(c,x+w/2,y+h+L.gu(.24),w*.47,L.gu(.24),'#b4cda2');
  buddy(c,x+w/2,y-L.gu(1.14),L.gu(2.25),color,i===0?'bear':'bun',happy);
  box(c,x,y+L.gu(.13),w,h,'#9b998c',L.gu(.65),false);
  box(c,x,y,w,h,color,L.gu(.65));
  box(c,x+L.gu(.35),y+L.gu(.35),w-L.gu(.7),h-L.gu(1.3),PAPER,L.gu(.45));
  // House colour and mascot are fixed by side, never by the right answer.
  text(c,String(g.targets[i]),x+w/2,y+L.gu(1.53),L.font(.065));
  const ax=x+(i===0?L.gu(.9):w-L.gu(.9)),ay=y+h-L.gu(.5),d=i===0?-1:1;
  line(c,[[ax-d*L.gu(.26),ay],[ax+d*L.gu(.26),ay]],INK,L.gu(.09));
  line(c,[[ax,ay-L.gu(.18)],[ax+d*L.gu(.26),ay],[ax,ay+L.gu(.18)]],INK,L.gu(.09));
  text(c,i===0?'왼쪽 · A':'오른쪽 · D',x+w/2,y+h-L.gu(.5),L.font(.024));
  c.restore();
}
function timer(c,g,r){
  const y=r.y+r.h+L.gu(.75),x=r.x+L.gu(.15),w=r.w-L.gu(.3);
  const safe=g.wasFever||g.cue>0,ratio=safe?1:clamp(1-g.cardAge/g._cardSeconds());
  box(c,x,y,w,L.gu(.34),'#fffaf0',L.gu(.17));
  if(ratio>0)box(c,x+L.gu(.055),y+L.gu(.055),(w-L.gu(.11))*ratio,L.gu(.23),safe?'#efc362':ratio>.3?'#69bea6':'#e59a73',L.gu(.11),false);
  text(c,g.wasFever?'피버! 카드 시간 걱정 없이':g.cue>0?'목적지 확인 중':`이 카드 · ${Math.max(0,g._cardSeconds()-g.cardAge).toFixed(1)}초`,L.W/2,y+L.gu(.87),L.font(.024),'#706177');
}
function ready(c,g,r){
  text(c,'두 갈래 배송',L.W/2,L.zone.problem+L.gu(.4),L.font(.056));
  text(c,'숲속 친구들에게 택배를 보내요',L.W/2,L.zone.problem+L.gu(2),L.font(.027),'#5d6676');
  buddy(c,L.W/2,L.zone.playTop+L.gu(4.5),L.gu(2.4),MINT,'bear',true);
  parcel(c,{x:r.card.x+L.gu(.8),y:r.card.y-L.gu(.2),w:r.card.w-L.gu(1.6),h:L.gu(3.6)},'6 × 4');
  text(c,'◀ 24       32 ▶',L.W/2,L.zone.controls-L.gu(3.6),L.font(.04));
  text(c,`한 판 60초 · 카드 ${g._cardSeconds()}초 · 8개마다 출발!`,L.W/2,L.zone.controls-L.gu(2.2),L.font(.025));
  for(const [b,t,color] of [[r.start,'배송 시작!',MINT],[r.legacy,'기존 콤보와 비교하기',PAPER]]){
    box(c,b.x,b.y+L.gu(.14),b.w,b.h,'#a5bc9d',L.gu(.7),false);box(c,b.x,b.y,b.w,b.h,color,L.gu(.7));
    text(c,t,b.x+b.w/2,b.y+b.h/2,L.font(.034));
  }
}
export function drawDeliveryScene(c,g){
  c.save();try{
    backdrop(c,g.time,g.wasFever);
    const r=g._layout();
    if(g.phase==='ready'){ready(c,g,r);return;}
    g.engine.fever?.renderGauge(c,{x:L.safe,y:L.zone.gauge,w:L.W-L.safe*2,h:L.gu(.5)});
    header(c,g);
    for(let i=2;i>=1;i--){
      const w=r.card.w*(i===1?.83:.67),y=r.card.y-L.gu(i===1?1.7:3.1);
      parcel(c,{x:L.W/2-w/2,y,w,h:L.gu(1.38)},g.queue[i]?.text||'',true);
    }
    parcel(c,r.card,g.queue[0]?.text||'',false,g.flights.length>0);
    if(g.queue[0]?.fromReview)text(c,'다시 도전',r.card.x+r.card.w-L.gu(1.6),r.card.y+r.card.h-L.gu(.5),L.font(.02),'#685875');
    timer(c,g,r.card);
    const fy=L.zone.controls-L.gu(.85);
    if(g.feedback&&g.cue<=0)text(c,g.feedback.text,L.W/2,fy,L.font(.029),g.feedback.good?'#436f66':'#994f49');
    else text(c,g.cue>0?'두 집의 숫자를 확인해요!':'어느 집으로 보내줄까?',L.W/2,fy,L.font(.027),'#5d6973');
    r.buttons.forEach((b,i)=>house(c,g,b,i));
    for(const f of g.flights){
      const p=clamp(f.t/.22),b=r.buttons[f.side],cx=r.card.x+r.card.w/2;
      c.save();c.globalAlpha=1-p*.65;
      const x=cx+(b.x+b.w/2-cx)*p,y=r.card.y+r.card.h/2+(b.y-r.card.y)*p;
      box(c,x-L.gu(.5),y-L.gu(.38),L.gu(1),L.gu(.76),'#ffcd94',L.gu(.16));c.restore();
    }
    for(const d of g.departures){
      const x=L.W/2+(L.W+L.gu(4))*d.t/.7,y=L.zone.floor+L.gu(.45);
      box(c,x-L.gu(2),y-L.gu(1.35),L.gu(2.8),L.gu(1.35),'#ffd08b',L.gu(.3));
      box(c,x+L.gu(.8),y-L.gu(.9),L.gu(1.15),L.gu(.9),MINT,L.gu(.3));
      text(c,'택배',x-L.gu(.6),y-L.gu(.68),L.font(.021));
      for(const s of [-1,1])oval(c,x+s*L.gu(1.2),y+L.gu(.1),L.gu(.25),L.gu(.25),INK);
    }
  }finally{c.restore();}
}
