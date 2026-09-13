import test from 'node:test';
import assert from 'node:assert/strict';
import {g07Shoot} from '../src/games/g07_shoot.js';
import {L} from '../src/core/layout.js';
import {ScoreManager} from '../src/core/scoreManager.js';
import {ProblemGenerator} from '../src/core/problemGenerator.js';
import {Fever} from '../src/core/fever.js';
function setup(){
  const settings={operation:'multiply',timeScale:1};
  const e={settings,state:'PLAYING',freeze:{active:false},scoreManager:new ScoreManager(),problemGenerator:new ProblemGenerator(settings),fever:new Fever({type:'multi'}),records:[],
    sound:{play(){},tone(){}},particles:{emit(){}},ui:{flash(){},shake(){},showComboText(){},floatScores:[],comboOverlays:[]},reportNearMiss(){},
    answerCorrect(p,v,pts){const n=pts*this.fever.registerScoreStreak();this.scoreManager.registerCorrect(n);this.records.push({correct:true,pts:n});this.fever.gainCorrect();},
    answerWrong(p,v,o){this.records.push({correct:false});if(!this.fever.active){this.scoreManager.registerWrong(o);this.freeze={active:o.freeze!==false,onResume:o.onResume};}},
  };
  const g=Object.create(g07Shoot);g.init(e);return{g,e};
}
function hit(g,en){g.bullets.push({x:en.x,prevY:en.y+L.gu(5),y:en.y-L.gu(5),r:L.gu(.2),round:g.roundSerial});g._resolveHits();}
test('일반 3차선 동시 출현, 정답 1개, 정오답 외형 판정 크기 동일',()=>{
  const{g,e}=setup();e.scoreManager.combo=50;g._startRound();
  assert.equal(g.enemies.length,3);assert.equal(new Set(g.enemies.map(en=>en.y)).size,1);
  assert.equal(g.enemies.filter(en=>en.correct).length,1);assert.equal(new Set(g.enemies.map(en=>g._visR(en))).size,1);
  const xs=g.enemies.map(en=>en.x);assert.ok(xs[1]-xs[0]>g.enemyR*2);
  assert.ok(g.topY-g.enemyR*1.56>=L.zone.problem+L.gu(2.8));
});
test('보이는 하강 4.2초, 모든 가산/교사 배속 뒤에도 2.2초 이상',()=>{
  const{g,e}=setup(),distance=g.floorY-g.enemyR-g.topY;
  assert.ok(Math.abs(distance/g._currentSpeed()-4.2)<1e-8);
  for(const combo of[0,10,100])for(const score of[0,3000,999999])for(const scale of[.5,1,2])for(const active of[false,true]){
    e.scoreManager.combo=combo;e.scoreManager.score=score;e.settings.timeScale=scale;e.fever.active=active;
    assert.ok(distance/g._currentSpeed()>=2.2-1e-8);
  }
});
test('이동은 발사하지 않고 릴리즈 한 번=한 발; 문제 영역/반복 키/무단 릴리즈 무시',()=>{
  const{g}=setup();const x=g.enemies[0].x,y=g.charY;
  g.onTouch(x,y,'start');g.onTouch(x,y,'move');assert.equal(g.bullets.length,0);
  g.onTouch(x,y,'end');assert.equal(g.bullets.length,1);assert.equal(g.bullets[0].x,x);
  g.onTouch(x,y,'end');assert.equal(g.bullets.length,1);
  g.onKey({key:' ',repeat:true});assert.equal(g.bullets.length,1);
  g.fireCooldown=0;g.onTouch(x,L.zone.problem,'start');g.onTouch(x,L.zone.problem,'end');assert.equal(g.bullets.length,1);
  g.onKey({key:' ',repeat:false});assert.equal(g.bullets.length,2);
});
test('정답 5회=편대 보너스 200, 대장은 마지막 문제에서만; 판정당 기록 1회',()=>{
  const{g,e}=setup();
  for(let i=0;i<5;i++){
    assert.equal(g.roundCaptain,i===4);hit(g,g.enemies.find(en=>en.correct));
    assert.equal(e.records.length,i+1);assert.ok(g.enemies.length===3);assert.equal(g.bullets.length,0);
  }
  assert.equal(e.scoreManager.score,550);assert.equal(g.squadsCleared,1);assert.equal(g.squadProgress,0);assert.equal(g.roundCaptain,false);assert.ok(g.clearEffect);
});
test('오답과 놓침은 진행 별 유지, 탄환 정리, 회복 후 같은 대장 문제로 재도전',()=>{
  const{g,e}=setup();g.squadProgress=4;g._startRound();
  const lives=e.scoreManager.lives;hit(g,g.enemies.find(en=>!en.correct));
  assert.equal(e.scoreManager.lives,lives-1);assert.equal(g.squadProgress,4);assert.equal(g.bullets.length,0);
  e.freeze.active=false;e.freeze.onResume();assert.equal(g.roundCaptain,true);
  const good=g.enemies.find(en=>en.correct);good.y=g.floorY;g.update(0);
  assert.equal(g.squadProgress,4);assert.equal(g.hitStreak,0);assert.equal(e.freeze.active,true);
});
test('탄환 경로 판정은 프레임 사이 통과도 명중, 다른 레인 오폭 없음',()=>{
  const{g,e}=setup();const good=g.enemies.find(en=>en.correct);
  g.bullets=[{x:good.x+g.enemyR+L.gu(.1),prevY:good.y+L.gu(5),y:good.y-L.gu(5),r:L.gu(1),round:g.roundSerial}];
  g._resolveHits();assert.equal(e.records.length,0);
  g.bullets=[];hit(g,good);assert.equal(e.records.length,1);assert.equal(e.records[0].correct,true);
});
test('오래된 문제 탄환은 새 문제를 맞히지 않는다',()=>{
  const{g,e}=setup(),old=g.roundSerial;g._startRound();const bad=g.enemies.find(en=>!en.correct);
  g.bullets=[{x:bad.x,prevY:bad.y+L.gu(5),y:bad.y-L.gu(5),r:L.gu(.2),round:old}];
  g._resolveHits();assert.equal(e.records.length,0);assert.equal(g.bullets.length,0);
});
test('피버 배수를 전부 잡으면 즉시 다음 편대; 일반 진행 보존, 실제 득점 표시',()=>{
  const{g,e}=setup();g.squadProgress=3;e.fever.gauge=100;e.fever.gainCorrect();g.update(0);
  const before=g.roundSerial;
  for(const en of g.enemies.filter(en=>en.isMultiple))hit(g,en);
  assert.equal(g.squadProgress,3);assert.equal(g.floatTexts.at(-1).text,`+${e.records.at(-1).pts}`);
  g.update(0);assert.ok(g.roundSerial>before);assert.equal(g.enemies.length,3);
  e.fever.active=false;g.update(0);assert.equal(g.multiMode,false);assert.equal(g.squadProgress,3);assert.equal(g.bullets.length,0);
});
test('피버 함정 무적과 ULTRA 신규 편대 전부 배수, 전환 직전 발사 차단',()=>{
  const{g,e}=setup();e.fever.gauge=100;e.fever.gainCorrect();g._fire();assert.equal(g.bullets.length,0);g.update(0);
  const lives=e.scoreManager.lives;const trap=g.enemies.find(en=>!en.isMultiple);hit(g,trap);
  assert.equal(e.scoreManager.lives,lives);assert.equal(e.freeze.active,false);
  e.fever.stage=3;g._startRoundMulti();assert.equal(g.enemies.length,3);assert.ok(g.enemies.every(en=>e.fever.isMultiple(en.value)));
  g._fire();assert.equal(g.fireCooldown,.1);e.fever.active=false;g.fireCooldown=0;g._fire();assert.equal(g.bullets.length,1);g.update(0);assert.equal(g.bullets.length,0);
});
