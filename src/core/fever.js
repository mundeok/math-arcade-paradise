// fever.js — 피버 시스템 공통 모듈 (재미 표준: g02_catch에서 검증한 피버를 core로 추출)
// SPEC §2.5 '재미 표준' / §7. 게임은 선택적으로 opt-in 한다(게임 객체의 fever 필드).
//
// 역할 분담:
//   - 게이지·타이머·램프·grace 등 '피버 상태'는 이 모듈이 전담한다.
//   - 배수(점수·속도·판정완화)는 '값'만 제공하고, 실제 적용은 게임/엔진이 조회해서 한다.
//     · 점수 배수(기본 3배, 연타 보너스로 4~5배)·게이지 가감·피버 무적은
//       engine.answerCorrect/answerWrong 이 자동 처리한다(피버 opt-in 시).
//     · 속도 1.35배·판정 1.2배·크기 1.1배는 게임이 자기 로직에 곱해 쓴다(게임마다 다르므로).
//   - 게이지 바 렌더는 위치만 받아 그린다(게임이 L 헬퍼로 위치 지정).
//   - 진입/종료 콜백(onEnter/onExit)으로 게임이 자체 연출(플래시·문구 등)을 붙인다.
//
// ⚠️ 효과음/좌표 규칙: 이 모듈은 소리를 직접 내지 않는다(연출은 콜백으로 게임이 처리).
//    렌더 좌표는 호출자가 L 헬퍼로 계산해 넘긴다.

import { THEME, font, roundRect } from './ui.js';

// 로컬 난수 유틸 (multi 유형 값 생성용)
function ri(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DEFAULTS = {
  // 피버 유형(재설계 2단계): 'easy'=쉬운 문제형(기본, 8게임) / 'multi'=다중 정답형(g02,g09).
  //   fever:true 는 {type:'easy'} 로 해석된다(하위 호환). 'easy'의 문제 하향은 problemGenerator가,
  //   'multi'의 단(dan)·배수 판정·값 생성은 아래 헬퍼가 담당한다.
  type: 'easy',
  multiDanRange: [2, 3, 4, 5], // 'multi' 진입 시 이 중에서 단을 무작위로 고른다(SPEC §4)
  multiMultipleRatio: 0.8, // 'multi' 화면 대상 중 배수 비율(나머지는 함정)
  gainPerCorrect: 10, // 정답 시 게이지 +
  gainNearMiss: 5, // 니어미스 추가 게이지 +
  lossWrong: 20, // 오답 시 게이지 - (양수로 지정, 내부에서 차감)
  threshold: 100, // 이 값 도달 시 발동
  duration: 6, // 지속(초)
  rampDown: 0.3, // 종료 후 속도 복귀 램프(초)
  grace: 0.5, // 종료 직후 난이도 상승 미적용(초)
  scoreMult: 3, // 피버 중 기본 점수 배수 (재설계: 2→3)
  speedMult: 1.35, // 피버 중 속도 배수
  hitScale: 1.2, // 피버 중 판정 범위 배수(성공 가능성 유지)
  sizeScale: 1.1, // 피버 중 정답 크기 배수
  // 연타 보너스(재설계): 피버 중 짧은 간격 연속 정답이면 배수가 더 오른다.
  //   streakWindow 이내 2연속 → +1(4배), 3연속 이상 → +2(5배). 연속이 끊기면 기본 배수로 복귀.
  streakWindow: 1.0, // 직전 정답과 이 시간(초) 이내면 '연타'로 인정
  streakBonusMax: 2, // 연타로 추가되는 배수 상한 (3 + 2 = 5배)
  onEnter: null, // () => {}  진입 콜백(게임 연출)
  onExit: null, // (pointsEarned) => {}  종료 콜백(게임 연출 — 예: "FEVER +N")
};

export class Fever {
  constructor(config = {}) {
    this.cfg = Object.assign({}, DEFAULTS, config || {});
    this.type = this.cfg.type === 'multi' ? 'multi' : 'easy'; // 알 수 없는 값은 easy로 안전 처리
    this.reset();
  }

  reset() {
    this.gauge = 0;
    this.active = false;
    this.timer = 0;
    this.ramp = 0; // 종료 후 속도 복귀 잔여 시간
    this.graceUntil = 0;
    this.pointsEarned = 0;
    this._time = 0;
    // 연타 배수 상태(재설계). scoreMultiplier 가 이 값을 반환한다(피버 중이 아니면 1).
    this._streak = 0;
    this._lastStreakTime = null;
    this._streakMult = this.cfg.scoreMult;
    // 'multi' 유형: 이번 피버의 단(dan). 발동 중이 아니면 null.
    this.dan = null;
  }

  update(dt) {
    this._time += dt;
    if (this.active) {
      this.timer -= dt;
      if (this.timer <= 0) this._end();
    }
    if (this.ramp > 0) this.ramp = Math.max(0, this.ramp - dt);
  }

  // ── 게이지 ────────────────────────────────────────────────
  gain(delta) {
    if (this.active) return; // 피버 중엔 게이지 변화 없음(시간만 감소)
    this.gauge = Math.max(0, Math.min(this.cfg.threshold, this.gauge + delta));
    if (this.gauge >= this.cfg.threshold) this._start();
  }
  gainCorrect() {
    this.gain(this.cfg.gainPerCorrect);
  }
  gainNearMissBonus() {
    this.gain(this.cfg.gainNearMiss);
  }
  gainWrong() {
    this.gain(-this.cfg.lossWrong);
  }

  // 피버 중 획득 점수 누적(종료 배너 "FEVER +N"용). 엔진이 정답 처리 때 호출.
  addPoints(p) {
    if (this.active) this.pointsEarned += p;
  }

  // 연타 정답 등록(재설계). engine.answerCorrect 가 피버 중 정답마다 호출한다.
  //   직전 정답과 streakWindow 이내면 연속으로 보고 배수를 올리고, 아니면 기본 배수로 복귀한다.
  //   반환값은 이번 정답에 적용할 점수 배수(3~5). 피버 중이 아니면 1을 반환하고 아무것도 하지 않는다.
  //   ⚠️ scoreMultiplier getter 가 이 결과(this._streakMult)를 그대로 노출하므로, 게임이
  //      answerCorrect 직후 scoreMultiplier 를 읽어 만드는 '+점수' 표시가 실제 가산 배수와 일치한다.
  registerScoreStreak() {
    if (!this.active) return 1;
    const now = this._time;
    if (this._lastStreakTime != null && now - this._lastStreakTime <= this.cfg.streakWindow) {
      this._streak += 1;
    } else {
      this._streak = 1;
    }
    this._lastStreakTime = now;
    const bonus = Math.min(this._streak - 1, this.cfg.streakBonusMax);
    this._streakMult = this.cfg.scoreMult + bonus;
    return this._streakMult;
  }
  // 현재 연타 단계(연출용, 선택적 조회). 0=연타 아님, 1=2연속(4배), 2=3연속+(5배).
  get streakStage() {
    return this.active ? Math.min(Math.max(this._streak - 1, 0), this.cfg.streakBonusMax) : 0;
  }

  // ── 배수/판정 완화 (게임이 조회) ──────────────────────────
  // 재설계: 피버 중에는 연타 보너스가 반영된 현재 배수(3~5)를 반환한다.
  get scoreMultiplier() {
    return this.active ? this._streakMult : 1;
  }
  // 종료 시 rampDown 동안 1.35 → 1.0 으로 부드럽게 복귀
  get speedMultiplier() {
    if (this.active) return this.cfg.speedMult;
    if (this.ramp > 0) return 1 + (this.cfg.speedMult - 1) * (this.ramp / this.cfg.rampDown);
    return 1;
  }
  get hitScale() {
    return this.active ? this.cfg.hitScale : 1;
  }
  get sizeScale() {
    return this.active ? this.cfg.sizeScale : 1;
  }
  // 종료 직후 grace 구간인가(게임이 난이도 상승을 잠깐 멈출 때 참조)
  get graceActive() {
    return this._time < this.graceUntil;
  }
  get gaugeRatio() {
    return Math.max(0, Math.min(1, this.gauge / this.cfg.threshold));
  }
  get timeRatio() {
    return this.active ? Math.max(0, Math.min(1, this.timer / this.cfg.duration)) : 0;
  }

  _start() {
    this.active = true;
    this.timer = this.cfg.duration;
    this.pointsEarned = 0;
    // 연타 배수는 발동 시점에 초기화(기본 배수). 첫 피버 정답부터 연타 판정 시작.
    this._streak = 0;
    this._lastStreakTime = null;
    this._streakMult = this.cfg.scoreMult;
    // 'multi' 유형이면 이번 피버의 단을 뽑아 노출한다(게임이 "N단!" 표시·값 채우기에 사용).
    this.dan = this.type === 'multi' ? pick(this.cfg.multiDanRange) : null;
    if (typeof this.cfg.onEnter === 'function') this.cfg.onEnter();
  }
  _end() {
    this.active = false;
    this.gauge = 0;
    this.ramp = this.cfg.rampDown;
    this.graceUntil = this._time + this.cfg.grace;
    this.dan = null;
    // 피버 종료가 콤보를 끊지 않는다(콤보는 scoreManager가 관리 — 여기선 아무 것도 리셋 안 함)
    if (typeof this.cfg.onExit === 'function') this.cfg.onExit(this.pointsEarned);
  }

  // ── 'multi' 유형 헬퍼 (다음 단계에서 g02·g09가 사용) ─────────
  //   전부 피버가 'multi'로 발동 중일 때만 의미가 있다(그 외엔 안전한 기본값 반환).
  //
  //   dan 조회:            engine.fever.dan            // 현재 단(2~5) 또는 null
  //   배수 판정:           engine.fever.isMultiple(v)  // v가 현재 단의 배수인가(양의 정수)
  //   배수 값 하나:        engine.fever.randomMultiple()   // 예: 단=3 → 3·(1~9) 중 하나
  //   함정 값 하나:        engine.fever.randomTrap()       // 현재 단의 배수가 아닌 값
  //   화면 채우기(권장):   engine.fever.fillValues(n)      // [{value, isMultiple}] n개(≈80% 배수), 셔플됨
  isMultiple(v) {
    return !!(this.active && this.type === 'multi' && this.dan && Number.isInteger(v) && v > 0 && v % this.dan === 0);
  }
  randomMultiple() {
    const d = this.dan || 2;
    return d * ri(1, 9); // 구구단 범위의 배수 (초3)
  }
  randomTrap() {
    const d = this.dan || 2;
    const hi = d * 9;
    let v,
      guard = 0;
    do {
      v = ri(2, hi);
      guard++;
    } while (v % d === 0 && guard < 60); // 배수가 아닌 값
    if (v % d === 0) v = d * 9 - 1; // 최후 안전값(거의 도달 안 함)
    return v;
  }
  // n개의 값을 배수:함정 ≈ multiMultipleRatio 비율로 만들어 [{value, isMultiple}]로 반환(값 중복 없음, 셔플).
  fillValues(n, { multipleRatio = this.cfg.multiMultipleRatio } = {}) {
    if (!this.active || this.type !== 'multi' || !this.dan) return [];
    const out = [];
    const used = new Set();
    const nMult = Math.max(1, Math.round(n * multipleRatio));
    let guard = 0;
    while (out.length < n && guard < n * 50) {
      guard++;
      const wantMultiple = out.length < nMult;
      const v = wantMultiple ? this.randomMultiple() : this.randomTrap();
      if (used.has(v)) continue;
      used.add(v);
      out.push({ value: v, isMultiple: v % this.dan === 0 });
    }
    return shuffle(out);
  }

  // ── 게이지 바 렌더 (위치는 게임이 L 헬퍼로 계산해 넘긴다) ──
  // rect: {x, y, w, h}. 채우는 중이면 파랑+게이지, 피버 중이면 골드+남은 시간.
  renderGauge(ctx, rect) {
    const { x, y, w, h } = rect;
    ctx.save();
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();

    const ratio = this.active ? this.timeRatio : this.gaugeRatio;
    const col = this.active ? THEME.gold : THEME.accent;
    if (ratio > 0) {
      ctx.fillStyle = col;
      roundRect(ctx, x, y, w * ratio, h, h / 2);
      ctx.fill();
    }
    ctx.fillStyle = THEME.text;
    ctx.font = font(Math.round(h * 0.72), 'normal');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.active ? '🔥 FEVER!' : 'FEVER', x + w / 2, y + h / 2);
    ctx.restore();
  }
}
