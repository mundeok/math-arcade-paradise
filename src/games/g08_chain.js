// 배수 젤리 팡: stationary board, editable adjacent path, release-to-score.
import { L } from '../core/layout.js';
import { font } from '../core/ui.js';
import { adjacent, newBoard, refillBoard, SIDE } from './chainBoard.js';
import { drawChainScene } from '../art/chainArt.js';

const pick=a=>a[Math.floor(Math.random()*a.length)];
export const g08Chain={
  id:'g08_chain',name:'배수 젤리 팡',emoji:'🔗',category:'연쇄형',
  maxLevel:2,blankRatio:0,opMode:'mixed',fever:{type:'easy'},
  comboMilestones:{5:'착착 연결!',10:'젤리 파티!',20:'팡팡 달인!'},
  tutorial:{
    text:'배수 젤리를 이웃끼리 쭉 연결! 손을 떼면 팡! 되짚으면 연결을 고칠 수 있어요.',
    draw(c){
      c.textAlign='center';c.textBaseline='middle';c.fillStyle='#ffffff';c.font=font(L.font(.04));
      c.fillText('4단: 4 → 16 → 8 → 24',L.W/2,L.gu(3));
      c.font=font(L.font(.028));c.fillText('순서 자유 · 대각선 OK · 길수록 보너스!',L.W/2,L.gu(5));
    },
  },
  _layout(){
    const step=(L.W-L.safe*2)/SIDE,top=L.zone.playTop+L.gu(4.15);
    return {step,top,r:step*.37,points:Array.from({length:16},(_,i)=>({
      x:L.safe+step*(i%SIDE+.5),y:top+step*(Math.floor(i/SIDE)+.5),
    }))};
  },
  get br(){return this._layout().r;},
  init(e){
    this._detach?.();this.engine=e;this.time=0;this.remaining=60;this.phase='play';
    this.waveIndex=0;this.progress=0;this.poppedCount=0;this.longest=0;this.chainCount=0;
    this.board=[];this.path=[];this.dragging=false;this.cursor=0;this.keyboardMode=false;this.pops=[];this.feedback=null;
    this.wasFever=false;this.normalSaved=null;this.pendingWave=false;this.cue=1;this.lock=0;
    this._newWave();this.cue=1;this._bindCancellation();
  },
  _bindCancellation(){
    // Core maps touchcancel to end: cancel in capture phase without changing core.
    const canvas=this.engine.canvas;
    if(!canvas?.addEventListener||typeof window==='undefined')return;
    const cancel=()=>this._cancel();
    const key=e=>{if(['Escape','p','P'].includes(e.key))cancel();};
    const start=e=>{
      const p=e.touches?.[0]||e,r=canvas.getBoundingClientRect();
      if((p.clientY-r.top)*L.H/r.height<L.zone.hudBottom)cancel();
    };
    canvas.addEventListener('touchcancel',cancel,true);
    canvas.addEventListener('touchstart',start,true);canvas.addEventListener('mousedown',start,true);
    window.addEventListener('blur',cancel);window.addEventListener('keydown',key,true);
    document.addEventListener('visibilitychange',cancel);
    this._detach=()=>{
      canvas.removeEventListener('touchcancel',cancel,true);
      canvas.removeEventListener('touchstart',start,true);canvas.removeEventListener('mousedown',start,true);
      window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key,true);
      document.removeEventListener('visibilitychange',cancel);this._detach=null;
    };
  },
  _dans(easy){
    const s=this.engine.settings;
    let ds=(s.dans||[]).filter(d=>Number.isInteger(d)&&d>=2&&d<=9);
    if(!ds.length)ds=[2,3,4,5];
    if(easy&&ds.some(d=>d<=5))ds=ds.filter(d=>d<=5);
    return ds;
  },
  _newWave(easy=false){
    this.D=pick(this._dans(easy));
    const op=this.engine.settings.operation||'mixed';
    this.divWave=op==='divide'||(op==='mixed'&&this.waveIndex%2===1);
    this.board=newBoard(this.D,easy);this.progress=0;this.pendingWave=false;
    this._cancel();this.engine.markQuestionStart();
  },
  _syncFever(){
    const active=!!this.engine.fever?.active;
    if(active===this.wasFever)return false;
    this._cancel();this.pops=[];this.lock=0;
    if(active){
      this.normalSaved={board:this.board,D:this.D,divWave:this.divWave,progress:this.progress,pending:this.pendingWave};
      this._newWave(true);this.cue=.4;this.feedback={text:'쉬운 배수로 길게 이어봐!',t:1};
    }else{
      const s=this.normalSaved;
      if(s){Object.assign(this,{board:s.board,D:s.D,divWave:s.divWave,progress:s.progress,pendingWave:s.pending});}
      this.normalSaved=null;
      if(this.pendingWave){this.waveIndex++;this._newWave();}
      this.cue=.6;this.feedback={text:`FEVER +${this.engine.fever?.pointsEarned||0}`,t:1.2};
    }
    this.wasFever=active;this.engine.markQuestionStart();return true;
  },
  update(dt){
    this.time+=dt;
    for(const p of this.pops){
      p.t+=dt;
      if(!p.fired&&p.t>=p.delay){
        p.fired=true;this.engine.particles.emit(p.x,p.y,'sparkle','#ffe69a',p.big?12:5);
        this.engine.sound.tone?.(520*2**(p.order/12),0,.055,{type:'sine',vol:.06});
      }
    }
    this.pops=this.pops.filter(p=>p.t<p.delay+.14);
    if(this.feedback){this.feedback.t-=dt;if(this.feedback.t<=0)this.feedback=null;}
    if(this.phase!=='play')return;
    this._syncFever();this.lock=Math.max(0,this.lock-dt);
    if(this.cue>0){this.cue=Math.max(0,this.cue-dt);this.engine.markQuestionStart();return;}
    this.remaining=Math.max(0,this.remaining-dt);
    if(!this.remaining){this.phase='finished';this._cancel();this.engine.endGame();this._detach?.();}
  },
  _cancel(){this.path=[];this.dragging=false;this.lastPointer=null;},
  _visit(i){
    if(i<0)return;
    const at=this.path.indexOf(i);
    if(at>=0){this.path=this.path.slice(0,at+1);return;}
    if(this.path.length&&!adjacent(this.path.at(-1),i))return;
    this.path.push(i);
    // Neutral selection sound: never reveals whether this is a multiple.
    this.engine.sound.tone?.(330*2**(Math.min(this.path.length,12)/12),0,.035,{type:'sine',vol:.07});
  },
  _hit(x,y){
    const r=this._layout();
    return r.points.findIndex(p=>Math.hypot(x-p.x,y-p.y)<=r.r);
  },
  _trace(x,y){
    const from=this.lastPointer||{x,y},dist=Math.hypot(x-from.x,y-from.y);
    const steps=Math.max(1,Math.ceil(dist/(this.br*.45)));
    for(let j=1;j<=steps;j++)this._visit(this._hit(from.x+(x-from.x)*j/steps,from.y+(y-from.y)*j/steps));
    this.lastPointer={x,y};
  },
  _inputReady(){return this.phase==='play'&&!this.engine.isFrozen?.()&&this.cue<=0&&this.lock<=0;},
  onTouch(x,y,phase){
    if(phase==='cancel'){this._cancel();return;}
    if(this._syncFever()||!this._inputReady()){this._cancel();return;}
    if(phase==='start'){
      this.keyboardMode=false;
      this._cancel();const i=this._hit(x,y);if(i<0)return;
      this.dragging=true;this.lastPointer={x,y};this.engine.markQuestionStart();this._visit(i);
    }else if(this.dragging&&phase==='move')this._trace(x,y);
    else if(this.dragging&&phase==='end'){
      if(x<0||x>L.W||y<0||y>L.H){this._cancel();return;}
      this._trace(x,y);this._submit();
    }
  },
  _mult(n){return n>=8?3:n>=5?2:n>=3?1.5:1;},
  _fact(value,wrong=false){
    const d=this.D;
    if(wrong||this.divWave)return {a:value,b:d,op:'÷',answer:Math.floor(value/d),
      remainder:wrong?value%d:null,text:`${value} ÷ ${d}`,blank:null,level:d<=5?1:2};
    return {a:d,b:value/d,op:'×',answer:value,remainder:null,text:`${d} × ${value/d}`,blank:null,level:d<=5?1:2};
  },
  _submit(){
    if(this._syncFever()||!this._inputReady()||!this.path.length)return;
    const selected=[...this.path],e=this.engine,fever=this.wasFever;
    const wrong=selected.filter(i=>this.board[i].value%this.D!==0);
    this._cancel();
    if(wrong.length&&!fever){
      // One failed attempt, one life. No auto-filtering, no rewards for sweeping traps.
      const v=this.board[wrong[0]].value,p=this._fact(v,true);
      this.feedback={text:`${v} ÷ ${this.D} = ${p.answer} … ${p.remainder}`,t:1.2,bad:true};
      this.lock=.3;this.chainCount=0;e.sound.play('wrong');e.ui.shake(L.gu(.12),.09);
      const res=e.answerWrong(p,v,{freeze:false});
      if(res?.gameOver){this.phase='finished';this._detach?.();}
      return;
    }
    const correct=selected.filter(i=>this.board[i].value%this.D===0),mult=this._mult(correct.length);
    const before=e.scoreManager.score,layout=this._layout();
    const floatsBefore=e.ui.floatScores?.length||0;
    // Grade synchronously. A newly triggered fever changes mode only AFTER this path.
    // Each question keeps the old dan/op; no callbacks score stale tiles.
    for(const i of selected){
      const v=this.board[i].value,good=v%this.D===0,p=this._fact(v,!good);
      if(good)e.answerCorrect(p,p.answer,Math.round(30*mult));
      else e.answerWrong(p,v,{freeze:false});
    }
    // Use existing compact HUD style. Per-tile fever numbers would cover the
    // next board; this game's footer shows the actual aggregate score instead.
    for(const o of e.ui.comboOverlays||[]){o.compact=true;o.big=false;}
    if(e.ui.comboOverlays?.length>1)e.ui.comboOverlays.splice(0,e.ui.comboOverlays.length-1);
    e.ui.floatScores?.splice(floatsBefore);
    this.chainCount=correct.length;this.longest=Math.max(this.longest,correct.length);
    this.progress+=correct.length;this.poppedCount+=correct.length;
    this.pops.push(...correct.map((i,order)=>({...layout.points[i],value:this.board[i].value,
      order,delay:order*.22/Math.max(1,correct.length-1),t:0,fired:false,big:correct.length>=8})));
    this.feedback={text:correct.length?`${correct.length}연결! ×${mult}  +${e.scoreManager.score-before}`:'다시 이어봐!',t:.9};
    if(correct.length)e.ui.shake(L.gu(correct.length>=8?.18:.07),.09);
    const refill=refillBoard(this.board,new Set(selected),this.D,fever);
    this.board=refill.board;this.lock=.12;
    if(refill.rearranged){this.cue=.3;this.feedback={text:'새 길이 열렸어!',t:.5};}
    if(!fever&&this.progress>=24)this.pendingWave=true;
    if(this._syncFever())return;
    if(this.pendingWave){this.waveIndex++;this._newWave();this.cue=.6;}
    e.markQuestionStart();
  },
  onKey(e){
    if(e.repeat)return;
    if(this._syncFever()||!this._inputReady())return;
    this.keyboardMode=true;
    if(e.key==='Backspace'){this.path.pop();e.preventDefault?.();return;}
    if(e.key==='Enter'){this._submit();return;}
    if(e.key===' '){this._visit(this.cursor);e.preventDefault?.();return;}
    const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-4,ArrowDown:4}[e.key];
    if(delta){const n=this.cursor+delta;if(n>=0&&n<16&&(Math.abs(delta)===4||Math.floor(n/4)===Math.floor(this.cursor/4)))this.cursor=n;e.preventDefault?.();}
  },
  onHover(x,y){return this._hit(x,y)>=0;},
  clearHover(){},
  render(c){drawChainScene(c,this);},
  destroy(){this._detach?.();this.phase='finished';this._cancel();this.board=[];this.pops=[];this.normalSaved=null;},
};
