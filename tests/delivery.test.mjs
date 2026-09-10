import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDeliveryBank,DeliveryDeck,factKey } from '../src/games/deliveryDeck.js';
import { g01Delivery } from '../src/games/g01_delivery.js';
import { g01Combo } from '../src/games/g01_combo.js';
import { ScoreManager } from '../src/core/scoreManager.js';
import { Fever } from '../src/core/fever.js';
import { L } from '../src/core/layout.js';
function setup(settings={}) {
  const e={settings,scoreManager:new ScoreManager(),fever:new Fever({type:'easy'}),records:[],ended:false,
    markQuestionStart(){},isFrozen(){return false;},ui:{shake(){},showComboText(){}},particles:{emit(){}},sound:{play(){}},
    endGame(){this.ended=true;},startGame(g){this.started=g;},
    answerCorrect(p,v,pts){const mult=this.fever.active?this.fever.registerScoreStreak():1;
      this.scoreManager.registerCorrect(pts*mult);this.records.push({p,v,correct:true});this.fever.gainCorrect();},
    answerWrong(p,v,opts){this.records.push({p,v,correct:false,opts});if(this.fever.active)return {gameOver:false};
      const r=this.scoreManager.registerWrong({loseLife:true});this.fever.gainWrong();if(r.gameOver)this.endGame();return r;},
  };
  const g=Object.create(g01Delivery);g.init(e);g._start();g.update(1.01);return {g,e};
}
function correct(g){g._send(g.targets.indexOf(g.queue[0].answer));}

test('teacher operation/dans respected; all equations are exact within the bounded deck',()=>{
  for(const operation of ['multiply','divide','mixed'])for(const dans of [[2],[9],[3,7],[]])for(const easy of [false,true]){
    const bank=makeDeliveryBank({operation,dans},easy);assert.ok(bank.length>=4);
    for(const p of bank){assert.equal(p.op==='×'?p.a*p.b:p.a/p.b,p.answer);assert.equal(p.blank,null);
      if(operation!=='mixed')assert.equal(p.op,operation==='divide'?'÷':'×');
      if(dans.length)assert.ok(dans.includes(p.op==='×'?p.a:p.b));}
  }
});
test('two distinct fixed destinations, correct membership and bounded generation for 100 batches',()=>{
  for(const operation of ['multiply','divide','mixed']) {
    const d=new DeliveryDeck({operation,dans:[9]});
    for(let i=0;i<100;i++){const t=d.startBatch(i%3===0);assert.equal(new Set(t).size,2);
      for(let j=0;j<20;j++)assert.ok(t.includes(d.next().answer));}
  }
});
test('correct sends immediately advance; eight cards depart with bonus, targets announced',()=>{
  const {g,e}=setup();const first=g.queue[0],targets=[...g.targets];correct(g);
  assert.notEqual(g.queue[0],first);assert.equal(g.delivered,1);assert.equal(g.lock,0);assert.deepEqual(g.targets,targets);
  for(let i=0;i<7;i++)correct(g);
  assert.equal(g.loads,1);assert.equal(g.delivered,8);assert.equal(e.records.length,8);
  assert.equal(e.scoreManager.score,8*120+200);assert.ok(g.cue>0);
  const n=e.records.length;correct(g);assert.equal(e.records.length,n);
});
test('wrong direction loses life/combo but not progress; correction and local review survive',()=>{
  const {g,e}=setup();correct(g);const p=g.queue[0];
  g._send(1-g.targets.indexOf(p.answer));assert.equal(e.scoreManager.lives,2);assert.equal(e.scoreManager.combo,0);
  assert.equal(g.inLoad,1);assert.equal(g.feedback.text,`${p.text} = ${p.answer}`);assert.ok(g.lock>0);
  let seen=false;
  for(let i=0;i<12;i++){g.update(1);const next=g.queue[0];if(next.fromReview&&factKey(next)===factKey(p))seen=true;correct(g);}
  assert.ok(seen);assert.equal(g.deck.reviews.length,0);
});
test('fever starts at the scoring boundary, restores unconsumed queue, no invincible penalty',()=>{
  const {g,e}=setup();e.fever.gauge=90;const next=g.queue[1];correct(g);
  assert.ok(g.wasFever);assert.equal(g.normalSaved.queue[0],next);assert.equal(g.delivered,1);
  g.update(.7);const lives=e.scoreManager.lives,combo=e.scoreManager.combo;
  g._send(1-g.targets.indexOf(g.queue[0].answer));assert.equal(e.scoreManager.lives,lives);assert.equal(e.scoreManager.combo,combo);
  assert.equal(g.lock,0);e.fever.active=false;g.update(.01);
  assert.equal(g.queue[0],next);assert.equal(g.inLoad,1);assert.equal(g.wasFever,false);assert.equal(g.flights.length,0);
});
test('touch requires release inside the same button; held key and transition gestures do not submit',()=>{
  const {g,e}=setup();const b=g._layout().buttons[g.targets.indexOf(g.queue[0].answer)];
  g.onTouch(b.x+b.w/2,b.y+b.h/2,'start');assert.equal(e.records.length,0);
  g.onTouch(b.x+b.w/2,b.y+b.h/2,'end');assert.equal(e.records.length,1);
  g.onTouch(b.x+b.w/2,b.y+b.h/2,'end');assert.equal(e.records.length,1);
  g.onKey({key:'ArrowLeft',repeat:true});assert.equal(e.records.length,1);
  g.onTouch(b.x,b.y,'start');e.fever.gauge=100;e.fever.gainCorrect();g.update(.01);
  g.onTouch(b.x,b.y,'end');assert.equal(e.records.length,1);
});
test('60 active seconds ends once; all controls fit L bounds; legacy remains separate',()=>{
  const {g,e}=setup();g.remaining=.02;g.update(.03);assert.ok(e.ended);assert.equal(g.phase,'finished');
  const n=e.records.length;correct(g);assert.equal(e.records.length,n);
  for(const b of Object.values(g._layout()).flat()) {
    assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=L.W&&b.y+b.h<=L.H);
    assert.ok(b.w>=L.minTouch&&b.h>=L.minTouch);
  }
  const h=Object.create(g01Delivery);h.init(e);const r=h._layout().legacy;
  h.onTouch(r.x+1,r.y+1,'start');h.onTouch(r.x+1,r.y+1,'end');assert.equal(e.started,g01Combo);
  assert.notEqual(g01Combo.id,g01Delivery.id);
});

test('five-second card deadline advances once, records a miss, preserves delivery progress and reviews',()=>{
  const {g,e}=setup();correct(g);const p=g.queue[0],next=g.queue[1];
  const b=g._layout().buttons[0];g.onTouch(b.x+1,b.y+1,'start');
  g.update(4.99);assert.equal(e.records.length,1);g.update(.02);
  assert.equal(e.records.length,2);assert.equal(e.records[1].v,null);
  assert.deepEqual(e.records[1].opts,{freeze:false,missed:true,affectLevel:false});
  assert.equal(g.queue[0],next);assert.equal(g.inLoad,1);assert.equal(g.cardAge,0);
  assert.equal(e.scoreManager.lives,2);assert.equal(e.scoreManager.combo,0);
  assert.ok(g.deck.reviews.some(r=>factKey(r.p)===factKey(p)));
  g.onTouch(b.x+1,b.y+1,'end');assert.equal(e.records.length,2);
  g.update(.2);assert.equal(g.cardAge,0);assert.equal(e.records.length,2);
});

test('teacher time scale, transition cues, fever and end-of-round protect the card clock',()=>{
  const {g,e}=setup({timeScale:1.5});assert.equal(g._cardSeconds(),7.5);
  g.cue=1;g.update(.8);assert.equal(g.cardAge,0);g.update(.3);
  g.update(7.4);assert.equal(e.records.length,0);
  e.fever.active=true;g.update(.01);g.update(.7);g.update(9);
  assert.equal(e.records.length,0);assert.equal(e.scoreManager.lives,3);
  e.fever.active=false;g.update(.01);g.update(.9);assert.equal(g.cardAge,0);
  g.remaining=.01;g.cardAge=7.49;g.update(.02);
  assert.ok(e.ended);assert.equal(e.records.length,0);
});

test('score steps shorten only the next card from 5 to 3 seconds, never combo-dependent',()=>{
  const {g,e}=setup();
  for(const [score,seconds] of [[0,5],[999,5],[1000,4.8],[5000,4],[9999,3.2],[10000,3],[999999,3]]){
    const old=g._cardSeconds();e.scoreManager.score=score;
    assert.equal(g._cardSeconds(),old);g._resetCardClock();assert.equal(g._cardSeconds(),seconds);
    e.scoreManager.combo=0;assert.equal(g._nextCardSeconds(),seconds);
  }
  e.scoreManager.score=990;g._resetCardClock();correct(g);assert.equal(g._cardSeconds(),4.8);
});

test('3s floor survives teacher speed-up; fever exit snapshots score and gives a fresh clock',()=>{
  const {g,e}=setup({timeScale:.5});assert.equal(g._cardSeconds(),3);
  e.settings.timeScale=1.5;e.scoreManager.score=10000;g._resetCardClock();assert.equal(g._cardSeconds(),4.5);
  e.settings.timeScale=1;e.fever.active=true;g.update(.01);g.update(.7);
  e.scoreManager.score=20000;g.update(8);assert.equal(e.records.length,0);
  e.fever.active=false;g.update(.01);g.update(.9);assert.equal(g.cardAge,0);assert.equal(g._cardSeconds(),3);
  g.update(2.99);assert.equal(e.records.length,0);g.update(.02);assert.equal(e.records.length,1);
  assert.equal(e.records[0].opts.missed,true);
});
