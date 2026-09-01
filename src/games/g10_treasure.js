// g10_treasure.js — 💎 나머지 보물찾기 (SPEC §4 🔟 / Phase 5, 개정안)
// 나눗셈 심화. 확정 인터페이스(SPEC §7)만 사용한다. core/scenes는 절대 건드리지 않는다.
//
// ⚠️ 개정안(원안 폐기): 원안은 "보물상자에서 몫 선택 → 보석에서 나머지 선택"의 2단계 객관식이었다.
//   개정 이유 — 2단계 객관식은 '정답 선택에 그림만 입힌 구조'라 나눗셈의 '의미'가 드러나지 않는다.
//   개정안은 숫자를 고르는 대신 '실제로 나누는 행동'을 한다: 보석을 해적들에게 똑같이 배분하고,
//   더 못 나누면 [다 나눴어요!]를 누른다 → 화면에 식이 조립된다 (17 ÷ 5 = 3 … 2).
//
// ⚠️ 배분 조작 방식(택1): '해적 탭 → 그 해적이 보석 1개 받음' 을 채택했다(원안 후보 중 단순한 쪽).
//   근거: 아이가 '누구에게 몇 개를 줄지'를 직접 정하고 각 해적의 개수가 커지는 걸 눈으로 보게 되어
//   "몇 개씩 갔는지"가 그대로 드러난다(교육 목적에 부합). 속도 보완은 '해적 길게 누르기' 대신
//   [🔄 한 바퀴 돌리기] 버튼(모든 해적에게 하나씩 동시 배분)을 택했다 — 태블릿에서 롱프레스보다
//   오조작이 적고, 똑같이 나누기가 빨라 균등 배분을 자연히 유도한다. 배분을 처음부터 다시 하려면
//   [↺ 다시 담기]로 모든 보석을 통에 되돌린다.
//
// 판정: 각 해적이 똑같은 수 q개씩 받고 남은 보석이 divisor보다 적으면 정답(= q개씩, 나머지 r).
//   - 똑같이 안 나눔 → 어느 해적이 더 받았는지 표시 + 재시도(라이프 유지, 배분 실수는 계산 오류 아님)
//   - 더 나눌 수 있음(남은 보석 ≥ 해적 수) → "아직 더 나눌 수 있어요" + 재시도(라이프 유지)
//   라이프는 시간초과(판정 오류)로만 깎인다.
//
// ⚠️ 이 게임은 '보석 수·해적 수'가 개정안 난이도 밴드로 정해지므로(원안 나눗셈 사다리는 피제수가
//   너무 커서 손으로 배분 불가 — 96개 배분은 무리), g08처럼 게임이 숫자를 직접 생성해 나눗셈
//   '사실 객체'를 만들어 answerCorrect/timeUp 에 넘긴다. 세션·복습큐·레벨조정은 core가 처리.
//   밴드 선택에는 problemGenerator.currentLevel(공개 필드)을 읽는다(=어떤 크기의 나눗셈을 낼지).
//
// 재미 표준(§2.6): fever:true, comboMilestones, L 헬퍼 좌표, 손맛.
//   니어미스: 제한시간을 넉넉히 남기고 완료. 고유 재미: 배분이 끝나는 순간 식이 조립되는 연출 +
//   나머지 보석이 보물상자로 들어가며 반짝임.
//
// 개념 설명 화면(이 게임만): 첫 진입 1회 자동, 이후 [❓개념] 버튼으로 재접근.
//   ⚠️ 원안/개정안은 "튜토리얼 화면의 [개념 다시보기]"를 말하지만 tutorialScene은 core라 수정 금지.
//   대신 재접근 버튼을 '게임 화면 안'에 두어 같은 의도(언제든 개념 재확인)를 충족한다.

import { L } from '../core/layout.js';
import { THEME, font, roundRect } from '../core/ui.js';

const CONCEPT_KEY = 'g10_remain.conceptSeen'; // storage가 mathArcade. 접두
const REVEAL_DUR = 1.2; // 식 조립 연출(초) — 긍정적 순간, 오답 정지(1.2s)보다 부드럽게
const HINT_DUR = 1.6; // 배분 실수 안내 지속(초)
const GEM_ICON_MAX = 20; // 이 수를 넘으면 개별 아이콘 대신 뭉치로 표시
const NEARMISS_RATIO = 0.35; // 제한시간의 이 비율 이상 남기고 완료 → 니어미스

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
    text: '보석을 해적들에게 똑같이 나눠주고, 더 못 나누면 [다 나눴어요!]를 눌러!',
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
      ctx.fillText('해적을 눌러 하나씩 · 🔄 한 바퀴로 빠르게', cx, L.gu(8.4));
    },
  },

  init(engine) {
    this.engine = engine;
    this.mode = 'concept'; // 'concept' | 'play' | 'reveal'
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
    this.wasFever = false;
    this.feverBanner = null;
    this.time = 0;

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
    const easy = this._feverEasyActive();
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

    this.dividend = D;
    this.divisor = P;
    this.q = q;
    this.r = r;
    this.counts = new Array(P).fill(0);
    this.pile = D;
    this.nearMissUsed = false;
    this.hint = null;
    this.reveal = null;
    this.movingGems = [];

    // 피버 easy 문제는 실제로 쉬우므로 리포트 오분류를 막기 위해 level=1로 기록(축 A 자체는 불변).
    this.problem = { a: D, b: P, op: '÷', answer: q, remainder: r > 0 ? r : null, text: `${D} ÷ ${P}`, blank: null, level: easy ? 1 : level };

    // 제한시간: 보석 수에 비례(넉넉히). 교사 배율 반영.
    const base = 8 + D * 0.7;
    this.timeLimit = base * (e.settings.timeScale || 1);
    this.timeLeft = this.timeLimit;
    this.mode = 'play';
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

    if (this.roundPulse > 0) this.roundPulse = Math.max(0, this.roundPulse - dt);
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
      for (const g of this.movingGems) g.t = Math.min(1, g.t + dt / 0.5);
      if (this.reveal.t >= REVEAL_DUR) this._nextProblem();
      return;
    }

    // play — 제한시간(정지/개념/리빌 중엔 진행 안 함)
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      // 시간초과 = 판정 오류 → 라이프 -1 + 정답식 표시(core 1.2초 정지)
      this.engine.timeUp(this.problem, { loseLife: true, onResume: () => this._nextProblem() });
    }
  },

  // ── 입력 ──────────────────────────────────────────────────
  onTouch(x, y, phase) {
    if (phase !== 'start') return;

    if (this.mode === 'concept') {
      if (hitRect(this._btnConceptClose(), x, y)) {
        this.engine.storage.set(CONCEPT_KEY, true);
        if (this.conceptReturn === 'start') this._nextProblem();
        else this.mode = 'play';
      }
      return;
    }
    if (this.mode === 'reveal') return;

    // play
    if (hitRect(this._btnConcept(), x, y)) {
      this.conceptReturn = 'play';
      this.conceptT = 0;
      this.mode = 'concept';
      return;
    }
    if (hitRect(this._btnDone(), x, y)) {
      this._judge();
      return;
    }
    if (hitRect(this._btnRound(), x, y)) {
      this._dealRound();
      return;
    }
    if (hitRect(this._btnReset(), x, y)) {
      this._resetDistribution();
      return;
    }
    // 해적 탭 → 보석 1개 배분
    const rects = this._pirateRects();
    for (let i = 0; i < rects.length; i++) {
      if (hitRect(rects[i], x, y)) {
        this._giveOne(i);
        return;
      }
    }
  },

  _giveOne(i) {
    if (this.pile <= 0) return;
    this.pile -= 1;
    this.counts[i] += 1;
    this.hint = null;
    const r = this._pirateRects()[i];
    this.engine.particles.emit(r.x + r.w / 2, r.y + L.gu(0.4), 'sparkle', THEME.accent, 6);
    this.engine.sound.play('tick');
    this._haptic(10);
  },

  _dealRound() {
    if (this.pile < this.divisor) {
      // 한 바퀴 돌릴 만큼 안 남음 → 가벼운 안내(라이프 영향 없음)
      this.hint = { type: 'nofull', t: 0 };
      this.engine.ui.shake(6, 0.1);
      return;
    }
    for (let i = 0; i < this.divisor; i++) this.counts[i] += 1;
    this.pile -= this.divisor;
    this.hint = null;
    this.roundPulse = 0.35;
    const rects = this._pirateRects();
    for (const r of rects) this.engine.particles.emit(r.x + r.w / 2, r.y + L.gu(0.4), 'pop', THEME.gold, 5);
    this.engine.sound.play('pop');
    this._haptic(15);
  },

  _resetDistribution() {
    this.counts = new Array(this.divisor).fill(0);
    this.pile = this.dividend;
    this.hint = null;
    this.engine.sound.play('tick');
  },

  _judge() {
    const e = this.engine;
    const max = Math.max(...this.counts);
    const min = Math.min(...this.counts);
    const allEqual = max === min;

    if (!allEqual) {
      // 똑같이 안 나눔 → 어느 해적이 더 받았는지 + 재시도(라이프 유지)
      this.hint = { type: 'unequal', t: 0 };
      e.ui.shake(10, 0.12);
      e.sound.play('wrong');
      return;
    }
    if (this.pile >= this.divisor) {
      // 더 나눌 수 있음 → 재시도(라이프 유지)
      this.hint = { type: 'more', t: 0 };
      e.ui.shake(8, 0.12);
      e.sound.play('wrong');
      return;
    }
    // 정답: 균등 + 남은 보석 < 해적 수 → 각 q개, 나머지 pile(=r)
    this._complete();
  },

  _complete() {
    const e = this.engine;
    const combo = e.scoreManager.combo;
    let pts = 120 + combo * 10;
    if (this.r > 0) pts += 40; // 나머지 있는 문제 가산
    e.answerCorrect(this.problem, this.q, pts); // 점수배수·게이지·정답음·콤보문구 자동
    const shown = pts * (e.fever && e.fever.active ? e.fever.scoreMultiplier : 1);

    // 니어미스: 제한시간을 넉넉히 남기고 완료
    if (!this.nearMissUsed && this.timeLeft >= this.timeLimit * NEARMISS_RATIO) {
      this.nearMissUsed = true;
      e.reportNearMiss(L.W / 2, L.y(0.45));
    }

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
    this.floats.push({ x: L.W / 2, y: L.y(0.4), text: `+${shown}`, color: THEME.gold, size: L.font(0.05), t: 0, dur: 0.8 });
    e.particles.emit(chest.x + chest.w / 2, chest.y, 'gem', THEME.gold, 16);
    e.ui.flash('rgba(255,220,140,0.3)', 0.1);
    e.ui.shake(6, 0.1);
    this._haptic(15);

    this.reveal = { t: 0 };
    this.mode = 'reveal';
  },

  // ── 좌표(L 헬퍼) ──────────────────────────────────────────
  _pileAnchor() {
    return { x: L.W * 0.36, y: L.zone.playTop + L.gu(3.4) };
  },
  _chestRect() {
    const w = L.gu(3.4);
    const h = L.gu(2.4);
    return { x: L.W - L.safe - w, y: L.zone.playTop + L.gu(1.4), w, h };
  },
  _pileRect() {
    return { x: L.safe, y: L.zone.playTop + L.gu(1.4), w: L.W * 0.62, h: L.gu(5.2) };
  },
  _pirateRects() {
    const P = this.divisor;
    const rows = P <= 5 ? 1 : 2;
    const perRow = Math.ceil(P / rows);
    const top = L.y(0.44);
    const bot = L.zone.controls - L.gu(1.2);
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
  _btnConceptClose() {
    const w = L.gu(9);
    return { x: (L.W - w) / 2, y: L.y(0.82), w, h: L.gu(2.4) };
  },

  // ── 렌더 ──────────────────────────────────────────────────
  render(ctx) {
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
    this._drawButtons(ctx);
    this._drawHint(ctx);
    if (this.mode === 'reveal') this._drawReveal(ctx);
    this._drawFloats(ctx);
    this._drawFeverBanner(ctx);
  },

  _drawInstruction(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.text;
    const msg = `보석 ${this.dividend}개를 해적 ${this.divisor}명에게 똑같이!`;
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
    const ratio = this.timeLimit > 0 ? Math.max(0, this.timeLeft / this.timeLimit) : 0;
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
    ctx.fillText(`${low ? '⏳ ' : ''}${Math.ceil(this.timeLeft)}초`, L.W / 2, y + h / 2);
    ctx.restore();
  },

  _drawPile(ctx) {
    const rect = this._pileRect();
    ctx.save();
    // 통(보석 더미) 배경
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, L.gu(0.5));
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = L.gu(0.06);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.subtext;
    ctx.font = font(L.font(0.026), 'normal');
    ctx.fillText('보석 통', rect.x + rect.w / 2, rect.y + L.gu(0.6));

    if (this.pile <= GEM_ICON_MAX) {
      // 개별 보석 아이콘 격자
      const cols = Math.min(this.pile, 6) || 1;
      const gx = L.font(0.045);
      const startX = rect.x + rect.w / 2 - ((Math.min(this.pile, cols) - 1) * gx) / 2;
      const startY = rect.y + L.gu(1.6);
      for (let i = 0; i < this.pile; i++) {
        const cc = i % cols;
        const rr = Math.floor(i / cols);
        ctx.font = font(L.font(0.04));
        ctx.fillStyle = '#fff';
        ctx.fillText('💎', startX + cc * gx, startY + rr * L.gu(1.3));
      }
    } else {
      // 뭉치 + 개수
      ctx.font = font(L.font(0.08));
      ctx.fillText('💎', rect.x + rect.w / 2, rect.y + rect.h / 2 + L.gu(0.2));
      ctx.fillStyle = THEME.gold;
      ctx.font = font(L.font(0.05));
      ctx.fillText(`× ${this.pile}`, rect.x + rect.w / 2 + L.gu(2.2), rect.y + rect.h / 2 + L.gu(0.2));
    }
    // 남은 개수 라벨(항상)
    ctx.fillStyle = THEME.text;
    ctx.font = font(L.font(0.03));
    ctx.fillText(`남은 보석 ${this.pile}개`, rect.x + rect.w / 2, rect.y + rect.h - L.gu(0.6));
    ctx.restore();
  },

  _drawChest(ctx) {
    const r = this._chestRect();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    roundRect(ctx, r.x, r.y, r.w, r.h, L.gu(0.4));
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    ctx.strokeStyle = THEME.gold;
    ctx.lineWidth = L.gu(0.08);
    ctx.stroke();
    ctx.font = font(L.font(0.055));
    ctx.fillText('🧰', r.x + r.w / 2, r.y + r.h * 0.42);
    ctx.fillStyle = THEME.subtext;
    ctx.font = font(L.font(0.024), 'normal');
    // reveal 중이면 나머지 수를 보여준다
    const label = this.mode === 'reveal' ? `나머지 ${this.r}` : '나머지 통';
    ctx.fillStyle = this.mode === 'reveal' ? THEME.gold : THEME.subtext;
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h - L.gu(0.5));
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
      ctx.fillStyle = THEME.panel;
      ctx.fill();
      ctx.strokeStyle = over ? THEME.wrong : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = over ? L.gu(0.18) : L.gu(0.06);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 해적
      ctx.font = font(Math.min(L.font(0.05), r.h * 0.34));
      ctx.fillText('🏴‍☠️', r.x + r.w / 2, r.y + r.h * 0.3);
      // 받은 개수(크게 — "몇 개씩 갔는지")
      ctx.fillStyle = '#fff';
      ctx.font = font(Math.min(L.font(0.06), r.h * 0.4));
      ctx.fillText(`💎${this.counts[i]}`, r.x + r.w / 2, r.y + r.h * 0.72);
      if (over) {
        ctx.fillStyle = THEME.wrong;
        ctx.font = font(L.font(0.024), 'normal');
        ctx.fillText('많아요', r.x + r.w / 2, r.y + r.h - L.gu(0.4));
      }
      ctx.restore();
    }
  },

  _drawButtons(ctx) {
    this._btn(ctx, this._btnReset(), '↺ 다시', THEME.panel, L.font(0.03));
    this._btn(ctx, this._btnRound(), '🔄 한 바퀴 돌리기', this.roundPulse > 0 ? THEME.gold : THEME.accent, L.font(0.036));
    this._btn(ctx, this._btnDone(), '✅ 다 나눴어요!', THEME.correct, L.font(0.044));
    // 개념 재접근 버튼(좌상단)
    this._btn(ctx, this._btnConcept(), '❓개념', THEME.panel, L.font(0.026));
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
    else if (this.hint.type === 'nofull') msg = '한 바퀴 돌리기엔 보석이 모자라요';
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
    ctx.fillText(msg, L.W / 2, this._btnRow() - L.gu(1));
    ctx.restore();
  },

  _drawReveal(ctx) {
    const p = Math.min(1, this.reveal.t / (REVEAL_DUR * 0.6));
    // 이동하는 나머지 보석
    for (const g of this.movingGems) {
      const t = ease(g.t);
      const x = g.sx + (g.dx - g.sx) * t;
      const y = g.sy + (g.dy - g.sy) * t;
      ctx.save();
      ctx.globalAlpha = 1 - g.t * 0.3;
      ctx.font = font(L.font(0.04));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💎', x, y);
      ctx.restore();
    }
    // 조립되는 식
    const lines = this.r > 0 ? [`${this.dividend} ÷ ${this.divisor} = ${this.q} … ${this.r}`, `${this.dividend} = ${this.divisor} × ${this.q} + ${this.r}`] : [`${this.dividend} ÷ ${this.divisor} = ${this.q}`];
    ctx.save();
    ctx.globalAlpha = p;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.gold;
    let size = L.font(0.06);
    ctx.font = font(size);
    const maxW = L.W - L.safe * 2;
    const w0 = ctx.measureText(lines[0]).width;
    if (w0 > maxW) size = Math.max(L.font(0.04), (size * maxW) / w0);
    ctx.font = font(size);
    ctx.fillText(lines[0], L.W / 2, L.y(0.4));
    if (lines[1]) {
      ctx.fillStyle = THEME.text;
      ctx.font = font(size * 0.7);
      ctx.fillText(lines[1], L.W / 2, L.y(0.4) + L.gu(2));
    }
    ctx.restore();
  },

  _drawConcept(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(10,15,25,0.92)';
    ctx.fillRect(0, L.zone.hudBottom, L.W, L.H - L.zone.hudBottom);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = THEME.gold;
    ctx.font = font(L.font(0.05));
    ctx.fillText('나머지가 뭘까?', L.W / 2, L.y(0.2));
    ctx.fillStyle = THEME.text;
    ctx.font = font(L.font(0.032), 'normal');
    ctx.fillText('사탕 17개를 5개씩 묶어보자!', L.W / 2, L.y(0.26));

    // 17개 사탕을 5개씩 3묶음 + 2개 남음. conceptT 에 따라 묶음이 하나씩 생긴다.
    const total = 17;
    const per = 5;
    const groups = Math.floor(total / per); // 3
    const shownGroups = Math.min(groups, Math.floor(this.conceptT / 0.8));
    const cellSize = L.gu(1.3);
    const areaTop = L.y(0.34);
    const groupGapY = L.gu(2.0);
    for (let gi = 0; gi < groups; gi++) {
      const gy = areaTop + gi * groupGapY;
      const gx0 = L.W / 2 - (per * cellSize) / 2 + cellSize / 2;
      const bound = gi < shownGroups;
      if (bound) {
        // 묶음 테두리
        ctx.strokeStyle = THEME.correct;
        ctx.lineWidth = L.gu(0.12);
        roundRect(ctx, gx0 - cellSize * 0.7, gy - cellSize * 0.7, per * cellSize + cellSize * 0.4, cellSize * 1.4, L.gu(0.6));
        ctx.stroke();
      }
      for (let k = 0; k < per; k++) {
        ctx.font = font(L.font(0.036));
        ctx.fillStyle = '#fff';
        ctx.fillText('🍬', gx0 + k * cellSize, gy);
      }
    }
    // 남은 2개(나머지)
    const remY = areaTop + groups * groupGapY;
    const showRemain = this.conceptT >= groups * 0.8;
    for (let k = 0; k < total - groups * per; k++) {
      ctx.font = font(L.font(0.036));
      ctx.globalAlpha = showRemain ? 1 : 0.25;
      ctx.fillText('🍬', L.W / 2 - cellSize / 2 + k * cellSize, remY);
      ctx.globalAlpha = 1;
    }
    if (showRemain) {
      ctx.fillStyle = THEME.gold;
      ctx.font = font(L.font(0.034));
      ctx.fillText('← 남은 2개가 나머지!', L.W / 2 + L.gu(3.4), remY);
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.03), 'normal');
      ctx.fillText('17 ÷ 5 = 3 … 2', L.W / 2, remY + L.gu(1.8));
      ctx.fillStyle = THEME.subtext;
      ctx.fillText('나누고 남은 것을 나머지라고 해!', L.W / 2, remY + L.gu(3));
    }

    // 시작/닫기 버튼
    const b = this._btnConceptClose();
    roundRect(ctx, b.x, b.y, b.w, b.h, L.gu(0.5));
    ctx.fillStyle = THEME.correct;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = font(L.font(0.04));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.conceptReturn === 'start' ? '시작하기 →' : '닫기', b.x + b.w / 2, b.y + b.h / 2);
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
    if (this.mode === 'concept') return hitRect(this._btnConceptClose(), x, y);
    if (this.mode === 'reveal') return false;
    if (hitRect(this._btnDone(), x, y) || hitRect(this._btnRound(), x, y) || hitRect(this._btnReset(), x, y) || hitRect(this._btnConcept(), x, y)) return true;
    for (const r of this._pirateRects()) if (hitRect(r, x, y)) return true;
    return false;
  },
  clearHover() {},
  onKey() {},

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
    ctx.strokeText(`FEVER +${b.points}`, L.W / 2, L.H * 0.95);
    ctx.fillStyle = THEME.gold;
    ctx.fillText(`FEVER +${b.points}`, L.W / 2, L.H * 0.95);
    ctx.restore();
  },

  destroy() {
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
