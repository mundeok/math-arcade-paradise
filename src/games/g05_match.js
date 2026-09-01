// g05_match.js — 🧩 숫자 매칭 (SPEC §4 5️⃣ / Phase 4)
// 전략형. 좌측 문제 카드 ↔ 우측 답 카드를 짝짓는다.
// 확정 인터페이스(SPEC §7)만 사용한다. core/scenes는 절대 건드리지 않는다.
//
// ⚠️ 조작은 드래그가 아니라 탭-탭 방식(태블릿 오조작·스크롤 충돌 방지, SPEC §4 5️⃣):
//   - 카드 탭 → 선택 상태(테두리 강조) → 반대편 카드 탭 → 연결선 그려지며 판정.
//   - 선택 상태에서 같은 카드 재탭 = 선택 해제. 같은 열의 다른 카드 탭 = 선택 이동.
//
// 웨이브(SPEC §4 5️⃣): 3vs3 → 4vs5(함정1) → 5vs6(함정2) → 6vs7(함정1)+30초 제한.
//   ⚠️ '함정N'은 함정(오답 카드) 난이도 티어로 해석한다(답 카드 수는 vs 숫자가 고정).
//      티어2는 더 근접한(헷갈리는) 오답을 쓴다. 함정 카드 수 = (답 카드 수 − 문제 수).
//   ⚠️ 제한시간 웨이브에서는 출제 레벨을 4 이하로 낮춘다(30초 안에 세 자리 곱셈은 3학년에게 무리).
//   웨이브 4 이후는 마지막 구성(6vs7+30초)을 반복한다(무한 진행).
//
// 점수: 정답 매칭 50 + 콤보×5, 5연속(콤보 5의 배수) CHAIN! 점수 2배, 웨이브 완료 +200.
//   오답 매칭: 라이프 -1 + 정답표시 1.2초. 제한시간 초과: 라이프 -1 + 웨이브 재시작.
//
// 재미 표준(§2.6): fever:true, 니어미스(제한시간 웨이브를 5초 이내 남기고 완료), 정답 즉시 진행,
//   손맛, L 헬퍼 좌표. 고유 재미(연결과 정리): 정답 연결선이 무지개로 흐르며 사라지고,
//   웨이브 완료 시 남은 카드가 스파클로 정리된다.

import { L } from '../core/layout.js';
import { THEME, font, roundRect } from '../core/ui.js';

// 웨이브 구성: probs=문제 수, answers=답 카드 수, trapTier=함정 근접도 티어, timeLimit=제한(초,0=무제한)
const WAVES = [
  { probs: 3, answers: 3, trapTier: 0, timeLimit: 0 },
  { probs: 4, answers: 5, trapTier: 1, timeLimit: 0 },
  { probs: 5, answers: 6, trapTier: 2, timeLimit: 0 },
  { probs: 6, answers: 7, trapTier: 1, timeLimit: 30 },
];

const LINK_DUR = 0.55; // 무지개 연결선 지속(파티클 상한 내)
const FLOAT_DUR = 0.6;
const FLASH_DUR = 0.08;
const SHAKE_TIME = 0.1;
const NEARMISS_TIME = 5; // 제한시간 웨이브를 5초 이내 남기고 완료 → 니어미스

export const g05Match = {
  id: 'g05_match',
  name: '숫자 매칭',
  emoji: '🧩',
  category: '전략형',
  maxLevel: 5, // 출제 상한 Lv5 (SPEC 2.1 사고형)
  blankRatio: 0.4, // 사고형(□ 혼합)
  opMode: 'mixed', // 곱셈·나눗셈·빈칸 혼합(교사 설정이 특정 연산이면 교사 우선)
  comboMilestones: { 5: 'CHAIN!', 10: '완벽한 연결!', 20: '매칭 마스터!', 30: '전설의 짝!' },
  fever: { type: 'easy' }, // easy=피버 중 쉬운 문제형 (§2.6/§7.6)

  tutorial: {
    text: '문제를 누르고, 맞는 답을 눌러서 짝을 지어줘!',
    draw(ctx) {
      const midY = L.gu(5);
      const lw = L.gu(4.2);
      const lh = L.gu(1.7);
      const lx = L.W / 2 - L.gu(6);
      const rx = L.W / 2 + L.gu(6) - lw;
      // 무지개 연결선
      const grad = ctx.createLinearGradient(lx + lw, midY, rx, midY);
      grad.addColorStop(0, '#ff5d73');
      grad.addColorStop(0.5, '#ffd54a');
      grad.addColorStop(1, '#2ec16b');
      ctx.strokeStyle = grad;
      ctx.lineWidth = L.gu(0.3);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(lx + lw, midY + lh / 2);
      ctx.lineTo(rx, midY + lh / 2);
      ctx.stroke();
      // 카드
      drawTutorialCard(ctx, lx, midY, lw, lh, '4 × 6', THEME.panel);
      drawTutorialCard(ctx, rx, midY, lw, lh, '24', THEME.accent);
      ctx.fillStyle = THEME.subtext;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = font(L.font(0.032));
      ctx.fillText('문제 탭 → 답 탭', L.W / 2, midY + lh + L.gu(1.4));
      ctx.font = font(L.font(0.05));
      ctx.fillText('👆', L.W / 2, midY + lh + L.gu(3));
    },
  },

  init(engine) {
    this.engine = engine;
    this.waveIndex = 0;
    this.left = []; // 문제 카드 [{problem, value, rect, matched}]
    this.right = []; // 답 카드 [{value, isTrap, matchProblem, rect, matched}]
    this.selected = null; // 현재 선택된 카드(양쪽 어느 열이든)
    this.links = []; // 무지개 연결선 [{ax,ay,bx,by,t,dur}]
    this.floatTexts = [];
    this.timeLeft = 0; // 제한시간 남은 초(0=무제한)
    this.timeLimit = 0;
    this.nearMissUsed = false;
    this.wasFever = false;
    this.feverBanner = null;
    this.time = 0;
    this._startWave();
  },

  _wave() {
    return WAVES[Math.min(this.waveIndex, WAVES.length - 1)];
  },

  // 제한시간 웨이브는 세 자리 곱셈을 피하려 레벨 상한을 4로 낮춘다(3학년 배려, SPEC 지시).
  _effMaxLevel(wave) {
    return wave.timeLimit > 0 ? Math.min(4, this.maxLevel) : this.maxLevel;
  },

  _startWave() {
    const e = this.engine;
    const wave = this._wave();
    const eff = this._effMaxLevel(wave);

    // 1) 문제 카드: 답(정답값)이 서로 겹치지 않도록 생성(같은 답 두 개면 매칭이 모호해짐).
    const problems = [];
    const usedAnswers = new Set();
    let guard = 0;
    while (problems.length < wave.probs && guard < 200) {
      guard++;
      const p = e.problemGenerator.nextProblem({ maxLevel: eff, blankRatio: this.blankRatio, opMode: this.opMode });
      if (usedAnswers.has(p.answer)) continue;
      usedAnswers.add(p.answer);
      problems.push(p);
    }

    // 2) 함정(오답) 값: 어떤 문제의 답과도 겹치지 않는 근접 오답. 티어↑ → 더 근접.
    const trapCount = Math.max(0, wave.answers - wave.probs);
    const closeness = wave.trapTier >= 2 ? 0.85 : wave.trapTier >= 1 ? 0.5 : 0.4;
    const traps = [];
    const usedTrap = new Set();
    guard = 0;
    while (traps.length < trapCount && guard < 300) {
      guard++;
      const src = problems[Math.floor(Math.random() * problems.length)];
      const cand = e.problemGenerator.makeDistractors(src, 1, closeness)[0];
      if (cand == null || usedAnswers.has(cand) || usedTrap.has(cand)) continue;
      usedTrap.add(cand);
      traps.push(cand);
    }
    // 후보가 부족하면 임의 근접값으로 채운다(자릿수 무시 — 함정은 헷갈리기만 하면 됨)
    guard = 0;
    while (traps.length < trapCount && guard < 300) {
      guard++;
      const src = problems[Math.floor(Math.random() * problems.length)];
      const v = src.answer + (Math.floor(Math.random() * 9) + 1) * (Math.random() < 0.5 ? -1 : 1);
      if (v > 0 && !usedAnswers.has(v) && !usedTrap.has(v)) {
        usedTrap.add(v);
        traps.push(v);
      }
    }

    // 3) 카드 구성
    this.left = problems.map((p) => ({ problem: p, value: p.answer, matched: false, rect: null }));
    const answerCards = [
      ...problems.map((p) => ({ value: p.answer, isTrap: false, matched: false, rect: null })),
      ...traps.map((v) => ({ value: v, isTrap: true, matched: false, rect: null })),
    ];
    this.right = shuffle(answerCards);

    this._layout();

    this.selected = null;
    this.nearMissUsed = false;
    this.timeLimit = wave.timeLimit > 0 ? wave.timeLimit * (e.settings.timeScale || 1) : 0;
    this.timeLeft = this.timeLimit;
  },

  // 두 열을 세로로 분배 배치(웨이브 동안 위치 고정 — 매칭 대상이 흔들리지 않게).
  _layout() {
    const topY = L.y(0.27);
    const botY = L.zone.floor;
    const avail = botY - topY;
    const cardW = L.w(0.4);
    const leftX = L.safe;
    const rightX = L.W - L.safe - cardW;
    this._placeColumn(this.left, leftX, cardW, topY, avail);
    this._placeColumn(this.right, rightX, cardW, topY, avail);
  },

  _placeColumn(cards, x, w, topY, avail) {
    const K = cards.length;
    const gap = L.gu(0.4);
    const cardH = Math.min(L.gu(3), (avail - (K - 1) * gap) / K);
    const totalH = K * cardH + (K - 1) * gap;
    const startY = topY + (avail - totalH) / 2;
    cards.forEach((c, i) => {
      c.rect = { x, y: startY + i * (cardH + gap), w, h: cardH };
    });
  },

  _side(card) {
    return this.left.includes(card) ? 'left' : 'right';
  },

  update(dt) {
    this.time += dt;

    // 피버 진입/종료 전이(연출만)
    const fev = this.engine.fever;
    const active = !!(fev && fev.active);
    if (active && !this.wasFever) {
      this.engine.ui.flash('rgba(255,210,120,0.5)', FLASH_DUR);
      this.engine.ui.showComboText('🔥 FEVER!', true);
    } else if (!active && this.wasFever) {
      this.feverBanner = { points: fev ? fev.pointsEarned : 0, t: 0, dur: 1.4 };
      this.engine.ui.flash('rgba(120,200,255,0.4)', FLASH_DUR);
    }
    this.wasFever = active;

    // 제한시간(정지 중엔 update가 안 불리므로 자연히 멈춘다)
    if (this.timeLimit > 0) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this._onTimeout();
        return;
      }
    }

    for (let i = this.links.length - 1; i >= 0; i--) {
      this.links[i].t += dt;
      if (this.links[i].t >= this.links[i].dur) this.links.splice(i, 1);
    }
    for (let i = this.floatTexts.length - 1; i >= 0; i--) {
      this.floatTexts[i].t += dt;
      if (this.floatTexts[i].t >= this.floatTexts[i].dur) this.floatTexts.splice(i, 1);
    }
    if (this.feverBanner) {
      this.feverBanner.t += dt;
      if (this.feverBanner.t >= this.feverBanner.dur) this.feverBanner = null;
    }
  },

  _onTimeout() {
    // 남은 문제 하나로 정답표시(식 전체) 후 같은 웨이브를 새 타이머로 재시작. 콤보 리셋.
    const remain = this.left.find((c) => !c.matched);
    const prob = remain ? remain.problem : (this.left[0] && this.left[0].problem);
    this.engine.timeUp(prob, { loseLife: true, onResume: () => this._startWave() });
  },

  onTouch(x, y, phase) {
    if (phase !== 'start') return;
    const card = this._cardAt(x, y);
    if (!card || card.matched) return;

    // 같은 카드 재탭 → 선택 해제
    if (this.selected === card) {
      this.selected = null;
      return;
    }
    // 선택이 없거나 같은 열을 탭 → 선택(이동)
    if (!this.selected || this._side(this.selected) === this._side(card)) {
      this.selected = card;
      this.engine.sound.play('tick');
      return;
    }
    // 반대편 카드 탭 → 판정
    const leftCard = this._side(this.selected) === 'left' ? this.selected : card;
    const rightCard = this._side(this.selected) === 'right' ? this.selected : card;
    this.selected = null;
    this._judge(leftCard, rightCard);
  },

  _cardAt(x, y) {
    for (const c of this.left) if (!c.matched && hitRect(c.rect, x, y)) return c;
    for (const c of this.right) if (!c.matched && hitRect(c.rect, x, y)) return c;
    return null;
  },

  _judge(leftCard, rightCard) {
    const e = this.engine;
    const problem = leftCard.problem;
    if (rightCard.value === leftCard.value) {
      // ── 정답 매칭 ──
      const combo = e.scoreManager.combo;
      const newCombo = combo + 1;
      let pts = 50 + combo * 5;
      if (newCombo % 5 === 0) pts *= 2; // CHAIN! 점수 2배(5연속)
      e.answerCorrect(problem, rightCard.value, pts); // 점수2배·게이지·정답음·콤보문구 자동
      const shown = pts * (e.fever && e.fever.active ? e.fever.scoreMultiplier : 1);

      leftCard.matched = true;
      rightCard.matched = true;

      // 무지개 연결선 + 손맛
      const a = rectCenter(leftCard.rect);
      const b = rectCenter(rightCard.rect);
      this.links.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, t: 0, dur: LINK_DUR });
      this.floatTexts.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, text: `+${shown}`, color: e.fever && e.fever.active ? THEME.gold : THEME.correct, size: L.font(0.038), t: 0, dur: FLOAT_DUR });
      e.particles.emit(b.x, b.y, 'sparkle', THEME.correct, 14);
      e.particles.emit(a.x, a.y, 'pop', THEME.gold, 8);
      e.ui.shake(6, SHAKE_TIME);
      this._haptic(15);

      // 웨이브 완료?
      if (this.left.every((c) => c.matched)) this._clearWave();
    } else {
      // ── 오답 매칭 → 라이프 -1 + 정답표시 1.2초 ──
      e.ui.shake(14, SHAKE_TIME);
      e.answerWrong(problem, rightCard.value, { loseLife: true, onResume: () => {} });
    }
  },

  _clearWave() {
    const e = this.engine;
    const wave = this._wave();
    const fmult = e.fever && e.fever.active ? e.fever.scoreMultiplier : 1;

    // 니어미스: 제한시간 웨이브를 5초 이내 남기고 완료(아슬아슬하게 정리)
    if (wave.timeLimit > 0 && this.timeLeft > 0 && this.timeLeft <= NEARMISS_TIME && !this.nearMissUsed) {
      this.nearMissUsed = true;
      e.reportNearMiss(L.W / 2, L.y(0.5));
    }

    // 웨이브 완료 +200 (콤보 판정 아님 → addPoints)
    const bonus = Math.round(200 * fmult);
    e.scoreManager.addPoints(bonus);
    if (e.fever) e.fever.addPoints(bonus);

    // '정리' 연출: 남은(함정 포함) 카드 위치에 스파클 + 밝은 플래시
    for (const c of [...this.left, ...this.right]) {
      if (c.rect) e.particles.emit(c.rect.x + c.rect.w / 2, c.rect.y + c.rect.h / 2, 'sparkle', THEME.gold, 6);
    }
    e.particles.emit(L.W / 2, L.y(0.5), 'explode', THEME.gold, 24);
    e.ui.flash('rgba(255,220,140,0.35)', 0.1);
    e.ui.showComboText(`정리 완료! +${bonus}`, false);

    this.waveIndex += 1;
    this._startWave();
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
      this.engine.fever.renderGauge(ctx, { x: L.safe, y: L.zone.gauge, w: L.W - L.safe * 2, h: L.gu(0.5) });
    }

    const cx = L.W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 지시문 + 웨이브/타이머
    const wave = this._wave();
    ctx.fillStyle = THEME.text;
    ctx.font = font(L.font(0.04));
    ctx.fillText('짝을 지어 정리하자!', cx, L.zone.problem - L.gu(0.6));
    ctx.font = font(L.font(0.028), 'normal');
    ctx.fillStyle = THEME.subtext;
    ctx.fillText(`웨이브 ${this.waveIndex + 1}`, cx, L.zone.problem + L.gu(0.9));
    if (this.timeLimit > 0) this._drawTimer(ctx);

    // 무지개 연결선(정답 매칭 — 흐르며 사라짐)
    for (const link of this.links) this._drawLink(ctx, link);

    // 카드
    for (const c of this.left) this._drawCard(ctx, c, 'left');
    for (const c of this.right) this._drawCard(ctx, c, 'right');

    // 부양 점수
    for (const t of this.floatTexts) {
      const prog = t.t / t.dur;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog);
      ctx.fillStyle = t.color;
      ctx.font = font(t.size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.text, t.x, t.y - prog * L.gu(2));
      ctx.restore();
    }

    this._drawFeverBanner(ctx);
  },

  _drawTimer(ctx) {
    const w = L.w(0.5);
    const h = L.gu(0.6);
    const x = L.W / 2 - w / 2;
    const y = L.zone.problem + L.gu(1.7);
    const ratio = this.timeLimit > 0 ? Math.max(0, this.timeLeft / this.timeLimit) : 0;
    ctx.save();
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
    // 남은 시간이 적으면 색으로 + 아이콘으로 경고(색만 의존 금지)
    const low = this.timeLeft <= NEARMISS_TIME;
    if (ratio > 0) {
      roundRect(ctx, x, y, w * ratio, h, h / 2);
      ctx.fillStyle = low ? THEME.wrong : THEME.accent;
      ctx.fill();
    }
    ctx.fillStyle = THEME.text;
    ctx.font = font(Math.round(h * 0.9), 'normal');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${low ? '⏳ ' : ''}${Math.ceil(this.timeLeft)}초`, L.W / 2, y + h / 2);
    ctx.restore();
  },

  _drawCard(ctx, c, side) {
    if (c.matched) return;
    const r = c.rect;
    const isSel = this.selected === c;
    ctx.save();
    if (isSel) {
      // 선택 상태: 살짝 확대 + 굵은 골드 테두리(모양 변화로도 구분)
      const s = 1.04;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);
    }
    roundRect(ctx, r.x, r.y, r.w, r.h, L.gu(0.4));
    ctx.fillStyle = side === 'left' ? THEME.panel : THEME.accent;
    ctx.fill();
    ctx.strokeStyle = isSel ? THEME.gold : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = isSel ? L.gu(0.28) : L.gu(0.08);
    ctx.stroke();

    // 텍스트(카드 폭에 맞춰 자동 축소)
    const label = side === 'left' ? c.problem.text : String(c.value);
    ctx.fillStyle = '#fff';
    fitText(ctx, label, r.x + r.w / 2, r.y + r.h / 2, r.w - L.gu(1), L.font(0.042), L.font(0.024));

    // 복습 문제 표시(좌측)
    if (side === 'left' && c.problem.fromReview) {
      ctx.fillStyle = THEME.gold;
      ctx.font = font(L.font(0.02), 'normal');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔁', r.x + r.w - L.gu(0.6), r.y + L.gu(0.5));
    }
    ctx.restore();
  },

  // 무지개 연결선: 위치별 색상 회전 + 시간에 따라 흐르고 사라짐.
  _drawLink(ctx, link) {
    const prog = link.t / link.dur;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - prog);
    const grad = ctx.createLinearGradient(link.ax, link.ay, link.bx, link.by);
    const shift = link.t * 2; // 흐르는 느낌
    for (let i = 0; i <= 4; i++) {
      const hue = (((i / 4 + shift) % 1) * 360) | 0;
      grad.addColorStop(i / 4, `hsl(${hue},85%,60%)`);
    }
    ctx.strokeStyle = grad;
    ctx.lineWidth = L.gu(0.3) * (1 - prog * 0.4);
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(255,255,255,0.5)';
    ctx.shadowBlur = L.gu(0.6);
    ctx.beginPath();
    ctx.moveTo(link.ax, link.ay);
    ctx.lineTo(link.bx, link.by);
    ctx.stroke();
    ctx.restore();
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

  onHover(x, y) {
    return !!this._cardAt(x, y);
  },
  clearHover() {},
  onKey() {},

  destroy() {
    this.engine = null;
    this.left = [];
    this.right = [];
    this.selected = null;
    this.links = [];
    this.floatTexts = [];
    this.feverBanner = null;
  },
};

// ── 헬퍼(모듈 로컬 — core 미수정) ────────────────────────────
function drawTutorialCard(ctx, x, y, w, h, label, color) {
  roundRectPath(ctx, x, y, w, h, L.gu(0.4));
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = L.gu(0.08);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(L.font(0.036));
  ctx.fillText(label, x + w / 2, y + h / 2);
}

// 텍스트를 최대 폭에 맞춰 자동 축소해 중앙 정렬로 그린다.
function fitText(ctx, text, cx, cy, maxW, baseSize, minSize) {
  let size = baseSize;
  ctx.font = font(size);
  let w = ctx.measureText(text).width;
  if (w > maxW) size = Math.max(minSize, (size * maxW) / w);
  ctx.font = font(size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function hitRect(r, x, y) {
  return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function rectCenter(r) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
