// g06_stack.js — 🏗️ 스택 빌더 (SPEC §4 6️⃣ / Phase 2)
// 축적형·판단형. 떨어지는 블록 중 '정답 블록'만 탭해 탑을 쌓는다.
// 확정 인터페이스(SPEC §7)만 사용한다. core/scenes는 건드리지 않는다.
//
// ⚠️ 좌표·크기·폰트는 전부 core/layout.js 의 L 헬퍼로 계산한다(픽셀 리터럴 금지).
//    낙하 블록의 소멸/놓침 기준선은 L.zone.floor.
//
// 두 가지 긴장 요소(SPEC §4 6️⃣):
//   1) 정답 블록이 바닥(zone.floor)에 닿으면 '놓침' → 라이프 -1  (이게 없으면 기다리기만 하면 됨)
//      ⚠️ g02 놓침과 달리 라이프를 깎는다(축적형이라 긴장 필요). 다만 반응 문제이므로
//         화면은 멈추지 않고(freeze:false) 레벨·복습큐엔 영향 주지 않는다(affectLevel:false).
//   2) 오답 블록 탭 → 탑이 기울어짐(5°→12°). 오답 3개 누적 → 붕괴 = 웨이브 실패.
//      오답 탭은 이해 오류이므로 정답표시(1.2초 정지) + 복습큐 등록(affectLevel:true).
//      단 라이프는 깎지 않는다(라이프는 '놓침'으로만 잃는다 — 기울기/붕괴가 오답의 벌).
//
// 축 분리(SPEC 2.1): level은 problemGenerator만 관리. 게임 난이도(축 B: 낙하 속도·오답 수·근접도)는
//   scoreManager.combo로만 계산한다. 점수·콤보·라이프·복습큐·연출은 answerCorrect/answerWrong 이 전담.

import { L } from '../core/layout.js';
import { THEME, font, roundRect } from '../core/ui.js';

// 시간(초) 상수 — 좌표가 아니므로 L 대상이 아니다.
const BASE_FALL_SEC = 2.6; // 콤보 0에서 블록이 한 화면 떨어지는 시간
const FALL_MIN_SEC = 1.2; // 가장 빠른 낙하(하한 클램프)

// 웨이브 목표 높이(칸). 5개 이후는 '무한' — 직전 목표에서 +5씩 계속 상승.
const TARGETS = [5, 8, 12, 15, 20];
// 오답 누적별 기울기(도). index = 누적 오답 수(0~2). 3이면 붕괴.
const TILT_DEG = [0, 5, 12];
const COLLAPSE_DEG = 20; // 붕괴 직전 표시 각도

export const g06Stack = {
  id: 'g06_stack',
  name: '스택 빌더',
  emoji: '🏗️',
  category: '축적형',
  maxLevel: 4, // 출제 상한 Lv4 (SPEC 2.1 판단형)
  blankRatio: 0.25, // 판단형 빈칸 비율
  // 게임 고유 콤보 문구(그 외 5/20/30은 core 기본). core가 일원 관리(SPEC §7.1).
  comboMilestones: { 10: 'STEADY!' },

  // ── 블록 크기/간격 (전부 L 기반 getter) ──
  get blockW() {
    return L.w(0.2);
  },
  get blockH() {
    return L.minTouch;
  }, // 낙하 블록 높이 = 최소 터치 타겟(96) 보장
  get stagger() {
    return L.gu(5);
  }, // 낙하 블록 세로 진입 간격

  tutorial: {
    text: '답이 맞는 블록만 눌러서 탑을 쌓아! 놓치면 안 돼!',
    draw(ctx) {
      // ctx는 논리 좌표, translate(0,260)된 카드 영역(x 24~776, y 0~440) 안에서 그린다.
      const cx = L.W / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 문제
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.045));
      ctx.fillText('6 × 4 = ?', cx, L.gu(1.4));

      // 쌓인 탑(왼쪽) — 정답 블록들
      const bw = L.gu(3);
      const bh = L.gu(1.1);
      const towerX = cx - L.gu(5);
      const baseY = L.gu(10);
      for (let i = 0; i < 3; i++) {
        const y = baseY - (i + 1) * bh;
        roundRect(ctx, towerX - bw / 2, y, bw, bh - L.gu(0.12), L.gu(0.2));
        ctx.fillStyle = THEME.correct;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = font(L.font(0.03));
        ctx.fillText('24', towerX, y + bh / 2 - L.gu(0.06));
      }

      // 떨어지는 블록 2개: 정답 24(손가락) + 오답 20
      const fall = [
        { x: cx + L.gu(2), y: L.gu(4), label: '24', ok: true },
        { x: cx + L.gu(5.5), y: L.gu(6.5), label: '20', ok: false },
      ];
      for (const f of fall) {
        roundRect(ctx, f.x - bw / 2, f.y - bh / 2, bw, bh, L.gu(0.2));
        ctx.fillStyle = THEME.accent;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = font(L.font(0.03));
        ctx.fillText(f.label, f.x, f.y);
      }
      // 정답 블록을 누르는 손가락 + ⭕
      ctx.font = font(L.font(0.05));
      ctx.fillText('👆', cx + L.gu(2.9), L.gu(4.6));
      ctx.font = font(L.font(0.032));
      ctx.fillText('⭕', cx + L.gu(2), L.gu(2.6));
    },
  },

  init(engine) {
    this.engine = engine;
    this.problem = null;
    this.blocks = []; // 낙하 블록 [{value, correct, x, y, vy}]
    this.stacked = []; // 쌓인 블록 값들(현재 웨이브)
    this.waveIndex = 0;
    this.wrongInWave = 0; // 오답 누적(0~2), 3이면 붕괴
    this.waveHadWrong = false; // 무오답 웨이브 보너스 판정용
    this.collapsing = false; // 붕괴 표시(정답표시 1.2초 동안 20° 기울여 그림)
    this.popEffects = []; // 정답 블록이 탑으로 날아가는 연출 [{x,y,tx,ty,value,t,dur}]
    this.missEffect = null; // 놓침 시 "앗! -1" 연출 {x,y,t,dur}
    this.time = 0;
    this._startRound();
  },

  _targetFor(i) {
    if (i < TARGETS.length) return TARGETS[i];
    return TARGETS[TARGETS.length - 1] + 5 * (i - TARGETS.length + 1);
  },
  get target() {
    return this._targetFor(this.waveIndex);
  },

  // 낙하 속도(px/s): 콤보 6마다 ÷1.1(빨라짐), 하한 FALL_MIN_SEC 클램프. 교사 배율 반영.
  _fallSpeed() {
    const combo = this.engine.scoreManager.combo;
    let sec = BASE_FALL_SEC / Math.pow(1.1, Math.floor(combo / 6));
    if (sec < FALL_MIN_SEC) sec = FALL_MIN_SEC; // 하한(가장 빠름) 클램프
    sec *= this.engine.settings.timeScale || 1;
    const span = L.zone.floor + this.blockH; // 화면 위(-blockH)에서 바닥까지
    return span / sec;
  },

  // 콤보별 동시 오답 블록 수(축 B): 0~9→2 / 10~19→3 / 20+→4
  _wrongCount() {
    const combo = this.engine.scoreManager.combo;
    if (combo >= 20) return 4;
    if (combo >= 10) return 3;
    return 2;
  },

  _startRound() {
    const e = this.engine;
    this.problem = e.problemGenerator.nextProblem({ maxLevel: this.maxLevel, blankRatio: this.blankRatio });

    // 오답 근접도(축 B): 콤보 오를수록 헷갈리는 수(48/42/54/49류) 등장
    const closeness = Math.min(0.8, 0.2 + 0.025 * e.scoreManager.combo);
    const distractors = e.problemGenerator.makeDistractors(this.problem, this._wrongCount(), closeness);

    const items = shuffle([
      { value: this.problem.answer, correct: true },
      ...distractors.map((v) => ({ value: v, correct: false })),
    ]);

    const total = items.length;
    const bw = this.blockW;
    const minX = L.safe + bw / 2;
    const maxX = L.W - L.safe - bw / 2;
    const laneW = (maxX - minX) / total;
    const order = shuffle(items.map((_, i) => i)); // 진입 순서 무작위
    const speed = this._fallSpeed();

    this.blocks = items.map((it, i) => {
      const jitter = (Math.random() - 0.5) * Math.max(0, laneW - bw);
      const x = minX + laneW * (i + 0.5) + jitter;
      const rank = order.indexOf(i);
      const y = -this.blockH - rank * this.stagger - Math.random() * L.gu(1);
      return { value: it.value, correct: it.correct, x, y, vy: speed };
    });
  },

  _nextWave() {
    this.waveIndex += 1;
    this.stacked = [];
    this.wrongInWave = 0;
    this.waveHadWrong = false;
    this.collapsing = false;
    this._startRound();
  },

  // 오답 3개 누적 → 붕괴 후 웨이브 재시작(같은 목표). 라이프는 깎지 않는다(콤보는 이미 0).
  _collapseWave() {
    const baseX = L.W / 2;
    const floorY = L.zone.floor;
    // 쌓였던 블록들이 무너지는 파티클(색+흩어짐)
    for (let i = 0; i < Math.min(this.stacked.length, 8); i++) {
      this.engine.particles.emit(baseX + (Math.random() - 0.5) * this.blockW, floorY - i * L.gu(1), 'explode', THEME.wrong, 8);
    }
    this.stacked = [];
    this.wrongInWave = 0;
    this.waveHadWrong = false; // 재시작이므로 무오답 보너스 다시 가능
    this.collapsing = false;
    this._startRound();
  },

  update(dt) {
    this.time += dt;
    const floorY = L.zone.floor;

    for (const b of this.blocks) b.y += b.vy * dt;

    // 정답 블록이 바닥에 닿으면 '놓침' → 라이프 -1 (흐름은 멈추지 않음)
    const c = this.blocks.find((b) => b.correct);
    if (c && c.y + this.blockH / 2 >= floorY) {
      this.engine.answerWrong(this.problem, null, { loseLife: true, freeze: false, affectLevel: false, missed: true });
      this.engine.particles.emit(c.x, floorY, 'pop', THEME.wrong, 16);
      this.missEffect = { x: c.x, y: floorY - L.gu(1), t: 0, dur: 0.6 };
      this._startRound();
      return;
    }

    // 오답 블록이 바닥을 지나 화면 밖으로 나가면 무해하게 제거(놓침 아님)
    this.blocks = this.blocks.filter((b) => b.correct || b.y - this.blockH / 2 <= L.H);

    // 연출 갱신
    for (let i = this.popEffects.length - 1; i >= 0; i--) {
      const p = this.popEffects[i];
      p.t += dt;
      if (p.t >= p.dur) this.popEffects.splice(i, 1);
    }
    if (this.missEffect) {
      this.missEffect.t += dt;
      if (this.missEffect.t >= this.missEffect.dur) this.missEffect = null;
    }
  },

  render(ctx) {
    const cx = L.W / 2;
    const floorY = L.zone.floor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 상단 고정 문제(최소 80px — 화면 높이 7%)
    ctx.fillStyle = THEME.text;
    ctx.font = font(L.font(0.07));
    const qText = this.problem.blank ? this.problem.text : `${this.problem.text} = ?`;
    ctx.fillText(qText, cx, L.zone.problem);

    // 웨이브 정보
    ctx.fillStyle = THEME.subtext;
    ctx.font = font(L.font(0.028), 'normal');
    ctx.fillText(`웨이브 ${this.waveIndex + 1} · 목표 ${this.target}칸 · 현재 ${this.stacked.length}칸`, cx, L.zone.problem + L.gu(1.7));
    if (this.problem.fromReview) {
      ctx.fillStyle = THEME.gold;
      ctx.font = font(L.font(0.028));
      ctx.fillText('🔁 다시 도전!', cx, L.zone.problem + L.gu(3));
    }

    // 기울기 경고(색+아이콘+텍스트 3중 — SPEC 2.5)
    if (this.wrongInWave > 0 || this.collapsing) {
      ctx.fillStyle = THEME.wrong;
      ctx.font = font(L.font(0.03));
      const n = this.collapsing ? 3 : this.wrongInWave;
      ctx.fillText(`⚠️ 기우뚱! (오답 ${n}/3)`, cx, L.zone.problem + L.gu(4.2));
    }

    // 바닥선(놓침 경계)
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = Math.max(2, L.gu(0.08));
    ctx.setLineDash([L.gu(0.5), L.gu(0.4)]);
    ctx.beginPath();
    ctx.moveTo(L.safe, floorY);
    ctx.lineTo(L.W - L.safe, floorY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = THEME.subtext;
    ctx.font = font(L.font(0.024), 'normal');
    ctx.fillText('여기 닿으면 놓쳐요', cx, floorY + L.gu(0.7));

    // ── 쌓인 탑(기울기 적용) ──
    this._renderTower(ctx, cx, floorY);

    // ── 낙하 블록(정답/오답 색 동일 — 정답 노출 금지) ──
    for (const b of this.blocks) {
      if (b.y + this.blockH / 2 < 0) continue; // 아직 화면 위
      this._drawBlock(ctx, b.x, b.y, this.blockW, this.blockH, THEME.accent, String(b.value));
    }

    // 정답 블록이 탑으로 날아가는 연출
    for (const p of this.popEffects) {
      const prog = p.t / p.dur;
      const x = p.x + (p.tx - p.x) * prog;
      const y = p.y + (p.ty - p.y) * prog;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog * 0.5);
      this._drawBlock(ctx, x, y, this.blockW * (1 - 0.35 * prog), this.blockH * (1 - 0.35 * prog), THEME.correct, String(p.value));
      ctx.font = font(L.font(0.03));
      ctx.fillStyle = THEME.correct;
      ctx.fillText('⭕', x + this.blockW * 0.4, y - this.blockH * 0.4);
      ctx.restore();
    }

    // 놓침 연출: "앗! -1"
    if (this.missEffect) {
      const m = this.missEffect;
      const prog = m.t / m.dur;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog);
      ctx.fillStyle = THEME.wrong;
      ctx.font = font(L.font(0.045));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('앗! -1', m.x, m.y - prog * L.gu(1.2));
      ctx.restore();
    }
  },

  // 쌓인 탑을 바닥 중심에서 기울여 그린다. 목표 높이에 맞춰 블록 높이를 줄여 항상 화면에 들어오게 한다.
  _renderTower(ctx, cx, floorY) {
    const count = this.stacked.length;
    if (count === 0) return;
    const availH = floorY - L.zone.playTop - L.gu(1);
    const target = Math.max(this.target, 1);
    const bh = Math.min(L.gu(1.2), availH / target);
    const bw = L.w(0.24);
    const gap = Math.min(L.gu(0.12), bh * 0.12);

    const tiltDeg = this.collapsing ? COLLAPSE_DEG : TILT_DEG[Math.min(this.wrongInWave, TILT_DEG.length - 1)];
    const tilt = (tiltDeg * Math.PI) / 180;

    ctx.save();
    ctx.translate(cx, floorY);
    ctx.rotate(-tilt); // 한쪽으로 기울어짐
    for (let i = 0; i < count; i++) {
      const y = -(i + 1) * bh;
      this._drawBlock(ctx, 0, y + bh / 2, bw, bh - gap, THEME.correct, String(this.stacked[i]), L.font(0.026));
    }
    ctx.restore();
  },

  // 블록 하나(둥근 사각형 + 값). center=(x,y).
  _drawBlock(ctx, x, y, w, h, color, label, fontPx) {
    ctx.save();
    roundRect(ctx, x - w / 2, y - h / 2, w, h, Math.min(L.gu(0.4), h * 0.22));
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = Math.max(2, w * 0.02);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = font(fontPx || L.font(0.04));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
    ctx.restore();
  },

  onTouch(x, y, phase) {
    if (phase !== 'start') return;
    if (!this.blocks.length) return;

    // 사각 판정: 블록 위인지(가장 가까운 것 우선)
    let target = null;
    let best = Infinity;
    for (const b of this.blocks) {
      const w = this.blockW;
      const h = this.blockH;
      if (x >= b.x - w / 2 && x <= b.x + w / 2 && y >= b.y - h / 2 && y <= b.y + h / 2) {
        const d = Math.hypot(x - b.x, y - b.y);
        if (d < best) {
          best = d;
          target = b;
        }
      }
    }
    if (!target) return;

    const e = this.engine;
    if (target.correct) {
      // 탑에 한 칸 쌓기
      this.stacked.push(target.value);
      const target_ = this.target;
      const waveDone = this.stacked.length >= target_;

      // 점수: 블록 1개 10점. 웨이브 완료 시 목표높이×50, 무오답이면 +200 (SPEC §4 6️⃣ — 콤보 계수 없음)
      let pts = 10;
      if (waveDone) pts += target_ * 50 + (this.waveHadWrong ? 0 : 200);
      e.answerCorrect(this.problem, target.value, pts);

      // 탑으로 날아가는 연출 + 파티클/사운드
      const towerTopY = L.zone.floor - this.stacked.length * L.gu(1);
      this.popEffects.push({ x: target.x, y: target.y, tx: L.W / 2, ty: towerTopY, value: target.value, t: 0, dur: 0.35 });
      e.particles.emit(target.x, target.y, 'sparkle', THEME.correct, 12);
      e.sound.play('pop');
      // 콤보 문구(STEADY! 포함)는 comboMilestones로 core가 표시한다.

      if (waveDone) {
        e.ui.showComboText(`웨이브 클리어! +${target_ * 50}`, true);
        e.particles.emit(L.W / 2, L.y(0.5), 'sparkle', THEME.gold, 24);
        this._nextWave();
      } else {
        this._startRound();
      }
    } else {
      // 오답 블록 탭: 기울기 누적 + 정답표시(1.2초). 라이프는 깎지 않는다(놓침으로만 잃음).
      this.wrongInWave += 1;
      this.waveHadWrong = true;
      e.ui.shake(14, 0.3);
      if (this.wrongInWave >= 3) {
        // 붕괴 = 웨이브 실패. 정답표시 후 웨이브 재시작.
        this.collapsing = true;
        e.answerWrong(this.problem, target.value, { loseLife: false, onResume: () => this._collapseWave() });
      } else {
        e.answerWrong(this.problem, target.value, { loseLife: false, onResume: () => this._startRound() });
      }
    }
  },

  // 마우스 hover: 블록 위면 true → 커서 pointer (PC 확인용)
  onHover(x, y) {
    const w = this.blockW;
    const h = this.blockH;
    for (const b of this.blocks) {
      if (x >= b.x - w / 2 && x <= b.x + w / 2 && y >= b.y - h / 2 && y <= b.y + h / 2) return true;
    }
    return false;
  },
  clearHover() {},

  onKey() {},

  destroy() {
    this.engine = null;
    this.problem = null;
    this.blocks = [];
    this.stacked = [];
    this.popEffects = [];
    this.missEffect = null;
  },
};

// 배열 셔플(게임 내부 배치용 — 문제/오답 생성은 core가 담당)
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
