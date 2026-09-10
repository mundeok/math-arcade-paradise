// Original storybook scenery, drawn in Canvas. Decorative only: no RNG, input,
// answer data, timers or score changes. All geometry derives from L or a size.
import { L } from '../core/layout.js';
import { roundRect } from '../core/ui.js';

const WORLDS = {
  g01_combo: ['#b8a7ee','#fbd6e5','#7468ab','cloud'],
  g02_catch: ['#8ed9e9','#e6f8dc','#41889d','cloud'],
  g04_timing: ['#c4b0ee','#fbe5ce','#7b64a5','clock'],
  g05_match: ['#b8e7d3','#f8edc8','#548579','garden'],
  g06_stack: ['#acddeb','#ffedc5','#618ba0','town'],
  g07_shoot: ['#97d5eb','#d2ebfa','#527fa2','workshop'],
  g08_chain: ['#65cbd8','#36a8bc','#327a99','sea'],
  g09_balloon: ['#e9b0d3','#fff0ce','#a66d9c','festival'],
  g10_remain: ['#8cdad8','#f9e9b3','#478c98','island'],
  g11_farm: ['#bce5bc','#f6efc0','#67976b','garden'],
};

function ellipse(c,x,y,rx,ry,color) {
  c.beginPath(); c.ellipse(x,y,rx,ry,0,0,Math.PI*2); c.fillStyle=color; c.fill();
}
function panel(c,x,y,w,h,r,color,edge) {
  roundRect(c,x,y,w,h,r); c.fillStyle=color; c.fill();
  if(edge) {c.strokeStyle=edge;c.lineWidth=L.gu(.06);c.stroke();}
}
function polygon(c,pts,color) {
  c.beginPath(); pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));
  c.closePath();c.fillStyle=color;c.fill();
}
function cloud(c,x,y,w,color='#fffcf0') {
  ellipse(c,x,y,w*.48,w*.15,color);
  ellipse(c,x-w*.22,y-w*.08,w*.2,w*.18,color);
  ellipse(c,x+w*.04,y-w*.15,w*.24,w*.24,color);
  ellipse(c,x+w*.28,y-w*.045,w*.19,w*.15,color);
}
function rainbow(c,x,y,r) {
  c.save();c.globalAlpha*=.6;c.lineWidth=r*.12;
  ['#f69bab','#ffd68b','#ffffc4','#9bd8ba','#a5b7ef'].forEach((color,i)=>{
    c.beginPath();c.arc(x,y,r-i*r*.12,Math.PI,Math.PI*2);c.strokeStyle=color;c.stroke();
  });c.restore();
}
function hill(c,x,y,w,h,color) {
  c.beginPath();c.moveTo(x-w,y);c.quadraticCurveTo(x,y-h,x+w,y);
  c.lineTo(x+w,L.H);c.lineTo(x-w,L.H);c.closePath();c.fillStyle=color;c.fill();
}
function blossom(c,x,y,s,color) {
  for(let i=0;i<5;i++) {
    const a=i*Math.PI*2/5;
    ellipse(c,x+Math.cos(a)*s*.45,y+Math.sin(a)*s*.45,s*.35,s*.35,color);
  }
  ellipse(c,x,y,s*.23,s*.23,'#ffdf8b');
}

/** A little seed creature; decorative spectators never carry answer numbers. */
export function drawWorldBuddy(c,x,y,size,time=0,kind='seed') {
  c.save();c.translate(x,y);c.scale(size,size);c.lineWidth=.035;c.lineJoin='round';
  ellipse(c,0,.44,.42,.085,'#416d7133');
  c.translate(0,Math.sin(time*1.7)*.025);
  const col=kind==='cloud'?'#fffbed':kind==='bot'?'#f2c477':'#c8e59b';
  ellipse(c,-.22,.4,.12,.065,'#dcac75');ellipse(c,.22,.4,.12,.065,'#dcac75');
  if(kind==='seed') {
    ellipse(c,-.11,-.43,.17,.07,'#71ac7a');ellipse(c,.11,-.49,.17,.075,'#92c387');
  } else if(kind==='bot') {
    c.beginPath();c.moveTo(0,-.35);c.lineTo(0,-.57);c.strokeStyle='#7b8795';c.stroke();
    ellipse(c,0,-.58,.065,.065,'#f1918e');
  }
  c.beginPath();c.ellipse(0,0,.36,.42,0,0,Math.PI*2);c.fillStyle=col;c.fill();
  c.strokeStyle='#547478';c.stroke();
  ellipse(c,-.31,.09,.105,.07,col);ellipse(c,.31,.09,.105,.07,col);
  ellipse(c,-.13,-.04,.035,.05,'#384963');ellipse(c,.13,-.04,.035,.05,'#384963');
  ellipse(c,-.23,.08,.064,.033,'#efa497');ellipse(c,.23,.08,.064,.033,'#efa497');
  c.beginPath();c.arc(0,.06,.08,0,Math.PI);c.strokeStyle='#384963';c.lineWidth=.022;c.stroke();
  c.restore();
}

function town(c,color) {
  const y=L.zone.floor-L.gu(1.2);
  for(let i=0;i<7;i++) {
    const x=L.gu(.5+i*3),h=L.gu(1.8+(i%3)*.45),w=L.gu(2.3);
    panel(c,x,y-h,w,h+L.gu(3),L.gu(.12),i%2?'#ffe5bd':'#efd2bb');
    polygon(c,[[x-L.gu(.15),y-h],[x+w/2,y-h-L.gu(.85)],[x+w+L.gu(.15),y-h]],color);
    for(let k=0;k<2;k++) panel(c,x+L.gu(.3+k*1),y-h+L.gu(.4),L.gu(.6),L.gu(.7),L.gu(.13),'#a9d7d9');
  }
}

function sea(c,t) {
  // Broad, faint water ripples; no small bright circles resembling tappable bubbles.
  c.save();c.strokeStyle='#e1fff22e';c.lineWidth=L.gu(.065);
  for(let row=0;row<6;row++) {
    const y=L.zone.problem+L.gu(4+row*3.3);
    c.beginPath();c.moveTo(-L.gu(1),y);
    for(let col=0;col<5;col++) {
      const x=L.gu(col*5),dy=Math.sin(t*.35+row+col)*L.gu(.3);
      c.bezierCurveTo(x,y-L.gu(.9)+dy,x+L.gu(2),y+L.gu(1.1)+dy,x+L.gu(5),y);
    } c.stroke();
  }c.restore();
  hill(c,L.gu(4),L.zone.floor+L.gu(.9),L.gu(8),L.gu(2),'#f0e3ad');
  hill(c,L.W-L.gu(2),L.zone.floor+L.gu(1.4),L.gu(9),L.gu(1.7),'#fff0c1');
  for(const side of [-1,1]) for(let i=0;i<4;i++) {
    const x=side<0?L.gu(.3+i*.55):L.W-L.gu(.3+i*.55),y=L.H;
    c.beginPath();c.moveTo(x,y);
    c.bezierCurveTo(x+side*L.gu(.5),y-L.gu(1.4),x-side*L.gu(.5),y-L.gu(3.2),x,y-L.gu(3+i*.5));
    c.lineWidth=L.gu(.16);c.strokeStyle=i%2?'#70ba9c':'#8dceb0';c.lineCap='round';c.stroke();
  }
  blossom(c,L.gu(1.7),L.zone.floor+L.gu(.6),L.gu(.4),'#f2b4b1');
}

/** Header contrast plates only. Also used on top of the racing scenery. */
export function drawWorldHeader(c,id) {
  c.save();
  // Core owns score/hearts; place a quiet dark shelf behind their original positions.
  panel(c,0,0,L.W,L.zone.hudBottom,L.gu(.45),'#314960');
  // Racing already has a compact question chip. A full board would hide gates
  // near the horizon and shorten their visible approach time.
  if(id==='g03_racing') {c.restore();return;}
  const top=L.zone.hudBottom+L.gu(.2);
  let bottom=L.zone.problem+L.gu(2.75);
  if(id==='g06_stack') bottom=L.zone.problem+L.gu(4.6);
  if(id==='g09_balloon') bottom=L.zone.problem+L.gu(3.6);
  if(id==='g01_combo') bottom=L.gu(14.7);
  if(id==='g10_remain') bottom=L.zone.problem+L.gu(1.8);
  panel(c,L.safe-L.gu(.15),top,L.W-L.safe*2+L.gu(.3),bottom-top,L.gu(.55),'#38556d','#c8ede1');
  // Inset top studs evoke a little hanging noticeboard, not a new input.
  for(const x of [L.safe+L.gu(.3),L.W-L.safe-L.gu(.3)]) {
    ellipse(c,x,top+L.gu(.25),L.gu(.055),L.gu(.055),'#accfc9');
  }
  c.restore();
}

export function drawArcadeWorld(c,id,time=0) {
  const [sky,base,accent,kind]=WORLDS[id] || WORLDS.g02_catch;
  c.save();
  const g=c.createLinearGradient(0,L.zone.hudBottom,0,L.H);
  g.addColorStop(0,sky);g.addColorStop(1,base);c.fillStyle=g;c.fillRect(0,0,L.W,L.H);
  if(kind==='sea') sea(c,time);
  else {
    const drift=Math.sin(time*.16)*L.gu(.25);
    if(['cloud','festival','clock'].includes(kind)) {
      rainbow(c,L.W-L.gu(1.8),L.zone.problem+L.gu(7),L.gu(4));
      cloud(c,L.W-L.gu(4)+drift,L.zone.problem+L.gu(7),L.gu(3));
    }
    c.save();c.globalAlpha=.68;
    cloud(c,L.gu(1.1)+drift,L.zone.problem+L.gu(4.6),L.gu(3.7));
    cloud(c,L.W-L.gu(.8)-drift,L.zone.problem+L.gu(10),L.gu(3.6));
    cloud(c,L.gu(.7)-drift,L.zone.problem+L.gu(16),L.gu(2.8));
    c.restore();
    if(kind==='town'||kind==='workshop') town(c,accent);
    else if(kind==='festival') {
      for(const side of [-1,1]) {
        const x=side<0?L.gu(1):L.W-L.gu(1),y=L.zone.floor+L.gu(.5),w=L.gu(3);
        panel(c,x-w/2,y,w,L.gu(2),L.gu(.1),'#fff2d4');
        polygon(c,[[x-w*.7,y],[x,y-L.gu(2)],[x+w*.7,y]],'#d999b9');
        polygon(c,[[x-w*.25,y],[x,y-L.gu(2)],[x+w*.25,y]],'#fff1cf');
      }
    } else {
      hill(c,L.gu(3),L.zone.floor+L.gu(.8),L.gu(9),L.gu(3),'#a9d6ad');
      hill(c,L.W,L.zone.floor+L.gu(.6),L.gu(10),L.gu(2.4),'#c5dfb0');
    }
    if(kind==='cloud'||kind==='clock') {
      for(let i=0;i<5;i++) cloud(c,L.gu(i*5),L.zone.floor+L.gu(1.5),L.gu(5.5),'#fff8e8');
    } else if(kind==='garden'||kind==='island') {
      for(const x of [L.gu(.8),L.W-L.gu(.9)]) blossom(c,x,L.zone.floor+L.gu(.6),L.gu(.35),'#fff2d5');
    }
  }
  drawWorldBuddy(c,L.gu(1.35),L.H-L.gu(.95),L.gu(1.4),time,kind==='workshop'?'bot':kind==='cloud'?'cloud':'seed');
  drawWorldBuddy(c,L.W-L.gu(1.2),L.H-L.gu(.9),L.gu(1.15),time+2,'seed');
  drawWorldHeader(c,id);
  c.restore();
}
