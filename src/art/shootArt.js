// 슈팅 전용 소품. 정답 여부를 읽지 않으며 크기는 L 또는 입력 크기에서 파생한다.
import {L} from '../core/layout.js';
import {font,roundRect} from '../core/ui.js';
function star(c,x,y,r,color){
  c.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,d=r*(i%2?.45:1);const px=x+Math.cos(a)*d,py=y+Math.sin(a)*d;if(i)c.lineTo(px,py);else c.moveTo(px,py);}
  c.closePath();c.fillStyle=color;c.fill();
}
export function drawAimGuide(c,x,top,bottom,recoil){
  c.save();c.strokeStyle='#4a889b55';c.lineWidth=L.gu(.045);c.setLineDash([L.gu(.16),L.gu(.26)]);
  c.beginPath();c.moveTo(x,bottom);c.lineTo(x,top);c.stroke();c.setLineDash([]);
  // 중립 조준선: 로봇 값/정답 여부와 무관한 플레이어 x 표시.
  c.strokeStyle='#34758a';c.lineWidth=L.gu(.07);
  c.beginPath();c.moveTo(x-L.gu(.32),bottom-L.gu(.5));c.lineTo(x,bottom-L.gu(.82));c.lineTo(x+L.gu(.32),bottom-L.gu(.5));c.stroke();
  if(recoil>0){
    const r=L.gu(.55)*recoil/.12;star(c,x,bottom+L.gu(.22),r,'#ffcc6e');star(c,x,bottom+L.gu(.22),r*.5,'#fff8df');
  }
  c.restore();
}
export function drawCaptainFrame(c,x,y,r){
  c.save();c.strokeStyle='#dc9858';c.lineWidth=r*.075;
  // 세 후보 모두 같은 날개/장식. 판정 크기를 키우거나 정답을 암시하지 않는다.
  for(const side of [-1,1]){
    c.beginPath();c.moveTo(x+side*r*.9,y-r*.5);c.lineTo(x+side*r*1.15,y-r*.22);c.lineTo(x+side*r*.98,y+r*.4);c.stroke();
  }
  star(c,x,y-r*1.05,r*.19,'#ffcc6e');c.restore();
}
export function drawRobotBurst(c,x,y,r,p,captain=false){
  c.save();c.globalAlpha=Math.max(0,1-p);
  c.strokeStyle=captain?'#ffbb68':'#79c9c4';c.lineWidth=L.gu(.09)*(1-p*.7);
  c.beginPath();c.arc(x,y,r*(.6+p*1.9),0,Math.PI*2);c.stroke();
  for(let i=0;i<6;i++){
    const a=i*Math.PI/3-.4,d=r*(.35+p*2.1);
    star(c,x+Math.cos(a)*d,y+Math.sin(a)*d+r*p*p,r*(.18-p*.09),i%2?'#fff8df':'#efb46d');
  }
  // 옆 패널이 별처럼 분리되는 시각 효과. 새 편대의 충돌 객체로 남지 않는다.
  for(const side of [-1,1]){
    c.save();c.translate(x+side*r*(.6+p*1.5),y+r*p*p);c.rotate(side*p*2);
    roundRect(c,-r*.13,-r*.3,r*.26,r*.6,r*.09);c.fillStyle='#8bd5d1';c.fill();c.restore();
  }
  c.restore();
}
export function drawSquadStatus(c,progress,cleared,multi,celebrate,cooldown,scoreText){
  c.save();const x=L.safe,y=L.H-L.gu(3.3),w=L.W-L.safe*2,h=L.gu(2.9);
  roundRect(c,x,y,w,h,L.gu(.4));c.fillStyle='#f3fbf4';c.fill();
  c.textAlign='center';c.textBaseline='middle';c.fillStyle='#315b6a';c.font=font(L.font(.024));
  const text=celebrate?`${celebrate.number}편대 돌파! 다음 편대로!`:multi?'피버 보너스 편대 · 일반 진행 유지':`${cleared+1}편대 · ${progress}/5 격추${progress===4?' · 대장 출현!':''}`;
  c.fillText(text,L.W/2,y+L.gu(.55));
  const step=L.gu(1.1),left=L.W/2-step*2;
  for(let i=0;i<5;i++)star(c,left+i*step,y+L.gu(1.35),L.gu(.28),i<progress?'#e7aa45':'#c9dfdc');
  c.font=font(L.font(.021),'normal');c.fillStyle='#507884';
  c.fillText(scoreText?`명중 ${scoreText}`:cooldown>0?'찰칵! 재장전 중':'좌우로 조준 · 손을 떼거나 SPACE로 한 발',L.W/2,y+L.gu(2.2));
  if(celebrate){
    c.globalAlpha=Math.max(0,1-celebrate.t/celebrate.dur);
    for(const side of [-1,1])star(c,L.W/2+side*L.gu(4),y+L.gu(1.35),L.gu(.45),'#edb24e');
  }
  c.restore();
}
