// 동물 북 연주단 — 하나의 입력으로 계산과 연주. 박자는 제출 기한이 아니다.
// 게임 전용 Canvas 그림/합성 타악기. core/scenes·공통 음량 설정은 수정하지 않는다.
import { L } from '../core/layout.js';
import { THEME, font } from '../core/ui.js';
import { drawPlayBackdrop, drawRewardText } from '../art/toyArt.js';
import { timingDrum } from '../art/timingAssets.js';

const BEAT_SEC = 60 / 90;
const PERFECT_SEC = .120;
const BASE_SCORE = 50;
const PERFECT_BONUS = 50;
const PHRASE_COUNT = 4;
const PHRASE_BONUS = 100;
const MULTI_COUNT = 8;
const MULTI_COOLDOWN = .15;
const COLORS = ['#e692a5','#81bdb6','#b4a0dc','#eeb36f'];

export const g04Timing = {
  id:'g04_timing', name:'타이밍 퍼즐', emoji:'🎯', category:'정밀형',
  maxLevel:4, blankRatio:.25, opMode:'multiply', fever:{type:'multi'},
  comboMilestones:{5:'GROOVE!',15:'GREAT BAND!',25:'ENCORE!'},
  tutorial:{
    text:'정답 북을 둥! 박자까지 맞추면 둥—챙!',
    draw(ctx){
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=THEME.text;
      ctx.font=font(L.font(.043));ctx.fillText('6 × 4 = ?',L.W/2,L.gu(1.3));
      ['18','24','30','20'].forEach((v,i)=>{
        drum(ctx,L.W/2+(i-1.5)*L.gu(4.1),L.gu(5.7),L.gu(1.55),L.gu(.85),COLORS[i],v,1,0);
      });
      ctx.font=font(L.font(.04));ctx.fillText('👆',L.W/2-L.gu(1.7),L.gu(7.5));
      ctx.font=font(L.font(.024));ctx.fillText('모든 북이 함께 반짝! 정답은 직접 계산해요',L.W/2,L.gu(9.5));
    },
  },

  init(engine){
    ['drum','teal','pink','yellow','bear'].forEach(timingDrum);
    this.engine=engine;this.time=0;this.phraseHits=0;this.phrasePerfects=0;this.phrases=0;
    this.ensemble=null;this.note=null;this.comboNotice=null;this.feverBanner=null;
    this.multiMode=false;this.wasFever=false;this.multiCooldown=0;this.savedNormal=null;
    this.hits=[];this.musicQueue=[];this._load();
  },
  get cx(){return L.W/2;},
  get numR(){return this.multiMode?L.gu(1.8):L.gu(3.35);},
  get drumRy(){return this.multiMode?L.gu(1.15):L.gu(1.7);},
  _numPos(nm){
    const cols=this.multiMode?4:2, step=this.multiMode?L.gu(4.8):L.gu(9);
    return {x:this.cx+(nm.slot%cols-(cols-1)/2)*step,
      y:L.zone.playTop+L.gu(10.5)+Math.floor(nm.slot/cols)*L.gu(6)};
  },
  _hitNumber(x,y){
    return this.numbers.find(n=>{
      const p=this._numPos(n);
      return ((x-p.x)/(this.numR+L.gu(.25)))**2+((y-p.y)/(this.drumRy+L.gu(.65)))**2<=1;
    });
  },
  _beatDistance(){
    const phase=((this.time%BEAT_SEC)+BEAT_SEC)%BEAT_SEC;
    return Math.min(phase,BEAT_SEC-phase);
  },
  _perfect(){return this._beatDistance()<=PERFECT_SEC+1e-9;},
  _limit(){return Math.max(8,8*(this.engine.settings.timeScale||1));},
  _load(){
    const e=this.engine;
    this.problem=e.problemGenerator.nextProblem({maxLevel:this.maxLevel,blankRatio:this.blankRatio,opMode:this.opMode});
    const wrong=e.problemGenerator.makeDistractors(this.problem,3,Math.min(.7,.2+e.scoreManager.combo*.02));
    this.numbers=shuffle([this.problem.answer,...wrong]).map((value,slot)=>({value,slot,correct:value===this.problem.answer}));
    this.elapsed=0;this.limit=this._limit();e.markQuestionStart();
    // this.time은 리셋하지 않는다: 새 문제·합주·피버에도 같은 90 BPM.
  },
  update(dt){
    const previousBeat=Math.floor((this.time+1e-9)/BEAT_SEC);
    this.time+=dt;
    if(this.multiCooldown>0)this.multiCooldown=Math.max(0,this.multiCooldown-dt);
    for(const name of ['note','comboNotice','ensemble','feverBanner']){
      const item=this[name];if(item){item.t+=dt;if(item.t>=item.dur)this[name]=null;}
    }
    this.hits=this.hits.filter(h=>(h.t+=dt)<.25);
    const fv=this.engine.fever,active=!!fv?.active;
    if(active&&!this.wasFever&&fv.type==='multi')this._enterMulti();
    else if(!active&&this.wasFever&&this.multiMode)this._exitMulti();
    this.wasFever=active;
    const beat=Math.floor((this.time+1e-9)/BEAT_SEC);
    if(beat!==previousBeat)this._beatSound(beat); // 지연 프레임에 여러 박자를 몰아서 재생하지 않음
    const due=this.musicQueue.filter(n=>n.at<=this.time);
    this.musicQueue=this.musicQueue.filter(n=>n.at>this.time);
    for(const n of due)this.engine.sound.tone(n.freq,0,.10,{type:'triangle',vol:.08});
    if(this.multiMode){
      if(fv.trapRatio===0)for(const n of this.numbers)if(!fv.isMultiple(n.value))this._refillNum(n);
      if(!this.numbers.some(n=>fv.isMultiple(n.value)))this._buildMulti();
      return;
    }
    this.elapsed+=dt;
    if(this.elapsed>=this.limit){
      this.engine.timeUp(this.problem,{loseLife:true,missed:true,affectLevel:false,
        onResume:()=>this._load()});
    }
  },
  _beatSound(beat){
    const s=this.engine.sound;
    s.tone(beat%4===0?680:520,0,.035,{type:'triangle',vol:.055});
    // 박자 안내는 효과음 설정, 반주는 별도 음악 설정을 따른다.
    if(!s.musicEnabled)return;
    const layers=this.multiMode?this.engine.fever.stage:Math.min(3,this.phraseHits);
    if(layers>=1)s.tone(beat%2?147:131,0,.1,{vol:.07});
    if(layers>=2&&beat%2===0)s.tone(392,0,.09,{type:'triangle',vol:.05});
    if(layers>=3)s.tone(784,0,.05,{type:'triangle',vol:.035});
  },
  _strike(slot,perfect){
    const s=this.engine.sound;
    s.tone(170+slot*13,0,.14,{vol:.26,sweepTo:55+slot*4}); // 둥: 저음 타격
    if(perfect){
      // 짧은 비정수 배음으로 합성한 금속성 '챙'. 긴 예약 음원/타이머 없음.
      for(const f of [2347,3541,5107])s.tone(f,0,.12,{type:'triangle',vol:.035});
    }
    this.hits.push({slot,t:0,perfect,multi:this.multiMode});
  },
  _award(problem,value,points){
    const e=this.engine,before=e.scoreManager.score,floats=e.ui.floatScores.length;
    e.answerCorrect(problem,value,points);
    e.ui.floatScores.splice(floats);
    const notices=(e.ui.comboOverlays||[]).filter(o=>!o.compact);
    if(notices.length){
      this.comboNotice={text:notices.at(-1).text,t:0,dur:.55};
      e.ui.comboOverlays=e.ui.comboOverlays.filter(o=>o.compact);
    }
    return e.scoreManager.score-before;
  },
  onTouch(x,y,phase){
    const e=this.engine;
    if(phase!=='start'||e.freeze?.active||!!e.fever?.active!==this.multiMode)return;
    const n=this._hitNumber(x,y);if(!n)return;
    if(this.multiMode){
      if(this.multiCooldown>0)return;
      this._judgeMulti(n);this.multiCooldown=MULTI_COOLDOWN;return;
    }
    if(!n.correct){
      e.answerWrong(this.problem,n.value,{loseLife:true,onResume:()=>{
        this.elapsed=0;this.limit=this._limit();e.markQuestionStart();
      }});
      return;
    }
    const perfect=this._perfect();this.phraseHits++;
    if(perfect)this.phrasePerfects++;
    const complete=this.phraseHits===PHRASE_COUNT;
    const points=this._award(this.problem,n.value,BASE_SCORE+(perfect?PERFECT_BONUS:0)+(complete?PHRASE_BONUS:0));
    this._strike(n.slot,perfect);
    this.note={text:(perfect?'PERFECT! 둥—챙! +':'둥! +')+points,t:0,dur:.55,perfect};
    if(perfect)e.ui.shake(L.gu(.12),.07);
    if(complete){
      this.phrases++;
      this.ensemble={t:0,dur:.65,perfects:this.phrasePerfects};
      this.phraseHits=0;this.phrasePerfects=0;
      this.musicQueue=[523,659,784,1047].map((freq,i)=>({at:this.time+i*.10,freq}));
      e.particles.emit(this.cx,L.zone.problem+L.gu(5.4),'sparkle',THEME.gold,24);
    }
    this._load();
  },
  _enterMulti(){
    this.savedNormal={problem:this.problem,numbers:this.numbers,elapsed:this.elapsed,limit:this.limit};
    this.multiMode=true;this.multiCooldown=0;this.hits=[];this.note=null;this.comboNotice=null;
    this._buildMulti();
  },
  _exitMulti(){
    this.multiMode=false;this.multiCooldown=0;this.hits=[];this.note=null;this.comboNotice=null;
    if(this.savedNormal){Object.assign(this,this.savedNormal);this.savedNormal=null;this.engine.markQuestionStart();}
    else this._load();
    this.feverBanner={text:'FEVER +'+this.engine.fever.pointsEarned,t:0,dur:1.2};
  },
  _buildMulti(){
    this.numbers=this.engine.fever.fillValues(MULTI_COUNT).map((v,slot)=>({value:v.value,slot}));
  },
  _refillNum(n){
    const fv=this.engine.fever;
    n.value=Math.random()<1-fv.trapRatio?fv.randomMultiple():fv.randomTrap();
  },
  _judgeMulti(n){
    const e=this.engine,fv=e.fever,dan=fv.dan;
    if(fv.isMultiple(n.value)){
      const p={a:dan,b:n.value/dan,op:'×',answer:n.value,remainder:null,level:1,blank:null,text:dan+' × '+n.value/dan};
      const points=this._award(p,n.value,60+e.scoreManager.combo*5);
      this._strike(n.slot,fv.stage>=2);
      this.note={text:'자유 연주! +'+points,t:0,dur:.3,perfect:true};
    }else{
      const p={a:n.value,b:dan,op:'÷',answer:Math.floor(n.value/dan),remainder:n.value%dan,level:1,blank:null,text:n.value+' ÷ '+dan};
      e.answerWrong(p,n.value,{affectLevel:false,freeze:false});
    }
    this._refillNum(n);
  },

  render(ctx){
    drawPlayBackdrop(ctx,this.id,this.time);
    ctx.textAlign='center';ctx.textBaseline='middle';
    const e=this.engine,fv=e.fever;
    if(fv)fv.renderGauge(ctx,{x:L.safe,y:L.zone.gauge,w:L.W-2*L.safe,h:L.gu(.5)});
    ctx.fillStyle=this.multiMode?THEME.gold:THEME.text;ctx.font=font(L.font(.07));
    ctx.fillText(this.multiMode?fv.dan+'단!':this.problem.blank?this.problem.text:this.problem.text+' = ?',this.cx,L.zone.problem);
    ctx.font=font(L.font(.025));ctx.fillStyle=THEME.text;
    ctx.fillText(this.multiMode?'배수 북을 자유롭게 둥둥!':'정답 북을 둥! 박자까지 맞추면 PERFECT',this.cx,L.zone.problem+L.gu(1.6));
    if(!this.multiMode&&this.problem.fromReview){
      ctx.font=font(L.font(.022));ctx.fillStyle=THEME.gold;
      ctx.fillText('🔁 다시 도전!',this.cx,L.zone.problem+L.gu(2.7));
    }
    const phase=(this.time%BEAT_SEC)/BEAT_SEC, pulse=Math.max(0,1-this._beatDistance()/PERFECT_SEC);
    this._drawBand(ctx,phase,pulse);
    for(const n of this.numbers){
      const p=this._numPos(n),hit=this.hits.findLast(h=>h.slot===n.slot&&h.multi===this.multiMode);
      drum(ctx,p.x,p.y,this.numR,this.drumRy,COLORS[n.slot%4],String(n.value),pulse,hit?Math.sin(Math.PI*hit.t/.25):0);
      if(hit?.perfect){
        ctx.save();ctx.globalAlpha=1-hit.t/.25;ctx.fillStyle=THEME.gold;
        ctx.font=font(L.font(.033));ctx.fillText('✦',p.x+this.numR+L.gu(.2),p.y-L.gu(1));ctx.restore();
      }
      ctx.fillStyle='#74617a';ctx.font=font(L.font(.018));
      ctx.fillText(String(n.slot+1),p.x,p.y+this.drumRy+L.gu(1.65));
    }
    ctx.fillStyle='#6b507f';ctx.font=font(L.font(.025));
    ctx.fillText(this.multiMode?'자유 연주 · '+['','FEVER','SUPER','ULTRA'][fv.stage]:
      this.ensemble?'합주 완성! +100 · PERFECT '+this.ensemble.perfects+'/4':
      '네 번 맞히면 다 같이 연주! '+this.phraseHits+'/4',this.cx,L.zone.floor-L.gu(2.6));
    if(this.note){
      ctx.font=font(L.font(.033));ctx.fillStyle=this.note.perfect?THEME.gold:'#7a9c6c';
      drawRewardText(ctx,this.note.text,this.cx,L.zone.floor-L.gu(1.4));
    }
    if(!this.multiMode){
      const remaining=Math.max(0,this.limit-this.elapsed),x=L.safe+L.gu(.5),y=L.zone.floor+L.gu(.05);
      ctx.fillStyle='#e2cddb';ctx.fillRect(x,y,L.W-2*x,L.gu(.14));
      ctx.fillStyle=remaining<2?'#d77988':'#80bdb0';ctx.fillRect(x,y,(L.W-2*x)*remaining/this.limit,L.gu(.14));
      ctx.fillStyle='#6b507f';ctx.font=font(L.font(.022));
      ctx.fillText('계산 '+remaining.toFixed(1)+'초 · 완성한 합주 '+this.phrases+'회',this.cx,y+L.gu(.62));
    }else{
      ctx.font=font(L.font(.022));ctx.fillStyle='#6b507f';
      ctx.fillText('일반 합주 '+this.phraseHits+'/4 보관 중',this.cx,L.zone.floor+L.gu(.65));
    }
    if(this.feverBanner){
      ctx.font=font(L.font(.022));ctx.fillStyle='#775b8c';ctx.fillText(this.feverBanner.text,this.cx,L.zone.floor-L.gu(3.7));
    }else if(this.comboNotice){
      ctx.font=font(L.font(.022));ctx.fillStyle='#775b8c';ctx.fillText(this.comboNotice.text,this.cx,L.zone.floor-L.gu(3.7));
    }
  },
  _drawBand(ctx,phase,pulse){
    const cy=L.zone.problem+L.gu(5.9),bounce=Math.cos(phase*Math.PI*2)*L.gu(.15);
    ctx.fillStyle='#fff3d6';ctx.beginPath();ctx.roundRect(L.safe+L.gu(.7),cy-L.gu(1.6),L.W-2*(L.safe+L.gu(.7)),L.gu(4.1),L.gu(.6));ctx.fill();
    const members=this.multiMode?Math.min(3,this.engine.fever.stage):Math.min(3,this.phraseHits);
    for(let i=0;i<3;i++){
      const x=this.cx+(i-1)*L.gu(6);
      const bear=timingDrum('bear');
      if(bear){const h=L.gu(i===1?2.8:2.4),w=h*bear.naturalWidth/bear.naturalHeight;ctx.drawImage(bear,x-w/2,cy+bounce-h*.58,w,h);}
      else animal(ctx,x,cy+bounce,L.gu(i===1?1.12:.78),i===1?'#f3bf8e':i===0?'#b5d5ae':'#d0b8e6',i);
      if(!bear&&(i===1||members>i)){
        ctx.strokeStyle='#866259';ctx.lineWidth=L.gu(.09);ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(x+L.gu(.65),cy+L.gu(.3));ctx.lineTo(x+L.gu(1.3),cy-L.gu(.4)-pulse*L.gu(.6));ctx.stroke();
      }
    }
    ctx.font=font(L.font(.024));ctx.textAlign='center';ctx.fillStyle='#805875';
    ctx.fillText('동물 북 연주단',this.cx,cy+L.gu(1.55));
    const trackY=cy+L.gu(2.15),width=L.gu(8);
    ctx.strokeStyle='#dfc6cf';ctx.lineWidth=L.gu(.06);ctx.beginPath();ctx.moveTo(this.cx-width/2,trackY);ctx.lineTo(this.cx+width/2,trackY);ctx.stroke();
    ctx.fillStyle='#dfaf63';ctx.beginPath();ctx.arc(this.cx-width/2+phase*width,trackY,L.gu(.14),0,Math.PI*2);ctx.fill();
    for(const x of [this.cx-width/2,this.cx+width/2]){
      ctx.beginPath();ctx.arc(x,trackY,L.gu(.2)+pulse*L.gu(.08),0,Math.PI*2);ctx.fill();
    }
  },
  onHover(x,y){return !!this._hitNumber(x,y);},
  clearHover(){},
  onKey(e){
    if(e.repeat||!/^[1-8]$/.test(e.key))return;
    const n=this.numbers[Number(e.key)-1];if(n){const p=this._numPos(n);this.onTouch(p.x,p.y,'start');}
  },
  destroy(){
    this.musicQueue=[];this.hits=[];this.savedNormal=null;this.numbers=[];
    this.engine=null;this.problem=null;this.note=null;this.ensemble=null;
  },
};

function drum(ctx,x,y,rx,ry,color,label,pulse,squash){
  ctx.save();ctx.translate(x,y);ctx.scale(1+squash*.04,1-squash*.12);
  const variant=['pink','teal','drum','yellow'][Math.max(0,COLORS.indexOf(color))];
  const art=timingDrum(variant);
  if(art){
    ctx.drawImage(art,-rx,-ry,rx*2,ry*2+L.gu(1.2));
    ctx.save();ctx.globalAlpha=pulse*.8;
    const faceY=-ry+(ry*2+L.gu(1.2))*(variant==='drum'?.26:.24);
    ctx.beginPath();ctx.ellipse(0,faceY,rx+L.gu(.12),ry*.72,0,0,Math.PI*2);
    ctx.strokeStyle='#ffcc6b';ctx.lineWidth=L.gu(.1);ctx.stroke();ctx.restore();
    ctx.fillStyle='#594263';ctx.font=font(L.font(.04));ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,0,faceY);
    ctx.restore();return;
  }
  // 북통·가죽면·줄. 숫자와 박자 파동은 모든 북에 동일한 규칙.
  ctx.fillStyle=color;ctx.strokeStyle='#89657a';ctx.lineWidth=L.gu(.08);
  ctx.beginPath();ctx.roundRect(-rx,-ry*.1,rx*2,ry+L.gu(1.2),L.gu(.35));ctx.fill();ctx.stroke();
  ctx.strokeStyle='#fff1d9';ctx.lineWidth=L.gu(.06);
  for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(i*rx*.55,-ry*.1);ctx.lineTo(i*rx*.55+rx*.18,ry+L.gu(1));ctx.stroke();}
  ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.fillStyle='#fff3db';ctx.fill();ctx.strokeStyle='#aa7a85';ctx.lineWidth=L.gu(.1);ctx.stroke();
  ctx.save();ctx.globalAlpha=pulse;
  ctx.beginPath();ctx.ellipse(0,0,rx+L.gu(.16)+(1-pulse)*L.gu(.2),ry+L.gu(.16)+(1-pulse)*L.gu(.2),0,0,Math.PI*2);
  ctx.strokeStyle='#ffcc6b';ctx.lineWidth=L.gu(.13);ctx.stroke();ctx.restore();
  ctx.fillStyle='#73546e';ctx.font=font(L.font(.04));ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,0,0);
  ctx.restore();
}
function animal(ctx,x,y,r,color,type){
  ctx.save();ctx.fillStyle=color;ctx.strokeStyle='#8c697b';ctx.lineWidth=L.gu(.055);
  for(const dx of [-.65,.65]){
    ctx.beginPath();ctx.ellipse(x+dx*r,y-r*.7,r*.3,r*(type===2?.6:.3),0,0,Math.PI*2);ctx.fill();ctx.stroke();
  }
  ctx.beginPath();ctx.ellipse(x,y,r,r*.8,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle='#664a63';
  for(const dx of [-.32,.32]){ctx.beginPath();ctx.arc(x+dx*r,y-r*.08,L.gu(.06),0,Math.PI*2);ctx.fill();}
  ctx.beginPath();ctx.arc(x,y+r*.12,r*.16,0,Math.PI);ctx.stroke();
  ctx.fillStyle='#ed9fab';for(const dx of [-.52,.52]){ctx.beginPath();ctx.ellipse(x+dx*r,y+r*.15,r*.15,r*.09,0,0,Math.PI*2);ctx.fill();}
  ctx.restore();
}
function shuffle(items){
  const a=items.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;
}
