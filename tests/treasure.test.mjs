import test from 'node:test';
import assert from 'node:assert/strict';
import {g10Treasure} from '../src/games/g10_treasure.js';
import {ScoreManager} from '../src/core/scoreManager.js';
import {Fever} from '../src/core/fever.js';
import {L} from '../src/core/layout.js';

function setup(level=1,seen=true) {
  const e={settings:{timeScale:1},storage:{get:()=>seen,set(){}},freeze:{active:false},
    scoreManager:new ScoreManager(),fever:new Fever({type:'easy'}),problemGenerator:{currentLevel:level},records:[],
    markQuestionStart(){},particles:{emit(){}},ui:{shake(){},flash(){},showComboText(){}},sound:{play(){},tone(){}},
    reportNearMiss(){this.near=(this.near||0)+1;},
    answerCorrect(p,v,pts){const mult=this.fever.active?this.fever.registerScoreStreak():1;
      this.scoreManager.registerCorrect(Math.round(pts*mult));this.records.push({p,v,pts,correct:true});this.fever.gainCorrect();},
    answerWrong(p,v,opts){this.records.push({p,v,correct:false});if(!this.fever.active)this.scoreManager.registerWrong(opts);
      this.freeze={active:!this.fever.active,onResume:opts.onResume};},
    timeUp(p,o){this.answerWrong(p,null,o);}
  };
  const g=Object.create(g10Treasure);e.game=g;g.init(e);return{g,e};
}
function board(g,D=17,P=5){
  g._nextProblem();
  Object.assign(g,{dividend:D,divisor:P,q:Math.floor(D/P),r:D%P,counts:Array(P).fill(0),pile:D,pirateBounces:Array(P).fill(0),
    problem:{a:D,b:P,op:'÷',answer:Math.floor(D/P),remainder:D%P||null,level:3,text:D+' ÷ '+P}});
}
const center=r=>[r.x+r.w/2,r.y+r.h/2];
function tap(g,r){g.onTouch(...center(r),'start');g.onTouch(...center(r),'end');}
function fire(g,k=g.q){g._setQuantity(k);tap(g,g._btnDone());}
function collect(g){tap(g,g._chestRect());g.update(.41);}
function resume(e){e.freeze.active=false;const cb=e.freeze.onResume;e.freeze.onResume=null;cb?.();}

test('본게임 모든 레벨: 자유 배분/미선택 발사/상자만으로는 통과 불가, 범위는 항상 1~9',()=>{
  for(let lv=1;lv<=5;lv++){
    const{g,e}=setup(lv);board(g);
    for(let i=0;i<20;i++){g._dealRound();g._giveOne(0);tap(g,g._btnDone());tap(g,g._chestRect());}
    assert.equal(g.pile,17);assert.deepEqual(g.counts,[0,0,0,0,0]);assert.equal(e.records.length,0);
    assert.equal(g.predMax,9);assert.equal(g.predictVal,0);
    for(const k of [1,2,9]){g._setQuantity(k);assert.equal(g.pile,17);assert.equal(g.failure,null,'선택 중 정오답 미리보기 없음');}
  }
});
test('정답은 발사 시 한 번만 기록, 수집 지연 무제한·중복 보상/재발사 금지',()=>{
  const{g,e}=setup();board(g);g.timeLeft=.25;fire(g);
  assert.equal(g.mode,'collect');assert.equal(e.records.length,1);assert.equal(e.scoreManager.score,120);assert.equal(e.near,1);
  assert.deepEqual(g.counts,[3,3,3,3,3]);assert.equal(g.pile,2);assert.equal(g.cargoCount,0);
  const q=g.problem;for(let i=0;i<800;i++)g.update(.05);
  assert.equal(g.mode,'collect');assert.equal(g.timeLeft,.25);assert.equal(e.records.length,1);
  g._fire();g._dealRound();g._giveOne(0);assert.equal(e.records.length,1);
  tap(g,g._chestRect());tap(g,g._chestRect());assert.equal(g.cargoCount,1);assert.equal(e.records.length,1);
  g.update(.399);assert.equal(g.problem,q);g.update(.002);assert.notEqual(g.problem,q);assert.ok(g.receipt);
});
test('과소 발사: 균등하지만 더 배분 가능. 과다 발사: 보석 부족, 가짜 불균등 배분 없음',()=>{
  for(const k of [2,4]){
    const{g,e}=setup();board(g);fire(g,k);g._fire();g._judge();
    assert.equal(e.records.length,1);assert.equal(e.records[0].v,k);assert.equal(e.scoreManager.lives,2);
    assert.equal(g.mode,'waiting');assert.equal(g.cargoCount,0);
    if(k===2){assert.equal(g.pile,7);assert.deepEqual(g.counts,[2,2,2,2,2]);assert.equal(g.failure.left,7);}
    else{assert.equal(g.failure.missing,3);assert.equal(g.failure.needed,20);assert.equal(g.pile,17);assert.deepEqual(g.counts,[0,0,0,0,0]);}
    assert.equal(g.pile+g.counts.reduce((a,b)=>a+b,0),17);
    const p=g.problem;resume(e);assert.notEqual(g.problem,p);assert.equal(g.predictVal,0);
  }
});
test('연습 무득점/무기록/무제한, 다른 예제 사용, 본게임 수량·시간 복원',()=>{
  const{g,e}=setup();board(g,7,3);g.predictVal=2;g.timeLeft=4;const original=g.problem;
  g._enterPractice();assert.notEqual(g.divisor,3);assert.equal(g.practice,true);
  for(let n=0;n<9;n++){
    g._giveOne(0);while(g.pile>=g.divisor||Math.min(...g.counts)!==Math.max(...g.counts))g._dealRound();
    const before=g.timeLeft;g._dealRound();g.update(30);assert.equal(g.timeLeft,before);
    g._judge();g.update(.41);
  }
  assert.equal(e.records.length,0);assert.equal(e.scoreManager.score,0);assert.equal(e.scoreManager.lives,3);
  assert.equal(e.fever.gauge,0);assert.equal(g.cargoCount,0);assert.equal(e.problemGenerator.currentLevel,1);
  g._leavePractice();assert.equal(g.problem,original);assert.equal(g.predictVal,2);assert.equal(g.timeLeft,4);
});
test('초기 안내: 연습 또는 바로 도전, 재시작 시 이벤트/진행 초기화',()=>{
  const{g,e}=setup(1,false);assert.equal(g.mode,'concept');
  tap(g,g._btnConceptClose());assert.ok(g.practice);tap(g,g._btnConcept());assert.equal(g.mode,'play');assert.equal(g.practice,false);
  g.cargoCount=4;g.init(e);assert.equal(g.mode,'concept');assert.equal(g.cargoCount,0);
  tap(g,g._btnConceptSkip());assert.equal(g.mode,'play');assert.equal(g.practice,false);
});
test('피버 같은 조작·쉬운 수량, 함정 무적, 정상 보드/선택값 복원',()=>{
  const{g,e}=setup(5);board(g,74,9);g.predictVal=8;g.timeLeft=7;const p=g.problem;
  e.fever.gain(100);g.update(0);
  assert.ok(g.dividend<=10&&g.divisor>=2&&g.divisor<=4);assert.equal(g.predMax,9);assert.equal(g.practice,false);
  fire(g,9);assert.equal(e.scoreManager.lives,3);assert.equal(e.records.at(-1).correct,false);resume(e);
  for(const stage of [1,2,3]){e.fever.stage=stage;fire(g);collect(g);}
  e.fever.active=false;g.update(0);assert.equal(g.problem,p);assert.equal(g.predictVal,8);assert.equal(g.timeLeft,7);
  assert.equal(g.flights.length,0);assert.equal(g.drag,null);assert.equal(g.cargoCount,3);
});
test('발사로 피버가 켜져도 이미 맞힌 보석은 수집 가능; 종료 중 수집도 버리지 않음',()=>{
  const{g,e}=setup();board(g);e.fever.gauge=90;fire(g);
  const p=g.problem;assert.equal(g.floats.at(-1).text,'+120');g.update(0);assert.equal(g.problem,p);assert.equal(g.mode,'collect');
  e.fever.active=false;g.update(0);assert.equal(g.problem,p);collect(g);assert.equal(g.cargoCount,1);assert.equal(e.records.length,1);
  board(g);const saved=g.problem;e.fever.gain(100);g.update(0);fire(g);const easy=g.problem;
  e.fever.active=false;g.update(0);assert.equal(g.problem,easy);assert.equal(g.mode,'collect');
  collect(g);assert.equal(g.problem,saved);assert.equal(g.mode,'play');
});
test('피버 중 연습을 열었다 종료하면 일반 보드 복원. 연습 보상 오염 없음',()=>{
  const{g,e}=setup();board(g);const p=g.problem;e.fever.gain(100);g.update(0);
  g._enterPractice();e.fever.active=false;g.update(1);g._leavePractice();
  assert.equal(g.problem,p);assert.equal(g.mode,'play');assert.equal(g.practice,false);assert.equal(e.records.length,0);
});
test('드래그 end/취소/일시정지는 제출 안 함. 수집 뒤 다음 문제로 제스처 이월 없음',()=>{
  const{g,e}=setup();board(g);fire(g);const a=center(g._pileRect()),b=center(g._chestRect());
  g.onTouch(...a,'start');g.onTouch(...b,'end');assert.equal(g.cargoCount,0);
  g.onTouch(...a,'start');g._pauseGesture({key:'Escape'});g.onTouch(...b,'move');assert.equal(g.cargoCount,0);
  g.onTouch(...a,'start');g.onTouch(...b,'move');assert.equal(g.cargoCount,1);assert.equal(e.records.length,1);
  g.update(.41);g.onTouch(...b,'move');g.onTouch(...b,'end');assert.equal(e.records.length,1);
});
test('0 나머지 동일 보상, 시간초과 한 번, 피버 배수 실제 가산 표시',()=>{
  for(const D of [15,17]){const{g,e}=setup();board(g,D);fire(g);collect(g);assert.equal(e.scoreManager.score,120);assert.equal(g.cargoCount,1);}
  const{g,e}=setup();g.timeLeft=.01;g.update(.02);g.update(.1);assert.equal(e.records.length,1);assert.equal(g.mode,'waiting');
  resume(e);e.fever.gain(100);g.update(0);const before=e.scoreManager.score;fire(g);
  assert.equal(g.floats.at(-1).text,'+'+(e.scoreManager.score-before));
});
test('1~9 수량 슬라이드/키보드, 큰 묶음 비행 상한, 좌표/터치 크기',()=>{
  const{g,e}=setup(5);board(g,81,9);const r=g._quantityRect();
  for(let k=1;k<=9;k++){g._selectQuantity(r.x+r.w*(k-1)/8);assert.equal(g.predictVal,k);}
  g.onKey({key:'1',repeat:true});assert.equal(g.predictVal,9);fire(g,9);
  assert.equal(g.flights.length,81);assert.ok(g.flights.every(f=>f.dur-f.t<=.340001));g.update(.45);assert.equal(g.flights.length,0);
  for(let lv=1;lv<=5;lv++){e.problemGenerator.currentLevel=lv;g._nextProblem();
    const rects=[g._pileRect(),g._chestRect(),...g._pirateRects(),g._btnConcept(),g._btnPredMinus(),g._btnPredPlus(),g._quantityRect(),g._btnDone()];
    for(const[aIndex,a]of rects.entries()){
      assert.ok(a.w>=L.minTouch&&a.h>=L.minTouch);
      for(const b of rects.slice(aIndex+1))assert.ok(a.x+a.w<=b.x+.01||b.x+b.w<=a.x+.01||a.y+a.h<=b.y+.01||b.y+b.h<=a.y+.01);
    }
  }
});
