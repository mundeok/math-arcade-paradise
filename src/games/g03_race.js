// g03_race.js — 🚀 레이싱 계산 (SPEC §4 3️⃣ / Phase 5, 개정안)
// 경쟁형. 확정 인터페이스(SPEC §7)만 사용한다. core/scenes는 절대 건드리지 않는다.
//
// ⚠️ 개정안(원안 폐기): 원안은 "AI 차와 경주 + 오답 시 AI 전진 + 3패 게임오버"였다.
//   개정 이유 — 원안은 '정답을 고른다'에 그림만 입힌 구조라 앞 게임들과 조작 감각이 겹치고,
//   진 사람을 만든다. 개정안은 (1) 매 구간 '안전/도전' 경로를 먼저 고르는 판단을 넣고,
//   (2) AI 대신 '자기 최고기록 유령'과 겨룬다. 패배 개념 없음 — 자기 기록과의 경쟁이다.
//
// 진행: 총 30칸. 매 구간 두 경로의 '실제 식'을 보고 하나를 골라(좌/우 탭) 그 문제를 푼다.
//   - 안전(좌): 현재 레벨 문제 → 정답 시 1칸 전진
//   - 도전(우): 현재 레벨+1 문제 → 정답 시 2칸 전진
//   - 어느 쪽이든 오답이면 전진 없음 + 라이프 -1 + 정답표시(core가 1.2초 정지 처리)
//   30칸 도착 → 기록 확정 후 결과 화면. 라이프 3, 오답으로만 깎인다.
//
// ⚠️ 축 A(레벨) 참조에 관하여: 이 게임의 핵심 메커닉("안전=현재 레벨, 도전=현재 레벨+1")은
//   두 문제의 상대 난이도를 '현재 수학 레벨'로 정의하므로, 다른 게임과 달리
//   problemGenerator.currentLevel(공개 필드)을 읽어 프레이밍한다. 이는 게임 난이도(속도/개수)를
//   레벨로 계산하는 것이 아니라, '어떤 난이도의 문제를 낼지'를 정하는 것이라 ProblemGenerator의
//   책무 범위 안이다. 문제 생성은 공개 API만 사용한다:
//     - 안전 경로: nextProblem({maxLevel:base}) — 복습 큐/중복 방지 그대로 활용
//     - 도전 경로: generateForLevel(base+1, ...) — 정확히 한 단계 위 문제(공개 메서드)
//   결과는 answerCorrect/answerWrong 으로 넘겨 세션·복습큐·레벨조정을 core가 처리한다.
//
// 유령(Ghost): 자기 최고기록의 '구간별 통과 시각'을 localStorage에 저장하고, 재생한다.
//   기록이 없으면 기본 페이스의 연습 유령을 쓴다. 유령을 앞지르면 짧은 연출, 뒤처져도
//   비난 표현은 쓰지 않는다(SPEC §2.5).
//
// 재미 표준(§2.6): fever:true, comboMilestones, 정답 즉시 진행, 손맛, L 헬퍼 좌표.
//   고유 재미(위험 감수의 쾌감): 도전 경로 성공 시 부스터 연출·속도선·화면 살짝 당김.
//   니어미스: 도전 경로(2칸) 연속 3회 성공.

import { L } from '../core/layout.js';
import { THEME, font, roundRect } from '../core/ui.js';

const TRACK = 30; // 총 칸 수
const GHOST_KEY = 'g03_racing.ghost'; // localStorage: { times:[…], total } (storage가 mathArcade. 접두)
const GHOST_PACE = 4.0; // 연습 유령 페이스(초/칸). 기록 없을 때만 사용.
const NEARMISS_STREAK = 3; // 도전 경로 연속 성공 니어미스 트리거
const FINISH_HOLD = 1.3; // 도착 배너 유지 후 결과 화면(초)
const REVEAL_SNAP = 0.15; // 정답 후 다음 구간 준비 상한(SPEC §2.6)

export const g03Race = {
  id: 'g03_racing', // ⚠️ CATALOG/저장 키와 일치(파일명 g03_race와 별개)
  name: '레이싱 계산',
  emoji: '🚀',
  category: '경쟁형',
  maxLevel: 4, // 개정안 지정
  blankRatio: 0.25, // 판단형 비율
  opMode: 'mixed',
  fever: true,
  comboMilestones: { 5: 'FAST!', 10: 'TURBO!', 20: 'NITRO!', 30: 'CHAMPION!' },

  tutorial: {
    text: '두 갈림길의 식을 보고 골라! 답을 맞히면 앞으로 달려. 내 최고기록과 겨뤄보자!',
    draw(ctx) {
      const cx = L.W / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 트랙 + 내 차/유령
      const ty = L.gu(1.6);
      const x0 = L.gu(2);
      const x1 = L.W - L.gu(2);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = L.gu(0.14);
      ctx.setLineDash([L.gu(0.4), L.gu(0.4)]);
      ctx.beginPath();
      ctx.moveTo(x0, ty);
      ctx.lineTo(x1, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = font(L.font(0.045));
      ctx.fillText('🚀', x0 + (x1 - x0) * 0.45, ty - L.gu(0.9));
      ctx.globalAlpha = 0.5;
      ctx.fillText('👻', x0 + (x1 - x0) * 0.3, ty + L.gu(0.9));
      ctx.globalAlpha = 1;
      ctx.font = font(L.font(0.04));
      ctx.fillText('🏁', x1, ty);
      // 두 갈림길 카드
      const cw = L.gu(6.4);
      const ch = L.gu(3.4);
      const gap = L.gu(0.8);
      const ly = L.gu(4.2);
      drawForkCard(ctx, cx - gap / 2 - cw, ly, cw, ch, '안전', '6 × 7', '+1칸', THEME.accent);
      drawForkCard(ctx, cx + gap / 2, ly, cw, ch, '도전', '23 × 4', '+2칸', THEME.gold);
      ctx.fillStyle = THEME.subtext;
      ctx.font = font(L.font(0.03), 'normal');
      ctx.fillText('왼쪽=안전  ·  오른쪽=질러보기', cx, ly + ch + L.gu(0.9));
    },
  },

  init(engine) {
    this.engine = engine;
    this.pos = 0; // 내 위치(칸)
    this.phase = 'fork'; // 'fork' | 'solve'
    this.choice = null; // 'safe' | 'challenge'
    this.safeProblem = null;
    this.challengeProblem = null;
    this.active = null; // 선택한 문제
    this.options = []; // 답 버튼 [{value, correct, rect}]
    this.forkRects = null; // {left, right}

    this.raceElapsed = 0; // 활성 경주 시간(초) — 유령 재생/기록 기준
    this.myTimes = new Array(TRACK + 1).fill(-1); // 각 칸 최초 도달 시각
    this.myTimes[0] = 0;
    this.ghost = this._loadGhost(); // {times,total} | null
    this.ghostProgress = 0;
    this.wasAheadOfGhost = true; // 시작은 동률(둘 다 0) → 앞지름 판정 기준
    this.passT = 0; // 유령 추월 연출 타이머

    this.challengeStreak = 0; // 도전 경로 연속 성공(니어미스용)
    this.boostT = 0; // 도전 성공 부스터/속도선 타이머
    this.carZoom = 0; // 차 미세 확대 타이머
    this.floats = [];
    this.finishing = false;
    this.finishTimer = 0;
    this.snapTimer = 0; // 정답 후 다음 구간 준비 지연(≤0.15초)

    this.wasFever = false;
    this.feverBanner = null;
    this.time = 0;

    this._makeFork();
  },

  // ── 유령 저장/로드 ────────────────────────────────────────
  _loadGhost() {
    const g = this.engine.storage.get(GHOST_KEY, null);
    if (g && Array.isArray(g.times) && g.times.length === TRACK + 1 && typeof g.total === 'number') return g;
    return null;
  },
  _saveGhostIfBest(total) {
    const prev = this.ghost;
    if (!prev || total < prev.total) {
      this.engine.storage.set(GHOST_KEY, { times: this.myTimes.slice(), total });
      return true; // 신기록
    }
    return false;
  },

  // 현재 경주 시각에서 유령이 도달한 칸(연속). 기록 있으면 그 시각표, 없으면 연습 페이스.
  _ghostCellAt(t) {
    const g = this.ghost;
    if (g) {
      let c = 0;
      for (let i = 1; i <= TRACK; i++) {
        if (g.times[i] >= 0 && g.times[i] <= t) c = i;
        else break;
      }
      return c;
    }
    return Math.min(TRACK, Math.floor(t / GHOST_PACE));
  },

  // ── 갈림길 구성 ───────────────────────────────────────────
  // 안전=현재 레벨, 도전=현재 레벨+1. 도전이 항상 한 단계 위가 되도록 base를 maxLevel-1로 제한.
  _makeFork() {
    const e = this.engine;
    const gen = e.problemGenerator;
    const cur = clamp(gen.currentLevel || 1, 1, this.maxLevel);
    const base = clamp(cur, 1, this.maxLevel - 1); // 안전 레벨(도전=base+1 ≤ maxLevel)

    // 안전 경로: nextProblem 으로 복습 큐/중복 방지 활용(min(현재,base)=base 이하)
    this.safeProblem = gen.nextProblem({ maxLevel: base, blankRatio: this.blankRatio, opMode: this.opMode });

    // 도전 경로: 정확히 한 단계 위 문제. 안전과 식이 겹치면 몇 번 다시 뽑는다.
    let ch = null;
    for (let i = 0; i < 8; i++) {
      ch = gen.generateForLevel(base + 1, this.blankRatio, this.opMode);
      if (ch && ch.text !== this.safeProblem.text) break;
    }
    this.challengeProblem = ch;

    this.phase = 'fork';
    this.choice = null;
    this.active = null;
    this.options = [];
  },

  // 경로 선택 후 답 버튼 4개(정답1 + 오답3) 구성. 오답 근접도는 콤보(축 B)로.
  _makeOptions(problem) {
    const e = this.engine;
    const combo = e.scoreManager.combo;
    const closeness = clamp(0.3 + combo * 0.03, 0.3, 0.9);
    const distractors = e.problemGenerator.makeDistractors(problem, 3, closeness);
    const values = shuffle([problem.answer, ...distractors]).slice(0, 4);
    // 정답이 혹시 빠지면(후보 부족) 강제 포함
    if (!values.includes(problem.answer)) values[0] = problem.answer;
    this.options = values.map((v) => ({ value: v, correct: v === problem.answer, rect: null }));
    this._layoutOptions();
  },

  // ── 좌표 계산(L 헬퍼) ─────────────────────────────────────
  _trackY() {
    // 게이지(zone.gauge)와 진행 라벨이 겹치지 않도록 트랙을 살짝 내린다.
    return L.zone.playTop + L.gu(1.6);
  },
  _cellX(c) {
    const x0 = L.safe + L.gu(0.6);
    const x1 = L.W - L.safe - L.gu(0.6);
    return x0 + (x1 - x0) * (c / TRACK);
  },

  _forkLayout() {
    const top = this._trackY() + L.gu(2.6);
    const bot = L.zone.playBottom + L.gu(1.5);
    const gap = L.gu(0.8);
    const w = (L.W - L.safe * 2 - gap) / 2;
    const left = { x: L.safe, y: top, w, h: bot - top };
    const right = { x: L.safe + w + gap, y: top, w, h: bot - top };
    return { left, right };
  },

  _layoutOptions() {
    const top = this._trackY() + L.gu(4.8);
    const bot = L.zone.playBottom + L.gu(1.5);
    const gap = L.gu(0.6);
    const cols = 2;
    const rows = 2;
    const w = (L.W - L.safe * 2 - gap) / cols;
    const h = Math.max(L.minTouch, (bot - top - gap) / rows);
    this.options.forEach((o, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      o.rect = { x: L.safe + c * (w + gap), y: top + r * (h + gap), w, h };
    });
  },

  // ── 업데이트 ──────────────────────────────────────────────
  update(dt) {
    this.time += dt;

    // 피버 진입/종료 전이(연출만)
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

    // 도착 배너 → 결과 화면
    if (this.finishing) {
      this.finishTimer -= dt;
      if (this.finishTimer <= 0) this.engine.endGame();
      return;
    }

    // 경주 시간 진행 + 유령 재생
    this.raceElapsed += dt;
    const gc = this._ghostCellAt(this.raceElapsed);
    this.ghostProgress += (gc - this.ghostProgress) * (1 - Math.pow(0.001, dt)); // 부드럽게 추적
    // 앞지름 판정(내가 유령보다 앞선 순간, 뒤처졌다가 다시 앞설 때만 연출)
    const ahead = this.pos > gc;
    if (ahead && !this.wasAheadOfGhost) {
      this.passT = 0.6;
      this.engine.particles.emit(this._cellX(this.pos), this._trackY() - L.gu(1.1), 'sparkle', THEME.gold, 12);
      this.engine.ui.showComboText('👻 추월!', false);
    }
    this.wasAheadOfGhost = ahead;

    if (this.passT > 0) this.passT = Math.max(0, this.passT - dt);
    if (this.boostT > 0) this.boostT = Math.max(0, this.boostT - dt);
    if (this.carZoom > 0) this.carZoom = Math.max(0, this.carZoom - dt);
    if (this.snapTimer > 0) {
      this.snapTimer = Math.max(0, this.snapTimer - dt);
      if (this.snapTimer === 0 && !this.finishing) this._makeFork();
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      this.floats[i].t += dt;
      if (this.floats[i].t >= this.floats[i].dur) this.floats.splice(i, 1);
    }
  },

  // ── 입력 ──────────────────────────────────────────────────
  onTouch(x, y, phase) {
    if (phase !== 'start') return;
    if (this.finishing || this.snapTimer > 0) return;

    if (this.phase === 'fork') {
      const { left, right } = this._forkLayout();
      if (hitRect(left, x, y)) this._choosePath('safe');
      else if (hitRect(right, x, y)) this._choosePath('challenge');
      return;
    }
    // solve
    for (const o of this.options) {
      if (o.rect && hitRect(o.rect, x, y)) {
        this._answer(o);
        return;
      }
    }
  },

  onKey(e) {
    if (this.finishing || this.snapTimer > 0) return;
    if (this.phase === 'fork') {
      if (e.key === 'ArrowLeft') this._choosePath('safe');
      else if (e.key === 'ArrowRight') this._choosePath('challenge');
      return;
    }
    const idx = { 1: 0, 2: 1, 3: 2, 4: 3 }[e.key];
    if (idx != null && this.options[idx]) this._answer(this.options[idx]);
  },

  _choosePath(which) {
    this.choice = which;
    this.active = which === 'safe' ? this.safeProblem : this.challengeProblem;
    this.phase = 'solve';
    this._makeOptions(this.active);
    this.engine.sound.play('tick');
  },

  _answer(opt) {
    const e = this.engine;
    const problem = this.active;
    const isChallenge = this.choice === 'challenge';
    if (opt.correct) {
      const combo = e.scoreManager.combo;
      const pts = isChallenge ? 120 + combo * 10 : 60 + combo * 6;
      e.answerCorrect(problem, opt.value, pts); // 점수배수·게이지·정답음·콤보문구 자동
      const shown = pts * (e.fever && e.fever.active ? e.fever.scoreMultiplier : 1);

      // 전진
      const step = isChallenge ? 2 : 1;
      this._advance(step);

      // 손맛
      const bx = this._cellX(this.pos);
      const by = this._trackY() - L.gu(1.1);
      this.floats.push({ x: bx, y: by, text: `+${shown}`, color: isChallenge ? THEME.gold : THEME.correct, size: L.font(0.036), t: 0, dur: 0.6 });
      e.particles.emit(bx, by, 'sparkle', isChallenge ? THEME.gold : THEME.correct, 14);
      e.ui.shake(isChallenge ? 9 : 6, 0.1);
      this.carZoom = 0.12;
      this._haptic(15);

      if (isChallenge) {
        // 위험 감수의 쾌감: 부스터 연출·속도선·화면 살짝 당김
        this.boostT = 0.4;
        e.particles.emit(bx - L.gu(1), by, 'explode', THEME.gold, 10);
        this.challengeStreak += 1;
        if (this.challengeStreak > 0 && this.challengeStreak % NEARMISS_STREAK === 0) {
          e.reportNearMiss(bx, by); // 도전 연속 3회 성공
        }
      } else {
        this.challengeStreak = 0;
      }

      if (this.pos >= TRACK) {
        this._finish();
        return;
      }
      // 멈춤 없이 다음 구간 준비(≤0.15초)
      this.snapTimer = REVEAL_SNAP;
      this.phase = 'wait';
      this.options = [];
    } else {
      // 오답: 전진 없음 + 라이프 -1 + 정답표시(core 1.2초 정지)
      this.challengeStreak = 0;
      e.ui.shake(14, 0.35);
      e.answerWrong(problem, opt.value, { loseLife: true, onResume: () => this._makeFork() });
    }
  },

  _advance(step) {
    const before = this.pos;
    this.pos = Math.min(TRACK, this.pos + step);
    // 지나친 칸들의 최초 도달 시각 기록(유령 저장용)
    for (let c = before + 1; c <= this.pos; c++) {
      if (this.myTimes[c] < 0) this.myTimes[c] = this.raceElapsed;
    }
  },

  _finish() {
    const e = this.engine;
    const total = this.raceElapsed;
    const isBest = this._saveGhostIfBest(total);
    this.finishing = true;
    this.finishTimer = FINISH_HOLD;
    this.phase = 'done';
    this.options = [];
    e.particles.emit(this._cellX(TRACK), this._trackY(), 'explode', THEME.gold, 40);
    e.particles.emit(L.W / 2, L.y(0.5), 'sparkle', THEME.gold, 24);
    e.ui.flash('rgba(255,220,140,0.4)', 0.1);
    e.ui.showComboText(isBest ? '🏁 신기록!' : '🏁 완주!', true);
    e.sound.play('fanfare');
  },

  // ── 렌더 ──────────────────────────────────────────────────
  render(ctx) {
    this._drawFeverBg(ctx);
    if (this.engine.fever) {
      this.engine.fever.renderGauge(ctx, { x: L.safe, y: L.zone.gauge, w: L.W - L.safe * 2, h: L.gu(0.5) });
    }
    this._drawTrack(ctx);

    if (this.finishing) {
      this._drawFinishBanner(ctx);
      this._drawFloats(ctx);
      this._drawFeverBanner(ctx);
      return;
    }

    if (this.phase === 'fork') this._drawFork(ctx);
    else if (this.phase === 'solve') this._drawSolve(ctx);
    // 'wait'/'done' 구간엔 트랙만(다음 구간 준비 중)

    this._drawFloats(ctx);
    this._drawFeverBanner(ctx);
  },

  _drawTrack(ctx) {
    const ty = this._trackY();
    const x0 = this._cellX(0);
    const x1 = this._cellX(TRACK);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 진행 라벨
    ctx.fillStyle = THEME.subtext;
    ctx.font = font(L.font(0.028), 'normal');
    ctx.fillText(`${this.pos} / ${TRACK}칸`, L.W / 2, ty - L.gu(2.2));

    // 트랙 라인 + 5칸 눈금
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = L.gu(0.14);
    ctx.beginPath();
    ctx.moveTo(x0, ty);
    ctx.lineTo(x1, ty);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let c = 0; c <= TRACK; c += 5) {
      const cxp = this._cellX(c);
      ctx.fillRect(cxp - L.gu(0.03), ty - L.gu(0.35), L.gu(0.06), L.gu(0.7));
    }
    // 이미 지난 구간 강조
    ctx.strokeStyle = THEME.correct;
    ctx.lineWidth = L.gu(0.18);
    ctx.beginPath();
    ctx.moveTo(x0, ty);
    ctx.lineTo(this._cellX(this.pos), ty);
    ctx.stroke();

    // 🏁 결승선
    ctx.font = font(L.font(0.04));
    ctx.fillStyle = '#fff';
    ctx.fillText('🏁', x1, ty);

    // 유령(반투명, 트랙 아래쪽)
    const gx = this._cellX(this.ghostProgress);
    ctx.globalAlpha = 0.55;
    ctx.font = font(L.font(0.045));
    ctx.fillText('👻', gx, ty + L.gu(1.1));
    ctx.globalAlpha = 1;

    // 내 차(트랙 위쪽) + 부스터 속도선 + 미세 확대
    const cx = this._cellX(this.pos);
    const cyc = ty - L.gu(1.1);
    if (this.boostT > 0) {
      ctx.strokeStyle = `rgba(255,213,74,${(this.boostT / 0.4) * 0.8})`;
      ctx.lineWidth = L.gu(0.1);
      for (let i = 1; i <= 3; i++) {
        const yy = cyc + (i - 2) * L.gu(0.4);
        ctx.beginPath();
        ctx.moveTo(cx - L.gu(1) - i * L.gu(0.5), yy);
        ctx.lineTo(cx - L.gu(0.4), yy);
        ctx.stroke();
      }
    }
    const z = 1 + (this.carZoom > 0 ? 0.25 * (this.carZoom / 0.12) : 0);
    ctx.save();
    ctx.translate(cx, cyc);
    ctx.scale(z, z);
    ctx.font = font(L.font(0.05));
    ctx.fillText('🚀', 0, 0);
    ctx.restore();

    if (this.passT > 0) {
      ctx.globalAlpha = this.passT / 0.6;
      ctx.fillStyle = THEME.gold;
      ctx.font = font(L.font(0.026), 'normal');
      ctx.fillText('앞질렀다!', cx, cyc - L.gu(1.1));
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  },

  _drawFork(ctx) {
    const { left, right } = this._forkLayout();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.text;
    ctx.font = font(L.font(0.036));
    ctx.fillText('어느 길로 갈까?', L.W / 2, left.y - L.gu(1.2));
    this._drawForkPanel(ctx, left, '안전', this.safeProblem, '+1칸', THEME.accent, '🛡️');
    this._drawForkPanel(ctx, right, '도전', this.challengeProblem, '+2칸', THEME.gold, '⚡');
    ctx.restore();
  },

  _drawForkPanel(ctx, r, label, problem, reward, color, icon) {
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, L.gu(0.5));
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = L.gu(0.14);
    ctx.stroke();

    const cx = r.x + r.w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 라벨 칩
    ctx.fillStyle = color;
    ctx.font = font(L.font(0.032));
    ctx.fillText(`${icon} ${label}`, cx, r.y + L.gu(1.1));
    // 실제 식(핵심 — 고르기 전에 보여야 함). 폭에 맞춰 자동 축소.
    ctx.fillStyle = '#fff';
    fitText(ctx, problem ? problem.text : '', cx, r.y + r.h * 0.46, r.w - L.gu(1), L.font(0.06), L.font(0.032));
    // 보상
    ctx.fillStyle = THEME.subtext;
    ctx.font = font(L.font(0.03), 'normal');
    ctx.fillText(`맞히면 ${reward}`, cx, r.y + r.h - L.gu(1.1));
    ctx.restore();
  },

  _drawSolve(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 선택한 식 배너
    const bannerY = this._trackY() + L.gu(2.6);
    const isCh = this.choice === 'challenge';
    ctx.fillStyle = isCh ? THEME.gold : THEME.accent;
    ctx.font = font(L.font(0.03));
    ctx.fillText(isCh ? '⚡ 도전 (+2칸)' : '🛡️ 안전 (+1칸)', L.W / 2, bannerY - L.gu(1.2));
    ctx.fillStyle = '#fff';
    fitText(ctx, this.active ? this.active.text : '', L.W / 2, bannerY + L.gu(0.4), L.W - L.safe * 2, L.font(0.07), L.font(0.04));

    // 답 버튼
    for (const o of this.options) {
      const r = o.rect;
      roundRect(ctx, r.x, r.y, r.w, r.h, L.gu(0.5));
      ctx.fillStyle = THEME.panel;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = L.gu(0.08);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = font(L.font(0.06));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(o.value), r.x + r.w / 2, r.y + r.h / 2);
    }
    ctx.restore();
  },

  _drawFinishBanner(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.gold;
    ctx.font = font(L.font(0.09));
    ctx.fillText('🏁 완주!', L.W / 2, L.y(0.5));
    ctx.fillStyle = THEME.subtext;
    ctx.font = font(L.font(0.035), 'normal');
    ctx.fillText(`${this.raceElapsed.toFixed(1)}초`, L.W / 2, L.y(0.5) + L.gu(2.4));
    ctx.restore();
  },

  _drawFloats(ctx) {
    for (const t of this.floats) {
      const p = t.t / t.dur;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.fillStyle = t.color;
      ctx.font = font(t.size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.text, t.x, t.y - p * L.gu(2));
      ctx.restore();
    }
  },

  onHover(x, y) {
    if (this.finishing || this.snapTimer > 0) return false;
    if (this.phase === 'fork') {
      const { left, right } = this._forkLayout();
      return hitRect(left, x, y) || hitRect(right, x, y);
    }
    if (this.phase === 'solve') {
      for (const o of this.options) if (o.rect && hitRect(o.rect, x, y)) return true;
    }
    return false;
  },
  clearHover() {},

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
    this.safeProblem = null;
    this.challengeProblem = null;
    this.active = null;
    this.options = [];
    this.floats = [];
    this.feverBanner = null;
  },
};

// ── 모듈 로컬 헬퍼(core 미수정) ──────────────────────────────
function drawForkCard(ctx, x, y, w, h, label, eq, reward, color) {
  roundRectPath(ctx, x, y, w, h, L.gu(0.4));
  ctx.fillStyle = THEME.panel;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = L.gu(0.1);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.font = font(L.font(0.026));
  ctx.fillText(label, x + w / 2, y + L.gu(0.7));
  ctx.fillStyle = '#fff';
  ctx.font = font(L.font(0.04));
  ctx.fillText(eq, x + w / 2, y + h / 2 + L.gu(0.1));
  ctx.fillStyle = THEME.subtext;
  ctx.font = font(L.font(0.024), 'normal');
  ctx.fillText(reward, x + w / 2, y + h - L.gu(0.6));
}

function fitText(ctx, text, cx, cy, maxW, baseSize, minSize) {
  let size = baseSize;
  ctx.font = font(size);
  const w = ctx.measureText(text).width;
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

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
