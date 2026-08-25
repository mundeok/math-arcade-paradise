// _dummy.js — Phase 0 인터페이스 검증용 최소 게임 (실제 게임 아님)
// 목적: 메뉴→튜토리얼→플레이→콤보연출→오답피드백→복습큐 재출제→라이프 회복→
//       라이프 0→결과→메뉴 의 전체 흐름이 끊김 없이 도는지 확인한다.
// 확정된 게임 인터페이스(SPEC §7)를 그대로 구현한다.

import { LOGICAL_W, LOGICAL_H, SAFE, THEME, font, roundRect, hit } from '../core/ui.js';

export const dummyGame = {
  id: 'g00_dummy',
  name: '연습 게임',
  emoji: '🎮',
  category: '선택형',
  maxLevel: 4, // 출제 레벨 상한 (검증용)
  blankRatio: 0.25, // 빈칸형(□) 출제 비율 (판단형 기준값)

  tutorial: {
    text: '문제의 답을 두 개 중에서 골라 눌러봐!',
    draw(ctx) {
      // 그림 한 장: 문제 카드 + 손가락이 정답을 누르는 모습
      const cx = LOGICAL_W / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      roundRect(ctx, cx - 220, 40, 440, 130, 20);
      ctx.fillStyle = THEME.panel;
      ctx.fill();
      ctx.fillStyle = THEME.text;
      ctx.font = font(72);
      ctx.fillText('3 × 4 = ?', cx, 105);

      // 두 선택지
      const opts = [
        { x: cx - 230, label: '12', ok: true },
        { x: cx + 30, label: '7', ok: false },
      ];
      for (const o of opts) {
        roundRect(ctx, o.x, 220, 200, 120, 18);
        ctx.fillStyle = o.ok ? THEME.correct : THEME.panel;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = font(60);
        ctx.fillText(o.label, o.x + 100, 280);
      }
      // 손가락 이모지
      ctx.font = font(80);
      ctx.fillText('👆', cx - 130, 380);
    },
  },

  init(engine) {
    this.engine = engine;
    this.problem = null;
    this.choices = []; // [{x,y,w,h,value}]
    this.selected = null; // 정답 순간 강조용
    this.markTimer = 0;
    this._loadProblem();
  },

  _loadProblem() {
    const e = this.engine;
    this.problem = e.problemGenerator.nextProblem({ maxLevel: this.maxLevel, blankRatio: this.blankRatio });

    // 콤보가 높을수록 가까운(헷갈리는) 오답 — 축 B(게임 난이도)
    const closeness = Math.min(1, e.scoreManager.combo / 15);
    const distractor = e.problemGenerator.makeDistractors(this.problem, 1, closeness)[0];

    // 선택지 2개 (정답 + 오답) 무작위 배치
    const vals = Math.random() < 0.5 ? [this.problem.answer, distractor] : [distractor, this.problem.answer];

    const w = (LOGICAL_W - SAFE * 3) / 2;
    const h = 240;
    const y = LOGICAL_H - SAFE - h - 120;
    this.choices = [
      { x: SAFE, y, w, h, value: vals[0] },
      { x: SAFE * 2 + w, y, w, h, value: vals[1] },
    ];
    this.selected = null;
  },

  update(dt) {
    if (this.markTimer > 0) this.markTimer -= dt;
  },

  render(ctx) {
    const e = this.engine;
    const cx = LOGICAL_W / 2;

    // 문제 텍스트 (최소 80px 규정 — 여유있게 크게)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.text;
    ctx.font = font(120);
    const qText = this.problem.blank ? this.problem.text : `${this.problem.text} = ?`;
    ctx.fillText(qText, cx, 340);

    // 복습 문제 표시 (다시 나온 문제임을 알려줌)
    if (this.problem.fromReview) {
      ctx.font = font(34);
      ctx.fillStyle = THEME.gold;
      ctx.fillText('🔁 다시 도전!', cx, 470);
    }

    // 선택지 버튼
    for (const c of this.choices) {
      const isSel = this.selected === c && this.markTimer > 0;
      roundRect(ctx, c.x, c.y, c.w, c.h, 26);
      ctx.fillStyle = isSel ? THEME.correct : THEME.accent;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = font(96);
      ctx.fillText(String(c.value), c.x + c.w / 2, c.y + c.h / 2);
    }

    // 안내
    ctx.fillStyle = THEME.subtext;
    ctx.font = font(30, 'normal');
    ctx.fillText('정답을 눌러줘!', cx, this.choices[0].y - 60);
  },

  onTouch(x, y, phase) {
    if (phase !== 'end') return;
    const e = this.engine;
    for (const c of this.choices) {
      if (hit(c, x, y)) {
        if (c.value === this.problem.answer) {
          // 정답: 100점 + 콤보×10 (SPEC 1️⃣ 공식 참고)
          const pts = 100 + e.scoreManager.combo * 10;
          this.selected = c;
          this.markTimer = 0.25;
          e.answerCorrect(this.problem, c.value, pts);
          e.particles.emit(c.x + c.w / 2, c.y + c.h / 2, 'sparkle', THEME.correct, 14);
          this._loadProblem();
        } else {
          // 오답: 라이프 -1 + 정답 1.2초 표시 후 다음 문제
          e.answerWrong(this.problem, c.value, {
            loseLife: true,
            onResume: () => this._loadProblem(),
          });
        }
        return;
      }
    }
  },

  onKey(e) {
    // 키보드 1/2로도 선택 가능 (데스크톱 확인용)
    if (e.key === '1' && this.choices[0]) this.onTouch(this.choices[0].x + 5, this.choices[0].y + 5, 'end');
    if (e.key === '2' && this.choices[1]) this.onTouch(this.choices[1].x + 5, this.choices[1].y + 5, 'end');
  },

  destroy() {
    this.engine = null;
    this.problem = null;
    this.choices = [];
  },
};
