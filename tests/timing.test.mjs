import test from 'node:test';
import assert from 'node:assert/strict';
import {g04Timing} from '../src/games/g04_timing.js';
import {ScoreManager} from '../src/core/scoreManager.js';
import {ProblemGenerator} from '../src/core/problemGenerator.js';
import {Fever} from '../src/core/fever.js';
import {L} from '../src/core/layout.js';
function setup(){
  const settings={operation:'multiply',timeScale:1};
  const e={settings,freeze:{active:false},scoreManager:new ScoreManager(),problemGenerator:new ProblemGenerator(settings),fever:new Fever({type:'multi'}),records:[],
    sound:{calls:[],musicEnabled:false,tone(...a){this.calls.push(a);}},particles:{emit(){}},
    ui:{floatScores:[],flash(){},shake(){},showComboText(){}},markQuestionStart(){},
    answerCorrect(p,v,pts){this.records.push({correct:true,p,pts});this.scoreManager.registerCorrect(pts*(this.fever.active?this.fever.registerScoreStreak():1));this.problemGenerator.reportResult(p,true);this.fever.gainCorrect();},
    answerWrong(p,v,o){this.records.push({correct:false,p,...o});if(!this.fever.active){this.scoreManager.registerWrong(o);if(o.affectLevel!==false)this.problemGenerator.reportResult(p,false);this.freeze={active:o.freeze!==false,onResume:o.onResume};}},
    timeUp(p,o){this.answerWrong(p,null,o);},
  };
  const g=Object.create(g04Timing);g.init(e);return {g,e};
}
function tap(g,n){const p=g._numPos(n);g.onTouch(p.x,p.y,'start');}
function answer(g){tap(g,g.numbers.find(n=>n.correct));}
test('북4개 직접 탭: 박자 밖에도 50점, 문제 교체는 박자를 초기화하지 않음',()=>{
  const{g,e}=setup();g.time=.3;const time=g.time,p=g.problem;answer(g);
  assert.equal(g.numbers.length,4);assert.equal(e.scoreManager.score,50);assert.equal(g.phraseHits,1);
  assert.equal(g.time,time);assert.notEqual(g.problem,p);assert.equal(e.records.length,1);
});
test('90 BPM 절대 시간 ±120ms: 느리거나 높은 콤보에서도 같은 판정 폭',()=>{
  for(const combo of [0,100])for(const [offset,perfect] of [[0,true],[.12,true],[.1201,false],[.3,false],[-.12,true],[-.1201,false]]){
    const{g,e}=setup();e.scoreManager.combo=combo;e.settings.timeScale=.1;
    g.time=10*(60/90)+offset;const calls=e.sound.calls.length;answer(g);
    assert.equal(e.records[0].pts,perfect?100:50);assert.equal(e.fever.gauge,10);
    assert.equal(e.sound.calls.length-calls,perfect?4:1,'PERFECT만 금속 배음 3개 추가');
  }
});
test('4정답 합주 한 번: 기본 300/전부 PERFECT 500, 기록 중복 없고 다음 문제 즉시',()=>{
  for(const perfect of [false,true]){
    const{g,e}=setup();g.time=perfect?0:.3;for(let i=0;i<4;i++)answer(g);
    assert.equal(e.records.length,4);assert.equal(e.scoreManager.score,perfect?500:300);
    assert.equal(g.phrases,1);assert.equal(g.phraseHits,0);assert.equal(g.ensemble.perfects,perfect?4:0);
    assert.equal(g.musicQueue.length,4);assert.equal(g.elapsed,0);
    answer(g);assert.equal(g.phraseHits,1,'합주 연출 중에도 입력');assert.equal(e.records.length,5);
  }
});
test('일반 오답은 복습/라이프, 현재 문제·합주 보존; 회복 후 8초 재시도',()=>{
  const{g,e}=setup();answer(g);const p=g.problem,numbers=g.numbers;g.elapsed=7;
  tap(g,g.numbers.find(n=>!n.correct));assert.equal(e.scoreManager.lives,2);assert.ok(e.freeze.active);
  assert.equal(e.problemGenerator.reviewQueue.length,1);answer(g);assert.equal(e.records.length,2);
  e.freeze.active=false;e.freeze.onResume();assert.equal(g.problem,p);assert.equal(g.numbers,numbers);
  assert.equal(g.phraseHits,1);assert.equal(g.elapsed,0);assert.equal(g.limit,8);
});
test('8초 계산 시계는 박자·교사 가속과 독립, 시간초과는 기존 진행 보존',()=>{
  const{g,e}=setup();answer(g);g.time=.22;e.settings.timeScale=.1;g._load();assert.equal(g.limit,8);
  for(let i=0;i<479;i++)g.update(1/60);assert.equal(e.records.length,1);
  g.update(.02);assert.ok(e.records.at(-1).missed);assert.equal(e.scoreManager.lives,2);
  assert.equal(g.phraseHits,1);assert.equal(e.problemGenerator.reviewQueue.length,0);
  e.freeze.active=false;e.freeze.onResume();assert.equal(g.elapsed,0);
  e.settings.timeScale=2;g._load();assert.equal(g.limit,16);
});
test('피버 북8개/무적/쿨다운/ULTRA, 시계와 문제 복원하고 박자는 계속',()=>{
  const{g,e}=setup();g.time=.3;answer(g);g.elapsed=3;const p=g.problem,nums=g.numbers;
  e.fever.gain(100);answer(g);assert.equal(e.records.length,1);g.update(0);
  assert.equal(g.numbers.length,8);tap(g,g.numbers.find(n=>!e.fever.isMultiple(n.value)));
  assert.equal(e.scoreManager.lives,3);assert.equal(e.scoreManager.combo,1);
  const count=e.records.length;tap(g,g.numbers[0]);assert.equal(e.records.length,count);
  e.fever.stage=3;g.update(.15);
  for(let i=0;i<50;i++){tap(g,g.numbers[i%8]);g.update(.15);assert.ok(g.numbers.every(n=>e.fever.isMultiple(n.value)));}
  assert.equal(g.phraseHits,1);assert.equal(g.phrases,0);assert.equal(g.elapsed,3);
  e.fever.active=false;const time=g.time,records=e.records.length;tap(g,g.numbers[0]);assert.equal(e.records.length,records);
  g.update(0);assert.equal(g.problem,p);assert.equal(g.numbers,nums);assert.equal(g.elapsed,3);assert.equal(g.time,time);
  assert.equal(g.savedNormal,null);assert.equal(g.hits.length,0);
});
test('정답 없는 피버 방지, 북 터치 범위 겹치지 않고 폰 최소 크기 보장',()=>{
  const{g,e}=setup();
  for(const multi of [false,true]){
    if(multi){e.fever.gain(100);g.update(0);for(const n of g.numbers)n.value=e.fever.randomTrap();g.update(0);assert.ok(g.numbers.some(n=>e.fever.isMultiple(n.value)));}
    assert.ok(2*g.numR>=L.minTouch);assert.ok(2*(g.drumRy+L.gu(.65))>=L.minTouch);
    for(const a of g.numbers){
      const p=g._numPos(a);assert.ok(p.x-g.numR>L.safe&&p.x+g.numR<L.W-L.safe);
      for(const b of g.numbers)if(a!==b){const q=g._numPos(b);
        assert.ok(Math.abs(p.x-q.x)>2*(g.numR+L.gu(.25))||Math.abs(p.y-q.y)>2*(g.drumRy+L.gu(.65)));
      }
    }
  }
});
test('늦은 프레임에 박자 몰아치지 않음, 반주 설정 분리, 예약은 게임 시간만 사용',()=>{
  const{g,e}=setup();g.update(1.9);assert.equal(e.sound.calls.length,1);
  e.sound.calls=[];e.sound.musicEnabled=true;g.phraseHits=3;g._beatSound(4);assert.equal(e.sound.calls.length,4);
  e.sound.calls=[];g.time=.3;for(let i=0;i<4;i++)answer(g);e.sound.calls=[];g.update(.01);assert.equal(e.sound.calls.length,1);
  assert.equal(g.musicQueue.length,3);g.destroy();assert.deepEqual(g.musicQueue,[]);
});
test('입력 영역/반복 키/동결 차단, 교사 연산·상한 보존, 재시작 초기화',()=>{
  const{g,e}=setup();g.onTouch(g.cx,L.zone.problem,'start');
  const n=g.numbers.find(n=>n.correct),p=g._numPos(n);g.onTouch(p.x,p.y,'move');g.onKey({key:String(n.slot+1),repeat:true});
  assert.equal(e.records.length,0);g.onKey({key:String(n.slot+1)});assert.equal(e.records.length,1);
  e.settings.operation='divide';e.problemGenerator.currentLevel=5;g._load();assert.equal(g.problem.op,'÷');assert.equal(g.problem.level,4);
  g.destroy();g.init(e);assert.equal(g.time,0);assert.equal(g.phrases,0);assert.equal(g.phraseHits,0);
});
