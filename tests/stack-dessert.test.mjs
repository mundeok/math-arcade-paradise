import test from 'node:test';
import assert from 'node:assert/strict';
import { g06Stack } from '../src/games/g06_stack.js';
import { ScoreManager } from '../src/core/scoreManager.js';
import { ProblemGenerator } from '../src/core/problemGenerator.js';
import { Fever } from '../src/core/fever.js';
import { L } from '../src/core/layout.js';
import { DESSERT_KINDS } from '../src/art/stackDessertArt.js';

function setup() {
  const settings = { operation: 'divide', timeScale: 1 };
  const e = {
    settings, scoreManager: new ScoreManager(), problemGenerator: new ProblemGenerator(settings),
    fever: new Fever({ type: 'multi' }), particles: { emit() {} }, sound: { play() {}, tone() {} },
    ui: { showComboText() {}, flash() {}, shake() {}, comboOverlays: [], floatScores: [] },
    answerCorrect(p, v, pts) { this.scoreManager.registerCorrect(pts); },
    answerWrong(p, v, opts) { if (!this.fever.active) this.scoreManager.registerWrong(opts); },
    reportNearMiss() {},
  };
  const g = Object.create(g06Stack); g.init(e); return { g, e };
}
function catchValue(g, value, perfect) {
  g._catchCorrect({ value, x: g.towerX + (perfect ? 0 : g.perfectHalfW + L.gu(0.1)), y: g._catchY() });
}
const seconds = g => (g.fallDist - g.fallBlockH / 2) / g._fallSpeed();

test('가운데 PERFECT는 +10 추가, 가장자리 정답은 +10·콤보 유지', () => {
  const { g, e } = setup();
  catchValue(g, 7, false); assert.equal(e.scoreManager.score, 10); assert.equal(g.catchFeedback.perfect, false);
  catchValue(g, 5, true); assert.equal(e.scoreManager.score, 30); assert.equal(g.catchFeedback.perfect, true);
  assert.equal(e.scoreManager.combo, 2); assert.equal(g.deliveredCount, 2);
  assert.equal(g._isPerfect({ x: g.towerX + g.perfectHalfW }), true);
  assert.equal(g._isPerfect({ x: g.towerX - g.perfectHalfW }), true);
  assert.equal(g._isPerfect({ x: g.towerX + g.perfectHalfW + L.gu(0.01) }), false);
});

test('균형은 일반 3개 또는 PERFECT+일반으로 회복; 오답/놓침은 회복 누적 초기화', () => {
  for (const sequence of [[false, false, false], [true, false], [false, true], [true, true]]) {
    const { g } = setup(); g.waveIndex = 4; g.wrongInWave = 2;
    for (let i = 0; i < sequence.length; i++) catchValue(g, i + 2, sequence[i]);
    assert.equal(g.wrongInWave, 1); assert.equal(g.recoveryCharge, 0);
    catchValue(g, 6, true); assert.equal(g.recoveryCharge, 2);
    g._catchWrong({ x: g.towerX, value: 999 }); assert.equal(g.recoveryCharge, 0);
    catchValue(g, 7, false); g._miss({ x: g.towerX }); assert.equal(g.recoveryCharge, 0);
  }
});

test('PERFECT는 틀린 답을 구제하지 않고, 기울기는 이동만으로 붕괴하지 않는다', () => {
  const { g, e } = setup();
  const lives = e.scoreManager.lives;
  g.blocks = [{ value: 999, correct: false, x: g.towerX, y: g._catchY() - g.fallBlockH / 2, age: 1 }];
  g.update(0); assert.equal(g.wrongInWave, 1); assert.equal(e.scoreManager.score, 0);
  assert.equal(e.scoreManager.lives, lives);
  g.blocks = []; g.stacked = [2,3,4,5,6]; g.wrongInWave = 2;
  for (let i = 0; i < 120; i++) { g.onTouch(i % 2 ? L.W : 0, 0, 'move'); g.update(1 / 60); }
  assert.equal(g.collapsing, false); assert.equal(g.wrongInWave, 2);
  const top = g._layerPose(g.stacked.length - 1);
  assert.ok(Math.abs(top.x - g.towerX) < 1e-8); assert.ok(Math.abs(top.angle) < 1e-8);
});

test('낙하 예산 2.6→2.4→2.2, 높은 점수·피버·교사 배속 뒤에도 2.2초 보장', () => {
  const { g, e } = setup();
  for (const [combo, expected] of [[0,2.6],[5,2.4],[15,2.2]]) {
    e.scoreManager.combo = combo; assert.ok(Math.abs(seconds(g) - expected) < 1e-8);
  }
  e.scoreManager.combo = 0; e.scoreManager.score = 9000;
  assert.ok(Math.abs(seconds(g) - 2.4) < 1e-8);
  for (const score of [0,3000,9000,30000,999999]) for (const combo of [0,5,15,100])
    for (const scale of [0.5,1,2]) for (const active of [false,true]) for (let height=0;height<8;height++) {
      e.scoreManager.score=score; e.scoreManager.combo=combo; e.settings.timeScale=scale;
      e.fever.active=active; g.stacked=Array(height).fill(7); g.waveIndex=4;
      assert.ok(seconds(g)>=2.2-1e-8); assert.ok(Number.isFinite(g._fallSpeed()));
    }
  e.settings.timeScale=1; e.scoreManager.lives=1;
  assert.ok(Math.abs(seconds(g)-2.6)<1e-8);
  e.scoreManager.lives=3; g.speedPenalty=1;
  assert.ok(Math.abs(seconds(g)-2.4)<1e-8);
});

test('완성품 기록·압축 진행도·즉시 다음 웨이브·최근 6개 진열', () => {
  const { g } = setup();
  for (let wave=0;wave<8;wave++) {
    const target=g.target;
    for (let i=0;i<target;i++) catchValue(g, i % 2 + 3, true);
    assert.equal(g.waveIndex,wave+1); assert.ok(g.blocks.length>0);
  }
  assert.deepEqual(g.completedDesserts.map(d=>d.number),[3,4,5,6,7,8]);
  assert.equal(g.waveGlow.dur,0.6); assert.equal(g.waveGlow.count,6);
  g._updateEffects(0.6); assert.equal(g.waveGlow,null); assert.equal(g.completedDesserts.length,6);
  g.destroy(); assert.equal(g.completedDesserts.length,0);
});

test('피버 함정·놓침 무적, 종료 시 배수 낙하물 제거 및 탑 진행도 보존', () => {
  const { g,e }=setup(); e.fever.gauge=100; e.fever.gainCorrect(); g.update(0);
  const lives=e.scoreManager.lives;
  g._catchMultiple({ x:g.towerX,y:g._catchY(),value:e.fever.dan*2 });
  g._catchTrap({ x:g.towerX,value:e.fever.randomTrap() });
  const height=g.stacked.length, progress=g.deliveredCount, old=g.blocks.slice();
  for(const b of g.blocks){b.y=L.H+L.gu(5);b.x=-L.W;}
  g.update(0.02); assert.equal(e.scoreManager.lives,lives); assert.equal(g.wrongInWave,0);
  e.fever.active=false; g.update(0);
  assert.equal(g.multiMode,false); assert.ok(g.blocks.every(b=>!old.includes(b)&&b.isMultiple===undefined));
  assert.equal(g.stacked.length,height); assert.equal(g.deliveredCount,progress);
});

test('5종은 목표 4~8과 함께 순환; 완성 잔상/진열은 이전 종류를 보존', () => {
  const {g,e}=setup();
  const ids=['pancake','pudding','macaron','donut','cake'];
  assert.deepEqual(DESSERT_KINDS.map(k=>k.id),ids);
  for(let wave=0;wave<10;wave++){
    assert.equal(g.dessertKind.id,ids[wave%5]);
    assert.equal(g.target,4+wave%5);
    const target=g.target,kind=g.dessertKind.id;
    for(let i=0;i<target;i++)catchValue(g,2+i%2,false);
    assert.equal(g.waveGlow.kind,kind);
    assert.equal(g.completedDesserts.at(-1).kind,kind);
    assert.equal(g.dessertKind.id,ids[(wave+1)%5]);
    assert.equal(g.deliveredCount,0);assert.ok(g.blocks.length);
  }
  const kind=g.dessertKind.id;
  g._collapseWave();assert.equal(g.dessertKind.id,kind);
  e.fever.gauge=100;e.fever.gainCorrect();g.update(0);assert.equal(g.dessertKind.id,kind);
  e.fever.active=false;g.update(0);assert.equal(g.dessertKind.id,kind);
  const old=g.completedDesserts.at(-1).kind;
  g.waveIndex=3;assert.equal(g.completedDesserts.at(-1).kind,old);
  g.init(e);assert.equal(g.dessertKind.id,'pancake');assert.deepEqual(g.completedDesserts,[]);
});
