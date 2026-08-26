// resultScene.js — 결과 화면 (Phase0 §10)
// 최종점수 / 최고콤보 / 정답률 / 별등급 / 틀린 문제 다시보기 목록 / [다시하기] [메뉴로]

import { LOGICAL_W, LOGICAL_H, SAFE, THEME, font, roundRect, hit } from '../core/ui.js';
import { oneLineEquation } from '../core/mathText.js';

export const resultScene = {
  enter(engine) {
    this.engine = engine;
    this.game = engine.game;

    // 기록 저장 (SPEC 3.8) — enter 시 1회
    this.topScores = engine.scoreManager.saveHighScore();
    this.newAchievements = engine.scoreManager.saveAchievements();
    this.stars = engine.scoreManager.getStars();
    this.wrongList = engine.session.getWrongList();

    // 팡파레 (효과음 ON일 때만 소리남)
    engine.sound.play('fanfare');

    this.retryBtn = { x: SAFE, y: LOGICAL_H - SAFE - 130, w: (LOGICAL_W - SAFE * 3) / 2, h: 130, label: '🔄 다시하기' };
    this.menuBtn = {
      x: SAFE * 2 + (LOGICAL_W - SAFE * 3) / 2,
      y: LOGICAL_H - SAFE - 130,
      w: (LOGICAL_W - SAFE * 3) / 2,
      h: 130,
      label: '🏠 메뉴로',
    };
    this.hoverPt = null;
  },

  update() {},

  render(ctx) {
    const e = this.engine;
    const sm = e.scoreManager;
    const cx = LOGICAL_W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 제목 (긍정적 문구 — SPEC 2.5)
    ctx.fillStyle = THEME.gold;
    ctx.font = font(60);
    ctx.fillText('잘했어요! 🎉', cx, 110);

    // 별 등급
    let starStr = '';
    for (let i = 0; i < 5; i++) starStr += i < this.stars ? '⭐' : '☆';
    ctx.font = font(64);
    ctx.fillText(starStr, cx, 210);

    // 점수 패널
    roundRect(ctx, SAFE, 280, LOGICAL_W - SAFE * 2, 230, 24);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    ctx.fillStyle = THEME.text;
    ctx.font = font(44);
    ctx.fillText(`최종 점수  ${sm.score}점`, cx, 340);
    ctx.font = font(36);
    ctx.fillStyle = THEME.subtext;
    ctx.fillText(`최고 콤보 ${sm.maxCombo}   ·   정답률 ${Math.round(sm.accuracy * 100)}%`, cx, 410);
    ctx.fillText(`맞힘 ${sm.correctCount} / 총 ${sm.totalCount}문제`, cx, 460);

    // 새 업적
    if (this.newAchievements.length) {
      const map = { bronze: '🥉 초급', silver: '🥈 중급', gold: '🥇 고급' };
      ctx.fillStyle = THEME.gold;
      ctx.font = font(34);
      ctx.fillText('새 업적: ' + this.newAchievements.map((a) => map[a]).join('  '), cx, 505);
    }

    // 틀린 문제 다시보기
    ctx.textAlign = 'left';
    ctx.fillStyle = THEME.text;
    ctx.font = font(38);
    ctx.fillText('📒 틀린 문제 다시보기', SAFE, 570);

    const listTop = 610;
    const listH = this.retryBtn.y - listTop - 20;
    roundRect(ctx, SAFE, listTop, LOGICAL_W - SAFE * 2, listH, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();

    ctx.font = font(34, 'normal');
    if (this.wrongList.length === 0) {
      ctx.fillStyle = THEME.correct;
      ctx.textAlign = 'center';
      ctx.font = font(40);
      ctx.fillText('전부 맞혔어요! 완벽해요 💯', cx, listTop + listH / 2);
      ctx.textAlign = 'left';
    } else {
      let yy = listTop + 46;
      const maxRows = Math.floor((listH - 20) / 52);
      const shown = this.wrongList.slice(0, maxRows);
      ctx.fillStyle = THEME.text;
      for (const q of shown) {
        ctx.fillText('• ' + oneLineEquation(q), SAFE + 24, yy);
        yy += 52;
      }
      if (this.wrongList.length > maxRows) {
        ctx.fillStyle = THEME.subtext;
        ctx.fillText(`… 외 ${this.wrongList.length - maxRows}문제 더`, SAFE + 24, yy);
      }
    }

    // 버튼
    ctx.textAlign = 'center';
    for (const b of [this.retryBtn, this.menuBtn]) {
      roundRect(ctx, b.x, b.y, b.w, b.h, 24);
      ctx.fillStyle = b === this.retryBtn ? THEME.correct : THEME.panel;
      ctx.fill();
      if (this.hoverPt && hit(b, this.hoverPt.x, this.hoverPt.y)) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fill();
      }
      ctx.fillStyle = '#fff';
      ctx.font = font(42);
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    }
  },

  onTouch(x, y, phase) {
    if (phase !== 'end') return;
    if (hit(this.retryBtn, x, y)) {
      this.engine.startGame(this.game); // 같은 게임 다시 시작
      return;
    }
    if (hit(this.menuBtn, x, y)) {
      this.engine.quitToMenu();
    }
  },

  onHover(x, y) {
    this.hoverPt = { x, y };
    return hit(this.retryBtn, x, y) || hit(this.menuBtn, x, y);
  },
  clearHover() {
    this.hoverPt = null;
  },

  onKey() {},
};
