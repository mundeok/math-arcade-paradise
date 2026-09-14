import test from 'node:test';
import assert from 'node:assert/strict';
import {g09Balloon} from '../src/games/g09_balloon.js';
import {ScoreManager} from '../src/core/scoreManager.js';
import {ProblemGenerator} from '../src/core/problemGenerator.js';
import {createBalloonBoard} from '../src/games/balloonBoard.js';
import {L} from '../src/core/layout.js';
import {Fever} from '../src/core/fever.js';
function setup(){
  const settings={operation:'multiply',timeScale:1};
  const e={settings,freeze:{active:false},scoreManager:new ScoreManager(),problemGenerator:new ProblemGenerator(settings),fever:new Fever({type:'multi'}),records:[],
    sound:{play(){},tone(){}},particles:{emit(){}},ui:{floatScores:[],flash(){},shake(){},showComboText(){}},markQuestionStart(){},reportNearMiss(){this.fever.gainNearMissBonus();},
    answerCorrect(p,v,pts){this.records.push({correct:true,p});this.scoreManager.registerCorrect(pts*(this.fever.active?this.fever.registerScoreStreak():1));this.problemGenerator.reportResult(p,true);this.fever.gainCorrect();},
    answerWrong(p,v,o){this.records.push({correct:false,p,...o});if(!this.fever.active){this.scoreManager.registerWrong(o);this.freeze={active:o.freeze!==false,onResume:o.onResume};}},
  };
  const g=Object.create(g09Balloon);g.init(e);return {g,e};
}
function tap(g,b){g.onTouch(b.x,b.y,'start');}
function resume(e){e.freeze.active=false;e.freeze.onResume?.();}
test('6문제/6답: 하나씩 비우고 남은 객체·좌표 보존, 완성 보너스는 한 번',()=>{
  const {g,e}=setup(), original=g.balloons.slice();
  assert.equal(original.length,6);
  assert.equal(new Set(original.map(b=>b.value)).size,6);
  for(let i=0;i<6;i++){
    const preview=g.nextProblem,target=g.balloons.find(b=>b.correct);
    const rest=g.balloons.filter(b=>b!==target), before=rest.map(b=>[b.x,b.y]);
    tap(g,target);
    assert.equal(e.records.length,i+1);
    if(i<5){
      assert.equal(g.problem,preview);assert.equal(g.balloons.length,5-i);
      assert.deepEqual(g.balloons,rest);
      rest.forEach((b,j)=>{assert.equal(g.balloons[j],b);assert.deepEqual([b.x,b.y],before[j]);});
      assert.equal(g.balloons.filter(b=>b.correct).length,1);
    }
  }
  assert.equal(g.bouquets,1);assert.equal(g.collected.length,0);assert.equal(g.burst.bonus,300);
  assert.equal(e.scoreManager.score,840);assert.equal(e.scoreManager.combo,6);
  assert.equal(new Set(e.records.map(r=>r.p.answer)).size,6);
  assert.equal(g.balloons.length,6);assert.ok(g.balloons.every(b=>!original.includes(b)));
});
test('오답 풍선은 다음 문제의 답: 제거/재배치 없이 피드백 후 재시도',()=>{
  const {g,e}=setup();tap(g,g.balloons.find(b=>b.correct));
  const p=g.problem,queue=g.boardProblems.slice(),remaining=g.balloons.slice();
  const score=e.scoreManager.score,lives=e.scoreManager.lives;
  tap(g,g.balloons.find(b=>!b.correct));
  assert.ok(e.freeze.active);assert.equal(e.scoreManager.lives,lives-1);assert.equal(e.scoreManager.score,score);
  resume(e);assert.equal(g.problem,p);assert.equal(g.collected.length,1);
  assert.deepEqual(g.boardProblems,queue);assert.deepEqual(g.balloons,remaining);
  tap(g,g.balloons.find(b=>b.correct));assert.equal(g.balloons.length,4);
});
test('작은 부유는 콤보·점수와 무관, 정상6/피버7 터치영역 비중첩·화면내 유지',()=>{
  const {g,e}=setup();
  const check=()=>{
    for(const a of g.balloons){
      assert.ok(Math.abs(a.x-a.baseX)<=L.gu(.28)+1e-8);
      assert.ok(Math.abs(a.y-a.baseY)<=L.gu(.3)+1e-8);
      assert.ok(a.x-g.rx-g.pad>=L.safe&&a.x+g.rx+g.pad<=L.W-L.safe);
      assert.ok(a.y-g.ry-g.pad>g.playTop&&a.y+g.ry+g.pad<g.playBottom);
      for(const b of g.balloons)if(a!==b)
        assert.ok(Math.abs(a.x-b.x)>2*(g.rx+g.pad)||Math.abs(a.y-b.y)>2*(g.ry+g.pad));
    }
  };
  for(let i=0;i<3600;i++){g.update(1/60);check();}
  assert.equal(e.records.length,0,'기다려도 놓침 벌점 없음');
  const phase=g.balloons[0].wobble;e.scoreManager.combo=90;e.scoreManager.score=999999;
  g.update(.1);assert.ok(Math.abs(g.balloons[0].wobble-phase-.085)<1e-8);
  tap(g,g.balloons.find(b=>b.correct));check();
  e.fever.gain(100);g.update(0);
  for(let i=0;i<3600;i++){g.update(1/60);check();}
});
test('피버 7개 즉시 보충·함정 무해·ULTRA 보존, 종료 시 남은 판/문제/위치 복원',()=>{
  const{g,e}=setup();tap(g,g.balloons.find(b=>b.correct));g.update(.2);
  const p=g.problem,preview=g.nextProblem,queue=g.boardProblems.slice(),remaining=g.balloons.map(b=>({...b}));
  const served=e.problemGenerator.served;e.fever.gain(100);
  tap(g,g.balloons.find(b=>b.correct));assert.equal(g.collected.length,1,'전환 프레임 입력 차단');
  g.update(0);assert.ok(g.multiMode);assert.equal(g.balloons.length,7);
  const bad=g.balloons.find(b=>!e.fever.isMultiple(b.value));
  const lives=e.scoreManager.lives,combo=e.scoreManager.combo;
  tap(g,bad);assert.equal(e.scoreManager.lives,lives);assert.equal(e.scoreManager.combo,combo);
  assert.equal(g.balloons.length,7);
  e.fever.stage=3;g.update(0);
  for(let i=0;i<100;i++){tap(g,g.balloons[0]);g.update(.01);assert.ok(g.balloons.every(b=>e.fever.isMultiple(b.value)));}
  assert.equal(e.problemGenerator.served,served);e.fever.active=false;
  const records=e.records.length;tap(g,g.balloons[0]);assert.equal(e.records.length,records);
  g.update(0);assert.equal(g.multiMode,false);assert.equal(g.problem,p);assert.equal(g.nextProblem,preview);
  assert.deepEqual(g.boardProblems,queue);assert.deepEqual(g.balloons,remaining);
  assert.equal(g.savedRound,null);assert.equal(g.popEffects.length,0);
  tap(g,g.balloons.find(b=>b.correct));assert.equal(g.problem,preview);assert.equal(g.collected.length,2);
});
test('피버 함정만 남으면 갱신, 보충 슬롯 위치 고정/중복 없음',()=>{
  const{g,e}=setup();e.fever.gain(100);g.update(0);
  const anchors=new Map(g.balloons.map(b=>[b.slot,[b.baseX,b.baseY]]));
  for(const b of g.balloons){b.value=e.fever.randomTrap();b.correct=false;}
  g.update(0);assert.ok(g.balloons.some(b=>e.fever.isMultiple(b.value)));
  for(let i=0;i<50;i++){
    tap(g,g.balloons.find(b=>e.fever.isMultiple(b.value)));g.update(0);
    assert.equal(new Set(g.balloons.map(b=>b.slot)).size,7);
    for(const b of g.balloons)assert.deepEqual([b.baseX,b.baseY],anchors.get(b.slot));
  }
  assert.equal(g._spawnOneBalloonMulti(),null);
});
test('교사 곱셈/나눗셈·단 선택·Lv1~3: 1,200판의 7,200문제 모두 유효한 서로 다른 답',()=>{
  for(const operation of ['multiply','divide'])for(const lv of [1,2,3])for(const oneDan of [false,true]){
    const dans=oneDan?[lv===1?2:6]:[2,3,4,5,6,7,8,9];
    const pg=new ProblemGenerator({operation,dans});pg.currentLevel=lv;
    for(let i=0;i<100;i++){
      const served=pg.served,ps=createBalloonBoard(pg,{maxLevel:3,blankRatio:0,opMode:'multiply'});
      assert.equal(pg.served,served+6);assert.equal(new Set(ps.map(p=>p.answer)).size,6);
      for(const p of ps){
        assert.equal(p.op,operation==='multiply'?'×':'÷');assert.ok(p.level<=3);assert.equal(p.blank,null);
        assert.equal(p.answer,operation==='multiply'?p.a*p.b:p.a/p.b);
        assert.ok(dans.includes(operation==='multiply'?p.a:p.b));
      }
    }
  }
});
test('복습 답 중복은 판 내 한 번만, 원본 복습큐는 실제 정답 전까지 보존',()=>{
  const{g,e}=setup(),p=g.problem;e.problemGenerator.addToReview(p);
  e.problemGenerator.reviewQueue[0].dueAt=0;g._startRound();
  assert.ok(g.problem.fromReview);assert.equal(g.problem.answer,p.answer);
  assert.equal(g.boardProblems.filter(q=>q.answer===p.answer).length,1);
  assert.equal(e.problemGenerator.reviewQueue.length,1);
  tap(g,g.balloons.find(b=>b.correct));assert.equal(e.problemGenerator.reviewQueue.length,0);
});
test('좁은 문제공간 실패는 유한하며 실제 생성기 카운터/최근목록을 오염하지 않음',()=>{
  const pg={served:0,recentKeys:[],reviewQueue:[],nextProblem(){this.served++;this.recentKeys.push('same');return{answer:4};}};
  assert.throws(()=>createBalloonBoard(pg,{}),/서로 다른 정답/);
  assert.equal(pg.served,0);assert.deepEqual(pg.recentKeys,[]);
});
test('상단/하단/드래그/동결 입력 무시, 재시작 초기화',()=>{
  const{g,e}=setup();const b=g.balloons.find(b=>b.correct);
  g.onTouch(b.x,b.y,'move');g.onTouch(b.x,g.playTop-1,'start');g.onTouch(b.x,g.playBottom+1,'start');
  e.freeze.active=true;tap(g,b);assert.equal(e.scoreManager.score,0);e.freeze.active=false;tap(g,b);
  g.destroy();g.init(e);assert.equal(g.collected.length,0);assert.equal(g.bouquets,0);assert.equal(g.savedRound,null);
  assert.equal(g.balloons.length,6);assert.equal(g.boardProblems.length,6);
});
test('마지막 정답으로 피버 발동해도 새 판 전체를 보관/복원',()=>{
  const{g,e}=setup();for(let i=0;i<5;i++)tap(g,g.balloons.find(b=>b.correct));
  assert.equal(g.nextProblem,null);e.fever.gauge=95;tap(g,g.balloons[0]);
  assert.equal(g.bouquets,1);assert.ok(e.fever.active);g.update(0);
  assert.equal(g.savedRound.balloons.length,6);assert.equal(g.savedRound.boardProblems.length,6);
  e.fever.active=false;g.update(0);assert.equal(g.balloons.length,6);
});
