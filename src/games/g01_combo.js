// g01_combo.js — ⚡ 콤보 챌린지 (SPEC §4 1️⃣ / Phase 1)
// 선택형·판단형. 상단 문제 + 하단 2×2 선택지 4개. 제한시간 게이지.
// 확정 인터페이스(SPEC §7)만 사용한다. core/scenes는 건드리지 않는다.
//
// 축 분리(SPEC 2.1) 준수:
//   - 수학 난이도(level)는 problemGenerator만 관리. 이 파일은 level을 읽지 않는다.
//   - 게임 난이도(축 B)는 오직 scoreManager.combo로 계산한다:
//       제한시간 단축 + 오답 근접도(closeness) 상승.
// 점수·콤보·라이프·복습큐·연출은 engine.answerCorrect / answerWrong 이 전담한다.

import { LOGICAL_W, LOGICAL_H, SAFE, THEME, font, roundRect, hit } from '../core/ui.js';

// ── 레이아웃 상수 (논리 좌표 800×1280) ─────────────────────
// 버튼 340×160 (SPEC 명시). 2열: 40 + 340 + 40 + 340 + 40 = 800 (좌우 여백 40 ≥ 안전여백 24)
const BTN_W = 340;
const BTN_H = 160;
const COL_X = [40, 420];
const ROW_GAP = 44;
const GRID_BOTTOM = LOGICAL_H - SAFE; // 1256
const ROW_Y = [GRID_BOTTOM - BTN_H * 2 - ROW_GAP, GRID_BOTTOM - BTN_H]; // [892, 1096]

// 제한시간 게이지 (HUD 아래)
const GAUGE_X = SAFE;
const GAUGE_Y = 150;
const GAUGE_W = LOGICAL_W - SAFE * 2;
const GAUGE_H = 40;

const CORRECT_ANIM = 0.35; // 정답 축하 연출 시간(초)
const WRONG_ANIM = 0.45; // 오답 버튼 피드백 시간(초) — 이후 core 정답표시 오버레이

export const g01Combo = {
  id: 'g01_combo',
  name: '콤보 챌린지',
  emoji: '⚡',
  category: '선택형',
  maxLevel: 4, // 출제 상한 Lv4 (SPEC 2.1 판단형)
  blankRatio: 0.25, // 판단형 빈칸 비율

  tutorial: {
    text: '문제의 답을 찾아 눌러봐! 빠를수록 점수가 올라가!',
    draw(ctx) {
      // ctx는 논리 좌표, translate(0,260)된 카드 영역(x 24~776, y 0~440) 안에서 그린다.
      const cx = LOGICAL_W / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 문제 카드
      roundRect(ctx, cx - 230, 24, 460, 110, 20);
      ctx.fillStyle = THEME.panel;
      ctx.fill();
      ctx.fillStyle = THEME.text;
      ctx.font = font(64);
      ctx.fillText('6 × 7 = ?', cx, 80);

      // 선택지 2×2 (정답 42는 초록 + ⭕)
      const bw = 190;
      const bh = 92;
      const gap = 26;
      const gx = cx - bw - gap / 2;
      const gy = 175;
      const opts = [
        { c: 0, r: 0, label: '42', ok: true },
        { c: 1, r: 0, label: '48', ok: false },
        { c: 0, r: 1, label: '36', ok: false },
        { c: 1, r: 1, label: '49', ok: false },
      ];
      for (const o of opts) {
        const x = gx + o.c * (bw + gap);
        const y = gy + o.r * (bh + gap);
        roundRect(ctx, x, y, bw, bh, 16);
        ctx.fillStyle = o.ok ? THEME.correct : THEME.accent;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = font(52);
        ctx.fillText(o.label, x + bw / 2, y + bh / 2);
        if (o.ok) {
          ctx.font = font(40);
          ctx.fillText('⭕', x + bw - 24, y + 22);
        }
      }

      // 정답을 누르는 손가락
      ctx.font = font(76);
      ctx.fillText('👆', gx + bw / 2 + 40, gy + bh - 6);
    },
  },

  init(engine) {
    this.engine = engine;
    this.problem = null;
    this.choices = []; // [{x,y,w,h,value}]
    this.pressedBtn = null; // 손가락으로 누르고 있는 버튼 (scale 0.95 연출)
    this.mark = null; // {btn, correct} — 정답/오답 순간 연출 대상
    this.pendingWrong = null; // {problem, value} — 오답 연출 후 answerWrong에 넘길 값
    this.phase = 'play'; // 'play' | 'correctAnim' | 'wrongAnim'
    this.animTimer = 0;

    this.timeLimit = 5;
    this.timeLeft = 5;
    this.ticked = false; // 1초 경고음 1회 재생 플래그

    this._loadProblem();
  },

  // 현재 콤보 기준 제한시간 계산: 5초 → 콤보 5마다 -0.3초, 최소 2.5초, ×제한시간배율
  _computeTimeLimit() {
    const combo = this.engine.scoreManager.combo;
    let base = 5 - 0.3 * Math.floor(combo / 5);
    if (base < 2.5) base = 2.5; // 최소 2.5초 (SPEC)
    return base * (this.engine.settings.timeScale || 1); // 교사 설정 제한시간 배율 반드시 곱함
  },

  _loadProblem() {
    const e = this.engine;
    this.problem = e.problemGenerator.nextProblem({ maxLevel: this.maxLevel, blankRatio: this.blankRatio });

    // 오답 근접도(축 B): 콤보 0→0.2 / 10→0.5 / 20+→0.8
    const closeness = Math.max(0.2, Math.min(0.8, 0.2 + 0.03 * e.scoreManager.combo));
    const distractors = e.problemGenerator.makeDistractors(this.problem, 3, closeness);

    // 정답 + 오답 3개를 4칸에 무작위 배치
    const values = shuffle([this.problem.answer, ...distractors]).slice(0, 4);
    this.choices = [];
    for (let i = 0; i < 4; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      this.choices.push({ x: COL_X[col], y: ROW_Y[row], w: BTN_W, h: BTN_H, value: values[i] });
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

    if (this.phase === 'correctAnim') {
      this.animTimer -= dt;
      if (this.animTimer <= 0) this._loadProblem();
      return;
    }

    if (this.phase === 'wrongAnim') {
      this.animTimer -= dt;
      if (this.animTimer <= 0) {
        // 오답 버튼 연출이 끝나면 core 정답표시 오버레이(1.2초 정지)로 넘긴다.
        const { problem, value } = this.pendingWrong;
        e.answerWrong(problem, value, { loseLife: true, onResume: () => this._loadProblem() });
        // 이후 freeze 동안 update는 호출되지 않는다. onResume에서 다음 문제 로드.
      }
      return;
    }

    // phase === 'play' — 제한시간 카운트다운
    this.timeLeft -= dt;
    if (!this.ticked && this.timeLeft <= 1 && this.timeLeft > 0) {
      e.sound.play('tick'); // 1초 남았을 때 경고음 1회 (색 변화는 render에서)
      this.ticked = true;
    }
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      // 시간초과 = 오답 처리 (콤보 리셋 + 라이프 -1 + 정답 1.2초 표시)
      e.timeUp(this.problem, { loseLife: true, onResume: () => this._loadProblem() });
    }
  },

  render(ctx) {
    const cx = LOGICAL_W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 제한시간 게이지 (1초 이하 남으면 주황으로 색 변화 — 색만 의존하지 않도록 아이콘 병행)
    const ratio = this.timeLimit > 0 ? Math.max(0, this.timeLeft / this.timeLimit) : 0;
    const low = this.timeLeft <= 1;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(ctx, GAUGE_X, GAUGE_Y, GAUGE_W, GAUGE_H, GAUGE_H / 2);
    ctx.fill();
    ctx.fillStyle = low ? THEME.wrong : THEME.accent;
    roundRect(ctx, GAUGE_X, GAUGE_Y, GAUGE_W * ratio, GAUGE_H, GAUGE_H / 2);
    ctx.fill();
    // 시간 임박 아이콘 (색약 대응: 색 외 신호)
    ctx.font = font(30);
    ctx.fillStyle = THEME.text;
    ctx.fillText(low ? '⏰ 서둘러!' : '⏱', cx, GAUGE_Y + GAUGE_H / 2);

    // 문제 텍스트 (최소 80px 규정 — 크게)
    ctx.fillStyle = THEME.text;
    ctx.font = font(120);
    const qText = this.problem.blank ? this.problem.text : `${this.problem.text} = ?`;
    ctx.fillText(qText, cx, 430);

    // 복습 문제 표시
    if (this.problem.fromReview) {
      ctx.font = font(36);
      ctx.fillStyle = THEME.gold;
      ctx.fillText('🔁 다시 도전!', cx, 560);
    }

    // 안내
    ctx.fillStyle = THEME.subtext;
    ctx.font = font(30, 'normal');
    ctx.fillText('정답을 찾아 눌러봐!', cx, ROW_Y[0] - 50);

    // 선택지 버튼
    for (const c of this.choices) this._drawChoice(ctx, c);
  },

  _drawChoice(ctx, c) {
    const isMark = this.mark && this.mark.btn === c;
    const isCorrectMark = isMark && this.mark.correct;
    const isWrongMark = isMark && !this.mark.correct;
    const isPressed = this.phase === 'play' && this.pressedBtn === c;

    // 색상: 정답 초록 / 오답 주황 / 누름 밝게 / 기본 파랑
    let color = THEME.accent;
    if (isCorrectMark) color = THEME.correct;
    else if (isWrongMark) color = THEME.wrong;
    else if (isPressed) color = '#6bb3ff'; // 누른 순간 밝은 파랑

    // 스케일: 누름 0.95 / 정답 살짝 튀어오름(1+0.14) / 오답은 그대로(흔들림은 core 화면 흔들림)
    let scale = 1;
    if (isPressed) scale = 0.95;
    else if (isCorrectMark) {
      const p = 1 - Math.max(0, this.animTimer) / CORRECT_ANIM; // 0→1
      scale = 1 + 0.14 * Math.sin(p * Math.PI); // 튀어올랐다 돌아옴
    }

    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);

    roundRect(ctx, c.x, c.y, c.w, c.h, 26);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = font(96);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(c.value), cx, cy);

    // 정오답 아이콘 (색 + 아이콘 + 모양 3중 — SPEC 2.5 색약 대응)
    if (isCorrectMark) {
      ctx.font = font(64);
      ctx.fillText('⭕', c.x + c.w - 44, c.y + 44);
    } else if (isWrongMark) {
      ctx.font = font(64);
      ctx.fillText('❌', c.x + c.w - 44, c.y + 44);
    }
    ctx.restore();
  },

  onTouch(x, y, phase) {
    if (this.phase !== 'play') return; // 연출 중 입력 차단

    if (phase === 'start') {
      for (const c of this.choices) {
        if (hit(c, x, y)) {
          this.pressedBtn = c; // 누른 느낌 표시
          return;
        }
      }
    } else if (phase === 'move') {
      // 손가락이 누른 버튼 밖으로 나가면 누름 취소
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
      // 정답: 100점 + (현재콤보 × 10) (SPEC 3.4 / §4 1️⃣)
      const pts = 100 + e.scoreManager.combo * 10;
      e.answerCorrect(this.problem, btn.value, pts);
      const bx = btn.x + btn.w / 2;
      const by = btn.y + btn.h / 2;
      e.particles.emit(bx, by, 'sparkle', THEME.correct, 16);
      this.mark = { btn, correct: true };
      this.phase = 'correctAnim';
      this.animTimer = CORRECT_ANIM;
    } else {
      // 오답: 버튼 주황+❌ 연출(흔들림) 후 core 정답표시 오버레이로 넘김
      this.mark = { btn, correct: false };
      this.pendingWrong = { problem: this.problem, value: btn.value };
      this.phase = 'wrongAnim';
      this.animTimer = WRONG_ANIM;
      e.ui.shake(16, 0.4); // 흔들림 (즉각 피드백)
    }
  },

  onKey(e) {
    // 데스크톱 확인용: 1~4 키로 선택지 선택
    if (this.phase !== 'play') return;
    const idx = { 1: 0, 2: 1, 3: 2, 4: 3 }[e.key];
    if (idx != null && this.choices[idx]) this._commit(this.choices[idx]);
  },

  destroy() {
    this.engine = null;
    this.problem = null;
    this.choices = [];
    this.pressedBtn = null;
    this.mark = null;
    this.pendingWrong = null;
  },
};

// 배열 셔플 (게임 내부 배치용 — 문제/오답 생성은 core가 담당)
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
