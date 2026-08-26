// tutorialScene.js — 튜토리얼 (Phase0 §10)
// 그림 영역 + 한 문장 + [시작!] 버튼. 게임 객체의 tutorial.draw(ctx)를 호출한다.
// SPEC 0: 3초 안에 이해된다 — 그림 한 장 + 문장 하나.

import { LOGICAL_W, LOGICAL_H, SAFE, THEME, font, roundRect, hit } from '../core/ui.js';

export const tutorialScene = {
  enter(engine) {
    this.engine = engine;
    this.game = engine.pendingGame;
    this.startBtn = { x: (LOGICAL_W - 480) / 2, y: LOGICAL_H - SAFE - 140, w: 480, h: 140, label: '시작!' };
    this.backBtn = { x: SAFE, y: SAFE, w: 160, h: 90, label: '← 뒤로' };
    this.hoverPt = null;
  },

  update() {},

  render(ctx) {
    const cx = LOGICAL_W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 게임 제목
    ctx.fillStyle = THEME.gold;
    ctx.font = font(56);
    ctx.fillText(`${this.game.emoji} ${this.game.name}`, cx, 160);

    // 그림 영역 (게임이 그린다)
    ctx.save();
    ctx.translate(0, 260);
    // 안내 카드 배경
    roundRect(ctx, SAFE, 0, LOGICAL_W - SAFE * 2, 440, 24);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    if (this.game.tutorial && this.game.tutorial.draw) {
      this.game.tutorial.draw(ctx);
    }
    ctx.restore();

    // 설명 문장 (한 문장)
    ctx.fillStyle = THEME.text;
    ctx.font = font(40);
    wrapText(ctx, this.game.tutorial.text, cx, 800, LOGICAL_W - SAFE * 4, 54);

    // 시작 버튼
    const b = this.startBtn;
    roundRect(ctx, b.x, b.y, b.w, b.h, 28);
    ctx.fillStyle = THEME.correct;
    ctx.fill();
    if (this._hovered(b)) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.font = font(60);
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);

    // 뒤로 버튼
    const bk = this.backBtn;
    roundRect(ctx, bk.x, bk.y, bk.w, bk.h, 16);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    if (this._hovered(bk)) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.font = font(32);
    ctx.fillText(bk.label, bk.x + bk.w / 2, bk.y + bk.h / 2);
  },

  onTouch(x, y, phase) {
    if (phase !== 'end') return;
    if (hit(this.startBtn, x, y)) {
      this.engine.startGame(this.game);
      return;
    }
    if (hit(this.backBtn, x, y)) {
      this.engine.setState('MENU');
    }
  },

  onHover(x, y) {
    this.hoverPt = { x, y };
    return hit(this.startBtn, x, y) || hit(this.backBtn, x, y);
  },
  clearHover() {
    this.hoverPt = null;
  },
  _hovered(rect) {
    return this.hoverPt && hit(rect, this.hoverPt);
  },

  onKey(e) {
    if (e.key === 'Enter' || e.key === ' ') this.engine.startGame(this.game);
  },
};

// 긴 문장 줄바꿈 (초3 가독성)
function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  const lines = [];
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  let yy = y - ((lines.length - 1) * lineH) / 2;
  for (const l of lines) {
    ctx.fillText(l, cx, yy);
    yy += lineH;
  }
}
