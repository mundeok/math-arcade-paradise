// g08_chain.js — 🔗 배수 체인 (SPEC §4 8️⃣ / Phase 3)
// 연쇄형. 떠다니는 숫자 버블 중 'N단의 배수'를 작은 수부터 순서대로 탭해 체인을 잇는다.
// 확정 인터페이스(SPEC §7)만 사용한다. core/scenes는 건드리지 않는다.
//
// 교육 목적: 배수 개념 ↔ 나눗셈(나누어떨어짐)을 연결한다.
//   - 곱셈 웨이브: "N단의 배수를 순서대로 이어라" (N×k=V 사실로 기록)
//   - 나눗셈 웨이브(교대): "N으로 나누어떨어지는 수를 찾아라" (V÷N=k 사실로 기록)
//   두 웨이브 모두 메커닉은 'N의 배수를 작은 수부터 순서대로 탭'으로 동일하고, 프레임/기록만 다르다.
//
// ⚠️ 이 게임은 '배수 목록'이 콘텐츠라 problemGenerator.nextProblem(a×b) 패턴에 맞지 않는다.
//    버블 숫자(배수·함정)는 게임이 생성하고, 각 정답 링크를 곱셈/나눗셈 '사실 객체'로 만들어
//    answerCorrect/answerWrong 에 넘긴다(세션·리포트·레벨조정은 core가 처리). core는 수정하지 않는다.
//
// 재미 표준(§2.6): fever:true, 니어미스(버블이 화면 밖 직전 탭), 정답 즉시 진행, L 헬퍼 좌표.
//   고유 재미(연쇄): 체인이 길어질수록 연결선이 굵어지고 빛난다.

import { L } from '../core/layout.js';
import { THEME, font } from '../core/ui.js';

const WAVE_GOAL = 6; // 웨이브당 이어야 할 배수 개수(N..6N)

export const g08Chain = {
  id: 'g08_chain',
  name: '배수 체인',
  emoji: '🔗',
  category: '연쇄형',
  maxLevel: 4,
  blankRatio: 0,
  opMode: 'mixed', // 곱셈·나눗셈 웨이브 교대(게임이 프레임 관리 — nextProblem은 쓰지 않음)
  fever: { type: 'easy' }, // easy=피버 중 쉬운 문제형 (§2.6/§7.6)
  // 체인 길이(=콤보) 문구. core 기본(5/10/20/30)을 이 콤보에서 덮어쓴다.
  comboMilestones: { 3: 'CHAIN!', 5: 'CHAIN×5!', 10: 'ULTIMATE CHAIN!' },

  get br() {
    return L.w(0.075);
  }, // 버블 반지름

  tutorial: {
    text: '4, 8, 12… 순서대로 눌러서 길게 이어봐!',
    draw(ctx) {
      const cx = L.W / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.04));
      ctx.fillText('4단의 배수를 순서대로!', cx, L.gu(1.3));

      // 4,8,12를 잇는 초록 체인 + 함정(14)
      const pts = [
        { x: cx - L.gu(5), y: L.gu(6), label: '4' },
        { x: cx - L.gu(1), y: L.gu(4.2), label: '8' },
        { x: cx + L.gu(3), y: L.gu(6.5), label: '12' },
      ];
      ctx.strokeStyle = THEME.correct;
      ctx.lineWidth = L.gu(0.3);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, L.gu(0.95), 0, Math.PI * 2);
        ctx.fillStyle = THEME.accent;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = font(L.font(0.03));
        ctx.fillText(p.label, p.x, p.y);
      }
      // 함정(14 — 4의 배수 아님)
      ctx.beginPath();
      ctx.arc(cx + L.gu(6), L.gu(3.6), L.gu(0.95), 0, Math.PI * 2);
      ctx.fillStyle = THEME.accent;
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = font(L.font(0.03));
      ctx.fillText('14', cx + L.gu(6), L.gu(3.6));
      ctx.font = font(L.font(0.04));
      ctx.fillText('👆', cx + L.gu(3), L.gu(7.9));
    },
  },

  init(engine) {
    this.engine = engine;
    this.bubbles = []; // [{value, isTarget, x, y, vx, vy}]
    this.D = 4;
    this.divWave = false;
    this.waveIndex = 0;
    this.nextIdx = 0; // 다음 기대 배수 인덱스(0→N, 1→2N …)
    this.chainPath = []; // 최근 탭 위치(연결선용)
    this.chainValues = []; // 이번 웨이브에서 이어온 값들(안내용)
    this.nearMissUsed = false;
    this.floats = [];
    this.zoomT = 0;
    this.time = 0;
    this.spawnAcc = 0;
    this.wasFever = false;
    this.feverBanner = null;
    this._startWave();
  },

  _playRect() {
    return { x0: L.safe + this.br, x1: L.W - L.safe - this.br, y0: L.zone.playTop + L.gu(4), y1: L.zone.floor };
  },

  // 버블 이동 속도(px/s): 콤보 + 피버 배속.
  _bubbleSpeed() {
    const e = this.engine;
    let s = L.gu(2) + L.gu(0.06) * e.scoreManager.combo; // 약 80 → …
    s = Math.min(s, L.gu(5));
    if (e.fever) s *= e.fever.speedMultiplier;
    return s * (e.settings.timeScale ? 1 / e.settings.timeScale : 1); // 배율↑=느리게(다른 게임과 방향 통일)
  },

  _bubbleCount() {
    return Math.min(8, 5 + Math.floor(this.engine.scoreManager.combo / 8));
  },

  // 피버 easy 유형이 지금 발동 중인가(core는 자체 생성 게임엔 문제 하향을 못 주므로 게임이 직접 읽는다).
  _feverEasyActive() {
    const f = this.engine.fever;
    return !!(f && f.active && f.type === 'easy');
  },

  _activeDans() {
    const s = this.engine.settings;
    let dans = s.dans && s.dans.length ? s.dans.slice() : [2, 3, 4, 5, 6, 7, 8, 9];
    if (this._feverEasyActive()) {
      // 피버 easy: 2~5단으로 제한(쉬운 단). 함정(2단=홀수 등)도 여전히 의미 있다.
      dans = dans.filter((d) => d >= 2 && d <= 5);
      if (!dans.length) dans = [2, 3, 4, 5];
    } else {
      dans = dans.filter((d) => d >= 3 && d <= 9); // 함정이 의미 있으려면 3단 이상
      if (!dans.length) dans = [3, 4, 6, 7, 8];
    }
    return dans;
  },

  _startWave() {
    const dans = this._activeDans();
    this.D = dans[Math.floor(Math.random() * dans.length)];
    // 프레임: 기본은 웨이브마다 곱셈/나눗셈 교대. 단, 교사 설정이 특정 연산이면 그것으로 고정(교사 우선).
    const op = this.engine.settings.operation || 'mixed';
    this.divWave = op === 'divide' ? true : op === 'multiply' ? false : this.waveIndex % 2 === 1;
    this.nextIdx = 0;
    this.chainValues = [];
    this.chainPath = [];
    this.nearMissUsed = false;
    this.bubbles = [];
    // 초기 버블: 다음 기대값 보장 + 나머지 채우기
    this._refill();
  },

  _nextValue() {
    return (this.nextIdx + 1) * this.D;
  },

  _trapValue() {
    for (let g = 0; g < 20; g++) {
      const k = 1 + Math.floor(Math.random() * WAVE_GOAL);
      const off = (1 + Math.floor(Math.random() * 3)) * (Math.random() < 0.5 ? -1 : 1);
      const v = k * this.D + off;
      if (v > 0 && v % this.D !== 0) return v;
    }
    return this.D + 1;
  },

  _spawnBubble(value, isTarget) {
    const R = this._playRect();
    const speed = this._bubbleSpeed();
    const edge = Math.floor(Math.random() * 4);
    let x, y, vx, vy;
    const cross = (Math.random() - 0.5) * speed * 0.6;
    if (edge === 0) {
      x = R.x0;
      y = rand(R.y0, R.y1);
      vx = speed;
      vy = cross;
    } else if (edge === 1) {
      x = R.x1;
      y = rand(R.y0, R.y1);
      vx = -speed;
      vy = cross;
    } else if (edge === 2) {
      x = rand(R.x0, R.x1);
      y = R.y0;
      vx = cross;
      vy = speed;
    } else {
      x = rand(R.x0, R.x1);
      y = R.y1;
      vx = cross;
      vy = -speed;
    }
    this.bubbles.push({ value, isTarget, x, y, vx, vy });
  },

  // 화면에 없는 유일한 함정값(비배수) 하나. 없으면 null.
  _uniqueTrap(existing) {
    for (let g = 0; g < 40; g++) {
      const v = this._trapValue();
      if (!existing.has(v)) return v;
    }
    return null;
  },
  // 화면에 없는 유일한 배수값 하나. 없으면 null.
  _uniqueMultiple(existing) {
    const opts = [];
    for (let k = 1; k <= WAVE_GOAL; k++) {
      const v = k * this.D;
      if (!existing.has(v)) opts.push(v);
    }
    return opts.length ? opts[Math.floor(Math.random() * opts.length)] : null;
  },

  // 다음 기대값을 항상 화면에 유지(소프트락 방지) + 목표 수만큼 채운다.
  //   ⚠️ 같은 값 중복 금지(#2) + 함정 비율 최소 40% 유지(#3, 순서 맞추기 게임 방지).
  _refill() {
    const existing = new Set(this.bubbles.map((b) => b.value));
    const nextV = this._nextValue();
    if (this.nextIdx < WAVE_GOAL && !existing.has(nextV)) {
      this._spawnBubble(nextV, true);
      existing.add(nextV);
    }
    const want = this._bubbleCount();
    const trapTarget = this._feverEasyActive() ? 0.25 : 0.4; // 피버 easy: 함정 비율 40%→25%로 낮춤
    let guard = 0;
    while (this.bubbles.length < want && guard < 60) {
      guard++;
      const traps = this.bubbles.filter((b) => !b.isTarget).length;
      const wantTrap = traps / Math.max(1, this.bubbles.length) < trapTarget;
      let value = null;
      let isTarget = false;
      if (wantTrap) {
        value = this._uniqueTrap(existing);
        isTarget = false;
      }
      if (value == null) {
        value = this._uniqueMultiple(existing); // 함정이 부족/불가면 배수로
        isTarget = true;
        if (value == null) {
          value = this._uniqueTrap(existing);
          isTarget = false;
        }
      }
      if (value == null) break; // 더 뽑을 유일값 없음(버블 수 부족해도 안전)
      this._spawnBubble(value, isTarget);
      existing.add(value);
    }
  },

  // 텍스트를 안전 여백 폭 안에 들어오도록 자동 축소해 그린다(넘치면 폭에 맞춰 줄임, minRatio 하한).
  _drawFit(ctx, text, cx, y, baseRatio, minRatio, weight) {
    const maxW = L.W - L.safe * 2;
    let size = L.font(baseRatio);
    ctx.font = font(size, weight);
    const w = ctx.measureText(text).width;
    if (w > maxW) size = Math.max(L.font(minRatio), (size * maxW) / w);
    ctx.font = font(size, weight);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, y);
  },

  update(dt) {
    this.time += dt;

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
    if (this.feverBanner) {
      this.feverBanner.t += dt;
      if (this.feverBanner.t >= this.feverBanner.dur) this.feverBanner = null;
    }

    // 버블 이동
    for (const b of this.bubbles) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    // 화면 밖으로 완전히 나간 버블 제거
    const R = this._playRect();
    const m = this.br * 2.2;
    this.bubbles = this.bubbles.filter((b) => b.x > R.x0 - m && b.x < R.x1 + m && b.y > R.y0 - m && b.y < R.y1 + m);
    this._refill();

    if (this.zoomT > 0) this.zoomT = Math.max(0, this.zoomT - dt);
    for (let i = this.floats.length - 1; i >= 0; i--) {
      this.floats[i].t += dt;
      if (this.floats[i].t >= this.floats[i].dur) this.floats.splice(i, 1);
    }
  },

  // 정답/오답 링크의 '사실 객체'
  _fact(k, V) {
    if (this.divWave) return { a: V, b: this.D, op: '÷', answer: k, text: `${V} ÷ ${this.D}`, blank: null, remainder: null, level: 1 };
    return { a: this.D, b: k, op: '×', answer: V, text: `${this.D} × ${k}`, blank: null, remainder: null, level: 1 };
  },

  onTouch(x, y, phase) {
    if (phase !== 'start') return;
    if (!this.bubbles.length) return;
    const e = this.engine;

    // 탭 지점의 버블(가장 가까운, 반경 안)
    let target = null;
    let best = Infinity;
    for (const b of this.bubbles) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d <= this.br && d < best) {
        best = d;
        target = b;
      }
    }
    if (!target) return; // 빈 공간 탭 → 무판정

    const nextV = this._nextValue();
    if (target.value === nextV) {
      // 정답 링크: 순서 맞음
      const k = this.nextIdx + 1;
      const fact = this._fact(k, nextV);

      // 니어미스: 화면 가장자리 직전 버블을 잡음 (웨이브당 1회)
      const R = this._playRect();
      const mg = this.br * 1.6;
      const nearEdge = target.x < R.x0 + mg || target.x > R.x1 - mg || target.y < R.y0 + mg || target.y > R.y1 - mg;
      const nearMiss = !this.nearMissUsed && nearEdge;

      // 점수: 링크 기본 30(체인 10+면 3배). 콤보 3/5 도달 시 보너스 +80/+200(피버 배수).
      const linkPts = 30 * (e.scoreManager.combo >= 9 ? 3 : 1);
      e.answerCorrect(fact, nextV, linkPts); // 점수2배·게이지·정답음·콤보문구(CHAIN!) 자동
      const combo = e.scoreManager.combo;
      const fmult = e.fever && e.fever.active ? e.fever.scoreMultiplier : 1;
      if (combo === 3) {
        e.scoreManager.addPoints(Math.round(80 * fmult));
        if (e.fever) e.fever.addPoints(Math.round(80 * fmult));
      } else if (combo === 5) {
        e.scoreManager.addPoints(Math.round(200 * fmult));
        if (e.fever) e.fever.addPoints(Math.round(200 * fmult));
      }

      // 체인 시각/진행
      this.chainPath.push({ x: target.x, y: target.y });
      if (this.chainPath.length > 10) this.chainPath.shift();
      this.chainValues.push(nextV);
      this.nextIdx += 1;

      // 손맛
      this.floats.push({ x: target.x, y: target.y, text: `+${linkPts}`, color: THEME.correct, size: L.font(0.036), t: 0, dur: 0.55 });
      e.particles.emit(target.x, target.y, 'sparkle', THEME.correct, 14 + Math.min(20, combo));
      e.particles.emit(target.x, target.y, 'pop', THEME.gold, 8);
      e.ui.shake(6, 0.09);
      this.zoomT = 0.06;
      if (nearMiss) {
        this.nearMissUsed = true;
        e.reportNearMiss(target.x, target.y);
      }

      // 탭한 버블 제거
      this.bubbles = this.bubbles.filter((b) => b !== target);

      // 웨이브 완성?
      if (this.nextIdx >= WAVE_GOAL) {
        e.ui.showComboText('다음 단!', false);
        e.ui.flash('rgba(255,220,140,0.35)', 0.1);
        e.particles.emit(L.W / 2, L.y(0.5), 'sparkle', THEME.gold, 20);
        this.waveIndex += 1;
        this._startWave(); // 체인(=콤보)은 유지, 새 단으로
      } else {
        this._refill();
      }
    } else {
      // 함정 or 순서 건너뜀 → 체인 끊김 + 라이프 -1 + 정답표시(다음 기대값 사실)
      const expected = this._fact(this.nextIdx + 1, nextV);
      this.bubbles = this.bubbles.filter((b) => b !== target);
      this.chainPath = [];
      this.chainValues = [];
      e.answerWrong(expected, target.value, { loseLife: true, onResume: () => this._refill() });
    }
  },

  render(ctx) {
    const cx = L.W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    this._drawFeverBg(ctx);
    if (this.engine.fever) {
      this.engine.fever.renderGauge(ctx, { x: L.safe, y: L.zone.gauge, w: L.W - L.safe * 2, h: L.gu(0.5) });
    }

    // 지시문 — 안전 여백 안에 반드시 들어오도록 자동 축소(넘치면 폭에 맞춰 줄임)
    ctx.fillStyle = THEME.text;
    const title = this.divWave ? `${this.D}로 나누어떨어지는 수!` : `${this.D}단 배수를 순서대로!`;
    this._drawFit(ctx, title, cx, L.zone.problem, 0.052, 0.036, 'bold');

    // 이어온 체인 값 안내(다음 수는 알려주지 않음 — 스스로 계산). 이것도 폭에 맞춰 축소.
    ctx.fillStyle = THEME.subtext;
    const seq = this.chainValues.length ? this.chainValues.join(' → ') + ' → ?' : '가장 작은 배수부터!';
    this._drawFit(ctx, seq, cx, L.zone.problem + L.gu(1.7), 0.03, 0.02, 'normal');

    // 체인 연결선(길수록 굵고 빛남)
    if (this.chainPath.length >= 2) {
      const combo = this.engine.scoreManager.combo;
      ctx.save();
      ctx.strokeStyle = THEME.correct;
      ctx.lineWidth = L.gu(0.15) + Math.min(L.gu(0.5), combo * L.gu(0.03));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = THEME.gold;
      ctx.shadowBlur = Math.min(L.gu(1.2), combo * L.gu(0.12));
      ctx.beginPath();
      ctx.moveTo(this.chainPath[0].x, this.chainPath[0].y);
      for (let i = 1; i < this.chainPath.length; i++) ctx.lineTo(this.chainPath[i].x, this.chainPath[i].y);
      ctx.stroke();
      ctx.restore();
    }

    // 버블 (배수/함정 색 동일 — 스스로 판단, 정답 노출 금지)
    const z = this.zoomT > 0 ? 1 + 0.01 * (this.zoomT / 0.06) : 1;
    for (const b of this.bubbles) {
      ctx.save();
      if (z !== 1) {
        ctx.translate(b.x, b.y);
        ctx.scale(z, z);
        ctx.translate(-b.x, -b.y);
      }
      ctx.beginPath();
      ctx.arc(b.x, b.y, this.br, 0, Math.PI * 2);
      ctx.fillStyle = THEME.accent;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = L.gu(0.1);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = font(L.font(0.045));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(b.value), b.x, b.y);
      ctx.restore();
    }

    // 판정 문구
    for (const f of this.floats) {
      const p = f.t / f.dur;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.fillStyle = f.color;
      ctx.font = font(f.size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.text, f.x, f.y - p * L.gu(1.8));
      ctx.restore();
    }

    this._drawFeverBanner(ctx);
  },

  onHover(x, y) {
    for (const b of this.bubbles) {
      if (Math.hypot(x - b.x, y - b.y) <= this.br) return true;
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
    ctx.strokeText(`FEVER +${b.points}`, L.W / 2, L.H * 0.92);
    ctx.fillStyle = THEME.gold;
    ctx.fillText(`FEVER +${b.points}`, L.W / 2, L.H * 0.92);
    ctx.restore();
  },

  destroy() {
    this.engine = null;
    this.bubbles = [];
    this.chainPath = [];
    this.chainValues = [];
    this.floats = [];
    this.feverBanner = null;
  },
};

function rand(a, b) {
  return a + Math.random() * (b - a);
}
