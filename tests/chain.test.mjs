import test from 'node:test';
import assert from 'node:assert/strict';
import { g08Chain } from '../src/games/g08_chain.js';
import { newBoard,refillBoard,findChain,adjacent } from '../src/games/chainBoard.js';
import { ScoreManager } from '../src/core/scoreManager.js';
import { Fever } from '../src/core/fever.js';
import { L } from '../src/core/layout.js';
function setup(settings={}){
  const e={settings,scoreManager:new ScoreManager(),fever:new Fever({type:'easy'}),records:[],ends:0,
    ui:{shake(){}},particles:{emit(){}},sound:{tone(){},play(){}},markQuestionStart(){},isFrozen(){return false;},
    endGame(){this.ends++;},
    answerCorrect(p,v,points){assert.equal(v,p.answer);this.records.push({p,v,good:true});
      this.scoreManager.registerCorrect(points*(this.fever.active?this.fever.registerScoreStreak():1));this.fever.gainCorrect();},
    answerWrong(p,v,opts){this.records.push({p,v,opts,good:false});if(this.fever.active)return {gameOver:false};
      this.fever.gainWrong();const r=this.scoreManager.registerWrong({loseLife:true});if(r.gameOver)this.endGame();return r;},
  };
  const g=Object.create(g08Chain);g.init(e);g.update(1.01);return {g,e};
}
test('boards and gravity refills always have 16 values, desired ratio and a connected path',()=>{
  for(let d=2;d<=9;d++)for(const easy of [false,true])for(let run=0;run<30;run++){
    let b=newBoard(d,easy);
    for(let step=0;step<5;step++){
      assert.equal(b.length,16);assert.equal(b.filter(t=>t.value%d===0).length,easy?13:10);
      assert.ok(b.every(t=>Number.isInteger(t.value)&&t.value>0&&t.value<=d*(easy?5:9)));
      const path=findChain(b,d,easy?8:5);assert.ok(path);assert.equal(new Set(path).size,path.length);
      assert.ok(path.slice(1).every((v,i)=>adjacent(path[i],v)));
      b=refillBoard(b,new Set(path),d,easy).board;
    }
  }
});
test('fixed grid fits L, large touch targets, positions do not drift',()=>{
  const {g}=setup(),r=g._layout(),before=JSON.stringify(r.points);g.update(.5);
  assert.equal(JSON.stringify(g._layout().points),before);assert.ok(r.r*2>=L.minTouch);
  for(const p of r.points)assert.ok(p.x-r.r>=0&&p.x+r.r<=L.W&&p.y-r.r>=L.zone.playTop&&p.y+r.r<L.zone.floor);
});
test('touch selection is neutral, adjacent, reversible; only release grades',()=>{
  const {g,e}=setup();const p=g._layout().points;
  g.onTouch(p[0].x,p[0].y,'start');g.onTouch(p[1].x,p[1].y,'move');
  assert.deepEqual(g.path,[0,1]);assert.equal(e.records.length,0);
  g.onTouch(p[0].x,p[0].y,'move');assert.deepEqual(g.path,[0]);
  g._visit(15);assert.deepEqual(g.path,[0]);
  g.onTouch(0,0,'cancel');g.onTouch(p[0].x,p[0].y,'end');assert.equal(e.records.length,0);
});
test('length bonus needs no ascending order, each chosen correct is recorded once',()=>{
  const {g,e}=setup({dans:[4],operation:'divide'}),path=findChain(g.board,g.D,5).reverse();
  g.path=path;g._submit();assert.equal(e.records.length,5);assert.equal(g.poppedCount,5);
  assert.equal(e.scoreManager.score,5*30*2);assert.ok(e.records.every(r=>r.p.op==='÷'&&r.v===r.p.answer));
  g._submit();assert.equal(e.records.length,5);assert.equal(g.longest,5);
  assert.ok(g.pops.every(p=>p.delay+.14<=.361));
  assert.deepEqual([1,2,3,4,5,7,8,16].map(n=>g._mult(n)),[1,1,1.5,1.5,2,2,3,3]);
});
test('normal trap costs one life with no sweep points, board/progress preserved',()=>{
  const {g,e}=setup();const board=g.board,wrong=g.board.findIndex(b=>b.value%g.D!==0);
  g.path=[wrong];g._submit();assert.equal(e.records.length,1);assert.equal(e.scoreManager.lives,2);
  assert.equal(e.scoreManager.score,0);assert.equal(g.board,board);assert.equal(g.progress,0);
  assert.equal(e.records[0].opts.freeze,false);assert.ok(e.records[0].p.remainder>0);
});
test('fever clears pending drag, uses easy board, mixed path scores only multiples and restores normal',()=>{
  const {g,e}=setup({dans:[2,8]});const board=g.board,d=g.D;g.path=[0];g.dragging=true;
  e.fever.active=true;g.update(.01);assert.equal(g.path.length,0);assert.equal(g.D,2);
  g.update(.5);const lives=e.scoreManager.lives;
  g.path=Array.from({length:16},(_,i)=>Math.floor(i/4)*4+(Math.floor(i/4)%2?3-i%4:i%4));
  g._submit();assert.equal(e.records.filter(r=>r.good).length,13);assert.equal(e.records.filter(r=>!r.good).length,3);
  assert.ok(e.scoreManager.lives>=lives);assert.equal(g.chainCount,13);
  e.fever.active=false;g.update(.01);assert.equal(g.board,board);assert.equal(g.D,d);assert.equal(g.pops.length,0);
  assert.equal(g.path.length,0);assert.ok(g.cue>0);
});
test('mid-path fever activation does not lose records or change the fact dan',()=>{
  const {g,e}=setup({dans:[7]});const d=g.D;e.fever.gauge=90;g.path=findChain(g.board,d,5);g._submit();
  assert.equal(e.records.length,5);assert.ok(e.records.every(r=>r.p.a===d));assert.equal(g.wasFever,true);
  assert.equal(g.normalSaved.progress,5);assert.equal(g.normalSaved.D,d);assert.equal(g.D,7);
});
test('60s finishes once, cancelled paths and repeated keys cannot submit',()=>{
  const {g,e}=setup();g.path=findChain(g.board,g.D,5);g.onKey({key:'Enter',repeat:true});assert.equal(e.records.length,0);
  g.remaining=.01;g.update(.02);g._submit();g.update(1);assert.equal(e.ends,1);assert.equal(e.records.length,0);
});
test('teacher operation lock and selected dans remain valid across normal/fever waves',()=>{
  for(const operation of ['multiply','divide']){
    const {g,e}=setup({operation,dans:[9]});assert.equal(g.D,9);assert.equal(g.divWave,operation==='divide');
    e.fever.active=true;g.update(.01);assert.equal(g.D,9);assert.ok(g.board.every(b=>b.value<=45));
  }
});
