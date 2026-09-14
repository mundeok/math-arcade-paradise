// g10_treasure.js — 해적 보물 분배소 (SPEC §4 🔟)
// 본게임: 수량 선택 → 한 번 발사(여기서 정오답 기록) → 정답일 때 상자 수집.
// 자유 배분은 무득점 연습 전용. 실제 보석 총량은 항상 보존하고 부족한 양은 배분하지 않는다.
// 정답 발사 후에는 계산 시계를 멈춘다. 수집은 보상 동작이며 두 번째 답안이 아니다.
// 피버는 쉬운 문제/무적을 유지한다. 진행 중인 정상 문제를 보관하고 이미 맞힌 수집을 버리지 않는다.
// 수량/판정은 입력 시 확정하며 비행은 장식만. core/scenes 미수정, 아트는 Canvas/L 헬퍼.

import { L } from '../core/layout.js';
import { THEME, font, roundRect } from '../core/ui.js';
import { drawTreasureChest, drawPirate, drawPlayBackdrop, drawRewardText } from '../art/toyArt.js';

const CONCEPT_KEY = 'g10_remain.oneShotSeen'; // 새 조작 안내. 학습 진도/보상 저장이 아님.
const REVEAL_DUR = 0.4; // 상자 수집 후 다음 문제. 이전 식은 별도 영수증 영역에 남는다.
const HINT_DUR = 1.6; // 배분 실수 안내 지속(초)
const GEM_ICON_MAX = 20; // 이 수를 넘으면 개별 아이콘 대신 뭉치로 표시
const NEARMISS_RATIO = 0.35; // 시계의 주의 색상 기준 (득점 판정과 분리)
const CARGO_PER_SHIP = 6; // 성공 1회=짐 1개. 실제 나머지의 크기와 무관한 세션 성취.
const BOARD_FIELDS = ['dividend', 'divisor', 'q', 'r', 'counts', 'pile', 'problem',
  'timeLimit', 'timeLeft', 'nearMissUsed', 'predictVal', 'mode'];

const PREDICT_TIME = 16; // Lv5 예측 모드 기본 제한시간(초) — 배분이 아니라 나눗셈 암산 중심이라 짧게

// 난이도 밴드(개정안): pirates=해적 수 범위, qMin/qMax=1인당 몫 범위, cap=보석 수 상한
const BANDS = {
  1: { pirates: [2, 3], qMin: 1, qMax: 3, cap: 10 },
  2: { pirates: [3, 4], qMin: 2, qMax: 3, cap: 12 },
  3: { pirates: [5, 6], qMin: 2, qMax: 3, cap: 20 },
  4: { pirates: [6, 8], qMin: 2, qMax: 3, cap: 22 },
  5: { pirates: [8, 9], qMin: 6, qMax: 9, cap: 90 }, // 두 자리 나눗셈(74÷9 등)
};

// 피버 easy 전용 밴드(재설계 2단계): 보석 10개 이하·해적 2~4명(Lv1~2 수준). core의 easy 오버라이드는
//   nextProblem을 쓰지 않는 이 게임엔 닿지 않으므로, 게임이 피버 상태를 직접 읽어 이 밴드를 쓴다.
const FEVER_EASY_BAND = { pirates: [2, 4], qMin: 1, qMax: 3, cap: 10 };
const FEVER_EASY_ZERO_R = 0.5; // 피버 easy: 나누어떨어짐(나머지 0) 비율↑ → 배분이 딱 떨어져 빠르게 끝남

export const g10Treasure = {
  id: 'g10_remain', // ⚠️ CATALOG/저장 키와 일치(파일명 g10_treasure와 별개)
  name: '나머지 보물찾기',
  emoji: '💎',
  category: '나눗셈 심화',
  maxLevel: 5,
  blankRatio: 0, // 빈칸 미출제(직접 배분 게임)
  opMode: 'divide',
  fever: { type: 'easy' }, // easy=피버 중 쉬운 문제형 (§2.6/§7.6)
  comboMilestones: { 5: '보물 사냥꾼!', 10: '나눗셈 척척!', 20: '해적왕!', 30: '전설의 분배!' },

  tutorial: {
    text: '몇 개씩 줄지 골라 한 번에 발사! 맞히면 남은 보석을 상자에 담아요.',
    draw(ctx) {
      const cx = L.W / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 보석 → 해적 배분 그림
      ctx.font = font(L.font(0.04));
      ctx.fillText('💎💎💎💎💎', cx, L.gu(1.6));
      ctx.fillStyle = THEME.subtext;
      ctx.font = font(L.font(0.028), 'normal');
      ctx.fillText('똑같이 나눠주면…', cx, L.gu(3.1));
      ctx.font = font(L.font(0.05));
      ctx.fillStyle = '#fff';
      ctx.fillText('🏴‍☠️  🏴‍☠️', cx, L.gu(5));
      ctx.fillStyle = THEME.gold;
      ctx.font = font(L.font(0.034));
      ctx.fillText('남은 보석 = 나머지 💎', cx, L.gu(7));
      ctx.fillStyle = THEME.subtext;
      ctx.font = font(L.font(0.026), 'normal');
      ctx.fillText('수량 선택 → 발사! → 남은 보석 담기', cx, L.gu(8.4));
    },
  },

  init(engine) {
    if (this.engine) this.destroy(); // 엔진의 재시작 경로는 destroy를 호출하지 않는다.
    this.engine = engine;
    this.mode = 'concept'; // concept / play(수량 선택) / collect(정답) / reveal / waiting(오답)
    this.conceptReturn = 'start'; // concept 종료 후: 'start'(첫 문제) | 'play'(재개)
    this.conceptT = 0;

    this.dividend = 0;
    this.divisor = 0;
    this.q = 0;
    this.r = 0;
    this.counts = []; // 해적별 받은 수
    this.pile = 0; // 통에 남은 보석
    this.problem = null;

    this.timeLimit = 0;
    this.timeLeft = 0;
    this.nearMissUsed = false;

    this.hint = null; // {type:'unequal'|'more', t}
    this.reveal = null; // {t}
    this.movingGems = []; // 나머지 보석이 보물상자로 이동
    this.floats = [];
    this.roundPulse = 0; // 한 바퀴 돌리기 연출
    this.roundsLeft = 0; // 이전 코드 호환: 본게임 0 / 연습 Infinity
    this.predict = true; // 호환 필드: 본게임은 모든 레벨에서 수량 선택
    this.predictVal = 1; // 예측값(몇 개씩)
    this.predMax = 9; // 정답과 독립적인 고정 선택 범위
    this.wasFever = false;
    this.feverBanner = null;
    this.time = 0;
    this.boardId = 0;
    this.drag = null;
    this.flights = [];
    this.pirateBounces = [];
    this.receipt = null;
    this.cargoCount = 0;
    this.cargoPulse = 0;
    this.returnPulse = 0;
    this.savedNormal = null;
    this.practice = false;
    this.practiceRound = 0;
    this.practiceReturn = null;
    this.quantityDrag = false;
    this.failure = null;
    // core가 touchcancel을 end로 합치므로 이동 중 상자 진입으로만 수집한다.
    // 일시정지/취소가 먼저 발생하면 이어진 제스처를 버린다. core 변경 없음.
    this._cancelGesture = () => { this.drag = null; this.quantityDrag = false; };
    this._pauseGesture = (ev) => {
      if (engine.game !== this) return;
      if (ev.key === 'Escape' || ev.key === 'p' || ev.key === 'P') this._cancelGesture();
      const p = ev.touches?.[0] || ev;
      if (typeof p.clientX === 'number' && engine.input?.toLogical) {
        const pos = engine.input.toLogical(p.clientX, p.clientY);
        if (engine.ui.hitPause(pos.x, pos.y)) this._cancelGesture();
      }
    };
    engine.canvas?.addEventListener('touchcancel', this._cancelGesture, true);
    engine.canvas?.addEventListener('touchstart', this._pauseGesture, true);
    engine.canvas?.addEventListener('mousedown', this._pauseGesture, true);
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this._cancelGesture);
      window.addEventListener('keydown', this._pauseGesture, true);
    }

    // 첫 진입이면 개념 설명 자동 1회
    const seen = this.engine.storage.get(CONCEPT_KEY, false);
    if (seen) {
      this.mode = 'play';
      this._nextProblem();
    } else {
      this.mode = 'concept';
      this.conceptReturn = 'start';
    }
  },

  // 피버 easy 유형이 지금 발동 중인가(core는 자체 생성 게임엔 문제 하향을 못 주므로 게임이 직접 읽는다).
  _feverEasyActive() {
    const f = this.engine.fever;
    return !!(f && f.active && f.type === 'easy');
  },

  // ── 문제 생성(밴드) ───────────────────────────────────────
  _nextProblem() {
    const e = this.engine;
    this._clearBoardEffects();
    this.boardId++;
    const easy = !this.practice && this._feverEasyActive();
    const level = clamp(e.problemGenerator.currentLevel || 1, 1, this.maxLevel);
    // 피버 easy: 레벨과 무관하게 쉬운 밴드(보석≤10·해적2~4). 그 외엔 레벨별 밴드.
    const band = easy ? FEVER_EASY_BAND : BANDS[level];
    const pirates = this._activeDans(band.pirates);
    const zeroR = easy ? FEVER_EASY_ZERO_R : 0.2; // 나누어떨어짐 비율(피버 easy는 높임)

    let P, q, r, D;
    let guard = 0;
    do {
      guard++;
      P = pick(pirates);
      q = ri(band.qMin, band.qMax);
      r = Math.random() < zeroR ? 0 : ri(1, P - 1);
      D = P * q + r;
    } while (D > band.cap && guard < 60);
    if (D > band.cap) {
      // 안전장치: 상한 안에서 다시 맞춤
      q = Math.max(1, Math.floor((band.cap - r) / P));
      D = P * q + r;
    }
    // 연습은 별도 예제다. 현재 본게임 문제를 쉽게 풀어주는 힌트 경로가 아니다.
    if (this.practice) {
      P = this.practiceReturn?.divisor === 3 ? 4 : 3;
      D = P * 2 + [1, 2, 0][this.practiceRound % 3]; q = Math.floor(D / P); r = D % P;
    }

    this.dividend = D;
    this.divisor = P;
    this.q = q;
    this.r = r;
    this.counts = new Array(P).fill(0);
    this.pirateBounces = new Array(P).fill(0);
    this.pile = D;
    this.nearMissUsed = false;
    this.hint = null;
    this.reveal = null;
    this.movingGems = [];

    this.predict = !this.practice; // 호환 필드: 이제 모든 본게임/피버가 수량 선택형
    this.roundsLeft = this.practice ? Infinity : 0;
    this.predictVal = 0; // 미선택. 무작정 발사 버튼만 누르는 반복으로 정답을 얻지 않음.
    this.predMax = 9; // 정답으로부터 계산하지 않는 고정 범위 (상한에서 답 유추 방지)
    this.failure = null;

    // 피버 easy 문제는 실제로 쉬우므로 리포트 오분류를 막기 위해 level=1로 기록(축 A 자체는 불변).
    this.problem = { a: D, b: P, op: '÷', answer: q, remainder: r > 0 ? r : null, text: `${D} ÷ ${P}`, blank: null, level: easy ? 1 : level };

    // 제한시간(교사 배율 반영):
    //   - 예측 모드(Lv5): 배분이 아니라 나눗셈 암산이므로 짧게(PREDICT_TIME + 해적수 여유).
    //   - 그 외: 보석 수에 비례(넉넉히). ⚠️ 기존 8+D×0.7은 Lv5 대용량 D(최대 90)에서 과다했으나,
    //     Lv5가 예측 모드로 분리되어 이 공식은 이제 D≤22 구간에만 적용된다 → 적정(예: D=22 → 23초).
    const scale = e.settings.timeScale || 1;
    this.timeLimit = (level >= 5 && !easy ? PREDICT_TIME + P * 0.8 : 8 + D * 0.7) * scale;
    this.timeLeft = this.timeLimit;
    this.mode = 'play';
    if (!this.practice) e.markQuestionStart();
  },

  _clearBoardEffects() {
    this.drag = null;
    this.quantityDrag = false;
    this.flights = [];
    this.movingGems = [];
    this.roundPulse = 0;
    this.returnPulse = 0;
  },

  _syncFever() {
    if (this.practice || this.mode === 'concept') return;
    const active = this._feverEasyActive();
    if (active === this.wasFever) return;
    this.wasFever = active;
    this._cancelGesture();
    if (!active) this.feverBanner = { points: this.engine.fever?.pointsEarned || 0, t: 0, dur: 1.4 };
    // 이미 정답인 수집은 버리지 않는다. 추가 득점/재판정 없이 다음 문제부터 출제 유형 전환.
    if (this.mode === 'collect' || this.mode === 'reveal' || this.mode === 'waiting') return;
    this._clearBoardEffects();
    if (active) {
      this.savedNormal = this.mode === 'play' ? this._snapshotBoard() : null;
      this._nextProblem();
    } else {
      this._advanceBoard();
    }
  },

  _snapshotBoard() {
    return Object.fromEntries(BOARD_FIELDS.map(k => [k, Array.isArray(this[k]) ? this[k].slice() : this[k]]));
  },
  _restoreBoard(saved) {
    this._clearBoardEffects();
    Object.assign(this, saved);
    this.boardId++;
    this.predict = !this.practice;
    this.pirateBounces = new Array(this.divisor).fill(0);
    this.hint = this.reveal = this.failure = null;
    this.engine.markQuestionStart();
  },
  _advanceBoard() {
    if (this.practice) { this.practiceRound++; this._nextProblem(); return; }
    if (!this._feverEasyActive() && this.savedNormal) {
      const saved = this.savedNormal; this.savedNormal = null; this._restoreBoard(saved);
    } else this._nextProblem();
  },
  _enterPractice() {
    if (this.practice || (this.mode !== 'play' && this.mode !== 'concept')) return;
    this.practiceReturn = this.mode === 'play' ? this._snapshotBoard() : null;
    this.practice = true; this.practiceRound = 0;
    this.receipt = this.feverBanner = null;
    this._nextProblem();
  },
  _leavePractice() {
    this.engine.storage.set(CONCEPT_KEY, true);
    this.practice = false;
    this.receipt = null;
    if (this.practiceReturn) this._restoreBoard(this.practiceReturn);
    else this._nextProblem();
    this.practiceReturn = null;
    this._syncFever();
  },

  // 교사 단(dan) 설정 ∩ 밴드 해적 범위. 교집합이 비면 밴드 범위 사용.
  _activeDans(range) {
    const [lo, hi] = range;
    const band = [];
    for (let d = lo; d <= hi; d++) band.push(d);
    const s = this.engine.settings;
    let dans = s.dans && s.dans.length ? s.dans.slice() : [2, 3, 4, 5, 6, 7, 8, 9];
    dans = dans.filter((d) => d >= lo && d <= hi);
    return dans.length ? dans : band;
  },

  // ── 업데이트 ──────────────────────────────────────────────
  update(dt) {
    this.time += dt;
    this._syncFever();
    if (this.feverBanner) {
      this.feverBanner.t += dt;
      if (this.feverBanner.t >= this.feverBanner.dur) this.feverBanner = null;
    }

    if (this.roundPulse > 0) this.roundPulse = Math.max(0, this.roundPulse - dt);
    this.cargoPulse = Math.max(0, this.cargoPulse - dt);
    this.returnPulse = Math.max(0, this.returnPulse - dt);
    if (this.receipt) { this.receipt.t += dt; if (this.receipt.t > 2.4) this.receipt = null; }
    this.pirateBounces = this.pirateBounces.map(t => Math.max(0, t - dt));
    // 게임 시간 기반 소리/도착 처리: 지연 프레임에 소리를 한꺼번에 쏟아내지 않는다.
    let sounded = false;
    for (const f of this.flights) {
      f.t += dt;
      if (!f.landed && f.t >= f.dur) {
        f.landed = true;
        this.pirateBounces[f.pirate] = 0.18;
        if (!sounded) {
          this.engine.sound.tone(390 + (f.pirate % 5) * 55, 0, 0.045, { type: 'triangle', vol: 0.1 });
          sounded = true;
        }
      }
    }
    this.flights = this.flights.filter(f => f.t < f.dur + 0.1);
    for (let i = this.floats.length - 1; i >= 0; i--) {
      this.floats[i].t += dt;
      if (this.floats[i].t >= this.floats[i].dur) this.floats.splice(i, 1);
    }
    if (this.hint) {
      this.hint.t += dt;
      if (this.hint.t >= HINT_DUR) this.hint = null;
    }

    if (this.mode === 'concept') {
      this.conceptT += dt;
      return;
    }

    if (this.mode === 'reveal') {
      this.reveal.t += dt;
      for (const g of this.movingGems) g.t = Math.min(1, g.t + dt / REVEAL_DUR);
      if (this.reveal.t >= REVEAL_DUR) this._advanceBoard();
      return;
    }

    if (this.mode !== 'play' || this.practice) return;
    // play — 제한시간(정지/개념/리빌 중엔 진행 안 함)
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.drag = null;
      this.mode = 'waiting'; // 콜백 전 중복 시간초과/득점 방지 (피버의 다음 프레임 콜백 포함)
      // 시간초과 = 판정 오류 → 라이프 -1 + 정답식 표시(core 1.2초 정지)
      this.engine.timeUp(this.problem, { loseLife: true, onResume: () => this._advanceBoard() });
    }
  },

  // ── 입력 ──────────────────────────────────────────────────
  onTouch(x, y, phase) {
    if (this.engine.freeze?.active || (!this.practice && this.mode === 'play' && this._feverEasyActive() !== this.wasFever)) {
      this._cancelGesture(); return;
    }
    if (phase === 'end' || phase === 'cancel') { this._cancelGesture(); return; }
    if (phase === 'move') {
      if (this.quantityDrag && this.mode === 'play' && !this.practice) this._selectQuantity(x);
      if ((this.mode === 'collect' || this.practice) && this.drag?.boardId === this.boardId) {
        this.drag.x = x; this.drag.y = y;
        if (hitRect(this._chestRect(), x, y) && Math.hypot(x - this.drag.sx, y - this.drag.sy) >= L.gu(1)) {
          this.drag = null; this._judge();
        }
      }
      return;
    }
    if (phase !== 'start') return;
    this._cancelGesture();
    if (this.mode === 'concept') {
      if (hitRect(this._btnConceptClose(), x, y)) this._enterPractice();
      if (hitRect(this._btnConceptSkip(), x, y)) this._leavePractice();
      return;
    }
    if (this.practice && hitRect(this._btnConcept(), x, y)) { this._leavePractice(); return; }
    if (this.mode === 'collect' || (this.practice && this.mode === 'play')) {
      if (hitRect(this._btnDone(), x, y) || hitRect(this._chestRect(), x, y)) { this._judge(); return; }
      if (hitRect(this._pileRect(), x, y)) { this.drag = {sx:x, sy:y, x, y, boardId:this.boardId}; return; }
    }
    if (this.mode !== 'play') return;
    if (hitRect(this._btnConcept(), x, y)) { this._enterPractice(); return; }
    if (!this.practice) {
      if (hitRect(this._btnPredMinus(), x, y)) { this._setQuantity(Math.max(1, this.predictVal - 1)); return; }
      if (hitRect(this._btnPredPlus(), x, y)) { this._setQuantity(Math.min(9, this.predictVal + 1)); return; }
      if (hitRect(this._quantityRect(), x, y)) { this.quantityDrag = true; this._selectQuantity(x); return; }
      if (hitRect(this._btnDone(), x, y)) this._fire();
      return;
    }
    if (hitRect(this._btnRound(), x, y)) { this._dealRound(); return; }
    if (hitRect(this._btnReset(), x, y)) { this._resetDistribution(); return; }
    const seats = this._pirateRects();
    for (let i = 0; i < seats.length; i++) if (hitRect(seats[i], x, y)) { this._giveOne(i); return; }
  },

  _setQuantity(n) {
    if (this.mode !== 'play' || this.practice) return;
    if (n !== this.predictVal) {
      this.predictVal = n; this.hint = null;
      this.engine.sound.play('tick'); this._haptic(8);
    }
  },
  _selectQuantity(x) {
    const r = this._quantityRect();
    this._setQuantity(1 + Math.round(clamp((x - r.x) / r.w, 0, 1) * 8));
  },

  _giveOne(i) {
    if (this.mode !== 'play' || !this.practice) return;
    if (this.pile <= 0) return;
    const min = Math.min(...this.counts);
    // ⚠️ 균등 유지: 가장 적게 받은 해적에게만 준다(한 명에게 몰아주기 방지 = "균등하지 않게 주면 안 됨").
    if (this.counts[i] > min) {
      this.hint = { type: 'giveleast', t: 0 };
      this.engine.ui.shake(4, 0.08);
      return;
    }
    // 모두 같은 수인데 남은 보석 < 해적 수 → 더는 똑같이 못 나눔(= 나머지). 오버 시도로 처리(라이프 X).
    if (Math.max(...this.counts) === min && this.pile < this.divisor) {
      this.hint = { type: 'nofull', t: 0 };
      this.engine.ui.shake(6, 0.1);
      return;
    }
    this.pile -= 1;
    this.counts[i] += 1;
    this.hint = null;
    this._launchGems([i]);
    this._haptic(10);
  },

  _dealRound() {
    if (this.mode !== 'play' || !this.practice) return;
    // 개별 배분 중이면 적게 받은 자리만 채운다. 모두에게 더하면 q+1개를 받은 자리가 생길 수 있다.
    const max = Math.max(...this.counts), min = Math.min(...this.counts);
    const target = max === min ? max + 1 : max;
    const recipients = this.counts.flatMap((n, i) => n < target ? [i] : []);
    if (this.pile < recipients.length) {
      // 연습에서 더 못 나누면 안내만. 점수/라이프/시간 불이익 없음.
      this.hint = { type: 'nofull', t: 0 };
      this.engine.ui.shake(6, 0.1);
      return;
    }
    for (const i of recipients) this.counts[i] += 1;
    this.pile -= recipients.length;
    this.hint = null;
    this.roundPulse = 0.35;
    this._launchGems(recipients);
    this._haptic(15);
  },

  _launchGems(recipients, rounds = 1) {
    const src = this._pileAnchor(), seats = this._pirateRects();
    for (let n = 0; n < rounds; n++) for (const i of recipients) {
      const r = seats[i];
      // 9명×9개도 전체 비행 길이는 0.34초 이하. 큰 몫이 긴 대기를 만들지 않는다.
      const delay = (rounds > 1 ? n / (rounds - 1) * 0.12 : 0) + i / Math.max(1, seats.length - 1) * 0.06;
      this.flights.push({sx:src.x, sy:src.y, dx:r.x+r.w/2, dy:r.y+r.h/2, pirate:i, t:-delay, dur:0.16, landed:false});
    }
    this.flights = this.flights.slice(-96);
    this.engine.sound.tone(190, 0, 0.055, {type:'triangle',vol:0.16,sweepTo:115});
    this.roundPulse = 0.2;
  },

  _fire() {
    if (this.practice || this.mode !== 'play' || this.engine.freeze?.active || this._feverEasyActive() !== this.wasFever) return;
    const k = this.predictVal;
    if (!Number.isInteger(k) || k < 1 || k > 9) { this.hint = {type:'choose',t:0}; return; }
    this._cancelGesture();
    const needed = this.divisor * k;
    this.mode = 'waiting'; // 입력 확정은 애니메이션보다 먼저: 재발사/수정 제출 불가
    if (k !== this.q) {
      this.failure = {k, needed, missing:Math.max(0, needed-this.dividend), left:Math.max(0, this.dividend-needed)};
      if (needed <= this.dividend) {
        this.counts.fill(k); this.pile = this.dividend - needed;
        this._launchGems(this.counts.map((_,i)=>i), k);
      }
      // 부족한 수량은 실제로 나누지 않는다. 화면에 필요한 양/부족분만 표시.
      this.engine.answerWrong(this.problem, k, {loseLife:true,onResume:()=>this._advanceBoard()});
      return;
    }
    this.counts.fill(k); this.pile = this.r;
    this._launchGems(this.counts.map((_,i)=>i), k);
    this.mode = 'collect'; // 수학 판정 완료. 수집을 기다리는 동안 계산 시간은 흐르지 않는다.
    this._awardAnswer();
  },

  _awardAnswer() {
    const e = this.engine, before = e.scoreManager.score;
    e.answerCorrect(this.problem, this.q, 120 + e.scoreManager.combo * 10);
    const shown = e.scoreManager.score - before, chest = this._chestRect();
    this.floats.push({x:chest.x+chest.w/2,y:chest.y+L.gu(1),text:`+${shown}`,color:THEME.gold,size:L.font(0.04),t:0,dur:0.6});
    if (!this.nearMissUsed && this.timeLeft > 0 && this.timeLeft <= 0.3) {
      this.nearMissUsed = true; e.reportNearMiss(chest.x, chest.y);
    }
    this.receipt = {t:0,text:`${this.dividend} ÷ ${this.divisor} = ${this.q} … ${this.r}`,
      detail:this.r === 0 ? '딱 나눴다!  빈 상자를 눌러 마무리' : `${this.q}개씩 나눴어요! 남은 ${this.r}개를 상자로`};
  },

  _resetDistribution() {
    if (!this.practice || this.mode !== 'play') return;
    this._clearBoardEffects();
    this.counts = new Array(this.divisor).fill(0);
    this.pile = this.dividend;
    this.hint = null;
    this.engine.sound.play('tick');
  },

  _judge() {
    if (this.engine.freeze?.active) return;
    if (this.practice && this.mode === 'play') {
      if (Math.max(...this.counts) !== Math.min(...this.counts)) { this.hint = {type:'unequal',t:0}; return; }
      if (this.pile >= this.divisor) { this.hint = {type:'more',t:0}; this.returnPulse = 0.3; return; }
      this.mode = 'collect';
    }
    if (this.mode === 'collect') this._complete();
  },

  _complete() {
    if (this.mode !== 'collect') return;
    const e = this.engine;
    this.mode = 'reveal';
    this._cancelGesture();
    // 나머지 보석이 보물상자로 이동하는 연출 준비
    const chest = this._chestRect();
    const src = this._pileAnchor();
    this.movingGems = [];
    for (let i = 0; i < this.pile; i++) {
      this.movingGems.push({
        sx: src.x + (Math.random() - 0.5) * L.gu(2),
        sy: src.y + (Math.random() - 0.5) * L.gu(1),
        dx: chest.x + chest.w / 2,
        dy: chest.y + chest.h / 2,
        t: 0,
      });
    }
    e.particles.emit(chest.x + chest.w / 2, chest.y, 'gem', THEME.gold, 16);
    e.ui.shake(L.gu(0.12), 0.09);
    e.sound.tone(260, 0, 0.08, { type: 'triangle', vol: 0.16, sweepTo: 130 });
    this._haptic(15);

    this.reveal = { t: 0 };
    if (!this.practice) { this.cargoCount++; this.cargoPulse = 0.6; }
    this.receipt = { t: 0, text: `${this.dividend} ÷ ${this.divisor} = ${this.q} … ${this.r}`,
      detail: this.r === 0 ? '딱 나눴다!  나머지 0' : `${this.q}개씩 나누고 ${this.r}개 남았어요` };
  },

  // ── 좌표(L 헬퍼) ──────────────────────────────────────────
  _pileAnchor() {
    const r = this._pileRect();
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  },
  _chestRect() {
    const w = L.gu(5.4);
    const h = L.gu(5.0);
    return { x: L.W - L.safe - w, y: L.zone.playTop + L.gu(1.4), w, h };
  },
  _pileRect() {
    return { x: L.safe, y: L.zone.playTop + L.gu(1.4), w: this._chestRect().x - L.safe - L.gu(0.4), h: L.gu(5.0) };
  },
  _pirateRects() {
    const P = this.divisor;
    const rows = P <= 5 ? 1 : 2;
    const perRow = Math.ceil(P / rows);
    const top = L.zone.playTop + L.gu(7.4);
    const bot = L.zone.controls - L.gu(2.7);
    const gap = L.gu(0.4);
    const areaW = L.W - L.safe * 2;
    const cellW = (areaW - (perRow - 1) * gap) / perRow;
    const cellH = Math.max(L.minTouch, (bot - top - (rows - 1) * gap) / rows);
    const rects = [];
    for (let i = 0; i < P; i++) {
      const rrow = Math.floor(i / perRow);
      const rcol = i % perRow;
      // 마지막 줄이 덜 찼으면 가운데 정렬
      const inRow = Math.min(perRow, P - rrow * perRow);
      const rowW = inRow * cellW + (inRow - 1) * gap;
      const startX = (L.W - rowW) / 2;
      rects.push({ x: startX + rcol * (cellW + gap), y: top + rrow * (cellH + gap), w: cellW, h: cellH });
    }
    return rects;
  },
  // 하단 조작 영역: 1행 = [❓개념][↺다시][🔄 한 바퀴 돌리기], 2행 = [✅ 다 나눴어요!]
  // (개념 버튼을 상단에서 하단 행으로 옮겨 게이지/문제 텍스트와 겹치지 않게 한다)
  _btnRow() {
    return L.zone.controls + L.gu(0.5);
  },
  _btnConcept() {
    return { x: L.safe, y: this._btnRow(), w: L.gu(3.2), h: L.gu(2.4) };
  },
  _btnReset() {
    const c = this._btnConcept();
    return { x: c.x + c.w + L.gu(0.4), y: this._btnRow(), w: L.gu(3.0), h: L.gu(2.4) };
  },
  _btnRound() {
    const r = this._btnReset();
    const x = r.x + r.w + L.gu(0.4);
    return { x, y: this._btnRow(), w: L.W - L.safe - x, h: L.gu(2.4) };
  },
  _btnDone() {
    return { x: L.safe, y: this._btnRow() + L.gu(2.9), w: L.W - L.safe * 2, h: L.gu(2.6) };
  },
  // 예측 모드 스테퍼: [❓개념] 옆의 [−] … [+] (그 사이에 '몇 개씩' 숫자). _btnDone은 '나눠주기!'로 재사용.
  _btnPredMinus() {
    const c = this._btnConcept();
    return { x: c.x + c.w + L.gu(0.4), y: this._btnRow(), w: L.gu(3), h: L.gu(2.4) };
  },
  _btnPredPlus() {
    return { x: L.W - L.safe - L.gu(3), y: this._btnRow(), w: L.gu(3), h: L.gu(2.4) };
  },
  _quantityRect() {
    const m = this._btnPredMinus(), p = this._btnPredPlus();
    return {x:m.x+m.w+L.gu(0.15),y:m.y,w:p.x-m.x-m.w-L.gu(0.3),h:m.h};
  },
  _btnConceptSkip() {
    const b = this._btnConceptClose();
    return {...b, y:b.y+b.h+L.gu(0.3)};
  },
  _btnConceptClose() {
    const w = L.gu(9);
    return { x: (L.W - w) / 2, y: L.y(0.82), w, h: L.gu(2.4) };
  },

  // ── 렌더 ──────────────────────────────────────────────────
  render(ctx) {
    if (this.mode !== 'concept') drawPlayBackdrop(ctx, this.id, this.time || 0);
    this._drawFeverBg(ctx);
    if (this.engine.fever) {
      this.engine.fever.renderGauge(ctx, { x: L.safe, y: L.zone.gauge, w: L.W - L.safe * 2, h: L.gu(0.5) });
    }

    if (this.mode === 'concept') {
      this._drawConcept(ctx);
      this._drawFeverBanner(ctx);
      return;
    }

    this._drawInstruction(ctx);
    this._drawTimer(ctx);
    this._drawPile(ctx);
    this._drawChest(ctx);
    this._drawPirates(ctx);
    this._drawFlights(ctx);
    this._drawButtons(ctx);
    this._drawCargo(ctx);
    if (this.failure) this._drawFailure(ctx);
    else if (this.hint) this._drawHint(ctx);
    else if (!this.feverBanner) this._drawReceipt(ctx);
    if (this.mode === 'reveal') this._drawReveal(ctx);
    this._drawFloats(ctx);
    this._drawFeverBanner(ctx);
  },

  _drawInstruction(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.text;
    const msg = this.practice ? `연습 · 보석 ${this.dividend}개를 ${this.divisor}명에게!` : `보석 ${this.dividend}개 · 해적 ${this.divisor}명 · 몇 개씩?`;
    let size = L.font(0.04);
    ctx.font = font(size);
    const maxW = L.W - L.safe * 2;
    const w = ctx.measureText(msg).width;
    if (w > maxW) size = Math.max(L.font(0.028), (size * maxW) / w);
    ctx.font = font(size);
    ctx.fillText(msg, L.W / 2, L.zone.problem);
    ctx.restore();
  },

  _drawTimer(ctx) {
    const w = L.w(0.5);
    const h = L.gu(0.55);
    const x = L.W / 2 - w / 2;
    const y = L.zone.playTop + L.gu(0.2);
    const ratio = this.practice || this.mode === 'collect' ? 1 : this.timeLimit > 0 ? Math.max(0, this.timeLeft / this.timeLimit) : 0;
    const low = this.timeLeft <= this.timeLimit * NEARMISS_RATIO;
    ctx.save();
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
    if (ratio > 0) {
      roundRect(ctx, x, y, w * ratio, h, h / 2);
      ctx.fillStyle = low ? THEME.wrong : THEME.accent;
      ctx.fill();
    }
    ctx.fillStyle = THEME.text;
    ctx.font = font(Math.round(h * 0.85), 'normal');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = this.practice ? '연습 · 시간 제한 없음' : this.mode === 'collect' ? '정답! 천천히 담아도 돼요' : `${low ? '⏳ ' : ''}${Math.ceil(this.timeLeft)}초`;
    ctx.fillText(label, L.W / 2, y + h / 2);
    ctx.restore();
  },

  _drawPile(ctx) {
    const rect = this._pileRect();
    ctx.save();
    // 밝은 보석 배분기. 입력 가능 여부/색은 정답 여부와 무관하다.
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, L.gu(0.5));
    ctx.fillStyle = '#fff2cd';
    ctx.fill();
    ctx.strokeStyle = '#b97845';
    ctx.lineWidth = L.gu(0.09);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#674631';
    ctx.font = font(L.font(0.026), 'normal');
    ctx.fillText(this.mode === 'play' && !this.practice ? '수량을 골라 한 번에 발사!' : '남은 보석을 상자로 쓱 →', rect.x + rect.w / 2, rect.y + L.gu(0.6));

    if (this.pile <= GEM_ICON_MAX) {
      // 개별 보석 아이콘 격자
      const cols = Math.min(this.pile, 6) || 1;
      const gx = L.gu(1.1);
      const startX = rect.x + rect.w / 2 - ((Math.min(this.pile, cols) - 1) * gx) / 2;
      const startY = rect.y + L.gu(1.5);
      for (let i = 0; i < this.pile; i++) {
        const cc = i % cols;
        const rr = Math.floor(i / cols);
        drawGem(ctx, startX + cc * gx, startY + rr * L.gu(0.68), L.gu(0.32));
      }
    } else {
      // 뭉치 + 개수
      drawGem(ctx, rect.x + L.gu(2), rect.y + rect.h / 2, L.gu(0.7));
      ctx.fillStyle = '#674631';
      ctx.font = font(L.font(0.05));
      ctx.fillText(`× ${this.pile}`, rect.x + rect.w / 2 + L.gu(1), rect.y + rect.h / 2);
    }
    // 남은 개수 라벨(항상)
    ctx.fillStyle = '#674631';
    ctx.font = font(L.font(0.03));
    ctx.fillText(`${this.mode === 'play' && !this.practice ? '보석 총' : '남은 보석'} ${this.pile}개`, rect.x + rect.w / 2, rect.y + rect.h - L.gu(0.6));
    if (this.pile === 0) {
      ctx.font = font(L.font(0.04));
      ctx.fillText('텅!', rect.x + rect.w / 2, rect.y + L.gu(2.5));
    }
    if (this.drag) {
      ctx.strokeStyle = '#218e9a'; ctx.lineWidth = L.gu(0.09);
      ctx.setLineDash([L.gu(0.2), L.gu(0.2)]);
      ctx.beginPath(); ctx.moveTo(this.drag.sx, this.drag.sy); ctx.lineTo(this.drag.x, this.drag.y); ctx.stroke();
      ctx.setLineDash([]);
      drawGem(ctx, this.drag.x, this.drag.y, L.gu(0.48));
    }
    ctx.restore();
  },

  _drawChest(ctx) {
    const r = this._chestRect();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    roundRect(ctx, r.x, r.y, r.w, r.h, L.gu(0.4));
    ctx.fillStyle = '#ffdfa0';
    ctx.fill();
    ctx.strokeStyle = '#a96534';
    ctx.lineWidth = L.gu(0.08);
    ctx.stroke();
    const bob = this.mode === 'reveal' ? Math.sin(this.reveal.t / REVEAL_DUR * Math.PI) * L.gu(0.15) : 0;
    drawTreasureChest(ctx, r.x + r.w / 2, r.y + L.gu(2.1) - bob, L.gu(3.8));
    ctx.fillStyle = '#674631';
    ctx.font = font(L.font(0.024), 'normal');
    // reveal 중이면 나머지 수를 보여준다
    const label = this.failure?.missing ? `${this.failure.missing}개 부족` : this.mode === 'reveal' || this.mode === 'collect' ? (this.r ? `나머지 ${this.r}개!` : '딱 나눴다!') : '나누고 담아요';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h - L.gu(0.5));
    if (this.failure?.missing) {
      ctx.globalAlpha = 0.3;
      const n = Math.min(6, this.failure.missing);
      for (let i=0;i<n;i++) drawGem(ctx, r.x+r.w/2+(i-(n-1)/2)*L.gu(0.55), r.y+L.gu(0.55), L.gu(0.22));
    }
    ctx.restore();
  },

  _drawPirates(ctx) {
    const rects = this._pirateRects();
    const max = this.counts.length ? Math.max(...this.counts) : 0;
    const min = this.counts.length ? Math.min(...this.counts) : 0;
    const showOver = this.hint && this.hint.type === 'unequal' && max > min;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const over = showOver && this.counts[i] === max;
      ctx.save();
      roundRect(ctx, r.x, r.y, r.w, r.h, L.gu(0.4));
      ctx.fillStyle = ['#fff1d6', '#e1f5ee', '#ffe8ee'][i % 3];
      ctx.fill();
      ctx.strokeStyle = over ? THEME.wrong : '#c99966';
      ctx.lineWidth = over ? L.gu(0.18) : L.gu(0.06);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 해적
      const bounce = Math.sin((this.pirateBounces[i] || 0) / 0.18 * Math.PI) * L.gu(0.16);
      drawPirate(ctx, r.x + r.w / 2, r.y + r.h * 0.3 - bounce, Math.min(L.gu(2.3), r.h * 0.55, r.w * 0.9));
      // 받은 개수(크게 — "몇 개씩 갔는지")
      ctx.fillStyle = '#674631';
      ctx.font = font(Math.min(L.font(0.04), r.h * 0.3));
      ctx.fillText(`${this.counts[i]}개`, r.x + r.w / 2, r.y + r.h * 0.75);
      for (let j = 0; j < Math.min(9, this.counts[i]); j++) {
        drawGem(ctx, r.x + L.gu(0.27) + (j % 3) * L.gu(0.24), r.y + r.h - L.gu(0.23) - Math.floor(j / 3) * L.gu(0.24), L.gu(0.13));
      }
      if (over) {
        ctx.fillStyle = THEME.wrong;
        ctx.font = font(L.font(0.024), 'normal');
        ctx.fillText('많아요', r.x + r.w / 2, r.y + r.h - L.gu(0.4));
      }
      ctx.restore();
    }
  },

  _drawButtons(ctx) {
    if (this.mode === 'collect' || this.mode === 'reveal') {
      if (this.practice) this._btn(ctx, this._btnConcept(), '본게임', THEME.panel, L.font(0.026));
      this._btn(ctx, this._btnDone(), '남은 보석 담기  →', '#a5693d', L.font(0.037));
      return;
    }
    this._btn(ctx, this._btnConcept(), this.practice ? '본게임' : '연습', THEME.panel, L.font(0.026));
    if (!this.practice) {
      this._btn(ctx, this._btnPredMinus(), '−', '#218e9a', L.font(0.05));
      this._btn(ctx, this._btnPredPlus(), '+', '#218e9a', L.font(0.05));
      this._drawPredValue(ctx);
      const label = this.predictVal ? `${this.predictVal}개씩 한 번에 발사!` : '몇 개씩 줄지 먼저 골라요';
      this._btn(ctx, this._btnDone(), label, '#218e9a', L.font(0.035));
      return;
    }
    this._btn(ctx, this._btnReset(), '↺ 다시', THEME.panel, L.font(0.03));
    this._btn(ctx, this._btnRound(), '레버 · 1개씩!', '#218e9a', L.font(0.03));
    this._btn(ctx, this._btnDone(), '남은 보석 담기 →', '#a5693d', L.font(0.035));
  },

  _drawPredValue(ctx) {
    const r = this._quantityRect(), cx = r.x+r.w/2;
    ctx.save();
    roundRect(ctx,r.x,r.y,r.w,r.h,L.gu(0.25));ctx.fillStyle='#fff2cd';ctx.fill();
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#674631';ctx.font=font(L.font(0.031));
    ctx.fillText(this.predictVal ? `한 명당 ${this.predictVal}개` : '한 명당 ?개',cx,r.y+L.gu(0.85));
    for(let i=0;i<9;i++){
      ctx.fillStyle=this.predictVal===i+1?'#218e9a':'#ceba8c';
      const x=r.x+L.gu(0.25)+(r.w-L.gu(0.5))*i/8;
      ctx.beginPath();ctx.arc(x,r.y+r.h-L.gu(0.55),L.gu(this.predictVal===i+1?0.11:0.06),0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  },

  _drawFailure(ctx) {
    const f=this.failure;
    const text=f.missing ? `${f.k}개씩 주려면 ${f.needed}개 필요 · ${f.missing}개 부족해요`
      : `${f.k}개씩 나누면 ${f.left}개가 남아 한 번 더 나눌 수 있어요`;
    ctx.save();ctx.fillStyle='#fff2cd';
    roundRect(ctx,L.safe,L.zone.controls-L.gu(2.1),L.W-L.safe*2,L.gu(1.8),L.gu(0.3));ctx.fill();
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#674631';ctx.font=font(L.font(0.028));
    const size=Math.min(L.font(0.028),L.font(0.028)*(L.W-L.safe*3)/ctx.measureText(text).width);ctx.font=font(size);
    ctx.fillText(text,L.W/2,L.zone.controls-L.gu(1.2));
    ctx.restore();
  },

  _btn(ctx, r, label, color, fsize) {
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, L.gu(0.4));
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = L.gu(0.06);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(fsize);
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
    ctx.restore();
  },

  _drawHint(ctx) {
    if (!this.hint) return;
    let msg = '';
    if (this.hint.type === 'unequal') msg = '똑같이 나눠야 해요! (많이 받은 해적 확인)';
    else if (this.hint.type === 'more') msg = '아직 더 나눌 수 있어요!';
    else if (this.hint.type === 'nofull') msg = `${this.pile}개로는 ${this.divisor}명에게 못 나눠요`;
    else if (this.hint.type === 'giveleast') msg = '적게 받은 해적부터 주세요!';
    else if (this.hint.type === 'choose') msg = '몇 개씩 줄지 먼저 골라요!';
    if (!msg) return;
    ctx.save();
    ctx.globalAlpha = this.hint.t < HINT_DUR - 0.4 ? 1 : Math.max(0, (HINT_DUR - this.hint.t) / 0.4);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.wrong;
    let size = L.font(0.034);
    ctx.font = font(size);
    const maxW = L.W - L.safe * 2;
    const w = ctx.measureText(msg).width;
    if (w > maxW) size = Math.max(L.font(0.024), (size * maxW) / w);
    ctx.font = font(size);
    drawRewardText(ctx, msg, L.W / 2, this._btnRow() - L.gu(1));
    ctx.restore();
  },

  _drawReveal(ctx) {
    // 이동하는 나머지 보석
    for (const g of this.movingGems) {
      const t = ease(g.t);
      const x = g.sx + (g.dx - g.sx) * t;
      const y = g.sy + (g.dy - g.sy) * t;
      ctx.save();
      ctx.globalAlpha = 1 - g.t * 0.3;
      drawGem(ctx, x, y - Math.sin(t * Math.PI) * L.gu(0.5), L.gu(0.36));
      ctx.restore();
    }
  },

  _drawReceipt(ctx) {
    if (!this.receipt) return;
    const r = this.receipt;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (2.4 - r.t) / 0.3);
    roundRect(ctx, L.safe, L.zone.controls - L.gu(2.1), L.W - L.safe * 2, L.gu(1.8), L.gu(0.3));
    ctx.fillStyle = '#fff8e9'; ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#674631'; ctx.font = font(L.font(0.027));
    ctx.fillText(`방금 나눈 식  ${r.text}`, L.W / 2, L.zone.controls - L.gu(1.5));
    ctx.font = font(L.font(0.022), 'normal');
    ctx.fillText(r.detail, L.W / 2, L.zone.controls - L.gu(0.65));
    ctx.restore();
  },

  _drawFlights(ctx) {
    for (const f of this.flights) {
      if (f.t < 0 || f.landed) continue;
      const p = clamp(f.t / f.dur, 0, 1);
      const x = f.sx + (f.dx - f.sx) * p;
      const y = f.sy + (f.dy - f.sy) * p - Math.sin(p * Math.PI) * L.gu(1.2);
      ctx.save();
      ctx.strokeStyle = '#ffd780'; ctx.lineWidth = L.gu(0.08);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (f.dx - f.sx) * 0.05, y - L.gu(0.5)); ctx.stroke();
      drawGem(ctx, x, y, L.gu(this._feverEasyActive() ? 0.45 : 0.36));
      ctx.restore();
    }
    if (this.returnPulse > 0) {
      const p = 1 - this.returnPulse / 0.3, a = this._pileAnchor(), c = this._chestRect();
      // 수량을 변경하지 않는 되돌아오기 신호. 실제 보석 수와 구분한다.
      ctx.save(); ctx.globalAlpha = 1 - p; ctx.fillStyle = '#674631';
      ctx.textAlign = 'center'; ctx.font = font(L.font(0.04));
      ctx.fillText('↶', c.x + (a.x - c.x) * p, a.y - L.gu(0.5)); ctx.restore();
    }
  },

  _drawCargo(ctx) {
    const voyages = Math.floor(this.cargoCount / CARGO_PER_SHIP);
    const slots = this.cargoCount ? (this.cargoCount - 1) % CARGO_PER_SHIP + 1 : 0;
    const y = L.zone.floor + L.gu(0.8);
    const left = L.safe + L.gu(0.8), right = L.W - L.safe - L.gu(0.8);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(L.font(0.024)); ctx.fillStyle = '#614330';
    ctx.fillText(this.practice ? '연습 중 · 점수와 짐은 늘지 않아요' : `내 보물선 · 짐 ${this.cargoCount}개 · 출항 ${voyages}번`, L.W / 2, y - L.gu(1.35));
    ctx.strokeStyle = '#478eaa'; ctx.lineWidth = L.gu(0.06);
    ctx.beginPath();
    for (let i = 0; i <= 36; i++) {
      const x = left + (right - left) * i / 36;
      const wy = y + L.gu(0.8) + Math.sin(i * 0.7 + this.time * 2) * L.gu(0.06);
      if (!i) ctx.moveTo(x, wy); else ctx.lineTo(x, wy);
    }
    ctx.stroke();
    ctx.fillStyle = '#b47649'; ctx.strokeStyle = '#704932'; ctx.lineWidth = L.gu(0.06);
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.lineTo(right - L.gu(0.7), y + L.gu(0.65));
    ctx.quadraticCurveTo(L.W / 2, y + L.gu(0.95), left + L.gu(0.7), y + L.gu(0.65)); ctx.closePath(); ctx.fill(); ctx.stroke();
    const step = (right - left - L.gu(1.4)) / CARGO_PER_SHIP;
    const rewards = ['📦', '🐚', '💎', '🎁', '👑', '🏴‍☠️'];
    for (let i = 0; i < CARGO_PER_SHIP; i++) {
      const x = left + L.gu(0.7) + step * (i + 0.5);
      const bounce = i === slots - 1 ? Math.sin(this.cargoPulse / 0.6 * Math.PI) * L.gu(0.18) : 0;
      ctx.globalAlpha = i < slots ? 1 : 0.22;
      ctx.font = font(L.font(0.03));
      ctx.fillText(rewards[i], x, y - L.gu(0.38) - bounce);
    }
    ctx.restore();
  },

  _drawConcept(ctx) {
    ctx.save();ctx.fillStyle='#fff4d7';ctx.fillRect(0,L.zone.hudBottom,L.W,L.H-L.zone.hudBottom);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#674631';ctx.font=font(L.font(0.045));
    ctx.fillText('해적 보물 분배소',L.W/2,L.zone.playTop);
    ctx.font=font(L.font(0.033));
    ctx.fillText('보석 17개를 5명에게 똑같이!',L.W/2,L.zone.playTop+L.gu(2));
    for(let i=0;i<5;i++){
      const x=L.safe+L.gu(1.5)+(L.W-L.safe*2-L.gu(3))*i/4;
      drawPirate(ctx,x,L.zone.playTop+L.gu(5),L.gu(2));
      ctx.fillStyle='#674631';ctx.font=font(L.font(0.032));ctx.fillText('3개',x,L.zone.playTop+L.gu(6.7));
    }
    ctx.font=font(L.font(0.037));ctx.fillText('17 ÷ 5 = 3 … 2',L.W/2,L.zone.playTop+L.gu(9));
    ctx.font=font(L.font(0.029),'normal');
    ctx.fillText('① 몇 개씩 줄지 고르기',L.W/2,L.zone.playTop+L.gu(11.3));
    ctx.fillText('② 한 번에 발사해서 확인!',L.W/2,L.zone.playTop+L.gu(12.7));
    ctx.fillText('③ 맞혔으면 남은 보석 담기',L.W/2,L.zone.playTop+L.gu(14.1));
    ctx.fillText('연습은 자유 배분 · 점수 없음',L.W/2,L.zone.playTop+L.gu(16.4));
    this._btn(ctx,this._btnConceptClose(),'먼저 나누기 연습','#218e9a',L.font(0.029));
    this._btn(ctx,this._btnConceptSkip(),'바로 본게임 시작','#a5693d',L.font(0.029));
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
      drawRewardText(ctx, t.text, t.x, t.y - p * L.gu(0.65));
      ctx.restore();
    }
  },

  onHover(x, y) {
    if(this.mode==='concept')return hitRect(this._btnConceptClose(),x,y)||hitRect(this._btnConceptSkip(),x,y);
    if(this.practice&&hitRect(this._btnConcept(),x,y))return true;
    if(this.mode==='collect')return [this._chestRect(),this._pileRect(),this._btnDone()].some(r=>hitRect(r,x,y));
    if(this.mode!=='play')return false;
    const buttons=this.practice?[this._btnConcept(),this._btnReset(),this._btnRound(),this._btnDone(),this._chestRect(),this._pileRect(),...this._pirateRects()]
      :[this._btnConcept(),this._btnPredMinus(),this._btnPredPlus(),this._quantityRect(),this._btnDone()];
    return buttons.some(r=>hitRect(r,x,y));
  },
  clearHover() { this._cancelGesture(); },
  onKey(ev) {
    if(ev.repeat||this.engine.freeze?.active)return;
    if(this.mode==='collect'&&ev.key==='Enter'){ev.preventDefault?.();this._judge();return;}
    if(this.mode!=='play'||(!this.practice&&this._feverEasyActive()!==this.wasFever))return;
    if(!this.practice&&/^[1-9]$/.test(ev.key))this._setQuantity(Number(ev.key));
    if(!this.practice&&ev.key==='ArrowLeft'){ev.preventDefault?.();this._setQuantity(Math.max(1,this.predictVal-1));}
    if(!this.practice&&ev.key==='ArrowRight'){ev.preventDefault?.();this._setQuantity(Math.min(9,this.predictVal+1));}
    if(ev.key===' '||ev.key==='Enter'){
      ev.preventDefault?.();
      if(this.practice){ev.key===' '?this._dealRound():this._judge();}else this._fire();
    }
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
    if (this.practice) return 0;
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
    if (!this.feverBanner || this.hint || this.failure || this.practice || this.mode === 'concept') return;
    const b = this.feverBanner;
    const prog = b.t / b.dur;
    ctx.save();
    ctx.globalAlpha = prog < 0.7 ? 1 : Math.max(0, 1 - (prog - 0.7) / 0.3);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    roundRect(ctx, L.safe, L.zone.controls - L.gu(2.1), L.W - L.safe * 2, L.gu(1.8), L.gu(0.3));
    ctx.fillStyle = '#ffefbb'; ctx.fill();
    const label = `피버에서 +${b.points}점!`;
    ctx.font = font(L.font(0.035));
    const size = Math.min(L.font(0.035), L.font(0.035) * (L.W - L.safe * 3) / ctx.measureText(label).width);
    ctx.font = font(size); ctx.fillStyle = '#674631';
    ctx.fillText(label, L.W / 2, L.zone.controls - L.gu(1.2));
    ctx.restore();
  },

  destroy() {
    this.engine?.canvas?.removeEventListener('touchcancel', this._cancelGesture, true);
    this.engine?.canvas?.removeEventListener('touchstart', this._pauseGesture, true);
    this.engine?.canvas?.removeEventListener('mousedown', this._pauseGesture, true);
    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', this._cancelGesture);
      window.removeEventListener('keydown', this._pauseGesture, true);
    }
    this._clearBoardEffects();
    this.savedNormal = this.receipt = this.practiceReturn = null;
    this.engine = null;
    this.counts = [];
    this.problem = null;
    this.movingGems = [];
    this.floats = [];
    this.feverBanner = null;
  },
};

// ── 모듈 로컬 헬퍼(core 미수정) ──────────────────────────────
function hitRect(r, x, y) {
  return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function ri(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function ease(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// 코드 기반 장난감 보석. 논리 크기는 L에서 받은 반지름으로만 결정한다.
function drawGem(ctx, x, y, r) {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.moveTo(-r, -r * 0.35); ctx.lineTo(-r * 0.5, -r * 0.85);
  ctx.lineTo(r * 0.5, -r * 0.85); ctx.lineTo(r, -r * 0.35); ctx.lineTo(0, r); ctx.closePath();
  ctx.fillStyle = '#62d5e7'; ctx.fill(); ctx.strokeStyle = '#218da8'; ctx.lineWidth = r * 0.13; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-r, -r * 0.35); ctx.lineTo(r, -r * 0.35); ctx.lineTo(0, r);
  ctx.lineTo(r * 0.35, -r * 0.35); ctx.lineTo(-r * 0.5, -r * 0.85);
  ctx.strokeStyle = '#e5ffff'; ctx.stroke(); ctx.restore();
}
