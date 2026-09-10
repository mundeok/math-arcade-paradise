import test from 'node:test';
import assert from 'node:assert/strict';
import { g11Farm } from '../src/games/g11_farm.js';
import { ProblemGenerator } from '../src/core/problemGenerator.js';
import { ScoreManager } from '../src/core/scoreManager.js';
import { L } from '../src/core/layout.js';
import { CATALOG, IMPLEMENTED } from '../src/games/registry.js';
import { menuScene } from '../src/scenes/menuScene.js';

function setup(operation = 'mixed') {
  const settings = { operation, dans: [2, 3, 4, 5, 6, 7, 8, 9], timeScale: 1 };
  const game = { ...g11Farm };
  const engine = {
    settings,
    problemGenerator: new ProblemGenerator(settings),
    scoreManager: new ScoreManager(),
    fever: { active: false, type: 'easy' },
    particles: { emit() {} },
    ui: { shake() {} },
    answers: [],
    markQuestionStart() {},
    answerCorrect(problem, value, points) {
      this.answers.push({ problem, value, correct: true });
      this.scoreManager.registerCorrect(points);
      this.problemGenerator.reportResult(problem, true);
    },
    answerWrong(problem, value, options) {
      this.answers.push({ problem, value, correct: false });
      if (!this.fever.active) this.scoreManager.registerWrong({ loseLife: true });
      this.problemGenerator.addToReview(problem);
      this.resume = options.onResume;
    },
    endGame() { this.ended = true; },
  };
  game.init(engine);
  return { game, engine };
}

function solve(game) {
  game.rows = game.division ? game.problem.b : game.problem.a;
  game.cols = game.division ? game.problem.answer : game.problem.b;
  game.hasSelection = true;
  game._submit();
}

test('모든 연산·Lv1/2 문제를 9×9 배열로 표현할 수 있다 (600개)', () => {
  for (const operation of ['multiply', 'divide', 'mixed']) {
    const { game, engine } = setup(operation);
    for (let i = 0; i < 200; i++) {
      engine.problemGenerator.currentLevel = i % 2 + 1;
      game.completed = i % 2;
      game._loadProblem();
      const p = game.problem;
      const rows = game.division ? p.b : p.a;
      const cols = game.division ? p.answer : p.b;
      assert.ok(rows >= 1 && rows <= 9 && cols >= 1 && cols <= 9);
      assert.equal(rows * cols, game.target);
      assert.ok(!p.blank && !p.remainder);
      if (operation !== 'mixed') assert.equal(p.op, operation === 'divide' ? '÷' : '×');
    }
  }
});

test('같은 넓이의 다른 곱셈 배열도 정답; 나눗셈은 줄 수 고정', () => {
  const { game, engine } = setup('multiply');
  game.problem = { a: 3, b: 4, op: '×', answer: 12, text: '3 × 4', level: 1 };
  game.target = 12;
  game.rows = 2;
  game.cols = 6;
  game.hasSelection = true;
  game._submit();
  assert.equal(engine.answers.at(-1).correct, true);
  assert.equal(engine.answers.at(-1).value, 12);
  const { game: division } = setup('divide');
  const { board } = division._layout();
  division._select(board.x + board.w, board.y);
  assert.equal(division.rows, division.problem.b);
});

test('드래그만으로 제출하지 않으며 버튼은 한 번만 제출한다', () => {
  const { game, engine } = setup('multiply');
  const { board, cell, button } = game._layout();
  const x = board.x + (game.problem.b - 0.5) * cell;
  const y = board.y + (game.problem.a - 0.5) * cell;
  game.onTouch(x, y, 'start');
  game.onTouch(x, y, 'move');
  game.onTouch(x, y, 'end');
  assert.equal(engine.answers.length, 0);
  game.onTouch(button.x + button.w / 2, button.y + button.h / 2, 'start');
  game.onTouch(button.x + button.w / 2, button.y + button.h / 2, 'end');
  game.onTouch(button.x + button.w / 2, button.y + button.h / 2, 'end');
  assert.equal(engine.answers.length, 1);
});

test('오답은 라이프·복습에 반영하고 복습 가능한 배열을 다시 낸다', () => {
  const { game, engine } = setup('multiply');
  const before = engine.scoreManager.lives;
  const wrongProblem = game.problem;
  game.rows = game.cols = 1;
  game.hasSelection = true;
  game._submit();
  assert.equal(engine.scoreManager.lives, before - 1);
  assert.equal(engine.problemGenerator.reviewQueue.length, 1);
  assert.equal(game.completed, 0);
  engine.resume();
  engine.problemGenerator.served += 3;
  game._loadProblem();
  assert.equal(game.problem.text, wrongProblem.text);
  assert.equal(game.problem.fromReview, true);
  solve(game);
  assert.equal(engine.problemGenerator.reviewQueue.length, 0);
});

test('피버 진입/종료는 드래그·제출 예약만 정리하고 진행을 보존한다', () => {
  const { game, engine } = setup();
  solve(game);
  const count = game.completed;
  game.hasSelection = game.dragging = game.buttonArmed = true;
  engine.fever.active = engine.problemGenerator.feverEasy = true;
  game.update(0.016);
  assert.equal(game.wasFever, true);
  assert.equal(game.hasSelection || game.dragging || game.buttonArmed, false);
  assert.equal(game.problem.level, 1);
  assert.equal(game.completed, count);
  game.hasSelection = game.dragging = game.buttonArmed = true;
  engine.fever.active = engine.problemGenerator.feverEasy = false;
  game.update(0.016);
  assert.equal(game.wasFever, false);
  assert.equal(game.hasSelection || game.dragging || game.buttonArmed, false);
  assert.equal(game.completed, count);
});

test('16개 밭에서 완주하며 중복 완료/반복 키 제출이 없다', () => {
  const { game, engine } = setup();
  for (let i = 0; i < 16; i++) solve(game);
  assert.equal(game.completed, 16);
  assert.equal(engine.ended, true);
  game.onKey({ key: 'Enter', repeat: true });
  game._submit();
  assert.equal(engine.answers.length, 16);
  assert.equal(game.history.length, 16);
});

test('게임/메뉴 레이아웃이 화면 안에 있고 제출 버튼이 최소 터치 크기를 지킨다', () => {
  const { game, engine } = setup();
  const { board, button } = game._layout();
  assert.ok(board.y > L.zone.problem + L.gu(2));
  assert.ok(board.x >= L.safe && board.x + board.w <= L.W - L.safe);
  assert.ok(board.y + board.h < button.y);
  assert.ok(button.w >= L.minTouch && button.h >= L.minTouch);
  assert.ok(button.y + button.h <= L.H - L.safe);
  const menu = { ...menuScene };
  menu.enter(engine);
  const cell = menu.cells.find(c => c.id === game.id);
  assert.equal(cell.active, true);
  assert.ok(cell.y + cell.h <= menu.reportBtn.y);
  assert.equal(CATALOG.length, 11);
  assert.equal(new Set(IMPLEMENTED.map(g => g.id)).size, IMPLEMENTED.length);
  assert.ok(IMPLEMENTED.every(g => ['init', 'render', 'update', 'onTouch', 'onKey', 'destroy'].every(k => typeof g[k] === 'function')));
});
