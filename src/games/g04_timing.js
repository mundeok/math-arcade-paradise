// g04_timing.js — 🎯 타이밍 퍼즐 (SPEC §4 4️⃣ / Phase 3)
// 정밀형. 원 둘레에 숫자 4~6개(정답 1 + 오답), 바늘이 회전. 바늘이 '정답' 위를 지날 때 탭.
// 확정 인터페이스(SPEC §7)만 사용한다. core/scenes는 건드리지 않는다.
//
// 재미 표준(§2.6) core 사용:
//   - fever:true → engine.fever. 피버 중 회전 빨라지되 판정 창(허용 각도)이 넓어져 성공 유지.
//   - 위기 테두리·정답음·점수2배·게이지·카운트업 자동. 니어미스(=PERFECT)는 reportNearMiss.
//   - 정답 즉시 다음 문제(멈춤 없음). 손맛: 파티클 + 미세 확대 + 짧은 흔들림(§2.6 상한).
//
// 좌표·크기·폰트는 전부 core/layout.js 의 L 헬퍼로 계산한다(픽셀 리터럴 금지).
// 축 분리(SPEC 2.1): level은 problemGenerator만. 게임 난이도(회전 속도·숫자 수·근접도)는 combo로만.

import { L } from '../core/layout.js';
import { THEME, font } from '../core/ui.js';

const BASE_PERIOD = 3.0; // 콤보 0에서 한 바퀴(초)
const MIN_PERIOD = 1.2; // 가장 빠른 회전
const MAX_ROT = 3; // 3회전 안에 못 맞히면 시간초과(무한 대기 방지)
// 판정 허용 각도(도). 피버 중 hitScale로 넓어진다.
const TOL = { perfect: 5, good: 15, ok: 30 };
const SCORE = { perfect: 100, good: 60, ok: 30 };
const MULTI_RING = 8; // 피버(multi) 중 원 둘레 숫자 개수

export const g04Timing = {
  id: 'g04_timing',
  name: '타이밍 퍼즐',
  emoji: '🎯',
  category: '정밀형',
  maxLevel: 4,
  blankRatio: 0.25,
  opMode: 'multiply',
  fever: { type: 'multi' }, // multi=피버 중 바늘 판정 끄고 "N단!" 배수 찾기 (§2.6/§7.6)
  // 게임 고유 콤보 문구(정밀함 테마). PERFECT/GOOD/OK는 '판정' 문구라 따로 그린다.
  comboMilestones: { 5: 'TICK!', 15: 'PRECISE!', 25: 'CLOCKWORK!' },

  // ── 원 배치 (L 기반 getter) ──
  get cx() {
    return L.W / 2;
  },
  get cy() {
    return L.y(0.53);
  },
  get ringR() {
    return L.w(0.29);
  }, // 숫자들이 놓이는 반지름
  get numR() {
    return L.w(0.076);
  }, // 숫자 원 반지름

  tutorial: {
    text: '바늘이 정답 위를 지나갈 때 화면을 눌러!',
    draw(ctx) {
      const cx = L.W / 2;
      const cy = L.gu(6.2);
      const R = L.gu(3.6);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 문제
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.042));
      ctx.fillText('6 × 4 = ?', cx, L.gu(1.3));

      // 원 둘레 숫자(정답 24 초록 + 오답)
      const nums = [
        { label: '24', ok: true },
        { label: '18', ok: false },
        { label: '30', ok: false },
        { label: '20', ok: false },
      ];
      for (let i = 0; i < nums.length; i++) {
        const a = (i / nums.length) * Math.PI * 2;
        const x = cx + R * Math.sin(a);
        const y = cy - R * Math.cos(a);
        ctx.beginPath();
        ctx.arc(x, y, L.gu(0.9), 0, Math.PI * 2);
        ctx.fillStyle = nums[i].ok ? THEME.correct : THEME.accent;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = font(L.font(0.03));
        ctx.fillText(nums[i].label, x, y);
      }
      // 바늘(정답을 가리킴) + 손가락
      ctx.strokeStyle = THEME.gold;
      ctx.lineWidth = L.gu(0.2);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - R);
      ctx.stroke();
      ctx.font = font(L.font(0.05));
      ctx.fillText('👆', cx + L.gu(1), cy + L.gu(1.2));
    },
  },

  init(engine) {
    this.engine = engine;
    this.problem = null;
    this.numbers = []; // [{value, correct, angle}]
    this.needle = 0; // 현재 바늘 각도(라디안, 0=위, 시계방향)
    this.totalRot = 0; // 이번 문제 누적 회전(라디안)
    this.floats = []; // 판정 문구 [{x,y,text,color,size,t,dur}]
    this.perfectRing = null; // PERFECT 시 퍼지는 링 {t,dur}
    this.zoomT = 0;
    this.time = 0;
    this.wasFever = false;
    this.feverBanner = null;
    this.multiMode = false; // 피버(multi) 중 '바늘 무관 배수 찾기' 모드
    this._load();
  },

  // 회전 각속도(rad/s): 콤보 오를수록 빠름 + 피버 배속. 교사 배율 반영.
  _omega() {
    const e = this.engine;
    let period = Math.max(MIN_PERIOD, BASE_PERIOD - 0.09 * e.scoreManager.combo);
    period *= e.settings.timeScale || 1;
    if (e.fever) period /= e.fever.speedMultiplier; // 피버 중 빨라짐
    return (Math.PI * 2) / period;
  },

  // 숫자 개수: 콤보 4→6개
  _count() {
    const combo = this.engine.scoreManager.combo;
    return 4 + (combo >= 8 ? 1 : 0) + (combo >= 16 ? 1 : 0);
  },

  _load() {
    const e = this.engine;
    this.problem = e.problemGenerator.nextProblem({ maxLevel: this.maxLevel, blankRatio: this.blankRatio, opMode: this.opMode });
    const n = this._count();
    const closeness = Math.max(0.2, Math.min(0.8, 0.2 + 0.03 * e.scoreManager.combo));
    const distractors = e.problemGenerator.makeDistractors(this.problem, n - 1, closeness);

    const values = shuffle([
      { value: this.problem.answer, correct: true },
      ...distractors.map((v) => ({ value: v, correct: false })),
    ]);
    // 원 둘레에 균등 배치(위에서 시작)
    this.numbers = values.map((it, i) => ({ value: it.value, correct: it.correct, angle: (i / n) * Math.PI * 2 }));

    this.needle = Math.random() * Math.PI * 2; // 시작 위치 무작위
    this.totalRot = 0;
  },

  update(dt) {
    this.time += dt;

    // 피버 진입/종료 전이
    const fev = this.engine.fever;
    const active = !!(fev && fev.active);
    if (active && !this.wasFever) {
      this.engine.ui.flash('rgba(255,210,120,0.5)', 0.09);
      this.engine.ui.showComboText('🔥 FEVER!', true);
      if (fev.type === 'multi') this._enterMulti(); // 바늘 판정 끄고 배수 찾기로
    } else if (!active && this.wasFever) {
      this.feverBanner = { points: fev ? fev.pointsEarned : 0, t: 0, dur: 1.4 };
      this.engine.ui.flash('rgba(120,200,255,0.4)', 0.09);
      if (this.multiMode) this._exitMulti(); // 타이밍 판정 복귀
    }
    this.wasFever = active;
    if (this.feverBanner) {
      this.feverBanner.t += dt;
      if (this.feverBanner.t >= this.feverBanner.dur) this.feverBanner = null;
    }

    // 바늘 회전(피버 multi 중엔 판정에 관여 안 하고 시각 연출로만 돈다)
    const dθ = this._omega() * dt;
    this.needle = (this.needle + dθ) % (Math.PI * 2);
    if (!this.multiMode) {
      this.totalRot += dθ;
      // 3회전 초과 → 시간초과(라이프 -1 + 정답표시). multi에는 시간초과 개념 없음.
      if (this.totalRot >= MAX_ROT * Math.PI * 2) {
        this.engine.timeUp(this.problem, { loseLife: true, onResume: () => this._load() });
        return;
      }
    } else {
      for (const nm of this.numbers) if (nm.popT > 0) nm.popT = Math.max(0, nm.popT - dt);
    }

    if (this.zoomT > 0) this.zoomT = Math.max(0, this.zoomT - dt);
    for (let i = this.floats.length - 1; i >= 0; i--) {
      this.floats[i].t += dt;
      if (this.floats[i].t >= this.floats[i].dur) this.floats.splice(i, 1);
    }
    if (this.perfectRing) {
      this.perfectRing.t += dt;
      if (this.perfectRing.t >= this.perfectRing.dur) this.perfectRing = null;
    }
  },

  // 두 각의 최소 차이(도)
  _angDegDist(a, b) {
    let d = Math.abs(a - b) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    return (d * 180) / Math.PI;
  },

  onTouch(x, y, phase) {
    if (phase !== 'start') return; // 정밀형: 누르는 순간 판정
    if (!this.numbers.length) return;
    const e = this.engine;

    // 피버 multi: 바늘 무관, 탭 지점의 숫자를 배수 여부로 판정(연타). 함정 무해.
    if (this.multiMode) {
      let near = null;
      let best = Infinity;
      for (const nm of this.numbers) {
        const p = this._numPos(nm);
        const d = Math.hypot(x - p.x, y - p.y);
        if (d <= this.numR * 1.5 && d < best) {
          best = d;
          near = nm;
        }
      }
      if (near) this._judgeNum(near);
      return;
    }

    // 바늘에 가장 가까운 숫자 찾기
    let near = null;
    let best = Infinity;
    for (const nm of this.numbers) {
      const d = this._angDegDist(this.needle, nm.angle);
      if (d < best) {
        best = d;
        near = nm;
      }
    }
    const tol = e.fever && e.fever.active ? e.fever.hitScale : 1; // 피버 중 판정 창 확대

    if (near.correct) {
      // 정답 위 판정: 근접 각도로 PERFECT/GOOD/OK
      let band = null;
      if (best <= TOL.perfect * tol) band = 'perfect';
      else if (best <= TOL.good * tol) band = 'good';
      else if (best <= TOL.ok * tol) band = 'ok';
      if (!band) return; // 정답 근처지만 아직 창 밖(빈 구간) → 무판정

      const pos = this._numPos(near);
      const pts = SCORE[band];
      e.answerCorrect(this.problem, near.value, pts); // 점수2배·게이지·정답음 자동

      // 판정 문구 + 손맛
      const label = band === 'perfect' ? 'PERFECT' : band === 'good' ? 'GOOD' : 'OK';
      const col = band === 'perfect' ? THEME.gold : band === 'good' ? THEME.correct : THEME.accent;
      this.floats.push({ x: pos.x, y: pos.y, text: label, color: col, size: L.font(band === 'perfect' ? 0.05 : 0.04), t: 0, dur: 0.6 });
      e.particles.emit(pos.x, pos.y, 'explode', THEME.correct, band === 'perfect' ? 40 : 22);
      e.particles.emit(pos.x, pos.y, 'sparkle', THEME.gold, 12);
      e.ui.shake(band === 'perfect' ? 9 : 6, 0.1);
      this.zoomT = 0.06;

      if (band === 'perfect') {
        // 고유 재미: 원 전체가 링으로 퍼짐
        this.perfectRing = { t: 0, dur: 0.45 };
        // 니어미스 = PERFECT 판정 (SPEC): +40·게이지+5·큰 파티클
        e.reportNearMiss(pos.x, pos.y);
      }
      this._load(); // 멈춤 없이 다음 문제
    } else {
      // 바늘이 '오답 숫자' 위(창 안)일 때만 오답. 빈 구간이면 무판정.
      if (best <= TOL.ok * tol) {
        e.answerWrong(this.problem, near.value, { loseLife: true, onResume: () => this._load() });
      }
    }
  },

  _numPos(nm) {
    return { x: this.cx + this.ringR * Math.sin(nm.angle), y: this.cy - this.ringR * Math.cos(nm.angle) };
  },

  // ── 피버 multi: 바늘 무관 배수 찾기 ────────────────────────
  _enterMulti() {
    this.multiMode = true;
    this._buildRingMulti();
  },
  _exitMulti() {
    this.multiMode = false;
    this._load(); // 타이밍 판정 문제로 복귀(원 둘레 재구성)
  },
  _buildRingMulti() {
    const fv = this.engine.fever;
    const items = fv.fillValues(MULTI_RING); // 80% 배수 + 20% 함정
    this.numbers = items.map((it, i) => ({ value: it.value, isMultiple: it.isMultiple, angle: (i / MULTI_RING) * Math.PI * 2, popT: 0 }));
    this.totalRot = 0;
  },
  _refillNum(nm) {
    const fv = this.engine.fever;
    if (!fv || !fv.active || fv.type !== 'multi') return;
    const ratio = (fv.cfg && fv.cfg.multiMultipleRatio) || 0.8;
    const v = Math.random() < ratio ? fv.randomMultiple() : fv.randomTrap();
    nm.value = v;
    nm.isMultiple = fv.isMultiple(v);
    nm.popT = 0.15;
  },
  _judgeNum(nm) {
    const e = this.engine;
    const fv = e.fever;
    const dan = fv.dan;
    const pos = this._numPos(nm);
    if (fv.isMultiple(nm.value)) {
      const q = Math.round(nm.value / dan);
      const prob = { a: dan, b: q, op: '×', answer: nm.value, remainder: null, text: `${dan} × ${q}`, blank: null, level: 1 };
      e.answerCorrect(prob, nm.value, 60 + e.scoreManager.combo * 5); // 점수배수·게이지·정답음 자동(무적)
      this.floats.push({ x: pos.x, y: pos.y, text: 'NICE', color: THEME.correct, size: L.font(0.038), t: 0, dur: 0.5 });
      e.particles.emit(pos.x, pos.y, 'sparkle', THEME.gold, 12);
      e.particles.emit(pos.x, pos.y, 'pop', THEME.correct, 8);
      e.sound.play('pop');
    } else {
      const prob = { a: nm.value, b: dan, op: '÷', answer: Math.floor(nm.value / dan), remainder: nm.value % dan, text: `${nm.value} ÷ ${dan}`, blank: null, level: 1 };
      e.answerWrong(prob, nm.value, { affectLevel: false, freeze: false }); // 무해
      e.particles.emit(pos.x, pos.y, 'pop', THEME.wrong, 8);
    }
    this._refillNum(nm);
  },

  render(ctx) {
    const cx = this.cx;
    const cy = this.cy;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    this._drawFeverBg(ctx);
    if (this.engine.fever) {
      this.engine.fever.renderGauge(ctx, { x: L.safe, y: L.zone.gauge, w: L.W - L.safe * 2, h: L.gu(0.5) });
    }

    // 문제(≥80px) — 피버 multi 중엔 "N단!"
    if (this.multiMode && this.engine.fever && this.engine.fever.dan) {
      ctx.fillStyle = THEME.gold;
      ctx.font = font(L.font(0.08));
      ctx.fillText(`${this.engine.fever.dan}단!`, cx, L.zone.problem);
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.026), 'normal');
      ctx.fillText('배수를 아무거나 눌러! (바늘 무관)', cx, L.zone.problem + L.gu(1.6));
    } else {
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.07));
      const qText = this.problem.blank ? this.problem.text : `${this.problem.text} = ?`;
      ctx.fillText(qText, cx, L.zone.problem);
      if (this.problem.fromReview) {
        ctx.font = font(L.font(0.026));
        ctx.fillStyle = THEME.gold;
        ctx.fillText('🔁 다시 도전!', cx, L.zone.problem + L.gu(1.6));
      }
    }

    // 미세 확대(원 전체)
    const z = this.zoomT > 0 ? 1 + 0.01 * (this.zoomT / 0.06) : 1;
    ctx.save();
    if (z !== 1) {
      ctx.translate(cx, cy);
      ctx.scale(z, z);
      ctx.translate(-cx, -cy);
    }

    // 원판 테두리
    ctx.beginPath();
    ctx.arc(cx, cy, this.ringR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = L.gu(0.15);
    ctx.stroke();

    // PERFECT 퍼지는 링
    if (this.perfectRing) {
      const p = this.perfectRing.t / this.perfectRing.dur;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.beginPath();
      ctx.arc(cx, cy, this.ringR * (0.6 + 0.8 * p), 0, Math.PI * 2);
      ctx.strokeStyle = THEME.gold;
      ctx.lineWidth = L.gu(0.3) * (1 - p);
      ctx.stroke();
      ctx.restore();
    }

    // 바늘
    const nx = cx + this.ringR * Math.sin(this.needle);
    const ny = cy - this.ringR * Math.cos(this.needle);
    ctx.strokeStyle = THEME.gold;
    ctx.lineWidth = L.gu(0.22);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, L.gu(0.4), 0, Math.PI * 2);
    ctx.fillStyle = THEME.gold;
    ctx.fill();

    // 중앙: 남은 회전 수(무한 대기 방지 안내). 피버 multi 중엔 시간초과가 없어 숨긴다.
    if (!this.multiMode) {
      const remain = Math.max(0, MAX_ROT - Math.floor(this.totalRot / (Math.PI * 2)));
      ctx.fillStyle = THEME.subtext;
      ctx.font = font(L.font(0.03), 'normal');
      ctx.fillText(`${remain}바퀴`, cx, cy + L.gu(1.6));
    }

    // 숫자 원 (정답/오답·배수/함정 색 동일 — 정답 노출 금지)
    for (const nm of this.numbers) {
      const pos = this._numPos(nm);
      const s = nm.popT ? 1 + 0.18 * (nm.popT / 0.15) : 1; // 새 숫자 팝(multi)
      ctx.save();
      if (s !== 1) {
        ctx.translate(pos.x, pos.y);
        ctx.scale(s, s);
        ctx.translate(-pos.x, -pos.y);
      }
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, this.numR, 0, Math.PI * 2);
      ctx.fillStyle = THEME.accent;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = L.gu(0.1);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = font(L.font(0.042));
      ctx.fillText(String(nm.value), pos.x, pos.y);
      ctx.restore();
    }
    ctx.restore();

    // 판정 문구
    for (const f of this.floats) {
      const p = f.t / f.dur;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.fillStyle = f.color;
      ctx.font = font(f.size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.text, f.x, f.y - p * L.gu(2));
      ctx.restore();
    }

    this._drawFeverBanner(ctx);
  },

  onHover() {
    return false; // 탭 타이밍 게임 — 특정 요소 위 hover 개념 없음(항상 default 커서)
  },
  clearHover() {},
  onKey(e) {
    if (e.key === ' ' || e.key === 'Enter') this.onTouch(this.cx, this.cy, 'start'); // 데스크톱 확인용
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
    ctx.strokeText(`FEVER +${b.points}`, L.W / 2, L.H * 0.9);
    ctx.fillStyle = THEME.gold;
    ctx.fillText(`FEVER +${b.points}`, L.W / 2, L.H * 0.9);
    ctx.restore();
  },

  destroy() {
    this.engine = null;
    this.problem = null;
    this.numbers = [];
    this.floats = [];
    this.perfectRing = null;
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
