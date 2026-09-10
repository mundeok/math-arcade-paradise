// 두 갈래 배송 — an A/B prototype; g01_combo.js remains intact.
// One release / one key press = one card. Score-based 5→3s clock; no auto-fire.
import { L } from '../core/layout.js';
import { THEME, font, hit } from '../core/ui.js';
import { drawDeliveryScene } from '../art/deliveryArt.js';
import { g01Combo } from './g01_combo.js';
import { DeliveryDeck } from './deliveryDeck.js';

const ROUND_SECONDS=60, LOAD=8;
export const g01Delivery={
  id:'g01_delivery',name:'두 갈래 배송',emoji:'📦',category:'연속 판단형',
  opMode:'mixed',maxLevel:2,blankRatio:0,fever:{type:'easy'},
  comboMilestones:{5:'착착!',10:'배송 달인!',20:'멈출 수 없어!'},
  tutorial:{
    text:'식의 답이 적힌 집으로 보내요! 카드 시간 안에 왼쪽·오른쪽! 8개를 보내면 트럭 출발!',
    draw(c){
      c.textAlign='center';c.textBaseline='middle';c.fillStyle=THEME.text;c.font=font(L.font(.065));
      c.fillText('6 × 4',L.W/2,L.gu(2));
      c.font=font(L.font(.05));c.fillText('◀ 24       32 ▶',L.W/2,L.gu(5));
      c.font=font(L.font(.027));c.fillText('정답은 왼쪽 집! 다음 식도 미리 봐요.',L.W/2,L.gu(7.5));
    },
  },
  _layout(){
    const gap=L.gu(.5),w=(L.W-L.safe*2-gap)/2;
    return {
      buttons:[0,1].map(i=>({x:L.safe+i*(w+gap),y:L.zone.controls+L.gu(2.2),w,h:L.gu(4)})),
      card:{x:L.safe+L.gu(1.2),y:L.zone.playTop+L.gu(6.9),w:L.W-L.safe*2-L.gu(2.4),h:L.gu(5.3)},
      start:{x:L.safe+L.gu(1),y:L.zone.controls-L.gu(1),w:L.W-L.safe*2-L.gu(2),h:L.minTouch+L.gu(.5)},
      legacy:{x:L.safe+L.gu(1),y:L.zone.controls+L.gu(3),w:L.W-L.safe*2-L.gu(2),h:L.minTouch},
    };
  },
  init(engine){
    this.engine=engine;this.deck=new DeliveryDeck(engine.settings);this.phase='ready';
    this.time=0;this.remaining=ROUND_SECONDS;this.delivered=0;this.loads=0;this.inLoad=0;
    this.targets=[];this.queue=[];this.problem=null;this.flights=[];this.feedback=null;
    this.departures=[];this.cue=0;this.lock=0;this.cardAge=0;this.wasFever=false;
    this.armed=null;this.hover=null;this.normalSaved=null;this.pendingBatch=false;
    this.cardLimit=this._nextCardSeconds();
  },
  _start(){
    if(this.phase!=='ready')return;
    this.phase='play';this._newBatch(false);this.cue=1;this.armed=null;
  },
  _nextCardSeconds(){
    const score=Math.max(0,this.engine.scoreManager.score);
    const base=Math.max(3,5-Math.floor(score/1000)*.2);
    // Teacher pacing still applies, but even a faster setting cannot break 3s.
    return Math.max(3,base*(this.engine.settings.timeScale||1));
  },
  _cardSeconds(){return this.cardLimit;},
  _resetCardClock(){
    this.cardAge=0;this.cardLimit=this._nextCardSeconds();this.engine.markQuestionStart();
  },
  _newBatch(easy){
    this.targets=this.deck.startBatch(easy);this.queue=Array.from({length:3},()=>this.deck.next());
    this.problem=this.queue[0];this.inLoad=0;this.pendingBatch=false;
    this._resetCardClock();
  },
  _syncFever(){
    const active=!!this.engine.fever?.active;
    if(active===this.wasFever)return false;
    this.armed=null;this.flights=[];
    if(active){
      this.normalSaved={targets:this.targets,queue:this.queue,inLoad:this.inLoad,bank:this.deck.bank,
        deckTargets:this.deck.targets,recent:this.deck.recent,wave:this.deck.wave,pending:this.pendingBatch};
      this._newBatch(true);this.cue=.65;
      this.engine.ui.showComboText('보너스 배송!',false);
    }else{
      const s=this.normalSaved;
      if(s){
        this.targets=s.targets;this.queue=s.queue;this.inLoad=s.inLoad;this.pendingBatch=s.pending;
        this.deck.bank=s.bank;this.deck.targets=s.deckTargets;this.deck.recent=s.recent;this.deck.wave=s.wave;
        this.deck.easy=false;this.normalSaved=null;
      }
      if(this.pendingBatch)this._newBatch(false);
      this.problem=this.queue[0];this.cue=.8;
      this.feedback={text:`FEVER +${this.engine.fever.pointsEarned}`,good:true,t:1};
    }
    this.wasFever=active;this._resetCardClock();return true;
  },
  update(dt){
    this.time+=dt;
    for(const a of this.flights)a.t+=dt;
    this.flights=this.flights.filter(a=>a.t<.22);
    for(const a of this.departures)a.t+=dt;
    this.departures=this.departures.filter(a=>a.t<.7);
    if(this.feedback){this.feedback.t-=dt;if(this.feedback.t<=0)this.feedback=null;}
    if(this.phase!=='play')return;
    this._syncFever();
    const lockedTime=Math.min(this.lock,dt);
    this.lock=Math.max(0,this.lock-dt);
    if(this.cue>0){this.cue=Math.max(0,this.cue-dt);this.engine.markQuestionStart();return;}
    this.cardAge+=dt-lockedTime;
    this.remaining=Math.max(0,this.remaining-dt);
    if(this.remaining===0){this.phase='finished';this.armed=null;this.engine.endGame();return;}
    if(!this.wasFever&&this.cardAge>=this._cardSeconds())this._send(null,true);
  },
  _send(side,timedOut=false){
    if(this.phase!=='play'||this.engine.isFrozen?.())return;
    if(this._syncFever()||this.cue>0||this.lock>0)return;
    const e=this.engine,p=this.queue[0],value=timedOut?null:this.targets[side],good=!timedOut&&value===p.answer;
    // Consume synchronously before effects/scoring: a second press sees a new card.
    this.queue.shift();this.armed=null;
    const before=e.scoreManager.score;
    if(good){
      const quick=this.cardAge<=1.1*(e.settings.timeScale||1)?20:0;
      this.inLoad++;this.delivered++;
      const complete=this.inLoad===LOAD;
      e.answerCorrect(p,value,100+quick+(complete?200:0));
      this.deck.report(p,true);
      this.feedback={text:`+${e.scoreManager.score-before}${quick?' 착착!':''}`,good:true,t:.5};
      this.flights.push({side,text:p.text,t:0});
      const b=this._layout().buttons[side];
      e.particles.emit(b.x+b.w/2,b.y,'sparkle',THEME.gold,this.wasFever?22:12);
      e.ui.shake(L.gu(.07),.07);
      if(complete){
        this.loads++;this.departures.push({t:0,side});this.inLoad=0;
        this.feedback={text:`${this.loads}번째 배송 출발!`,good:true,t:.65};
        // Fever keeps the same easy houses for all six seconds.
        if(!this.wasFever)this.pendingBatch=true;
      }
    }else{
      const res=e.answerWrong(p,value,timedOut?{freeze:false,missed:true,affectLevel:false}:{freeze:false});
      this.deck.report(p,false);this.lock=this.wasFever?0:.28;
      this.feedback={text:`${timedOut?'시간 끝! ':''}${p.text} = ${p.answer}`,good:false,t:timedOut?1:.85};
      e.ui.shake(L.gu(.1),.08);if(!this.wasFever)e.sound.play('wrong');
      if(res?.gameOver){this.phase='finished';return;}
    }
    // Scoring can activate fever on this very answer. Save the freshly refilled
    // normal queue, not the card just answered, before entering bonus mode.
    this.queue.push(this.deck.next());this.problem=this.queue[0];this._resetCardClock();
    if(this._syncFever())return;
    if(this.pendingBatch){this._newBatch(false);this.cue=.9;}
  },
  onTouch(x,y,phase){
    const r=this._layout();
    if(phase==='start'){
      this.armed=this.phase==='ready' ? hit(r.start,x,y)?'start':hit(r.legacy,x,y)?'legacy':null
        :this.cue<=0&&this.lock<=0 ? r.buttons.findIndex(b=>hit(b,x,y)):null;
    }else if(phase==='end'){
      const armed=this.armed;this.armed=null;
      if(armed==='start'&&hit(r.start,x,y))this._start();
      else if(armed==='legacy'&&hit(r.legacy,x,y))this.engine.startGame(g01Combo);
      else if(Number.isInteger(armed)&&armed>=0&&hit(r.buttons[armed],x,y))this._send(armed);
    }else if(phase==='cancel')this.armed=null;
  },
  onKey(e){
    if(e.repeat)return;
    if(this.phase==='ready'){if(e.key==='Enter'||e.key===' ')this._start();return;}
    const k=e.key.toLowerCase();if(k==='arrowleft'||k==='a')this._send(0);
    if(k==='arrowright'||k==='d')this._send(1);
  },
  onHover(x,y){this.hover={x,y};const r=this._layout();return (this.phase==='ready'?[r.start,r.legacy]:r.buttons).some(b=>hit(b,x,y));},
  clearHover(){this.hover=null;this.armed=null;},
  render(c){drawDeliveryScene(c,this);},
  destroy(){this.phase='finished';this.queue=[];this.flights=[];this.departures=[];this.armed=null;this.normalSaved=null;},
};
