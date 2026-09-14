import test from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../src/core/ui.js';
import { L } from '../src/core/layout.js';
import { fullEquationLines } from '../src/core/mathText.js';

function draw(problem) {
  const text = [];
  const ctx = new Proxy({
    font: '',
    measureText(value) { return { width: value.length * Number(this.font.match(/([\d.]+)px/)[1]) * .65 }; },
    fillText(value, x, y) { text.push({ value, x, y, width: this.measureText(value).width, font: this.font }); },
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  UI.prototype.renderAnswerFeedback.call({}, ctx, problem, .5);
  return text.filter(t => fullEquationLines(problem).includes(t.value));
}

test('오답 식: 나머지/큰 수/빈칸형도 전체 문자열을 안전 여백 안에 표시', () => {
  for (const problem of [
    { a: 17, b: 5, op: '÷', answer: 3, remainder: 2 },
    { a: 999, b: 12, op: '÷', answer: 83, remainder: 3 },
    { a: 56, b: 8, op: '÷', answer: 8, blank: 'b' },
    { a: 123, b: 456, op: '×', answer: 56088 },
  ]) {
    const rendered = draw(problem);
    assert.deepEqual(rendered.map(t => t.value), fullEquationLines(problem));
    for (const t of rendered) {
      assert.ok(t.x - t.width / 2 >= L.safe - 1e-6);
      assert.ok(t.x + t.width / 2 <= L.W - L.safe + 1e-6);
    }
  }
});

test('짧은 식은 기존 글자 크기 유지', () => {
  assert.match(draw({ a: 2, b: 3, op: '×', answer: 6 })[0].font, /120px/);
});
