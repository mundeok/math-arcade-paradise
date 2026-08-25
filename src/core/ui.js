// ui.js — 공용 UI 컴포넌트 (SPEC 3.3, 3.10 / Phase0 §9)
// HUD, 버튼, 콤보 텍스트 오버레이, 정답 표시 오버레이(1.2초), 흔들림/플래시.
// 정오답 피드백은 반드시 색 + 아이콘(⭕/❌) + 모양 변화 3중으로 표현(적록색약 대응).

import { fullEquationLines } from './mathText.js';

// 시스템 폰트 스택만 사용 (외부 폰트 금지 — SPEC 1.1)
export const FONT_STACK = '-apple-system, "Noto Sans KR", "Malgun Gothic", sans-serif';

export const THEME = {
  bg: '#101828',
  panel: '#1d2740',
  accent: '#4a9eff',
  correct: '#2ec16b', // 정답: 초록 (+ ⭕ 아이콘 병행)
  wrong: '#e8663d', // 오답: 주황 (적록색약 대응 — 빨강 대신 주황)
  text: '#ffffff',
  subtext: '#9fb2d4',
  gold: '#ffd54a',
  life: '#ff5d73',
  disabled: '#39445e', // 비활성 버튼 배경
};

export function font(size, weight = 'bold') {
  return `${weight} ${size}px ${FONT_STACK}`;
}

// 논리 좌표 상수
export const LOGICAL_W = 800;
export const LOGICAL_H = 1280;
export const SAFE = 24; // 안전 여백

export class UI {
  constructor(engine) {
    this.engine = engine;
    this.comboOverlays = []; // 콤보 연출 텍스트 [{text, t, dur, big}]
    this.shakeTime = 0;
    this.shakeMag = 0;
    this.flashTime = 0;
    this.flashDur = 0;
    this.flashColor = 'rgba(255,255,255,0.5)';

    this.pauseRect = { x: LOGICAL_W - SAFE - 96, y: SAFE, w: 96, h: 96 };
  }

  reset() {
    this.comboOverlays.length = 0;
    this.shakeTime = 0;
    this.shakeMag = 0;
    this.flashTime = 0;
  }

  update(dt) {
    for (let i = this.comboOverlays.length - 1; i >= 0; i--) {
      const o = this.comboOverlays[i];
      o.t += dt;
      if (o.t >= o.dur) this.comboOverlays.splice(i, 1);
    }
    if (this.shakeTime > 0) this.shakeTime = Math.max(0, this.shakeTime - dt);
    if (this.flashTime > 0) this.flashTime = Math.max(0, this.flashTime - dt);
  }

  // ── 흔들림 / 플래시 (깜빡임은 초당 3회 이하 — SPEC 2.5) ──
  shake(mag = 14, time = 0.3) {
    this.shakeMag = mag;
    this.shakeTime = time;
  }
  getShakeOffset() {
    if (this.shakeTime <= 0) return { x: 0, y: 0 };
    const m = this.shakeMag * (this.shakeTime); // 시간에 따라 감쇠
    return { x: (Math.random() - 0.5) * m, y: (Math.random() - 0.5) * m };
  }
  flash(color = 'rgba(255,255,255,0.4)', dur = 0.2) {
    this.flashColor = color;
    this.flashTime = dur;
    this.flashDur = dur;
  }
  renderFlash(ctx) {
    if (this.flashTime <= 0) return;
    ctx.save();
    ctx.globalAlpha = (this.flashTime / this.flashDur) * 0.6;
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.restore();
  }

  // ── 콤보 텍스트 오버레이 (SPEC 3.3) ──
  showComboText(text, big = false) {
    this.comboOverlays.push({ text, t: 0, dur: big ? 1.2 : 0.9, big });
  }
  renderComboOverlays(ctx) {
    for (const o of this.comboOverlays) {
      const p = o.t / o.dur;
      const scale = 1 + (o.big ? 0.5 : 0.3) * Math.sin(Math.min(1, p * 3) * Math.PI * 0.5);
      const alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(LOGICAL_W / 2, LOGICAL_H * 0.34);
      ctx.scale(scale, scale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = font(o.big ? 110 : 78);
      ctx.lineWidth = 10;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(o.text, 0, 0);
      ctx.fillStyle = THEME.gold;
      ctx.fillText(o.text, 0, 0);
      ctx.restore();
    }
  }

  // ── HUD (상단 고정) : 점수 | 콤보 | 라이프 ❤️ | ⏸ ──
  drawHUD(ctx, { score, combo, lives, showPause = true }) {
    const barH = 96;
    ctx.save();
    // 반투명 상단 바
    ctx.fillStyle = 'rgba(16,24,40,0.75)';
    ctx.fillRect(0, 0, LOGICAL_W, barH + SAFE);

    ctx.textBaseline = 'middle';
    const cy = SAFE + barH / 2;

    // 점수
    ctx.textAlign = 'left';
    ctx.font = font(40);
    ctx.fillStyle = THEME.text;
    ctx.fillText(`${score}점`, SAFE, cy);

    // 콤보 (중앙)
    ctx.textAlign = 'center';
    if (combo > 0) {
      ctx.font = font(44);
      ctx.fillStyle = THEME.gold;
      ctx.fillText(`${combo} COMBO`, LOGICAL_W / 2, cy);
    }

    // 라이프 하트 (⏸ 버튼 왼쪽)
    const heartSize = 46;
    let hx = this.pauseRect.x - 20 - heartSize;
    for (let i = 0; i < Math.max(lives, 0); i++) {
      drawHeart(ctx, hx, cy, heartSize, THEME.life);
      hx -= heartSize + 10;
    }

    // ⏸ 일시정지 버튼
    if (showPause) {
      const r = this.pauseRect;
      roundRect(ctx, r.x, r.y, r.w, r.h, 18);
      ctx.fillStyle = THEME.panel;
      ctx.fill();
      ctx.fillStyle = THEME.text;
      const bw = 12,
        bh = 40,
        gap = 12;
      const bx = r.x + r.w / 2 - gap / 2 - bw;
      const by = r.y + r.h / 2 - bh / 2;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillRect(bx + bw + gap, by, bw, bh);
    }
    ctx.restore();
  }

  hitPause(x, y) {
    const r = this.pauseRect;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  // ── 버튼 그리기 & 히트테스트 ──
  // btn: {x, y, w, h, label, emoji, sub, color, disabled}
  drawButton(ctx, btn) {
    const { x, y, w, h } = btn;
    ctx.save();
    roundRect(ctx, x, y, w, h, 22);
    ctx.fillStyle = btn.disabled ? THEME.disabled : btn.color || THEME.accent;
    ctx.fill();
    if (!btn.disabled) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = btn.disabled ? 0.55 : 1;

    const cx = x + w / 2;
    let cy = y + h / 2;
    if (btn.emoji) {
      ctx.font = font(Math.min(h * 0.42, 64));
      ctx.fillText(btn.emoji, cx, y + h * 0.36);
      cy = y + h * 0.72;
    }
    if (btn.label) {
      ctx.font = font(btn.emoji ? 30 : 40);
      ctx.fillStyle = '#fff';
      ctx.fillText(btn.label, cx, cy);
    }
    if (btn.sub) {
      ctx.font = font(22, 'normal');
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(btn.sub, cx, y + h - 22);
    }
    ctx.restore();
  }

  // ── 정답 표시 오버레이 (SPEC 2.3) ──
  // progress: 0~1 (1.2초 진행률). 이 동안 게임은 완전 정지(engine이 담당).
  renderAnswerFeedback(ctx, problem, progress) {
    ctx.save();
    // 배경 딤 (색만이 아니라 큰 ❌ 아이콘 + 식으로 3중 표현)
    ctx.fillStyle = 'rgba(10,15,25,0.82)';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    const cx = LOGICAL_W / 2;
    const cy = LOGICAL_H / 2;

    // ❌ 아이콘 (색약 대응: 모양으로도 구분)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(120);
    ctx.fillText('❌', cx, cy - 250);

    // "다시 해보자" — 부정적 평가 금지 (SPEC 2.5)
    ctx.font = font(48);
    ctx.fillStyle = THEME.subtext;
    ctx.fillText('아쉬워요! 정답을 볼까요?', cx, cy - 140);

    // 식 전체 120px
    const lines = fullEquationLines(problem);
    ctx.fillStyle = THEME.gold;
    let ly = cy;
    ctx.font = font(120);
    ctx.fillText(lines[0], cx, ly);
    if (lines[1]) {
      ly += 130;
      ctx.font = font(80);
      ctx.fillStyle = THEME.text;
      ctx.fillText(lines[1], cx, ly);
    }

    // 진행 게이지 (남은 정지 시간 시각화)
    const gw = 400;
    const gx = cx - gw / 2;
    const gy = cy + 300;
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    roundRect(ctx, gx, gy, gw, 16, 8);
    ctx.fill();
    ctx.fillStyle = THEME.accent;
    roundRect(ctx, gx, gy, gw * (1 - progress), 16, 8);
    ctx.fill();
    ctx.restore();
  }

  // ── 정답 순간 ⭕ 아이콘 (게임에서 원할 때 호출) ──
  showCorrectMark(ctx, x, y, size = 90) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(size);
    ctx.fillText('⭕', x, y);
    ctx.restore();
  }
}

// ── 도형 헬퍼 ─────────────────────────────────────────────
export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function drawHeart(ctx, x, y, size, color) {
  // (x,y)는 하트 중심
  ctx.save();
  ctx.fillStyle = color;
  ctx.translate(x, y);
  const s = size / 32;
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.bezierCurveTo(-16, -6, -12, -20, 0, -10);
  ctx.bezierCurveTo(12, -20, 16, -6, 0, 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function hit(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
