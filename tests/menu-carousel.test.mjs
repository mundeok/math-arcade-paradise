import test from 'node:test';
import assert from 'node:assert/strict';
import { menuScene } from '../src/scenes/menuScene.js';
import { L } from '../src/core/layout.js';

function setup() {
  const engine = {
    sound: { play() {} },
    goTutorial(game) { this.started = game.id; },
    setState(state) { this.state = state; },
  };
  const menu = { ...menuScene };
  menu.enter(engine);
  return { menu, engine };
}

test('11개 게임은 설명·조작법과 함께 순환 캐러셀에 들어간다', () => {
  const { menu } = setup();
  assert.equal(menu.cells.length, 11);
  assert.ok(menu.cells.every(c => c.active && c.description && c.control));
  assert.ok(menu.cardW > L.minTouch && menu.cardH > L.minTouch);
  assert.ok(menu.cells.every(c => c.y + c.h <= menu.descriptionPanel.y));
  assert.ok(menu.startBtn.w >= L.minTouch && menu.startBtn.h >= L.minTouch);
  assert.ok(menu.descriptionPanel.y + menu.descriptionPanel.h < menu.reportBtn.y);
});

test('좌우 선택은 양 끝에서 순환하고 키 반복 입력은 무시한다', () => {
  const { menu, engine } = setup();
  menu.selectedIndex = 0;
  menu._moveSelection(-1);
  assert.equal(menu.selectedIndex, 10);
  menu._moveSelection(1);
  assert.equal(menu.selectedIndex, 0);
  menu.onKey({ key: 'ArrowRight', repeat: true });
  assert.equal(menu.selectedIndex, 0);
  menu.onKey({ key: 'ArrowRight', repeat: false, preventDefault() {} });
  assert.equal(menu.selectedIndex, 1);
  menu.onKey({ key: 'Enter', repeat: false, preventDefault() {} });
  assert.equal(engine.started, menu._selectedCard().id);
});

test('가로 스와이프는 한 장만 이동하고 중앙 탭은 게임을 시작하지 않는다', () => {
  const { menu, engine } = setup();
  menu.selectedIndex = 0;
  menu.onTouch(L.W / 2, menu.carouselRect.y + L.gu(4), 'start');
  menu.onTouch(L.W / 2 - L.gu(3), menu.carouselRect.y + L.gu(4), 'move');
  assert.ok(menu.carouselOffset < 0);
  menu.onTouch(L.W / 2 - L.gu(3), menu.carouselRect.y + L.gu(4), 'end');
  assert.equal(menu.selectedIndex, 1);
  assert.equal(engine.started, undefined);

  const before = menu.selectedIndex;
  menu.onTouch(L.W / 2, menu.carouselRect.y + L.gu(4), 'start');
  menu.onTouch(L.W / 2, menu.carouselRect.y + L.gu(4), 'end');
  assert.equal(menu.selectedIndex, before);
  assert.equal(engine.started, undefined);
});

test('시작·리포트·랭킹은 누른 버튼 안에서 뗄 때만 실행된다', () => {
  const { menu, engine } = setup();
  const tap = (r) => {
    const x = r.x + r.w / 2, y = r.y + r.h / 2;
    menu.onTouch(x, y, 'start'); menu.onTouch(x, y, 'end');
  };
  tap(menu.startBtn);
  assert.equal(engine.started, menu._selectedCard().id);

  engine.started = undefined;
  menu.onTouch(menu.startBtn.x + L.gu(.2), menu.startBtn.y + L.gu(.2), 'start');
  menu.onTouch(0, 0, 'move'); menu.onTouch(0, 0, 'end');
  assert.equal(engine.started, undefined);

  tap(menu.reportBtn); assert.equal(engine.state, 'REPORT');
  tap(menu.rankBtn); assert.equal(engine.state, 'RANKING');
  assert.equal(engine._rankGameId, null);
});
