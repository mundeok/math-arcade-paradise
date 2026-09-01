// g06_stack.js — 🏗️ 스택 빌더 (SPEC §4 6️⃣ / Phase 2)
// 축적형·판단형. 떨어지는 블록 중 '정답 블록'만 탭해 탑을 쌓는다.
// 확정 인터페이스(SPEC §7)만 사용한다. core/scenes는 건드리지 않는다.
//
// ⚠️ 재미 표준(§2.6) core 모듈 사용:
//   - fever:true → engine.fever. 피버 중 낙하 빨라지되 '정답 블록 판정만' 넉넉히(성공 유지, 정답 노출 금지).
//   - 위기 테두리·정답음·점수2배·게이지·카운트업은 core 자동. 니어미스 보상은 reportNearMiss.
//   - 고유 재미(축적감): 블록 안착 시 "쿵" 무게감, 탑이 높을수록 카메라 살짝 위로, 웨이브 완료 시 탑 빛남.
//
// 좌표·크기·폰트는 전부 core/layout.js 의 L 헬퍼로 계산한다(픽셀 리터럴 금지).
//
// 두 가지 긴장 요소(SPEC §4 6️⃣):
//   1) 정답 블록이 바닥에 닿으면 '놓침' → 라이프 -1 (반응 문제라 정지 없음/무음/레벨무영향)
//   2) 오답 블록 탭 → 기울기(5°→12°), 3개 누적 → 붕괴=웨이브 실패. 라이프는 '놓침'으로만 잃는다.

import { L } from '../core/layout.js';
import { THEME, font, roundRect } from '../core/ui.js';

const BASE_FALL_SEC = 2.6; // 콤보 0에서 한 화면 낙하 시간
const FALL_MIN_SEC = 1.2; // 하한(가장 빠름)
const TARGETS = [5, 8, 12, 15, 20]; // 웨이브 목표(이후 +5씩)
const TILT_DEG = [0, 5, 12];
const COLLAPSE_DEG = 20;
const NEARMISS_TTF = 0.3; // 바닥 닿기 0.3초 이내 탭

export const g06Stack = {
  id: 'g06_stack',
  name: '스택 빌더',
  emoji: '🏗️',
  category: '축적형',
  maxLevel: 4,
  blankRatio: 0.25,
  opMode: 'divide',
  comboMilestones: { 10: 'STEADY!' },
  fever: { type: 'easy' }, // 재미 표준 피버 opt-in → engine.fever (§7.6). easy=피버 중 쉬운 문제형

  get blockW() {
    return L.w(0.2);
  },
  get blockH() {
    return L.minTouch;
  },
  get stagger() {
    return L.gu(5);
  },

  tutorial: {
    text: '답이 맞는 블록만 눌러서 탑을 쌓아! 놓치면 안 돼!',
    draw(ctx) {
      const cx = L.W / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.045));
      ctx.fillText('6 × 4 = ?', cx, L.gu(1.4));

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
      const fall = [
        { x: cx + L.gu(2), y: L.gu(4), label: '24' },
        { x: cx + L.gu(5.5), y: L.gu(6.5), label: '20' },
      ];
      for (const f of fall) {
        roundRect(ctx, f.x - bw / 2, f.y - bh / 2, bw, bh, L.gu(0.2));
        ctx.fillStyle = THEME.accent;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = font(L.font(0.03));
        ctx.fillText(f.label, f.x, f.y);
      }
      ctx.font = font(L.font(0.05));
      ctx.fillText('👆', cx + L.gu(2.9), L.gu(4.6));
      ctx.font = font(L.font(0.032));
      ctx.fillText('⭕', cx + L.gu(2), L.gu(2.6));
    },
  },

  init(engine) {
    this.engine = engine;
    this.problem = null;
    this.blocks = []; // [{value, correct, x, y}]
    this.stacked = [];
    this.waveIndex = 0;
    this.wrongInWave = 0;
    this.waveHadWrong = false;
    this.collapsing = false;
    this.popEffects = [];
    this.missEffect = null;
    this.time = 0;
    this.curFall = 0;
    this.nearMissUsed = false;

    // 재미 요소 상태
    this.camY = 0; // 카메라 상향(탑 높을수록)
    this.thud = 0; // 안착 "쿵" 스쿼시 타이머
    this.waveGlow = null; // 웨이브 완료 시 빛나는 탑 {count, target, t, dur}
    this.wasFever = false;
    this.feverBanner = null;

    this._startRound();
  },

  _targetFor(i) {
    if (i < TARGETS.length) return TARGETS[i];
    return TARGETS[TARGETS.length - 1] + 5 * (i - TARGETS.length + 1);
  },
  get target() {
    return this._targetFor(this.waveIndex);
  },

  // 낙하 속도(px/s): 콤보 6마다 빨라짐 + 피버 배속(core). 교사 배율·하한 클램프.
  _fallSpeed() {
    const e = this.engine;
    let sec = BASE_FALL_SEC / Math.pow(1.1, Math.floor(e.scoreManager.combo / 6));
    if (sec < FALL_MIN_SEC) sec = FALL_MIN_SEC;
    sec *= e.settings.timeScale || 1;
    const span = L.zone.floor + this.blockH;
    let speed = span / sec;
    if (e.fever) speed *= e.fever.speedMultiplier; // 피버 배속(램프 포함)
    return speed;
  },

  _wrongCount() {
    const combo = this.engine.scoreManager.combo;
    if (combo >= 20) return 4;
    if (combo >= 10) return 3;
    return 2;
  },

  _startRound() {
    const e = this.engine;
    this.problem = e.problemGenerator.nextProblem({ maxLevel: this.maxLevel, blankRatio: this.blankRatio, opMode: this.opMode });

    const closeness = Math.min(0.8, 0.2 + 0.025 * e.scoreManager.combo);
    const distractors = e.problemGenerator.makeDistractors(this.problem, this._wrongCount(), closeness);
    const items = shuffle([
      { value: this.problem.answer, correct: true },
      ...distractors.map((v) => ({ value: v, correct: false })),
    ]);

    const bw = this.blockW;
    const minX = L.safe + bw / 2;
    const maxX = L.W - L.safe - bw / 2;
    const laneW = (maxX - minX) / items.length;
    const order = shuffle(items.map((_, i) => i));

    this.blocks = items.map((it, i) => {
      const jitter = (Math.random() - 0.5) * Math.max(0, laneW - bw);
      const x = minX + laneW * (i + 0.5) + jitter;
      const rank = order.indexOf(i);
      const y = -this.blockH - rank * this.stagger - Math.random() * L.gu(1);
      return { value: it.value, correct: it.correct, x, y };
    });
    this.nearMissUsed = false;
  },

  _nextWave() {
    this.waveIndex += 1;
    this.stacked = [];
    this.wrongInWave = 0;
    this.waveHadWrong = false;
    this.collapsing = false;
    this._startRound();
  },

  _collapseWave() {
    const baseX = L.W / 2;
    const floorY = L.zone.floor;
    for (let i = 0; i < Math.min(this.stacked.length, 8); i++) {
      this.engine.particles.emit(baseX + (Math.random() - 0.5) * this.blockW, floorY - i * L.gu(1), 'explode', THEME.wrong, 8);
    }
    this.stacked = [];
    this.wrongInWave = 0;
    this.waveHadWrong = false;
    this.collapsing = false;
    this._startRound();
  },

  update(dt) {
    this.time += dt;
    const floorY = L.zone.floor;

    // 피버 진입/종료 전이
    const fev = this.engine.fever;
    const active = !!(fev && fev.active);
    if (active && !this.wasFever) {
      this.engine.ui.flash('rgba(255,210,120,0.5)', 0.09);
      this.engine.ui.showComboText('🔥 FEVER!', true);
    } else if (!active && this.wasFever) {
      this.feverBanner = { points: fev ? fev.pointsEarned : 0, t: 0, dur: 1.4 };
      this.engine.ui.flash('rgba(120,200,255,0.4)', 0.09);
    }
    this.wasFever = active;

    // 카메라: 탑이 높을수록 살짝 위로(부드럽게 수렴). 플레이 영역에만 적용(상단 UI 고정).
    const camTarget = Math.min(L.gu(2), Math.max(0, this.stacked.length - 5) * L.gu(0.2));
    this.camY += (camTarget - this.camY) * Math.min(1, dt * 6);
    if (this.thud > 0) this.thud = Math.max(0, this.thud - dt);

    // 낙하(전역 속도 — 피버/램프 즉시 반영)
    this.curFall = this._fallSpeed();
    for (const b of this.blocks) b.y += this.curFall * dt;

    // 정답 블록 바닥 도달 → '놓침' 라이프 -1 (흐름 유지)
    const c = this.blocks.find((b) => b.correct);
    if (c && c.y + this.blockH / 2 >= floorY) {
      this.engine.answerWrong(this.problem, null, { loseLife: true, freeze: false, affectLevel: false, missed: true });
      this.engine.particles.emit(c.x, floorY, 'pop', THEME.wrong, 16);
      this.missEffect = { x: c.x, y: floorY - L.gu(1), t: 0, dur: 0.6 };
      this._startRound();
      return;
    }
    this.blocks = this.blocks.filter((b) => b.correct || b.y - this.blockH / 2 <= L.H);

    for (let i = this.popEffects.length - 1; i >= 0; i--) {
      this.popEffects[i].t += dt;
      if (this.popEffects[i].t >= this.popEffects[i].dur) this.popEffects.splice(i, 1);
    }
    if (this.missEffect) {
      this.missEffect.t += dt;
      if (this.missEffect.t >= this.missEffect.dur) this.missEffect = null;
    }
    if (this.waveGlow) {
      this.waveGlow.t += dt;
      if (this.waveGlow.t >= this.waveGlow.dur) this.waveGlow = null;
    }
    if (this.feverBanner) {
      this.feverBanner.t += dt;
      if (this.feverBanner.t >= this.feverBanner.dur) this.feverBanner = null;
    }
  },

  render(ctx) {
    const cx = L.W / 2;
    const floorY = L.zone.floor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ── 상단 UI(고정, 카메라 영향 없음) ──
    this._drawFeverBg(ctx);
    if (this.engine.fever) {
      this.engine.fever.renderGauge(ctx, { x: L.safe, y: L.zone.gauge, w: L.W - L.safe * 2, h: L.gu(0.5) });
    }
    ctx.fillStyle = THEME.text;
    ctx.font = font(L.font(0.07));
    const qText = this.problem.blank ? this.problem.text : `${this.problem.text} = ?`;
    ctx.fillText(qText, cx, L.zone.problem);
    ctx.fillStyle = THEME.subtext;
    ctx.font = font(L.font(0.028), 'normal');
    ctx.fillText(`웨이브 ${this.waveIndex + 1} · 목표 ${this.target}칸 · 현재 ${this.stacked.length}칸`, cx, L.zone.problem + L.gu(1.7));
    if (this.problem.fromReview) {
      ctx.fillStyle = THEME.gold;
      ctx.font = font(L.font(0.028));
      ctx.fillText('🔁 다시 도전!', cx, L.zone.problem + L.gu(3));
    }
    if (this.wrongInWave > 0 || this.collapsing) {
      ctx.fillStyle = THEME.wrong;
      ctx.font = font(L.font(0.03));
      const n = this.collapsing ? 3 : this.wrongInWave;
      ctx.fillText(`⚠️ 기우뚱! (오답 ${n}/3)`, cx, L.zone.problem + L.gu(4.2));
    }

    // ── 플레이 영역(카메라 상향 적용) ──
    ctx.save();
    ctx.translate(0, -this.camY);

    // 바닥선
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

    this._renderTower(ctx, cx, floorY);
    this._renderWaveGlow(ctx, cx, floorY);

    for (const b of this.blocks) {
      if (b.y + this.blockH / 2 < 0) continue;
      this._drawBlock(ctx, b.x, b.y, this.blockW, this.blockH, THEME.accent, String(b.value));
    }

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
    ctx.restore();

    this._drawFeverBanner(ctx);
    // 위기 테두리는 ui가 자동으로 그린다.
  },

  // 탑 기하 계산(공유): 블록 높이·폭·간격
  _towerGeom(floorY) {
    const target = Math.max(this.target, 1);
    const availH = floorY - L.zone.playTop - L.gu(1);
    const bh = Math.min(L.gu(1.2), availH / target);
    return { bh, bw: L.w(0.24), gap: Math.min(L.gu(0.12), Math.min(L.gu(1.2), availH / target) * 0.12) };
  },

  _renderTower(ctx, cx, floorY) {
    const count = this.stacked.length;
    if (count === 0) return;
    const { bh, bw, gap } = this._towerGeom(floorY);
    const tiltDeg = this.collapsing ? COLLAPSE_DEG : TILT_DEG[Math.min(this.wrongInWave, TILT_DEG.length - 1)];
    const tilt = (tiltDeg * Math.PI) / 180;
    // "쿵" 안착: 맨 위 블록이 잠깐 눌렸다 펴짐(무게감)
    const squash = this.thud > 0 ? 1 - 0.12 * (this.thud / 0.12) : 1;

    ctx.save();
    ctx.translate(cx, floorY);
    ctx.rotate(-tilt);
    for (let i = 0; i < count; i++) {
      const isTop = i === count - 1;
      const h = (bh - gap) * (isTop ? squash : 1);
      const y = -(i + 1) * bh + (bh - gap) / 2;
      this._drawBlock(ctx, 0, y, bw, h, THEME.correct, String(this.stacked[i]), L.font(0.026));
    }
    ctx.restore();
  },

  // 웨이브 완료 시 완성됐던 탑이 통째로 빛나며 사라지는 연출(진행은 멈추지 않음).
  _renderWaveGlow(ctx, cx, floorY) {
    const g = this.waveGlow;
    if (!g) return;
    const prog = g.t / g.dur;
    const { bh, bw, gap } = this._towerGeom(floorY);
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - prog);
    ctx.shadowColor = THEME.gold;
    ctx.shadowBlur = L.gu(0.8) + L.gu(1.2) * (1 - prog);
    for (let i = 0; i < g.count; i++) {
      const y = floorY - (i + 1) * bh + (bh - gap) / 2;
      roundRect(ctx, cx - bw / 2, y - (bh - gap) / 2, bw, bh - gap, Math.min(L.gu(0.4), (bh - gap) * 0.22));
      ctx.fillStyle = THEME.gold;
      ctx.fill();
    }
    ctx.restore();
  },

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

    const ty = y + this.camY; // 카메라 상향 보정
    const fev = this.engine.fever;
    let target = null;
    let best = Infinity;
    for (const b of this.blocks) {
      // 피버 중 '정답 블록만' 판정 넉넉(시각 크기는 유지 → 정답 노출 금지)
      const hs = b.correct && fev && fev.active ? fev.hitScale : 1;
      const hw = (this.blockW / 2) * hs;
      const hh = (this.blockH / 2) * hs;
      if (x >= b.x - hw && x <= b.x + hw && ty >= b.y - hh && ty <= b.y + hh) {
        const d = Math.hypot(x - b.x, ty - b.y);
        if (d < best) {
          best = d;
          target = b;
        }
      }
    }
    if (!target) return;

    const e = this.engine;
    if (target.correct) {
      // 니어미스: 바닥 0.3초 이내 탭 (라운드당 1회 — 한 라운드에 정답 블록은 하나뿐)
      const toFloor = L.zone.floor - (target.y + this.blockH / 2);
      const nearMiss = !this.nearMissUsed && this.curFall > 0 && toFloor / this.curFall <= NEARMISS_TTF;

      this.stacked.push(target.value);
      this.thud = 0.12; // "쿵" 안착
      const target_ = this.target;
      const waveDone = this.stacked.length >= target_;

      // 점수(블록 10점 / 완료 목표×50 / 무오답 +200). 피버 2배는 answerCorrect가 자동.
      let pts = 10;
      if (waveDone) pts += target_ * 50 + (this.waveHadWrong ? 0 : 200);
      e.answerCorrect(this.problem, target.value, pts);

      if (nearMiss) {
        this.nearMissUsed = true;
        e.reportNearMiss(target.x, target.y);
      }

      const towerTopY = L.zone.floor - this.stacked.length * L.gu(1);
      this.popEffects.push({ x: target.x, y: target.y, tx: L.W / 2, ty: towerTopY, value: target.value, t: 0, dur: 0.35 });
      e.particles.emit(target.x, target.y, 'sparkle', THEME.correct, 12);
      e.sound.play('pop');
      // "쿵" 무게감: 짧은 흔들림 + 낮은 타격음(효과음 OFF면 무음)
      e.ui.shake(6, 0.09);
      if (e.sound.tone) e.sound.tone(90, 0, 0.12, { type: 'sine', vol: 0.14 });

      if (waveDone) {
        this.waveGlow = { count: this.stacked.length, target: target_, t: 0, dur: 0.5 }; // 탑 전체 빛남
        e.ui.showComboText(`웨이브 클리어! +${target_ * 50}`, true);
        e.ui.flash('rgba(255,220,140,0.4)', 0.1);
        e.particles.emit(L.W / 2, L.y(0.5), 'sparkle', THEME.gold, 24);
        this._nextWave();
      } else {
        this._startRound();
      }
    } else {
      // 오답 블록 탭: 기울기 누적 + 정답표시(1.2초). 라이프는 깎지 않음(게이지 -20은 core 자동).
      this.wrongInWave += 1;
      this.waveHadWrong = true;
      e.ui.shake(14, 0.3);
      if (this.wrongInWave >= 3) {
        this.collapsing = true;
        e.answerWrong(this.problem, target.value, { loseLife: false, onResume: () => this._collapseWave() });
      } else {
        e.answerWrong(this.problem, target.value, { loseLife: false, onResume: () => this._startRound() });
      }
    }
  },

  onHover(x, y) {
    const ty = y + this.camY;
    const fev = this.engine.fever;
    for (const b of this.blocks) {
      const hs = b.correct && fev && fev.active ? fev.hitScale : 1;
      const hw = (this.blockW / 2) * hs;
      const hh = (this.blockH / 2) * hs;
      if (x >= b.x - hw && x <= b.x + hw && ty >= b.y - hh && ty <= b.y + hh) return true;
    }
    return false;
  },
  clearHover() {},
  onKey() {},

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
    ctx.strokeText(`FEVER +${b.points}`, L.W / 2, L.H * 0.4);
    ctx.fillStyle = THEME.gold;
    ctx.fillText(`FEVER +${b.points}`, L.W / 2, L.H * 0.4);
    ctx.restore();
  },

  destroy() {
    this.engine = null;
    this.problem = null;
    this.blocks = [];
    this.stacked = [];
    this.popEffects = [];
    this.missEffect = null;
    this.waveGlow = null;
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
