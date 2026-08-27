// menuScene.js — 게임 선택 메뉴 (Phase0 §10)
// 3열 그리드로 게임 버튼 배치. Phase 0: 더미 1개만 활성, 나머지는 "준비 중".
// 게임별 최고점 미리보기 + 업적 뱃지 표시. 우측 상단 ⚙️는 1.5초 롱프레스로 진입.

import { LOGICAL_W, LOGICAL_H, SAFE, THEME, font, roundRect, hit } from '../core/ui.js';
import { L } from '../core/layout.js';
import { ScoreManager } from '../core/scoreManager.js';
import { IMPLEMENTED, CATALOG, getGameById } from '../games/registry.js';
import { dummyGame } from '../games/_dummy.js';

const LONGPRESS_SEC = 1.5; // 교사 설정 진입 롱프레스 시간 (학생 오조작 방지)

export const menuScene = {
  enter(engine) {
    this.engine = engine;
    this._build();
    // 롱프레스 상태
    this.gearHold = 0;
    this.gearPressing = false;
    this.t = 0;
    this.hoverPt = null; // 마우스 hover 위치(논리좌표). 없으면 null (터치/이탈 시)
  },

  _build() {
    // 그리드 셀 = [더미] + 카탈로그 10종
    const items = [{ id: dummyGame.id, name: dummyGame.name, emoji: dummyGame.emoji }, ...CATALOG];

    const cols = 3;
    const gap = 20;
    const cellW = (LOGICAL_W - SAFE * 2 - gap * (cols - 1)) / cols;
    const cellH = 200;
    const top = 300;

    this.cells = items.map((it, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const active = !!getGameById(it.id); // IMPLEMENTED에 있으면 활성
      return {
        x: SAFE + col * (cellW + gap),
        y: top + row * (cellH + gap),
        w: cellW,
        h: cellH,
        id: it.id,
        name: it.name,
        emoji: it.emoji,
        active,
        // 연산 배지용: 게임 정의(게임 파일)에서만 opMode를 읽는다(단일 출처). 비활성이면 null.
        opMode: getGameById(it.id)?.opMode ?? null,
        highScore: ScoreManager.getHighScores(it.id)[0]?.score ?? null,
        achievements: ScoreManager.getAchievements(it.id),
      };
    });

    // 하단 리포트 버튼
    this.reportBtn = { x: SAFE, y: LOGICAL_H - SAFE - 96, w: LOGICAL_W - SAFE * 2, h: 96, label: '📊 학습 리포트' };

    // 우측 상단 설정 기어
    this.gearRect = { x: LOGICAL_W - SAFE - 96, y: SAFE, w: 96, h: 96 };
  },

  update(dt) {
    this.t += dt;
    // 롱프레스 판정
    if (this.gearPressing) {
      this.gearHold += dt;
      if (this.gearHold >= LONGPRESS_SEC) {
        this.gearPressing = false;
        this.gearHold = 0;
        this.engine.setState('SETTINGS');
      }
    }
  },

  render(ctx) {
    const cx = LOGICAL_W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 타이틀
    ctx.fillStyle = THEME.gold;
    ctx.font = font(64);
    ctx.fillText('곱셈나눗셈', cx, 130);
    ctx.fillText('아케이드 천국', cx, 205);

    // 설정 기어 (롱프레스 진행 표시 포함)
    this._drawGear(ctx);

    // 게임 셀
    for (const c of this.cells) {
      roundRect(ctx, c.x, c.y, c.w, c.h, 22);
      ctx.fillStyle = c.active ? THEME.accent : THEME.disabled;
      ctx.fill();
      if (c.active) {
        ctx.strokeStyle = THEME.gold;
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      ctx.globalAlpha = c.active ? 1 : 0.55;
      // 이모지
      ctx.font = font(70);
      ctx.fillStyle = '#fff';
      ctx.fillText(c.emoji, c.x + c.w / 2, c.y + 70);
      // 이름
      ctx.font = font(26);
      ctx.fillText(c.name, c.x + c.w / 2, c.y + 130);

      if (c.active) {
        // 최고점 미리보기
        ctx.font = font(22, 'normal');
        ctx.fillStyle = THEME.gold;
        ctx.fillText(c.highScore != null ? `최고 ${c.highScore}점` : '지금 플레이!', c.x + c.w / 2, c.y + 168);
        // 업적 뱃지
        this._drawBadges(ctx, c);
      } else {
        ctx.font = font(22, 'normal');
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText('준비 중', c.x + c.w / 2, c.y + 168);
      }
      ctx.globalAlpha = 1;
      // hover 시 살짝 밝게 (활성 셀만)
      if (c.active && this._hovered(c)) {
        roundRect(ctx, c.x, c.y, c.w, c.h, 22);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fill();
      }
      // 연산 배지 (× / ÷) — hover 오버레이 위에 선명하게
      this._drawOpBadge(ctx, c);
    }

    // 리포트 버튼
    const r = this.reportBtn;
    roundRect(ctx, r.x, r.y, r.w, r.h, 20);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    if (this._hovered(r)) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.font = font(38);
    ctx.fillText(r.label, r.x + r.w / 2, r.y + r.h / 2);
  },

  // 연산 배지: 셀 우측 상단에 × 또는 ÷ 칩. mixed/미지정·비활성 셀은 표시하지 않는다.
  //   좌표·크기·폰트는 L 헬퍼로 계산(절대 픽셀 금지). 업적 뱃지는 좌측 상단이라 겹치지 않고,
  //   이름(중앙)·최고점(하단)도 가리지 않는다.
  _drawOpBadge(ctx, c) {
    if (!c.active) return;
    const sym = c.opMode === 'multiply' ? '×' : c.opMode === 'divide' ? '÷' : null;
    if (!sym) return; // mixed 또는 opMode 없음 → 배지 없음
    const r = L.gu(0.75);
    const inset = L.gu(0.95);
    const bx = c.x + c.w - inset; // 우측 상단
    const by = c.y + inset;
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fillStyle = THEME.gold;
    ctx.fill();
    ctx.fillStyle = THEME.bg; // 금색 칩 위 어두운 글리프(대비 확보)
    ctx.font = font(L.font(0.032));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sym, bx, by + L.gu(0.03));
    ctx.restore();
  },

  _drawBadges(ctx, c) {
    const badges = { bronze: '🥉', silver: '🥈', gold: '🥇' };
    const owned = c.achievements || [];
    let bx = c.x + 14;
    ctx.font = font(28);
    ctx.textAlign = 'left';
    for (const key of ['bronze', 'silver', 'gold']) {
      if (owned.includes(key)) {
        ctx.fillText(badges[key], bx, c.y + 26);
        bx += 32;
      }
    }
    ctx.textAlign = 'center';
  },

  _drawGear(ctx) {
    const g = this.gearRect;
    roundRect(ctx, g.x, g.y, g.w, g.h, 18);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    if (this._hovered(g)) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
    }
    ctx.font = font(50);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText('⚙️', g.x + g.w / 2, g.y + g.h / 2);
    // 롱프레스 진행 링
    if (this.gearPressing && this.gearHold > 0.1) {
      const p = Math.min(1, this.gearHold / LONGPRESS_SEC);
      ctx.beginPath();
      ctx.arc(g.x + g.w / 2, g.y + g.h / 2, 54, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      ctx.strokeStyle = THEME.gold;
      ctx.lineWidth = 6;
      ctx.stroke();
    }
  },

  onTouch(x, y, phase) {
    const e = this.engine;
    // 기어 롱프레스 처리
    if (phase === 'start') {
      if (hit(this.gearRect, x, y)) {
        this.gearPressing = true;
        this.gearHold = 0;
        return;
      }
    } else if (phase === 'move') {
      if (this.gearPressing && !hit(this.gearRect, x, y)) {
        this.gearPressing = false; // 손가락이 벗어나면 취소
        this.gearHold = 0;
      }
      return;
    } else if (phase === 'end') {
      if (this.gearPressing) {
        // 짧게 뗀 경우 — 진입 안 함(안내만)
        this.gearPressing = false;
        this.gearHold = 0;
        return;
      }
      // 게임 셀 선택
      for (const c of this.cells) {
        if (hit(c, x, y) && c.active) {
          const game = getGameById(c.id);
          if (game) e.goTutorial(game);
          return;
        }
      }
      // 리포트
      if (hit(this.reportBtn, x, y)) {
        e.setState('REPORT');
        return;
      }
    }
  },

  // 마우스 hover: 클릭 가능한 요소(활성 게임 셀 / 리포트 / 기어) 위인지 반환. 커서 pointer 판정용.
  onHover(x, y) {
    this.hoverPt = { x, y };
    if (hit(this.gearRect, x, y)) return true;
    if (hit(this.reportBtn, x, y)) return true;
    for (const c of this.cells) if (c.active && hit(c, x, y)) return true;
    return false;
  },
  clearHover() {
    this.hoverPt = null;
  },
  _hovered(rect) {
    return this.hoverPt && hit(rect, this.hoverPt);
  },

  onKey() {},
};
