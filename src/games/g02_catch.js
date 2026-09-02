// g02_catch.js — 🎪 떨어지는 캐치 (SPEC §4 2️⃣ / Phase 1)
// 반사신경형. 상단 문제 고정. 위에서 숫자 원이 떨어지고 '정답만' 터치한다.
// 확정 인터페이스(SPEC §7)만 사용한다. core/scenes는 건드리지 않는다.
//
// ⚠️ 재미 표준(§2.6)을 core 모듈로 사용한다(1단계에서 추출한 것을 2단계에서 연결):
//   - 피버: fever:true → engine.fever (게이지·배수·판정완화·게이지렌더는 core). 배경/배너만 게임이.
//   - 위기 테두리·낮은 긴장음: ui가 자동. (게임의 자체 테두리/긴장음 코드 제거 — 중복 해소)
//   - 콤보별 반음 정답음: answerCorrect가 playCorrect로 자동. (게임의 자체 정답음 제거)
//   - 점수 2배·게이지 가감: answerCorrect/answerWrong 자동. 니어미스 보상: reportNearMiss.
//   - 점수 카운트업: ui 자동.
//
// 좌표·크기·폰트는 전부 core/layout.js 의 L 헬퍼로 계산한다(픽셀 리터럴 금지).
//
// 라이프 규칙(반사신경형이라 관대):
//   - 오답 터치        → answerWrong(loseLife:true)  : 라이프 -1 + 콤보 리셋 + 정답표시 1.2초
//   - 정답 놓쳐 바닥 도달 → answerWrong(loseLife:false, freeze:false, missed) : 콤보만 리셋(정지 없음)

import { L } from '../core/layout.js';
import { THEME, font } from '../core/ui.js';

// ── 시간 상수(초). 정답 연출은 흐름을 멈추지 않는다(§2.6 상한 준수). ──
const HITSTOP = 0.05; // 순간 정지(0.03~0.06)
const FLASH_DUR = 0.08; // 플래시(0.05~0.10)
const SHAKE_TIME = 0.1; // 흔들림(0.08~0.12)
const ZOOM_DUR = 0.06; // 미세 확대(0.06)
const ZOOM_MAX = 0.01; // 1.01배
const POP_DUR = 0.45; // 정답 원 확대→소멸(0.30~0.50)
const FLOAT_DUR = 0.6; // 획득 점수 부양(≤0.70)
const MISS_DUR = 0.4; // 놓침 "앗!"

const INPUT_LOCK = 0.1; // 판정 후 중복 입력 무시(100ms)
const BASE_SEC = 1.8; // 콤보 0에서 화면 통과 시간
const MIN_SEC = 0.9; // 화면 통과 최소 시간(하드 클램프)

const NEARMISS_TTF = 0.3; // 바닥 닿기 0.3초 이내
const NEARMISS_DIST_RATIO = 0.1; // 또는 남은 거리 화면 높이 10% 이하

const MULTI_COUNT = 5; // 피버(multi) 중 화면에 유지할 값 개수

export const g02Catch = {
  id: 'g02_catch',
  name: '떨어지는 캐치',
  emoji: '🎪',
  category: '반사신경',
  maxLevel: 3, // 출제 상한 Lv3 (SPEC 2.1 반사신경형)
  blankRatio: 0, // 반사신경형은 빈칸 미출제
  opMode: 'multiply', // 곱셈만 출제
  comboMilestones: { 7: 'NICE!', 15: 'AWESOME!' },
  fever: { type: 'multi' }, // 재미 표준 피버 opt-in → engine.fever (§7.6). multi=다중 정답형("N단!" 배수 쓸기)

  // ── 크기/간격 (L 기반 getter) ──
  get R() {
    return L.w(0.0875);
  },
  get HIT_PAD() {
    return L.gu(0.5);
  },
  get FLOOR_Y() {
    return L.zone.floor;
  },
  get PROBLEM_Y() {
    return L.zone.problem;
  },
  get STAGGER() {
    return L.gu(5.25);
  },

  tutorial: {
    text: '떨어지는 숫자 중에서 답을 찾아 콕 눌러!',
    draw(ctx) {
      const cx = L.W / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.047));
      ctx.fillText('6 × 4 = ?', cx, L.gu(1.5));

      const circles = [
        { x: cx - L.gu(5), y: L.gu(4.4), label: '18' },
        { x: cx, y: L.gu(6.3), label: '24' },
        { x: cx + L.gu(5), y: L.gu(3.8), label: '30' },
      ];
      for (const c of circles) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, L.gu(1.45), 0, Math.PI * 2);
        ctx.fillStyle = THEME.accent;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = font(L.font(0.037));
        ctx.fillText(c.label, c.x, c.y);
      }
      ctx.font = font(L.font(0.06));
      ctx.fillText('👆', cx + L.gu(1.15), L.gu(7.5));
    },
  },

  init(engine) {
    this.engine = engine;
    this.problem = null;
    this.fallers = []; // [{value, correct, x, y, age, judged}]
    this.popEffects = [];
    this.floatTexts = [];
    this.missEffect = null;
    this.feverBanner = null; // 피버 종료 "FEVER +N"

    this.time = 0;
    this.inputLockUntil = 0;
    this.hitStop = 0;
    this.zoomT = 0;
    this.curSpeed = 0;
    this.nearMissUsed = false;
    this.wasFever = false; // 피버 진입/종료 전이 감지
    this.multiMode = false; // 피버(multi) 중 'N단 배수 쓸기' 모드

    this.consecWrong = 0;
    this.speedPenalty = 0;

    this._startWave();
  },

  _simulCount() {
    const combo = this.engine.scoreManager.combo;
    if (combo >= 20) return 5;
    if (combo >= 10) return 4;
    return 3;
  },

  // 낙하 속도(px/s). 콤보 단계 + 안전장치 + 피버 배속(core engine.fever가 램프/grace까지 반영).
  _currentSpeed() {
    const e = this.engine;
    const combo = e.scoreManager.combo;
    let step = combo >= 20 ? 1.4 : combo >= 15 ? 1.3 : combo >= 10 ? 1.2 : combo >= 5 ? 1.1 : 1.0;
    step *= e.scoreManager.speedFactor; // 점수/콤보 세션 가산(공통). 안전장치는 아래에서 우선 적용.
    if (this.speedPenalty > 0) step -= 0.1 * this.speedPenalty; // 연속 오답 감점
    if (e.scoreManager.lives <= 1) step = Math.min(step, 1.0); // 라이프1 상승 중단
    if (e.fever && e.fever.graceActive) step = Math.min(step, 1.0); // 피버 종료 직후 grace
    if (step < 1.0) step = 1.0;
    step *= e.fever ? e.fever.speedMultiplier : 1; // 피버 배속(램프 포함)

    let sec = BASE_SEC / step;
    sec *= e.settings.timeScale || 1;
    if (sec < MIN_SEC) sec = MIN_SEC; // 화면 통과 최소 0.9초
    return L.H / sec;
  },

  // 피버 중 정답 원은 크기·판정을 core 계수로 넉넉하게(성공 가능성 유지). 오답 원은 그대로.
  _visR(f) {
    const fev = this.engine.fever;
    return f.correct && fev && fev.active ? this.R * fev.sizeScale : this.R;
  },
  _judgeR(f) {
    const fev = this.engine.fever;
    const padMul = f.correct && fev && fev.active ? fev.hitScale : 1;
    return this._visR(f) + this.HIT_PAD * padMul;
  },

  _startWave() {
    const e = this.engine;
    this.problem = e.problemGenerator.nextProblem({ maxLevel: this.maxLevel, blankRatio: this.blankRatio, opMode: this.opMode });

    const total = this._simulCount();
    const closeness = Math.min(0.5, 0.15 + 0.015 * e.scoreManager.combo);
    const distractors = e.problemGenerator.makeDistractors(this.problem, total - 1, closeness);

    const items = shuffle([
      { value: this.problem.answer, correct: true },
      ...distractors.map((v) => ({ value: v, correct: false })),
    ]);

    const R = this.R;
    const minX = L.safe + R;
    const maxX = L.W - L.safe - R;
    const laneW = (maxX - minX) / items.length;
    const order = shuffle(items.map((_, i) => i));
    const feverActive = e.fever && e.fever.active;
    const stag = this.STAGGER * (feverActive ? 1.3 : 1.0); // 피버 중 간격↑(겹침·가림 방지)
    const jitterScale = feverActive ? 0.3 : 1.0;

    this.fallers = items.map((it, i) => {
      const gap = Math.max(0, laneW - 2 * R);
      const jitter = (Math.random() - 0.5) * gap * jitterScale;
      const x = minX + laneW * (i + 0.5) + jitter;
      const rank = order.indexOf(i);
      const y = -R - rank * stag - Math.random() * L.gu(1.5);
      return { value: it.value, correct: it.correct, x, y, age: 0, judged: false };
    });

    this.nearMissUsed = false;
  },

  update(dt) {
    this.time += dt;

    // 피버 진입/종료 전이(상태는 core가 관리, 연출만 게임이)
    const fev = this.engine.fever;
    const active = !!(fev && fev.active);
    if (active && !this.wasFever) {
      this.engine.ui.flash('rgba(255,210,120,0.5)', FLASH_DUR);
      this.engine.ui.showComboText('🔥 FEVER!', true);
      if (fev.type === 'multi') this._enterMulti(); // 다중 정답형: N단 배수 쓸기 모드로 전환
    } else if (!active && this.wasFever) {
      this.feverBanner = { points: fev ? fev.pointsEarned : 0, t: 0, dur: 1.4 };
      this.engine.ui.flash('rgba(120,200,255,0.4)', FLASH_DUR);
      if (this.multiMode) this._exitMulti(); // 일반 문제 모드로 복귀
    }
    this.wasFever = active;

    if (this.hitStop > 0) this.hitStop = Math.max(0, this.hitStop - dt);
    if (this.zoomT > 0) this.zoomT = Math.max(0, this.zoomT - dt);

    // 낙하 이동 (hitStop 동안 정지). 속도는 매 프레임 재계산(피버/램프 즉시 반영).
    this.curSpeed = this._currentSpeed();
    for (const f of this.fallers) {
      if (this.hitStop <= 0) f.y += this.curSpeed * dt;
      f.age += dt;
    }

    if (this.multiMode) {
      // 다중 정답형: 놓친 값(화면 밖)·터뜨린 값은 제거하고 화면을 계속 채운다(놓쳐도 무해).
      this.fallers = this.fallers.filter((f) => !f.judged && f.y - this.R <= L.H);
      let guard = 0;
      while (this.fallers.length < MULTI_COUNT && guard++ < MULTI_COUNT + 2) {
        const nf = this._spawnOneMulti();
        if (!nf) break;
        this.fallers.push(nf);
      }
    } else {
      // 정답이 바닥을 넘으면 '놓침'(현행 유지: 정지 없음, 무음, 라이프 유지)
      const correct = this.fallers.find((f) => f.correct && !f.judged);
      if (correct && correct.y >= this.FLOOR_Y && correct.age > 0.3) {
        this.engine.answerWrong(this.problem, null, { loseLife: false, freeze: false, affectLevel: false, missed: true });
        this.engine.particles.emit(correct.x, this.FLOOR_Y, 'pop', THEME.wrong, 16);
        this.missEffect = { x: correct.x, y: this.FLOOR_Y, t: 0, dur: MISS_DUR };
        this._startWave();
        return;
      }
      this.fallers = this.fallers.filter((f) => f.correct || f.y - this.R <= L.H);
    }

    for (let i = this.popEffects.length - 1; i >= 0; i--) {
      this.popEffects[i].t += dt;
      if (this.popEffects[i].t >= this.popEffects[i].dur) this.popEffects.splice(i, 1);
    }
    for (let i = this.floatTexts.length - 1; i >= 0; i--) {
      this.floatTexts[i].t += dt;
      if (this.floatTexts[i].t >= this.floatTexts[i].dur) this.floatTexts.splice(i, 1);
    }
    if (this.missEffect) {
      this.missEffect.t += dt;
      if (this.missEffect.t >= this.missEffect.dur) this.missEffect = null;
    }
    if (this.feverBanner) {
      this.feverBanner.t += dt;
      if (this.feverBanner.t >= this.feverBanner.dur) this.feverBanner = null;
    }
  },

  onTouch(x, y, phase) {
    if (phase !== 'start') return;
    if (!this.multiMode && this.time < this.inputLockUntil) return; // 판정 후 100ms 중복(일반 모드만)
    if (!this.fallers.length) return;

    let target = null;
    let best = Infinity;
    for (const f of this.fallers) {
      if (f.judged) continue;
      const jr = this._judgeR(f);
      const d = Math.hypot(x - f.x, y - f.y);
      if (d <= jr && d < best) {
        best = d;
        target = f;
      }
    }
    if (!target) return;

    target.judged = true;

    // 다중 정답형: 배수=정답(연타 허용, 입력락 없음) / 함정=무해
    if (this.multiMode) {
      this._judgeMultiTap(target);
      return;
    }

    this.inputLockUntil = this.time + INPUT_LOCK;
    if (target.correct) this._judgeCorrect(target);
    else this._judgeWrong(target);
  },

  _judgeCorrect(target) {
    const e = this.engine;
    const combo = e.scoreManager.combo;

    // 니어미스: 바닥 0.3초 이내 or 남은 거리 화면 10% 이하 (한 문제 1회)
    const remaining = this.FLOOR_Y - target.y;
    const ttf = this.curSpeed > 0 ? remaining / this.curSpeed : 999;
    const nearMiss = !this.nearMissUsed && (ttf <= NEARMISS_TTF || remaining <= L.H * NEARMISS_DIST_RATIO);

    const base = 50 + combo * 5;
    e.answerCorrect(this.problem, target.value, base); // 점수2배·게이지+10·정답음·위기밝힘 자동
    const shown = base * (e.fever && e.fever.active ? e.fever.scoreMultiplier : 1);

    if (nearMiss) {
      this.nearMissUsed = true;
      e.reportNearMiss(target.x, target.y); // +40(피버×2)·게이지+5·"아슬아슬!"·큰 파티클
    }

    // ── 손맛(동시 발생) ──
    this._emitCorrectParticles(target, nearMiss);
    this.popEffects.push({ x: target.x, y: target.y, value: target.value, t: 0, dur: POP_DUR });
    this.floatTexts.push({ x: target.x, y: target.y, text: `+${shown}`, color: e.fever && e.fever.active ? THEME.gold : THEME.correct, size: L.font(0.04), t: 0, dur: FLOAT_DUR });
    this.hitStop = HITSTOP;
    this.zoomT = ZOOM_DUR;
    e.ui.flash(e.fever && e.fever.active ? 'rgba(255,220,140,0.35)' : 'rgba(255,255,255,0.28)', FLASH_DUR);
    e.ui.shake(nearMiss ? 10 : 7, SHAKE_TIME);
    this._haptic(15);

    this.consecWrong = 0;
    this.speedPenalty = 0;
    this._startWave();
  },

  _judgeWrong(target) {
    const e = this.engine;
    this.consecWrong += 1;
    if (this.consecWrong >= 2) {
      this.speedPenalty = 1; // 연속 오답 2회 → 속도 한 단계 ↓ (정답 시 회복)
      this.consecWrong = 0;
    }
    // 게이지 -20은 answerWrong(피버 opt-in, !missed)이 자동. 정답표시 1.2초 후 다음 웨이브.
    e.answerWrong(this.problem, target.value, { loseLife: true, onResume: () => this._startWave() });
  },

  // ── 피버 multi 유형: "N단!" 배수 쓸기 ─────────────────────────
  // 진입 시 일반 문제(1정답+오답)를 끄고, 화면을 N단 배수(80%)+함정(20%)으로 채운다.
  // 배수를 누르면 전부 정답(연타), 함정은 무적이라 무해. 종료 시 일반 모드로 매끄럽게 복귀.
  _enterMulti() {
    this.multiMode = true;
    this.nearMissUsed = true; // multi에는 니어미스 개념 없음
    this._spawnMultiFallers(MULTI_COUNT);
  },
  _exitMulti() {
    this.multiMode = false;
    this.fallers = [];
    this.popEffects = []; // 남은 값·연출 정리(전환 매끄럽게)
    this._startWave(); // 일반 문제 모드 복귀(새 문제 로드)
  },
  // fv.fillValues로 초기 N개를 만든다([{value, isMultiple}]). 위치는 일반 웨이브와 같은 방식(L 기반).
  _spawnMultiFallers(count) {
    const fv = this.engine.fever;
    const items = fv.fillValues(count);
    const R = this.R;
    const minX = L.safe + R;
    const maxX = L.W - L.safe - R;
    const laneW = (maxX - minX) / Math.max(1, items.length);
    const order = shuffle(items.map((_, i) => i));
    this.fallers = items.map((it, i) => {
      const gap = Math.max(0, laneW - 2 * R);
      const jitter = (Math.random() - 0.5) * gap * 0.3;
      const x = minX + laneW * (i + 0.5) + jitter;
      const rank = order.indexOf(i);
      const y = -R - rank * this.STAGGER - Math.random() * L.gu(1.5);
      return { value: it.value, correct: false, isMultiple: it.isMultiple, x, y, age: 0, judged: false };
    });
  },
  // 보충용 값 하나(배수 비율은 core 기본 0.8). 화면 밖으로 나갔거나 터뜨린 자리를 채운다.
  _spawnOneMulti() {
    const fv = this.engine.fever;
    if (!fv || !fv.active || fv.type !== 'multi') return null;
    const ratio = (fv.cfg && fv.cfg.multiMultipleRatio) || 0.8;
    const value = Math.random() < ratio ? fv.randomMultiple() : fv.randomTrap();
    const R = this.R;
    const minX = L.safe + R;
    const maxX = L.W - L.safe - R;
    const x = minX + Math.random() * (maxX - minX);
    const y = -R - Math.random() * L.gu(3);
    return { value, correct: false, isMultiple: fv.isMultiple(value), x, y, age: 0, judged: false };
  },
  _judgeMultiTap(target) {
    const e = this.engine;
    const fv = e.fever;
    const dan = fv.dan;
    if (fv.isMultiple(target.value)) {
      // 배수 = 정답. dan×몫 = value 형태의 곱셈 사실로 기록(단별 정답률에도 정상 반영).
      const q = Math.round(target.value / dan);
      const prob = { a: dan, b: q, op: '×', answer: target.value, remainder: null, level: 1, text: `${dan} × ${q}`, blank: null };
      const base = 50 + e.scoreManager.combo * 5;
      e.answerCorrect(prob, target.value, base); // 점수배수·게이지·정답음·연출 자동(피버 무적)
      const shown = base * (fv && fv.active ? fv.scoreMultiplier : 1);
      this._emitCorrectParticles(target, false);
      this.popEffects.push({ x: target.x, y: target.y, value: target.value, t: 0, dur: POP_DUR });
      this.floatTexts.push({ x: target.x, y: target.y, text: `+${shown}`, color: THEME.gold, size: L.font(0.04), t: 0, dur: FLOAT_DUR });
      this.hitStop = HITSTOP;
      this.zoomT = ZOOM_DUR;
      e.ui.flash('rgba(255,220,140,0.35)', FLASH_DUR);
      this._haptic(15);
    } else {
      // 함정 = 무해(피버 무적). 세션 기록만 하고 복습 큐엔 넣지 않는다(정식 출제 문제가 아니므로).
      const prob = { a: target.value, b: dan, op: '÷', answer: Math.floor(target.value / dan), remainder: target.value % dan, level: 1, text: `${target.value} ÷ ${dan}`, blank: null };
      e.answerWrong(prob, target.value, { affectLevel: false, freeze: false });
      this.missEffect = { x: target.x, y: target.y, t: 0, dur: MISS_DUR };
      e.particles.emit(target.x, target.y, 'pop', THEME.wrong, 12);
    }
  },

  _emitCorrectParticles(target, nearMiss) {
    const e = this.engine;
    const mult = e.fever && e.fever.active ? 1.5 : 1;
    const base = nearMiss ? 44 : 30;
    e.particles.emit(target.x, target.y, 'explode', THEME.accent, Math.round(base * mult));
    e.particles.emit(target.x, target.y, 'pop', THEME.gold, Math.round(16 * mult));
    e.particles.emit(target.x, target.y, 'sparkle', THEME.correct, Math.round(8 * mult));
  },

  _haptic(ms) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch (e) {
        /* 무시 */
      }
    }
  },

  // 피버 배경 밝기(0~1): 활성 1, 종료 램프 동안 1→0. core engine.fever의 speed 램프로 계산.
  _feverIntensity() {
    const f = this.engine.fever;
    if (!f) return 0;
    if (f.active) return 1;
    const peak = (f.cfg && f.cfg.speedMult ? f.cfg.speedMult : 1.35) - 1;
    return peak > 0 ? Math.max(0, (f.speedMultiplier - 1) / peak) : 0;
  },

  render(ctx) {
    this._drawFeverBg(ctx);
    if (this.engine.fever) {
      const h = L.gu(0.5);
      this.engine.fever.renderGauge(ctx, { x: L.safe, y: L.zone.gauge, w: L.W - L.safe * 2, h });
    }

    const z = this.zoomT > 0 ? 1 + ZOOM_MAX * (this.zoomT / ZOOM_DUR) : 1;
    ctx.save();
    if (z !== 1) {
      const cx = L.W / 2;
      const cy = L.H * 0.55;
      ctx.translate(cx, cy);
      ctx.scale(z, z);
      ctx.translate(-cx, -cy);
    }
    this._drawProblem(ctx);
    this._drawFallers(ctx);
    this._drawPopEffects(ctx);
    this._drawFloats(ctx);
    this._drawMiss(ctx);
    ctx.restore();

    this._drawFeverBanner(ctx);
    // 위기 테두리는 ui가 자동으로 그린다(게임 코드 없음).
  },

  _drawProblem(ctx) {
    const cx = L.W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 피버 multi: "N단!" + 안내. 일반 문제 대신 표시한다.
    if (this.multiMode && this.engine.fever && this.engine.fever.dan) {
      ctx.fillStyle = THEME.gold;
      ctx.font = font(L.font(0.09));
      ctx.fillText(`${this.engine.fever.dan}단!`, cx, this.PROBLEM_Y);
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.03));
      ctx.fillText('배수를 모두 터뜨려!', cx, this.PROBLEM_Y + L.gu(1.7));
      return;
    }
    ctx.fillStyle = THEME.text;
    ctx.font = font(L.font(0.07));
    ctx.fillText(`${this.problem.text} = ?`, cx, this.PROBLEM_Y);
    if (this.problem.fromReview) {
      ctx.font = font(L.font(0.026));
      ctx.fillStyle = THEME.gold;
      ctx.fillText('🔁 다시 도전!', cx, this.PROBLEM_Y + L.gu(1.8));
    }
  },

  _drawFallers(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.fallers) {
      if (f.judged) continue;
      if (f.y < -this.R) continue;
      const r = this._visR(f);
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.fillStyle = THEME.accent;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = L.gu(0.12);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = font(L.font(0.05));
      ctx.fillText(String(f.value), f.x, f.y);
    }
  },

  _drawPopEffects(ctx) {
    for (const p of this.popEffects) {
      const prog = p.t / p.dur;
      const scale = prog < 0.3 ? 1 + 0.3 * (prog / 0.3) : 1.3 * (1 - (prog - 0.3) / 0.7);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog);
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.R * Math.max(0.01, scale), 0, Math.PI * 2);
      ctx.strokeStyle = THEME.correct;
      ctx.lineWidth = L.gu(0.15);
      ctx.stroke();
      const y = p.y - prog * L.gu(4);
      ctx.fillStyle = THEME.correct;
      ctx.font = font(L.font(0.056));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(p.value), p.x, y);
      ctx.font = font(L.font(0.037));
      ctx.fillText('⭕', p.x + L.gu(1.5), y - L.gu(1.1));
      ctx.restore();
    }
  },

  _drawFloats(ctx) {
    for (const t of this.floatTexts) {
      const prog = t.t / t.dur;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog);
      ctx.fillStyle = t.color;
      ctx.font = font(t.size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.text, t.x, t.y - prog * L.gu(2.2));
      ctx.restore();
    }
  },

  _drawMiss(ctx) {
    if (!this.missEffect) return;
    const m = this.missEffect;
    const prog = m.t / m.dur;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - prog);
    ctx.fillStyle = THEME.wrong;
    ctx.font = font(L.font(0.056));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('앗!', m.x, m.y - prog * L.gu(1.5));
    ctx.restore();
  },

  // 피버 배경: 밝고 화사한 워시(어둡게/반전 금지 — §2.5).
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
    ctx.strokeText(`FEVER +${b.points}`, L.W / 2, L.H * 0.44);
    ctx.fillStyle = THEME.gold;
    ctx.fillText(`FEVER +${b.points}`, L.W / 2, L.H * 0.44);
    ctx.restore();
  },

  onHover(x, y) {
    for (const f of this.fallers) {
      if (f.judged) continue;
      if (Math.hypot(x - f.x, y - f.y) <= this._judgeR(f)) return true;
    }
    return false;
  },
  clearHover() {},
  onKey() {},

  destroy() {
    this.engine = null;
    this.problem = null;
    this.fallers = [];
    this.popEffects = [];
    this.floatTexts = [];
    this.missEffect = null;
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
