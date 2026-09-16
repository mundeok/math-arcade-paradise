import test from 'node:test';
import assert from 'node:assert/strict';
import { g03Race } from '../src/games/g03_race.js';
import { Engine } from '../src/core/engine.js';
import { ScoreManager } from '../src/core/scoreManager.js';
import { ProblemGenerator } from '../src/core/problemGenerator.js';
import { Fever } from '../src/core/fever.js';
import { UI } from '../src/core/ui.js';
import { Session } from '../src/core/session.js';
import { L } from '../src/core/layout.js';
import { cockpitLayout, gateLayout, roadProjection, projectWorld } from '../src/art/raceCockpit.js';

// 실제 엔진의 정답/오답/정지 경로를 사용하고 DOM·오디오만 대체한다.
function setup() {
  const e = Object.create(Engine.prototype);
  const g = Object.create(g03Race);
  Object.assign(e, { settings: {operation:'multiply',timeScale:1}, state:'PLAYING', game:g,
    scoreManager:new ScoreManager(), session:new Session(), fever:new Fever({type:'multi'}),
    freeze:{active:false,timer:0,dur:1.2}, scenes:{result:{enter(){ e.ends++; }}}, ends:0,
    sound:{play(){},playCorrect(){}}, particles:{emit(){},update(){}}, _pendingResume:null });
  e.problemGenerator = new ProblemGenerator(e.settings); e.ui = new UI(e);
  e.markQuestionStart(); g.init(e); return {e,g};
}
function cross(g, correct=true) {
  g.gate.judgeLane = correct ? g.gate.correctLane : (g.gate.correctLane+1)%3;
  g._judge();
}
function advance(e, sec) { for(let t=0;t<sec-1e-8;t+=.01)e._update(.01); }

test('연료 증감: 일반 정답 +8, 니어미스 추가 +5, 100 상한; 하트 차감 없음',()=>{
  const {e,g}=setup(); g.fuel=50; cross(g); assert.equal(g.fuel,58);
  g.laneChangedThisGate=true; g.lastLaneChangeAt=g.raceElapsed-.45; cross(g);
  assert.equal(g.fuel,71); assert.equal(e.scoreManager.score,250);
  g.fuel=99;cross(g);assert.equal(g.fuel,100);
  const lives=e.scoreManager.lives; cross(g,false);
  assert.equal(g.fuel,75);assert.equal(e.scoreManager.lives,lives);
  assert.equal(e.scoreManager.combo,0);assert.ok(e.freeze.active);
  assert.ok(e.problemGenerator.reviewQueue.length>0);
});
test('오답 4회로 소진: 1.2초 피드백 후 배너, 새 게이트 없이 결과 1회',()=>{
  const{e,g}=setup();
  for(let i=0;i<4;i++) {
    cross(g,false); assert.equal(g.fuel,75-i*25);assert.equal(e.scoreManager.lives,3);
    assert.equal(g.gate,null);advance(e,1.19);assert.equal(e.state,'PLAYING');
    advance(e,.02);if(i<3)assert.ok(g.gate);
  }
  assert.ok(g.finishing);assert.equal(g.gate,null);assert.equal(g.gatesPassed,4);
  advance(e,.8);assert.equal(e.state,'RESULT');assert.equal(e.ends,1);
  advance(e,1);assert.equal(e.ends,1);
});
test('부스터 비용/재사용/3초 경계, 중첩 배수는 각 한 번만',()=>{
  const{e,g}=setup();g.fuel=19;assert.equal(g._useManualBoost(),false);
  g.fuel=100;const sec=g.gate.sec;assert.ok(g._useManualBoost());
  assert.equal(g.fuel,80);assert.equal(g.gate.sec,sec);assert.equal(g._useManualBoost(),false);
  cross(g);assert.equal(e.scoreManager.score,150);assert.equal(g.fuel,88);
  e.pause();advance(e,4);assert.equal(g.manualBoostT,3);e.resumeGame();
  cross(g,false);advance(e,1.21);assert.ok(g.manualBoostT>2.98,'오답 정지 제외');
  g.gate=null;advance(e,3.1);assert.equal(g.manualBoostT,0);
  assert.equal(g._boostPoints(110),110);
});
test('연료20 부스터 소진은 오답을 만들지 않고 종료; 사용 중 키 반복 무시',()=>{
  const{e,g}=setup();g.onKey({key:' ',repeat:true});assert.equal(g.fuel,100);
  g.fuel=20;g.onKey({key:' ',repeat:false});assert.equal(g.fuel,0);
  assert.ok(g.finishing);assert.equal(g.gate,null);assert.equal(e.session.current.length,0);
  advance(e,.8);assert.equal(e.state,'RESULT');
});
test('버튼과 HUD 제스처는 조향하지 않음; 조향에서 버튼 진입도 발동하지 않음',()=>{
  const{g}=setup();const b=g._boostRect(),x=b.x+b.w/2,y=b.y+b.h/2;
  assert.ok(b.w>=L.minTouch&&b.h>=L.minTouch);assert.ok(b.y+b.h<=L.H-L.safe);
  g.onTouch(x,y,'start');g.onTouch(780,900,'move');g.onTouch(780,900,'end');
  assert.equal(g.targetLane,1);assert.equal(g.fuel,80);
  g.manualBoostT=0;g.onTouch(400,800,'start');g.onTouch(x,y,'move');g.onTouch(x,y,'end');
  assert.equal(g.fuel,80);assert.equal(g.targetLane,1);
  g.onTouch(400,60,'start');g.onTouch(780,900,'end');assert.equal(g.targetLane,1);
  g.onTouch(750,900,'start');g.onTouch(750,900,'end');assert.equal(g.targetLane,2);
});
test('피버 함정은 연료 무해, 정답 회복; 수동·피버 BOOST·core 배수 1회',()=>{
  const{e,g}=setup();e.fever.gain(100);g.update(0);g.fuel=60;
  const combo=e.scoreManager.combo;cross(g,false);
  assert.equal(g.fuel,60);assert.equal(e.scoreManager.combo,combo);assert.equal(e.freeze.active,false);
  assert.equal(e.problemGenerator.reviewQueue.length,0);
  g._useManualBoost();assert.equal(g.fuel,40);cross(g);
  assert.equal(g.fuel,48);assert.equal(e.scoreManager.score,450);
  cross(g);assert.equal(e.scoreManager.score,1770); // 110 ×2 ×1.5 ×4 +450
});
test('30게이트 이후에도 계속; 피버·연료·교사 배율에 상관없이 간격 >=1.4',()=>{
  const{e,g}=setup();for(let i=0;i<35;i++)cross(g);
  assert.equal(g.gatesPassed,35);assert.equal(g.finishing,false);assert.ok(g.gate);
  e.scoreManager.combo=20;e.fever.active=false;g.fuel=31;assert.equal(g._gateSec(),1.4);
  g.fuel=30;assert.equal(g._gateSec(),1.6);
  for(const fuel of [0,15,30,100])for(const active of [false,true])for(const timeScale of [.1,.8,1,1.5]){
    g.fuel=fuel;e.fever.active=active;e.settings.timeScale=timeScale;assert.ok(g._gateSec()>=1.4);
  }
});
test('최고점: 니어미스 추가점으로 넘는 경우도 감지; 기록 없으면 숨김',()=>{
  const{g}=setup();g.bestScore=120;g.laneChangedThisGate=true;g.lastLaneChangeAt=-.45;
  cross(g);assert.equal(g.beatBest,true);
  const {g:other}=setup();other.bestScore=null;cross(other);assert.equal(other.beatBest,false);
});

test('1인칭: 부스터는 2.6배 배경만 가속, 게이트/점수 타이머는 독립; 보간/정지/복귀',()=>{
  const {e,g}=setup(),{g:normal}=setup();
  const p=g.gate.p,sec=g.gate.sec,base=g._speedFeel();g._useManualBoost();
  advance(e,.25);
  assert.ok(g.boostVisual>.9);assert.ok(g._speedFeel()>base*2.4);
  assert.equal(g.gate.sec,sec);assert.ok(Math.abs(g.gate.p-p-.25/sec)<1e-8);
  const visual=g.boostVisual,scroll=g.scrollPhase;e.pause();advance(e,2);
  assert.equal(g.boostVisual,visual);assert.equal(g.scrollPhase,scroll);e.resumeGame();
  g.gate=null;advance(e,4);assert.equal(g.manualBoostT,0);assert.ok(g.boostVisual<.003);
  g.boostVisual=1;normal.boostVisual=0;
  assert.equal(roadProjection(g,.5).half,roadProjection(normal,.5).half,'가속과 원근 기하를 분리');
  g.gate={p:.5};normal.gate={p:.5};
  assert.deepEqual(gateLayout(g),gateLayout(normal),'부스터가 답 패널 배치를 바꾸지 않음');
});

test('공통 원근: 잠금 전 모든 숫자가 보이고 게이트/차선/기둥 깊이가 일치',()=>{
  const {g}=setup(),{dash,boost,fuel,wheel}=cockpitLayout();
  for(const lane of [0,.5,1,1.5,2])for(const sec of [1.4,2.4,3.6])for(let step=0;step<=100;step++){
    g.laneF=lane;g.gate.sec=sec;g.gate.p=(1-.4/sec)*step/100;
    const {panels,scale,posts,groundY}=gateLayout(g);
    for(let i=0;i<3;i++) {
      const r=panels[i];assert.ok(r.x>=L.safe&&r.x+r.w<=L.W-L.safe);
      assert.ok(r.y>=L.zone.playTop+L.gu(1.4));assert.ok(r.y+r.h<groundY&&groundY<dash);
      assert.ok(r.h>=L.gu(1.9)&&r.w>=L.gu(2.8));
      const foot=projectWorld(g,i-1,0,scale);
      assert.ok(Math.abs(r.x+r.w/2-foot.x)<1e-8);assert.equal(foot.y,groundY);
      if(i)assert.ok(panels[i-1].x+panels[i-1].w<r.x);
    }
    for(const post of posts){assert.equal(post.top.x,post.bottom.x);assert.equal(post.bottom.y,groundY);}
  }
  assert.ok(boost.y>=dash&&boost.y+boost.h<=L.H-L.safe);
  assert.ok(boost.w>=L.minTouch&&boost.h>=L.minTouch);
  assert.ok(fuel.x+fuel.w<wheel.x-wheel.r+L.gu(.25));
  g.onTouch(L.W/2,dash+L.gu(2),'start');g.onTouch(L.W-L.safe,L.zone.playBottom,'end');assert.equal(g.targetLane,1);
  g.onTouch(L.safe,L.zone.playBottom,'start');g.onTouch(L.safe,L.H-L.safe,'end');assert.equal(g.targetLane,1);
});
