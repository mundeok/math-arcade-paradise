// g02_catch.js — 🎪 떨어지는 캐치 (SPEC §4 2️⃣ / Phase 1)
// 반사신경형. 상단 문제 고정. 위에서 숫자 원이 떨어지고 '정답만' 터치한다.
// 확정 인터페이스(SPEC §7)만 사용한다. core/scenes는 건드리지 않는다.
//
// 축 분리(SPEC 2.1) 준수:
//   - 수학 난이도(level)는 problemGenerator만 관리. 이 파일은 level을 읽지 않는다.
//   - 게임 난이도(축 B)는 오직 scoreManager.combo로 계산한다: 낙하 속도 + 동시 등장 개수.
// 점수·콤보·라이프·복습큐·연출은 engine.answerCorrect / answerWrong 이 전담한다.
//
// 라이프 규칙(반사신경형이라 관대):
//   - 오답 터치        → answerWrong(loseLife:true)  : 라이프 -1 + 콤보 리셋 + 정답표시
//   - 정답 놓쳐 바닥 도달 → answerWrong(loseLife:false) : 콤보만 리셋(라이프 유지) + 정답표시

import { LOGICAL_W, LOGICAL_H, SAFE, THEME, font } from '../core/ui.js';

const R = 70; // 숫자 원 반지름 (지름 140 논리px)
const HIT_PAD = 20; // 터치 판정 반경 여유 (시각 원보다 20px 넉넉하게)
const FLOOR_Y = LOGICAL_H - 90; // 이 선을 정답이 넘으면 '놓침'
const FALL_SPAN = LOGICAL_H; // '초/화면' 기준 낙하 거리
const STAGGER = 210; // 낙하 숫자 간 수직 간격 (동시 등장 시 계단식 진입)

const PROBLEM_Y = 220; // 상단 고정 문제 위치 (HUD 아래)

export const g02Catch = {
  id: 'g02_catch',
  name: '떨어지는 캐치',
  emoji: '🎪',
  category: '반사신경',
  maxLevel: 3, // 출제 상한 Lv3 (SPEC 2.1 반사신경형)
  blankRatio: 0, // 반사신경형은 빈칸 미출제
  // 게임 고유 콤보 문구(그 외 5/10/20/30은 core 기본). core가 일원 관리(SPEC §7.1).
  comboMilestones: { 7: 'NICE!', 15: 'AWESOME!' },

  tutorial: {
    text: '떨어지는 숫자 중에서 답을 찾아 콕 눌러!',
    draw(ctx) {
      // ctx는 논리 좌표, translate(0,260)된 카드 영역(x 24~776, y 0~440) 안에서 그린다.
      const cx = LOGICAL_W / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 상단 문제
      ctx.fillStyle = THEME.text;
      ctx.font = font(60);
      ctx.fillText('6 × 4 = ?', cx, 60);

      // 떨어지는 숫자 원 3개 (정답 24 하나 + 오답 2개). 색은 모두 같게(정답 노출 금지).
      const circles = [
        { x: cx - 200, y: 175, label: '18' },
        { x: cx, y: 250, label: '24', finger: true },
        { x: cx + 200, y: 150, label: '30' },
      ];
      for (const c of circles) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 58, 0, Math.PI * 2);
        ctx.fillStyle = THEME.accent;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = font(48);
        ctx.fillText(c.label, c.x, c.y);
      }
      // 정답을 누르는 손가락
      ctx.font = font(76);
      ctx.fillText('👆', cx + 46, 300);
    },
  },

  init(engine) {
    this.engine = engine;
    this.problem = null;
    this.fallers = []; // [{value, correct, x, y}]
    this.popEffects = []; // 정답 캐치 시 위로 튀어오르며 사라지는 숫자 [{x,y,value,t,dur}]
    this.missEffect = null; // 놓침 시 바닥에서 "앗!" 0.4초 연출 {x,y,t,dur}
    this._startWave();
  },

  // 현재 콤보 기준 낙하 속도(px/s): 1.5초/화면 → 콤보 5마다 ÷1.2 → 하한 0.6초/화면(클램프)
  // 교사 설정 제한시간 배율을 곱해 낙하 시간을 조절(느리게/빠르게)한다.
  _fallSpeed() {
    const combo = this.engine.scoreManager.combo;
    let sec = 1.5 / Math.pow(1.2, Math.floor(combo / 5));
    if (sec < 0.6) sec = 0.6; // 상한(가장 빠른) 0.6초/화면 클램프
    sec *= this.engine.settings.timeScale || 1;
    return FALL_SPAN / sec;
  },

  // 콤보별 동시 등장 오답 개수: 0~14→2 / 15~29→3 / 30+→4
  _wrongCount() {
    const combo = this.engine.scoreManager.combo;
    if (combo >= 30) return 4;
    if (combo >= 15) return 3;
    return 2;
  },

  _startWave() {
    const e = this.engine;
    this.problem = e.problemGenerator.nextProblem({ maxLevel: this.maxLevel, blankRatio: this.blankRatio });

    const wrongCount = this._wrongCount();
    // 반사신경형이라 오답 근접도는 낮게 유지(빠르게 구분 가능해야 함) — 콤보 따라 소폭 상승
    const closeness = Math.min(0.5, 0.15 + 0.015 * e.scoreManager.combo);
    const distractors = e.problemGenerator.makeDistractors(this.problem, wrongCount, closeness);

    const items = shuffle([
      { value: this.problem.answer, correct: true },
      ...distractors.map((v) => ({ value: v, correct: false })),
    ]);

    // x축 구간을 나눠 가로로 겹치지 않게 배정 (SPEC 2️⃣)
    const total = items.length;
    const minX = SAFE + R;
    const maxX = LOGICAL_W - SAFE - R;
    const laneW = (maxX - minX) / total;

    // 수직 진입은 계단식으로 (동시에 한 줄로 몰리지 않게)
    const order = shuffle(items.map((_, i) => i)); // 어느 낙하물이 먼저 들어올지 무작위

    const speed = this._fallSpeed();
    this.fallers = items.map((it, i) => {
      const jitter = (Math.random() - 0.5) * (laneW - 2 * R > 0 ? laneW - 2 * R : 0);
      const x = minX + laneW * (i + 0.5) + jitter;
      const rank = order.indexOf(i); // 0..total-1
      const y = -R - rank * STAGGER - Math.random() * 60;
      return { value: it.value, correct: it.correct, x, y, vy: speed };
    });
  },

  update(dt) {
    const e = this.engine;

    // 낙하 이동
    for (const f of this.fallers) f.y += f.vy * dt;

    // 정답이 바닥을 넘으면 '놓침'
    //  - 게임을 멈추지 않고(freeze:false) 즉시 다음 웨이브로 진행
    //  - 콤보만 리셋, 라이프 유지 / 무음 / 레벨·복습큐 영향 없음(affectLevel:false)
    //  - 세션에는 놓침(missed:true) 오답으로 기록 → 결과 '틀린 문제 다시보기'에 남김
    //  - 시각 연출: 바닥에서 원이 터지는 파티클 + "앗!" 0.4초
    const correct = this.fallers.find((f) => f.correct);
    if (correct && correct.y >= FLOOR_Y) {
      e.answerWrong(this.problem, null, { loseLife: false, freeze: false, affectLevel: false, missed: true });
      e.particles.emit(correct.x, FLOOR_Y, 'pop', THEME.wrong, 16);
      this.missEffect = { x: correct.x, y: FLOOR_Y, t: 0, dur: 0.4 };
      this._startWave();
      return;
    }

    // 오답은 화면 밖으로 나가면 조용히 제거 (라이프/콤보 영향 없음)
    this.fallers = this.fallers.filter((f) => f.correct || f.y - R <= LOGICAL_H);

    // 캐치 연출(위로 튀어오르며 사라지는 숫자) 갱신
    for (let i = this.popEffects.length - 1; i >= 0; i--) {
      const p = this.popEffects[i];
      p.t += dt;
      if (p.t >= p.dur) this.popEffects.splice(i, 1);
    }

    // 놓침 "앗!" 연출 갱신
    if (this.missEffect) {
      this.missEffect.t += dt;
      if (this.missEffect.t >= this.missEffect.dur) this.missEffect = null;
    }
  },

  render(ctx) {
    const cx = LOGICAL_W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 상단 고정 문제 (최소 80px 규정 — 크게)
    ctx.fillStyle = THEME.text;
    ctx.font = font(100);
    ctx.fillText(`${this.problem.text} = ?`, cx, PROBLEM_Y);
    if (this.problem.fromReview) {
      ctx.font = font(34);
      ctx.fillStyle = THEME.gold;
      ctx.fillText('🔁 다시 도전!', cx, PROBLEM_Y + 80);
    }

    // 떨어지는 숫자 원 (정답/오답 색 동일 — 정답이 드러나면 안 됨)
    for (const f of this.fallers) {
      if (f.y < -R) continue; // 아직 화면 위
      ctx.beginPath();
      ctx.arc(f.x, f.y, R, 0, Math.PI * 2);
      ctx.fillStyle = THEME.accent;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = font(64);
      ctx.fillText(String(f.value), f.x, f.y);
    }

    // 캐치 연출: 정답 숫자가 초록 ⭕와 함께 위로 튀어오르며 사라짐
    for (const p of this.popEffects) {
      const prog = p.t / p.dur;
      const alpha = 1 - prog;
      const y = p.y - prog * 160; // 위로 상승
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = THEME.correct;
      ctx.font = font(72);
      ctx.fillText(String(p.value), p.x, y);
      ctx.font = font(48);
      ctx.fillText('⭕', p.x + 60, y - 44);
      ctx.restore();
    }

    // 놓침 연출: 바닥에서 "앗!"이 살짝 떠오르며 사라짐 (색+텍스트, 흐름은 멈추지 않음)
    if (this.missEffect) {
      const m = this.missEffect;
      const prog = m.t / m.dur;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog);
      ctx.fillStyle = THEME.wrong;
      ctx.font = font(72);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('앗!', m.x, m.y - prog * 60);
      ctx.restore();
    }
  },

  onTouch(x, y, phase) {
    if (phase !== 'start') return; // 반사신경형은 누르는 즉시 반응
    if (!this.fallers.length) return;

    // 판정 반경(R+20) 안에서 가장 가까운 낙하물 선택
    let target = null;
    let best = Infinity;
    for (const f of this.fallers) {
      const d = Math.hypot(x - f.x, y - f.y);
      if (d <= R + HIT_PAD && d < best) {
        best = d;
        target = f;
      }
    }
    if (!target) return;

    const e = this.engine;
    if (target.correct) {
      // 정답: 50점 + (현재콤보 × 5)
      const pts = 50 + e.scoreManager.combo * 5;
      e.answerCorrect(this.problem, target.value, pts);
      // 파티클 폭발 + 위로 튀어오르는 숫자 연출
      e.particles.emit(target.x, target.y, 'explode', THEME.correct, 22);
      e.particles.emit(target.x, target.y, 'pop', THEME.gold, 10);
      e.sound.play('pop');
      this.popEffects.push({ x: target.x, y: target.y, value: target.value, t: 0, dur: 0.6 });
      // 콤보 문구(NICE!/AWESOME! 포함)는 comboMilestones로 core가 표시한다.
      this._startWave();
    } else {
      // 오답 터치: 라이프 -1 + 콤보 리셋 + 정답 표시
      e.answerWrong(this.problem, target.value, { loseLife: true, onResume: () => this._startWave() });
    }
  },

  // 마우스 hover: 떨어지는 원(터치 판정 반경) 위인지 반환 → 커서 pointer.
  // 원 자체의 시각 변화는 낙하 중이라 불필요(요구사항). 상태 저장도 없음.
  onHover(x, y) {
    for (const f of this.fallers) {
      if (Math.hypot(x - f.x, y - f.y) <= R + HIT_PAD) return true;
    }
    return false;
  },
  clearHover() {}, // hover 시각 상태가 없어 초기화할 값 없음(인터페이스 충족용)

  onKey() {},

  destroy() {
    this.engine = null;
    this.problem = null;
    this.fallers = [];
    this.popEffects = [];
    this.missEffect = null;
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
