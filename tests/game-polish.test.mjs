import test from 'node:test';
import assert from 'node:assert/strict';
import { g06Stack } from '../src/games/g06_stack.js';
import { g08Chain } from '../src/games/g08_chain.js';
import { UI } from '../src/core/ui.js';
import { L } from '../src/core/layout.js';
import { ScoreManager } from '../src/core/scoreManager.js';
import { ProblemGenerator } from '../src/core/problemGenerator.js';
import { Fever } from '../src/core/fever.js';

function setup() {
  const settings = { operation: 'divide', timeScale: 1 };
  const e = {
    settings, scoreManager: new ScoreManager(), problemGenerator: new ProblemGenerator(settings),
    fever: new Fever({ type: 'multi' }), particles: { emit() {} }, sound: { play() {}, tone() {} },
    ui: { showComboText() {}, flash() {}, shake() {} },
    answerCorrect(p, v, pts) { this.scoreManager.registerCorrect(pts); },
    answerWrong(p, v, opts) { if (!this.fever.active) this.scoreManager.registerWrong(opts); },
    reportNearMiss() {},
  };
  const g = Object.create(g06Stack);
  g.init(e);
  return { g, e };
}
function receive(g, value, multi = false) {
  const b = { value, x: g.towerX, y: g._catchY(), age: 1, correct: true };
  if (multi) return g._catchMultiple(b);
  g._catchCorrect(b);
}

test('압축이 발생해도 4번째 정답에서 배송 완료, 점수/콤보 보존', () => {
  const { g, e } = setup();
  for (let i = 0; i < 3; i++) receive(g, 7);
  assert.deepEqual(g.stacked, [21]);
  assert.equal(g.deliveredCount, 3);
  assert.equal(e.scoreManager.score, 130);
  receive(g, 4);
  assert.equal(g.waveIndex, 1);
  assert.equal(g.target, 5);
  assert.equal(g.deliveredCount, 0);
  assert.deepEqual(g.stacked, []);
  assert.deepEqual(g.waveGlow.values, [21, 4]);
  assert.equal(e.scoreManager.combo, 4);
  assert.equal(e.scoreManager.score, 540);
  assert.ok(g.blocks.length > 0); // 배송 잔상을 기다리지 않는다.
});

test('연쇄 압축마다 +100·기울기 회복, 배송 진행도는 불변', () => {
  const { g, e } = setup();
  g.stacked = [21, 21, 7, 7, 7];
  g.deliveredCount = 5;
  g.wrongInWave = 2;
  g._checkCompress();
  assert.deepEqual(g.stacked, [63]);
  assert.equal(g.deliveredCount, 5);
  assert.equal(g.wrongInWave, 0);
  assert.equal(e.scoreManager.score, 200);
});

test('피버 압축도 진행 유지; 전환 시 완료한 화물 보존', () => {
  const { g, e } = setup();
  e.fever.gauge = 100; e.fever.gainCorrect();
  g._enterMulti();
  for (let i = 0; i < 3; i++) receive(g, e.fever.dan * 2, true);
  assert.equal(g.stacked.length, 1);
  assert.equal(g.deliveredCount, 3);
  e.fever.active = false;
  g._exitMulti();
  assert.equal(g.deliveredCount, 3);
  receive(g, 5);
  assert.equal(g.waveIndex, 1);
});

test('붕괴만 진행 리셋, 목표 순환과 물리 난이도 상태는 유지', () => {
  const { g, e } = setup();
  assert.deepEqual(Array.from({ length: 10 }, (_, i) => g._targetFor(i)), [4,5,6,7,8,4,5,6,7,8]);
  g.waveIndex = 3; g.deliveredCount = 4; g.stacked = [3,4,5,6];
  g.speedPenalty = 1; e.scoreManager.combo = 18;
  g._collapseWave();
  assert.equal(g.target, 7);
  assert.equal(g.deliveredCount, 0);
  assert.equal(g.speedPenalty, 1);
  assert.equal(e.scoreManager.combo, 18);
});

test('높은 탑에서도 가시 낙하 시작점 보호와 기존 2.6초 예산 유지', () => {
  const { g } = setup();
  g.waveIndex = 4;
  for (let n = 0; n < 8; n++) {
    g.stacked = Array(n).fill(3); g.camY = L.gu(0.3);
    assert.ok(g.fallDist > 0);
    assert.ok(g._catchY() - g.fallDist - g.fallBlockH / 2 - g.camY >= L.zone.problem + L.gu(4.6) - 0.001);
    assert.ok(Math.abs(g.fallDist / g._fallSpeed() - 2.6) < 0.001);
  }
});

test('동일 위치에 생성된 8개 버블도 겹치지 않으며 속도는 변하지 않는다', () => {
  const g = Object.create(g08Chain);
  g.bubbles = Array.from({length:8}, (_, i) => ({ x: L.W / 2, y: L.zone.playBottom, vx: i + 1, vy: -2 }));
  g._separateBubbles();
  for (let i = 0; i < 8; i++) {
    assert.equal(g.bubbles[i].vx, i + 1);
    assert.equal(g.bubbles[i].vy, -2);
    for (let j = i + 1; j < 8; j++) {
      assert.ok(Math.hypot(g.bubbles[i].x-g.bubbles[j].x, g.bubbles[i].y-g.bubbles[j].y) >= 2*g.br);
    }
  }
});

test('피버 진입 0.45초, 일반 콤보 0.7초 이하; 확대 후에도 문구가 폭 안에 든다', () => {
  const ui = new UI({});
  ui.showComboText('🔥 FEVER!', true);
  ui.showComboText('아주 긴 배송 완료 보너스 문구입니다!', true);
  assert.equal(ui.comboOverlays[0].dur, 0.45);
  assert.equal(ui.comboOverlays[1].dur, 0.7);
  let scale = 1, size = 0;
  const draws = [];
  const ctx = {
    save() {}, restore() {}, translate(x,y) { draws.push({ y }); },
    scale(x) { scale=x; }, set font(f) { size=Number(f.match(/([\d.]+)px/)[1]); },
    measureText(t) { return { width: t.length * size }; },
    strokeText() {}, fillText(t) { assert.ok(t.length * size * scale < L.W-L.safe*2); },
  };
  ui.comboOverlays.forEach(o => o.t=o.dur/2);
  ui.renderComboOverlays(ctx);
  assert.ok(draws[0].y < L.zone.gauge);
});
