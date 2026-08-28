// g01_combo.js — ⚡ 콤보 챌린지 (SPEC §4 1️⃣ / Phase 1)
// 선택형·판단형. 상단 문제 + 하단 2×2 선택지 4개. 제한시간 게이지.
// 확정 인터페이스(SPEC §7)만 사용한다. core/scenes는 건드리지 않는다.
//
// ⚠️ 재미 표준(§2.6) core 모듈 사용:
//   - fever:true → engine.fever. 위기 테두리·정답음·점수2배·게이지·카운트업은 core 자동.
//   - 니어미스 보상: reportNearMiss. 정답 연출은 흐름을 멈추지 않는다(0.15초 이내).
//   - 고유 재미(순간 판단): 정답 순간 나머지 3개가 뒤로 물러남 + 빠르게 맞힐수록 QUICK 보너스.
//
// 좌표·크기·폰트는 전부 core/layout.js 의 L 헬퍼로 계산한다(픽셀 리터럴 금지).
//
// 축 분리(SPEC 2.1): level은 problemGenerator만 관리. 게임 난이도(축 B)는 scoreManager.combo로만.

import { L } from '../core/layout.js';
import { THEME, font, roundRect, hit } from '../core/ui.js';

const CORRECT_ANIM = 0.15; // 정답 연출(흐름 멈추지 않음, ≤0.15초)
const WRONG_ANIM = 0.45; // 오답 버튼 피드백 후 core 정답표시 오버레이

export const g01Combo = {
  id: 'g01_combo',
  name: '콤보 챌린지',
  emoji: '⚡',
  category: '선택형',
  maxLevel: 4, // 출제 상한 Lv4 (SPEC 2.1 판단형)
  blankRatio: 0.25, // 판단형 빈칸 비율
  opMode: 'multiply', // 곱셈만 출제
  fever: true, // 재미 표준 피버 opt-in → engine.fever (§7.6)

  tutorial: {
    text: '문제의 답을 찾아 눌러봐! 빠를수록 점수가 올라가!',
    draw(ctx) {
      const cx = L.W / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      roundRect(ctx, cx - L.gu(5.75), L.gu(0.6), L.gu(11.5), L.gu(2.75), L.gu(0.5));
      ctx.fillStyle = THEME.panel;
      ctx.fill();
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.05));
      ctx.fillText('6 × 7 = ?', cx, L.gu(2));

      const bw = L.gu(4.75);
      const bh = L.gu(2.3);
      const gap = L.gu(0.65);
      const gx = cx - bw - gap / 2;
      const gy = L.gu(4.4);
      const opts = [
        { c: 0, r: 0, label: '42', ok: true },
        { c: 1, r: 0, label: '48', ok: false },
        { c: 0, r: 1, label: '36', ok: false },
        { c: 1, r: 1, label: '49', ok: false },
      ];
      for (const o of opts) {
        const x = gx + o.c * (bw + gap);
        const y = gy + o.r * (bh + gap);
        roundRect(ctx, x, y, bw, bh, L.gu(0.4));
        ctx.fillStyle = o.ok ? THEME.correct : THEME.accent;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = font(L.font(0.041));
        ctx.fillText(o.label, x + bw / 2, y + bh / 2);
        if (o.ok) {
          ctx.font = font(L.font(0.031));
          ctx.fillText('⭕', x + bw - L.gu(0.6), y + L.gu(0.55));
        }
      }
      ctx.font = font(L.font(0.06));
      ctx.fillText('👆', gx + bw / 2 + L.gu(1), gy + bh - L.gu(0.15));
    },
  },

  // ── 레이아웃 (L 기반) ──
  _layout() {
    const btnW = L.w(0.425); // 340
    const btnH = L.h(0.125); // 160
    const colX = [L.w(0.05), L.w(0.525)]; // 40, 420
    const rowGap = L.gu(1.1); // 44
    const gridBottom = L.H - L.safe;
    const rowY = [gridBottom - btnH * 2 - rowGap, gridBottom - btnH];
    return { btnW, btnH, colX, rowY };
  },

  init(engine) {
    this.engine = engine;
    this.problem = null;
    this.choices = [];
    this.pressedBtn = null;
    this.hoverPt = null;
    this.mark = null; // {btn, correct}
    this.pendingWrong = null;
    this.phase = 'play'; // 'play' | 'correctAnim' | 'wrongAnim'
    this.animTimer = 0;

    this.timeLimit = 5;
    this.timeLeft = 5;
    this.ticked = false;

    this.wasFever = false;
    this.feverBanner = null;

    this._loadProblem();
  },

  // 제한시간: 5초 → 콤보 5마다 -0.3초, 최소 2.5초, ×교사배율.
  _computeTimeLimit() {
    const combo = this.engine.scoreManager.combo;
    let base = 5 - 0.3 * Math.floor(combo / 5);
    if (base < 2.5) base = 2.5;
    return base * (this.engine.settings.timeScale || 1);
  },

  _loadProblem() {
    const e = this.engine;
    this.problem = e.problemGenerator.nextProblem({ maxLevel: this.maxLevel, blankRatio: this.blankRatio, opMode: this.opMode });

    const closeness = Math.max(0.2, Math.min(0.8, 0.2 + 0.03 * e.scoreManager.combo));
    const distractors = e.problemGenerator.makeDistractors(this.problem, 3, closeness);

    const values = shuffle([this.problem.answer, ...distractors]).slice(0, 4);
    const { btnW, btnH, colX, rowY } = this._layout();
    this.choices = [];
    for (let i = 0; i < 4; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      this.choices.push({ x: colX[col], y: rowY[row], w: btnW, h: btnH, value: values[i] });
    }

    this.pressedBtn = null;
    this.mark = null;
    this.pendingWrong = null;
    this.phase = 'play';
    this.animTimer = 0;
    this.timeLimit = this._computeTimeLimit();
    this.timeLeft = this.timeLimit;
    this.ticked = false;
  },

  update(dt) {
    const e = this.engine;

    // 피버 진입/종료 전이
    const fev = e.fever;
    const active = !!(fev && fev.active);
    if (active && !this.wasFever) {
      e.ui.flash('rgba(255,210,120,0.5)', 0.09);
      e.ui.showComboText('🔥 FEVER!', true);
    } else if (!active && this.wasFever) {
      this.feverBanner = { points: fev ? fev.pointsEarned : 0, t: 0, dur: 1.4 };
      e.ui.flash('rgba(120,200,255,0.4)', 0.09);
    }
    this.wasFever = active;
    if (this.feverBanner) {
      this.feverBanner.t += dt;
      if (this.feverBanner.t >= this.feverBanner.dur) this.feverBanner = null;
    }

    if (this.phase === 'correctAnim') {
      this.animTimer -= dt;
      if (this.animTimer <= 0) this._loadProblem(); // 멈춤 없이 즉시 다음 문제
      return;
    }

    if (this.phase === 'wrongAnim') {
      this.animTimer -= dt;
      if (this.animTimer <= 0) {
        const { problem, value } = this.pendingWrong;
        e.answerWrong(problem, value, { loseLife: true, onResume: () => this._loadProblem() });
      }
      return;
    }

    // phase === 'play' — 제한시간 카운트다운
    this.timeLeft -= dt;
    if (!this.ticked && this.timeLeft <= 1 && this.timeLeft > 0) {
      e.sound.play('tick');
      this.ticked = true;
    }
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      e.timeUp(this.problem, { loseLife: true, onResume: () => this._loadProblem() });
    }
  },

  render(ctx) {
    const cx = L.W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    this._drawFeverBg(ctx);

    // 제한시간 게이지
    const gx = L.safe;
    const gy = L.zone.gauge;
    const gw = L.W - L.safe * 2;
    const gh = L.gu(1);
    const ratio = this.timeLimit > 0 ? Math.max(0, this.timeLeft / this.timeLimit) : 0;
    const low = this.timeLeft <= 1;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(ctx, gx, gy, gw, gh, gh / 2);
    ctx.fill();
    ctx.fillStyle = low ? THEME.wrong : THEME.accent;
    roundRect(ctx, gx, gy, gw * ratio, gh, gh / 2);
    ctx.fill();
    ctx.font = font(L.font(0.023));
    ctx.fillStyle = THEME.text;
    ctx.fillText(low ? '⏰ 서둘러!' : '⏱', cx, gy + gh / 2);

    // 피버 게이지(제한시간 게이지 아래)
    if (this.engine.fever) {
      this.engine.fever.renderGauge(ctx, { x: gx, y: gy + gh + L.gu(0.3), w: gw, h: L.gu(0.5) });
    }

    // 문제 텍스트(≥80px)
    ctx.fillStyle = THEME.text;
    ctx.font = font(L.font(0.094));
    const qText = this.problem.blank ? this.problem.text : `${this.problem.text} = ?`;
    ctx.fillText(qText, cx, L.gu(10.75));
    if (this.problem.fromReview) {
      ctx.font = font(L.font(0.028));
      ctx.fillStyle = THEME.gold;
      ctx.fillText('🔁 다시 도전!', cx, L.gu(14));
    }

    ctx.fillStyle = THEME.subtext;
    ctx.font = font(L.font(0.023), 'normal');
    ctx.fillText('정답을 찾아 눌러봐!', cx, this.choices[0].y - L.gu(1.25));

    for (const c of this.choices) this._drawChoice(ctx, c);

    this._drawFeverBanner(ctx);
  },

  _drawChoice(ctx, c) {
    const isMark = this.mark && this.mark.btn === c;
    const isCorrectMark = isMark && this.mark.correct;
    const isWrongMark = isMark && !this.mark.correct;
    const isPressed = this.phase === 'play' && this.pressedBtn === c;
    const isHover = this.phase === 'play' && this.hoverPt && hit(c, this.hoverPt.x, this.hoverPt.y);

    let color = THEME.accent;
    if (isCorrectMark) color = THEME.correct;
    else if (isWrongMark) color = THEME.wrong;
    else if (isPressed) color = '#6bb3ff';
    else if (isHover) color = '#5aa6ff';

    // 스케일/투명도
    let scale = 1;
    let alpha = 1;
    if (isPressed) scale = 0.95;
    else if (isCorrectMark) {
      const p = 1 - Math.max(0, this.animTimer) / CORRECT_ANIM; // 0→1
      scale = 1 + 0.14 * Math.sin(p * Math.PI); // 튀어올랐다 돌아옴
    } else if (this.phase === 'correctAnim' && !isMark) {
      // 고유 재미: 정답 순간 나머지 3개가 뒤로 물러남(축소+페이드)
      const p = 1 - Math.max(0, this.animTimer) / CORRECT_ANIM;
      scale = 1 - 0.3 * p;
      alpha = 1 - 0.65 * p;
    }

    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);

    roundRect(ctx, c.x, c.y, c.w, c.h, L.gu(0.65));
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = L.gu(0.1);
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = font(L.font(0.075));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(c.value), cx, cy);

    if (isCorrectMark) {
      ctx.font = font(L.font(0.05));
      ctx.fillText('⭕', c.x + c.w - L.gu(1.1), c.y + L.gu(1.1));
    } else if (isWrongMark) {
      ctx.font = font(L.font(0.05));
      ctx.fillText('❌', c.x + c.w - L.gu(1.1), c.y + L.gu(1.1));
    }
    ctx.restore();
  },

  onTouch(x, y, phase) {
    if (this.phase !== 'play') return;

    if (phase === 'start') {
      for (const c of this.choices) {
        if (hit(c, x, y)) {
          this.pressedBtn = c;
          return;
        }
      }
    } else if (phase === 'move') {
      if (this.pressedBtn && !hit(this.pressedBtn, x, y)) this.pressedBtn = null;
    } else if (phase === 'end') {
      const btn = this.pressedBtn;
      this.pressedBtn = null;
      if (btn && hit(btn, x, y)) this._commit(btn);
    }
  },

  _commit(btn) {
    const e = this.engine;
    if (btn.value === this.problem.answer) {
      const remainRatio = this.timeLimit > 0 ? Math.max(0, this.timeLeft / this.timeLimit) : 0;

      // 정답: 100점 + 콤보×10 (피버 2배는 answerCorrect 자동)
      const pts = 100 + e.scoreManager.combo * 10;
      e.answerCorrect(this.problem, btn.value, pts);

      const bx = btn.x + btn.w / 2;
      const by = btn.y + btn.h / 2;

      // 니어미스: 제한시간 0.3초 남기고 정답
      if (this.timeLeft <= 0.3) {
        e.reportNearMiss(bx, by);
      } else if (remainRatio >= 0.5) {
        // 고유 재미: 빠르게 맞힐수록 QUICK 보너스 (첫 절반 안에 정답)
        const fmult = e.fever && e.fever.active ? e.fever.scoreMultiplier : 1;
        const bonus = Math.round(remainRatio * 60 * fmult);
        if (bonus > 0) {
          e.scoreManager.addPoints(bonus);
          if (e.fever) e.fever.addPoints(bonus);
          e.ui.showComboText(`QUICK +${bonus}`, false);
        }
      }

      e.particles.emit(bx, by, 'sparkle', THEME.correct, 16);
      this.mark = { btn, correct: true };
      this.phase = 'correctAnim';
      this.animTimer = CORRECT_ANIM;
    } else {
      this.mark = { btn, correct: false };
      this.pendingWrong = { problem: this.problem, value: btn.value };
      this.phase = 'wrongAnim';
      this.animTimer = WRONG_ANIM;
      e.ui.shake(16, 0.4);
    }
  },

  onHover(x, y) {
    if (this.phase !== 'play') {
      this.hoverPt = null;
      return false;
    }
    this.hoverPt = { x, y };
    for (const c of this.choices) if (hit(c, x, y)) return true;
    return false;
  },
  clearHover() {
    this.hoverPt = null;
  },

  onKey(e) {
    if (this.phase !== 'play') return;
    const idx = { 1: 0, 2: 1, 3: 2, 4: 3 }[e.key];
    if (idx != null && this.choices[idx]) this._commit(this.choices[idx]);
  },

  _feverIntensity() {
    const f = this.engine.fever;
    if (!f) return 0;
    if (f.active) return 1;
    const peak = (f.cfg && f.cfg.speedMult ? f.cfg.speedMult : 1.35) - 1;
    return peak > 0 ? Math.max(0, (f.speedMultiplier - 1) / peak) : 0;
  },
  _drawFeverBg(ctx) {
    const mult = this._feverIntensity();
    if (mult <= 0) return;
    const a = 0.14 * mult;
    const g = ctx.createLinearGradient(0, 0, 0, L.H);
    g.addColorStop(0, `rgba(255,180,90,${a})`);
    g.addColorStop(0.5, `rgba(255,120,170,${a * 0.85})`);
    g.addColorStop(1, `rgba(120,180,255,${a})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L.W, L.H);
    ctx.restore();
  },
  _drawFeverBanner(ctx) {
    if (!this.feverBanner) return;
    const b = this.feverBanner;
    const prog = b.t / b.dur;
    ctx.save();
    ctx.globalAlpha = prog < 0.7 ? 1 : Math.max(0, 1 - (prog - 0.7) / 0.3);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(L.font(0.07));
    ctx.lineWidth = L.gu(0.25);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(`FEVER +${b.points}`, L.W / 2, L.gu(9));
    ctx.fillStyle = THEME.gold;
    ctx.fillText(`FEVER +${b.points}`, L.W / 2, L.gu(9));
    ctx.restore();
  },

  destroy() {
    this.engine = null;
    this.problem = null;
    this.choices = [];
    this.pressedBtn = null;
    this.hoverPt = null;
    this.mark = null;
    this.pendingWrong = null;
    this.feverBanner = null;
  },
};

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
