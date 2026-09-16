// 1인칭 레이싱: 승인된 로컬 이미지 + 원근을 공유하는 도로/게이트.
// 숫자는 코드로 그리며, 이미지 로드 실패 시에도 코드 드로잉으로 플레이 가능.
import { L } from '../core/layout.js';
import { font } from '../core/ui.js';
import { raceImage, preloadRaceAssets } from './raceAssets.js';

const U = n => L.gu(n);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mix = (a, b, t) => a + (b - a) * t;
export function cockpitLayout() {
  const dash = L.zone.floor - U(4.3);
  return { horizon: L.zone.playTop + U(4.2), dash,
    boost: { x: L.W - L.safe - U(5.55), y: dash + U(2.45), w: U(5.55), h: Math.max(L.minTouch,U(2.5)) },
    fuel: { x: L.safe, y: dash + U(2.45), w: U(5.55), h: U(2.5) },
    wheel: { x: L.W / 2, y: L.H + U(.6), r: U(4) } };
}

function path(ctx, points) {
  ctx.beginPath(); points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath();
}
function poly(ctx, points, color) { path(ctx,points); ctx.fillStyle=color; ctx.fill(); }
function box(ctx,x,y,w,h,r,color,stroke) {
  ctx.beginPath(); ctx.roundRect(x,y,w,h,Math.min(r,w/2,h/2));
  ctx.fillStyle=color;ctx.fill();
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=U(.055);ctx.stroke();}
}
function gradient(ctx,x,y,x2,y2,colors) {
  const g=ctx.createLinearGradient(x,y,x2,y2);
  colors.forEach((c,i)=>g.addColorStop(i/(colors.length-1),c)); return g;
}
function ellipse(ctx,x,y,rx,ry,c) {
  ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=c;ctx.fill();
}
function label(ctx,text,x,y,size,color='#f5fbff',align='center') {
  ctx.font=font(size);ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(text,x,y);
}

// 도로·게이트·기둥이 같은 카메라를 쓴다. x=차선 폭 단위, height=노면에서의 높이.
const CAMERA_HEIGHT = 1.7;
export function projectWorld(game, x, height, scale) {
  return { x:L.W/2+(x-(game.laneF-1))*scale, y:cockpitLayout().horizon+(CAMERA_HEIGHT-height)*scale };
}
export function roadProjection(game, p) {
  const {horizon,dash}=cockpitLayout();
  const nearScale=(dash+U(1)-horizon)/CAMERA_HEIGHT,scale=mix(U(.06),nearScale,clamp(p,0,1)**2);
  const center=projectWorld(game,0,0,scale);
  return {y:center.y,cx:center.x,half:1.5*scale,scale:scale/nearScale,laneSpacing:scale,worldScale:scale};
}
export function gateLayout(game) {
  const p=clamp(game.gate?.p||0,0,1), sec=game.gate?.sec||2.4;
  const lockP=1-.4/sec,reading=clamp(p/lockP,0,1),pass=clamp((p-lockP)/(1-lockP),0,1);
  // 마지막0.4초(선택 잠금) 전에는 가장자리 차선에서도 모든 숫자가 읽히는 거리.
  // 잠금 뒤에는 실제 원근 크기로 확대되어 운전석 위/옆을 지나간다.
  const scale=mix(U(3.2),U(3.7),reading)+U(11)*pass*pass;
  const center=projectWorld(game,0,2.08,scale),ground=projectWorld(game,0,0,scale);
  const w=.9*scale,h=.6*scale;
  return {y:center.y,h,w,spacing:scale,scale,groundY:ground.y,
    posts:[-1.56,1.56].map(x=>({top:projectWorld(game,x,2.43,scale),bottom:projectWorld(game,x,0,scale)})),
    panels:[-1,0,1].map(x=>{const c=projectWorld(game,x,2.08,scale);return {x:c.x-w/2,y:c.y-h/2,w,h};})};
}

function cloud(ctx,x,y,s) {
  ellipse(ctx,x,y,U(1.4)*s,U(.33)*s,'#e4f6ff');
  for(const [dx,dy,r] of [[-.9,0,.5],[-.25,-.25,.65],[.4,-.15,.6],[.95,.05,.4]])
    ellipse(ctx,x+U(dx)*s,y+U(dy)*s,U(r)*s,U(r*.65)*s,'#ffffff');
}
function backdrop(ctx,game) {
  const {horizon,dash}=cockpitLayout(),offset=(game.laneF-1)*U(.22);
  const image=raceImage('landscape');
  if(image){
    const h=(dash-horizon)/(1-.47),w=h*image.naturalWidth/image.naturalHeight;
    ctx.drawImage(image,(L.W-w)/2-offset,horizon-h*.47,w,h+U(.1));
    return;
  }
  ctx.fillStyle=gradient(ctx,0,L.zone.hudBottom,0,horizon,['#279dee','#79d3ff','#e8f8ff']);ctx.fillRect(0,0,L.W,horizon+U(1));
  ellipse(ctx,L.W-U(2.3),L.zone.problem+U(1.4),U(1.15),U(1.15),'#fff1b0');
  cloud(ctx,U(1.3)-offset,L.zone.problem+U(1.6),1.4);
  cloud(ctx,L.W-U(2)+offset,L.zone.problem-U(.6),1.1);
  cloud(ctx,L.W/2+U(2.5),horizon-U(.9),.7);
  for(let layer=0;layer<3;layer++) {
    ctx.beginPath();ctx.moveTo(-U(1),horizon+U(1));
    for(let i=0;i<=12;i++) {
      const x=i*L.W/11-U(.6)-offset*(layer+1);
      const y=horizon-U(.6)+(layer-1)*U(.42)-Math.abs(Math.sin(i*1.37+layer))*U(1.8-layer*.4);
      if(i===0)ctx.lineTo(x,y);
      else ctx.quadraticCurveTo(x-L.W/22,y-U(.7),x,y);
    }
    ctx.lineTo(L.W+U(1),horizon+U(1));ctx.closePath();ctx.fillStyle=['#8cbfc8','#6daf94','#6eae69'][layer];ctx.fill();
  }
  ctx.fillStyle=gradient(ctx,0,horizon,0,dash,['#93ce68','#7bbb4e','#5f9e45']);ctx.fillRect(0,horizon,L.W,dash-horizon+U(1));
  // 강과 먼 풍차는 풍경일 뿐이며 교통이나 새 판정은 추가하지 않는다.
  poly(ctx,[[L.W*.64,horizon],[L.W,horizon+U(2)],[L.W,horizon+U(3.4)],[L.W*.7,horizon+U(.6)]],'#8edbeb');
  const mx=U(2.1)-offset,my=horizon-U(.3);
  poly(ctx,[[mx-U(.35),my],[mx+U(.35),my],[mx+U(.22),my-U(1.6)],[mx-U(.22),my-U(1.6)]],'#fff2ca');
  poly(ctx,[[mx-U(.36),my-U(1.5)],[mx+U(.36),my-U(1.5)],[mx,my-U(2)]],'#d47b51');
  ctx.save();ctx.translate(mx,my-U(1.45));ctx.rotate(game.raceElapsed*.16);
  for(let i=0;i<4;i++){ctx.rotate(Math.PI/2);box(ctx,U(.1),-U(.055),U(.8),U(.13),U(.02),'#e7ae72','#fff3d4');}ctx.restore();
}

function road(ctx,game) {
  const a=roadProjection(game,0),b=roadProjection(game,1);
  const trapezoid=mult=>[[a.cx-a.half*mult,a.y],[a.cx+a.half*mult,a.y],[b.cx+b.half*mult,b.y],[b.cx-b.half*mult,b.y]];
  poly(ctx,trapezoid(1.09),'#e2d9b7');
  poly(ctx,trapezoid(1),gradient(ctx,0,a.y,0,b.y,['#979da7','#747c89','#596575']));
  const texture=raceImage('asphalt');
  if(texture){
    ctx.save();path(ctx,trapezoid(1));ctx.clip();
    // 2D 캔버스의 작은 가로 띠에 원근 텍스처를 투영. 노면이 배경과 함께 움직인다.
    const top=cockpitLayout().horizon,step=U(.16);
    for(let y=top+U(1);y<b.y;y+=step){
      const scale=(y-top)/CAMERA_HEIGHT,nextScale=(y+step-top)/CAMERA_HEIGHT;
      const z=U(10)/scale,nextZ=U(10)/nextScale;
      const center=projectWorld(game,0,0,scale);
      const v=((z-game.scrollPhase*15)%3+3)%3/3*texture.naturalHeight;
      const sh=Math.max(1,Math.min(texture.naturalHeight-v,(z-nextZ)/3*texture.naturalHeight));
      ctx.globalAlpha=clamp((y-top)/U(5),0,.52);
      ctx.drawImage(texture,0,v,texture.naturalWidth,sh,center.x-scale*1.5,y,scale*3,step+U(.015));
    }
    ctx.restore();
  }
  // 주기를 이동 거리로 적분해 부스터 중 같은 노면이 더 빠르게 흐른다.
  for(let i=0;i<24;i++) {
    const p=(i/24+game.scrollPhase)%1,q=Math.min(1,p+.45/24);
    const u=roadProjection(game,p),v=roadProjection(game,q);
    if(i%2===0)poly(ctx,[[u.cx-u.half,u.y],[u.cx+u.half,u.y],[v.cx+v.half,v.y],[v.cx-v.half,v.y]],'rgba(221,237,247,.012)');
    for(const lane of [-.5,.5]) {
      const x=u.cx+u.laneSpacing*lane,z=v.cx+v.laneSpacing*lane;
      poly(ctx,[[x-U(.055)*u.scale,u.y],[x+U(.055)*u.scale,u.y],[z+U(.12)*v.scale,v.y],[z-U(.12)*v.scale,v.y]],'#f5f4de');
    }
    for(const s of [-1,1]) {
      const x=u.cx+s*u.half,z=v.cx+s*v.half;
      poly(ctx,[[x,u.y],[x+s*U(.22)*u.scale,u.y],[z+s*U(.22)*v.scale,v.y],[z,v.y]],i%2?'#fff1cb':'#e6a668');
    }
  }
  // 연속 가드레일과 도로와 같은 원근의 지지대로 속도를 읽을 수 있다.
  for(const s of [-1,1]) {
    const pts=[];
    for(let i=0;i<=20;i++){const p=roadProjection(game,i/20);pts.push([p.cx+s*(p.half+U(.45)*p.scale),p.y-U(1.2)*p.scale]);}
    for(let k=0;k<2;k++) {
      ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y+U(.2)*k):ctx.moveTo(x,y+U(.2)*k));
      ctx.strokeStyle=k?'#869e9e':'#e5f0e7';ctx.lineWidth=U(.12);ctx.stroke();
    }
    for(let i=0;i<14;i++) {
      const p=roadProjection(game,(i/14+game.scrollPhase)%1),x=p.cx+s*(p.half+U(.45)*p.scale);
      ctx.strokeStyle='#d3e0d8';ctx.lineWidth=U(.2)*p.scale;ctx.beginPath();ctx.moveTo(x,p.y);ctx.lineTo(x,p.y-U(1.25)*p.scale);ctx.stroke();
    }
  }
}

function roadside(ctx,game) {
  // 고정 개수와 이동 위상. 렌더 중 난수나 무한한 객체 증가는 없다.
  const objs=[];
  for(let i=0;i<9;i++)for(const s of [-1,1])objs.push({p:(i/9+game.scrollPhase+(s===1?.057:0))%1,s,i});
  objs.sort((a,b)=>a.p-b.p);
  for(const o of objs) {
    const pr=roadProjection(game,o.p),scale=pr.scale*1.8,x=pr.cx+o.s*(pr.half+U(.75+o.i%3*.65)*pr.scale),y=pr.y;
    if(x<-U(5)||x>L.W+U(5))continue;
    ellipse(ctx,x+U(.4)*scale,y,U(1.3)*scale,U(.2)*scale,'rgba(42,87,49,.15)');
    const image=raceImage('tree');
    if(image){
      const h=U(10)*pr.scale*(1+(o.i%3)*.08),w=h*image.naturalWidth/image.naturalHeight;
      ctx.drawImage(image,x-w/2,y-h,w,h);continue;
    }
    box(ctx,x-U(.12)*scale,y-U(2)*scale,U(.24)*scale,U(2)*scale,U(.02),'#986e44');
    for(const [dx,dy,r] of [[-.55,-2,.8],[.45,-2.2,1],[0,-3,1]]) {
      const cx=x+U(dx)*scale,cy=y+U(dy)*scale,rr=U(r)*scale;
      const g=ctx.createRadialGradient(cx-rr*.3,cy-rr*.35,rr*.1,cx,cy,rr);
      g.addColorStop(0,'#b1dc61');g.addColorStop(.5,o.i%2?'#77bb46':'#63b368');g.addColorStop(1,'#367d52');ellipse(ctx,cx,cy,rr,rr,g);
    }
  }
}

function speedLines(ctx,game) {
  const strength=Math.max(game.boostVisual||0,game.engine?.fever?.active ? .35 : 0,(game.boostT||0)*.7);
  if(strength<.025)return;
  const {horizon,dash}=cockpitLayout();ctx.save();
  // 중앙 숫자 영역은 마스크 밖. 속도선은 화면 좌우에만 그린다.
  ctx.beginPath();ctx.rect(0,L.zone.hudBottom,L.safe+U(1.1),dash-L.zone.hudBottom);
  ctx.rect(L.W-L.safe-U(1.1),L.zone.hudBottom,L.safe+U(1.1),dash-L.zone.hudBottom);ctx.clip();
  for(let i=0;i<22;i++) {
    const t=(i/22+game.scrollPhase*1.2)%1,y=mix(L.zone.hudBottom,dash,t),len=U(2+strength*4);
    for(const s of [-1,1]){
      const x=s===-1?U(.2+(i%4)*.5):L.W-U(.2+(i%4)*.5);
      const dy=y-horizon,dx=x-L.W/2,n=Math.hypot(dx,dy);
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx/n*len,y+dy/n*len);
      ctx.lineWidth=U(.03+(i%3)*.027);ctx.strokeStyle=`rgba(209,253,255,${strength*.65})`;ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawCockpitWorld(ctx,game) {
  preloadRaceAssets();
  ctx.save();backdrop(ctx,game);road(ctx,game);roadside(ctx,game);speedLines(ctx,game);ctx.restore();
}

export function drawCockpitGate(ctx,game) {
  if(!game.gate||game.gate.judged)return;
  const gate=game.gate,{panels,y,h,posts,scale}=gateLayout(game),{dash}=cockpitLayout();
  ctx.save();ctx.beginPath();ctx.rect(0,L.zone.playTop+U(1.4),L.W,dash-L.zone.playTop-U(1.4));ctx.clip();
  // 기둥 바닥도 같은 깊이로 투영한다. 대시보드까지 늘리지 않는다.
  for(const post of posts){
    const w=.035*scale;
    box(ctx,post.top.x-w/2,post.top.y,w,post.bottom.y-post.top.y,U(.025),'#bfd1dc','#627b8c');
    ellipse(ctx,post.bottom.x,post.bottom.y,w*2,w*.5,'rgba(34,56,55,.2)');
  }
  box(ctx,posts[0].top.x,posts[0].top.y,posts[1].top.x-posts[0].top.x,.04*scale,U(.03),'#c9e4ed','#668da3');
  panels.forEach((r,i)=>{
    const chosen=i===game.targetLane,locked=gate.locked&&gate.judgeLane===i;
    box(ctx,r.x-.012*scale,r.y-.012*scale,r.w+.024*scale,r.h+.024*scale,U(.15),'#315878','#bfdfee');
    box(ctx,r.x,r.y,r.w,r.h,U(.12),gradient(ctx,0,r.y,0,r.y+r.h,locked?['#ffe292','#e4a941','#b47724']:['#53d2ff','#0f8be1','#1b589b']),locked?'#fff2cd':'#8ce7ff');
    box(ctx,r.x+.035*scale,r.y+.025*scale,r.w-.07*scale,.015*scale,U(.02),'rgba(233,255,255,.7)');
    label(ctx,String(gate.values[i]),r.x+r.w/2,y,Math.min(h*.66,r.w/2.2),'#fff');
    if(chosen){
      const cy=r.y+r.h+.07*scale;
      poly(ctx,[[r.x+r.w/2-.06*scale,cy+.05*scale],[r.x+r.w/2+.06*scale,cy+.05*scale],[r.x+r.w/2,cy-.04*scale]],locked?'#ffe394':'#e1faff');
    }
  });
  ctx.restore();
}

export function drawCockpitQuestion(ctx,game) {
  const fever=game.gate?.multi&&game.engine.fever?.dan;
  const problem=game.problem;if(!problem&&!fever)return;
  const text=fever?`${game.engine.fever.dan}단!`:problem.blank?problem.text:`${problem.text} = ?`;
  ctx.save();const w=L.W-2*L.safe-U(.4),h=U(2.8),x=(L.W-w)/2,y=L.zone.problem-U(1.05);
  box(ctx,x,y,w,h,U(.65),gradient(ctx,0,y,0,y+h,['#214e70','#102e49']),'#96ccec');
  // 긴 빈칸식은 자간을 압축하되 기본 글자 높이는 80 이상 유지.
  ctx.font=font(U(2));ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=fever?'#ffdf81':'#fff';
  ctx.fillText(text,L.W/2,y+h/2,w-U(.6));
  const hint=fever?(game.gate.nextLane!=null?'다음은 옆 차선!':'배수 차선으로 달려!'):problem.fromReview?'다시 도전!':'';
  if(hint)label(ctx,hint,L.W/2,cockpitLayout().dash-U(.65),U(.65),'#edfaff');
  ctx.restore();
}

export function drawCockpit(ctx,game) {
  const {dash,wheel,fuel,boost:b}=cockpitLayout(),active=game.manualBoostT>0;
  const ready=game.fuel>=20&&!active&&!game.finishing;
  ctx.save();
  const recoil=(game.carBounce||0)*.16+(game.boostVisual||0)*U(.1)+(game.carZoom||0)*U(.4);
  const dashboard=raceImage('dashboard');
  // 불투명 대시보드는 윤곽으로 클립해 전경만 합성. 하늘/글자는 이미지에 굽지 않는다.
  ctx.save();ctx.beginPath();ctx.moveTo(0,dash+U(.25)+recoil);
  ctx.quadraticCurveTo(L.W/2,dash-U(.4)+recoil,L.W,dash+U(.25)+recoil);
  ctx.lineTo(L.W,L.H);ctx.lineTo(0,L.H);ctx.closePath();ctx.clip();
  if(dashboard)ctx.drawImage(dashboard,0,dash-U(.4)+recoil,L.W,L.H-dash+U(.45));
  else{
    ctx.fillStyle=gradient(ctx,0,dash,0,L.H,['#ffad4b','#263d52','#121f32']);ctx.fillRect(0,dash-U(.4),L.W,L.H-dash+U(.4));
  }
  ctx.restore();
  if(game.bestScore>0){
    const score=game.engine.scoreManager.score,ratio=clamp(score/game.bestScore,0,1);
    label(ctx,game.beatBest?'최고점 돌파!':`내 최고 ${game.bestScore.toLocaleString()} · ${Math.max(0,game.bestScore-score).toLocaleString()}점 남음`,L.W/2,dash+U(.65),U(.53),'#e3f7ff');
    const w=L.W-L.safe*2;box(ctx,L.safe,dash+U(1.03),w,U(.1),U(.03),'#273d4c');
    if(ratio>0)box(ctx,L.safe,dash+U(1.03),w*ratio,U(.1),U(.03),'#84f0d8');
  }
  // 연료는 상단 HUD 한 곳에만. 왼쪽 계기는 통과 수·차선이다.
  label(ctx,`통과 ${game.gatesPassed}개`,fuel.x+fuel.w/2,fuel.y+U(.75),U(.78),'#cff5ff');
  label(ctx,['왼쪽 차선','가운데 차선','오른쪽 차선'][game.targetLane],fuel.x+fuel.w/2,fuel.y+U(1.6),U(.55),'#b7cddd');
  if(active){ctx.shadowColor='#ffb541';ctx.shadowBlur=U(.45);}
  box(ctx,b.x,b.y,b.w,b.h,U(.45),gradient(ctx,0,b.y,0,b.y+b.h,active?['#ffd76e','#f99810','#ed6d10']:ready?['#ffca7a','#fa9d34','#ce641d']:['#4e687b','#21354a']),'#ffcd85');
  ctx.shadowBlur=0;
  label(ctx,active?'부스터 ×1.5':'부스터',b.x+b.w/2,b.y+U(.72),U(.75));
  label(ctx,active?`${game.manualBoostT.toFixed(1)}초`:ready?'연료 −20 · Space':'연료 20 필요',b.x+b.w/2,b.y+U(1.7),U(.54));
  const image=raceImage('wheel');ctx.save();ctx.translate(wheel.x,wheel.y);ctx.rotate(game.carTilt*1.8);
  const r=wheel.r;
  if(image)ctx.drawImage(image,-r,-r,r*2,r*2);
  else{
    ctx.beginPath();ctx.arc(0,0,r-U(.3),0,Math.PI*2);ctx.lineWidth=U(.65);ctx.strokeStyle='#152b3d';ctx.stroke();
    poly(ctx,[[-r,0],[r,0],[r,U(.2)],[-r,U(.2)]],'#6c879b');ellipse(ctx,0,0,U(.85),U(.75),'#d7782c');
  }
  ctx.restore();ctx.restore();
}

export function drawCockpitPreview(ctx) {
  const game={laneF:1,targetLane:1,carTilt:0,boostVisual:.7,boostT:0,manualBoostT:2.4,raceElapsed:0,scrollPhase:.02,
    fuel:80,gatesPassed:0,bestScore:null,engine:{fever:null},gate:{p:.3,values:[36,42,48]},getSurvivalHUD(){return {color:'#88efda'};}};
  const scale=U(10.5)/L.H; // 튜토리얼 그림 카드(11gu)를 넘겨 설명문을 덮지 않는다.
  ctx.save();ctx.translate((L.W-L.W*scale)/2,0);ctx.scale(scale,scale);
  ctx.beginPath();ctx.rect(0,0,L.W,L.H);ctx.clip();
  drawCockpitWorld(ctx,game);drawCockpitGate(ctx,game);drawCockpit(ctx,game);ctx.restore();
  ctx.save();label(ctx,'←',U(3.2),U(5),U(1.5),'#a5eaff');label(ctx,'→',L.W-U(3.2),U(5),U(1.5),'#a5eaff');
  label(ctx,'왼쪽 탭',U(3.2),U(6.2),U(.7));label(ctx,'오른쪽 탭',L.W-U(3.2),U(6.2),U(.7));ctx.restore();
}
