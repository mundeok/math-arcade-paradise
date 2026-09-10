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
  scoreMult: 3, // 피버(1단계) 기본 점수 배수 (재설계: 2→3)
  speedMult: 1.35, // 피버 중 속도 배수
  hitScale: 1.2, // 피버 중 판정 범위 배수(성공 가능성 유지)
  sizeScale: 1.1, // 피버 중 정답 크기 배수
  // ── 3단계 피버(확장): FEVER → SUPER → ULTRA. 피버 중 정답 stageStep회마다 단계 상승. ──
  stageStep: 8, // 단계 상승에 필요한 '피버 중 정답' 수 (8회 → SUPER, 16회 → ULTRA)
  superScoreMult: 5, // 2단계(SUPER) 기본 점수 배수
  ultraScoreMult: 8, // 3단계(ULTRA) 기본 점수 배수
  stageDurationBonus: 4, // 단계 상승 시 지속시간 연장(초)
  maxDuration: 14, // 총 지속 상한(6 + 4 + 4)
  stageTrapRatios: [0.2, 0.1, 0], // 단계별 함정 비율(multi): FEVER 20% / SUPER 10% / ULTRA 0%(전부 배수)
  ultraHitScale: 1.5, // ULTRA(easy) 판정 범위 추가 완화(게임이 hitScale 조회 시 반영)
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
    // 3단계 상태: stage 0(비활성)/1(FEVER)/2(SUPER)/3(ULTRA). _feverCorrect=이번 피버 중 정답 수.
    this.stage = 0;
    this._feverCorrect = 0;
    this._stageChangedTo = 0; // 이번 프레임에 막 오른 단계(엔진이 consumeStageChange로 소비 → 연출)
    this._maxTimer = this.cfg.duration; // 현재 단계 기준 총 지속(시간 바 비율 계산용)
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
    if (this.active) {
      // 피버 중: 게이지 대신 '정답 수'를 누적해 단계 상승을 판정한다.
      this._feverCorrect += 1;
      this._maybeAdvanceStage();
    } else {
      this.gain(this.cfg.gainPerCorrect);
    }
  }
  gainNearMissBonus() {
    this.gain(this.cfg.gainNearMiss);
  }

  // 피버 중 정답 수가 임계에 닿으면 단계를 올리고 지속시간을 연장한다(하강 없음).
  //   8회 → SUPER(2), 16회 → ULTRA(3). 오를 때 timer +stageDurationBonus(총 maxDuration 상한).
  _maybeAdvanceStage() {
    const step = this.cfg.stageStep;
    const target = this._feverCorrect >= step * 2 ? 3 : this._feverCorrect >= step ? 2 : 1;
    if (target > this.stage) {
      this.stage = target;
      this.timer = Math.min(this.cfg.maxDuration, this.timer + this.cfg.stageDurationBonus);
      this._maxTimer = Math.min(this.cfg.maxDuration, this._maxTimer + this.cfg.stageDurationBonus);
      this._stageChangedTo = target; // 엔진이 소비해 "SUPER/ULTRA FEVER!" 연출
    }
  }

  // 엔진이 매 정답 후 호출해 '막 오른 단계'를 소비한다(0이면 변화 없음). 연출은 엔진이(fever.js는 무음).
  consumeStageChange() {
    const s = this._stageChangedTo;
    this._stageChangedTo = 0;
    return s;
  }

  // 현재 단계의 기본 점수 배수(연타 보너스는 registerScoreStreak에서 이 위에 더해진다).
  _stageBase() {
    if (this.stage >= 3) return this.cfg.ultraScoreMult;
    if (this.stage >= 2) return this.cfg.superScoreMult;
    return this.cfg.scoreMult;
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
    // 단계 기본 배수(3/5/8) 위에 연타 보너스(+0~+2)를 얹는다. 1단계는 3~5로 기존과 동일(하위 호환).
    const bonus = Math.min(this._streak - 1, this.cfg.streakBonusMax);
    this._streakMult = this._stageBase() + bonus;
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
    if (!this.active) return 1;
    return this.stage >= 3 ? this.cfg.ultraHitScale : this.cfg.hitScale; // ULTRA(easy)는 판정 더 넉넉
  }
  get sizeScale() {
    return this.active ? this.cfg.sizeScale : 1;
  }
  // 단계별 함정 비율(multi 게임이 참조). fillValues가 자동 반영한다(게임 파일 수정 불필요).
  //   FEVER 0.2 / SUPER 0.1 / ULTRA 0. 비활성이면 1단계 값을 반환(무해).
  get trapRatio() {
    const s = this.active && this.stage >= 1 ? this.stage : 1;
    return this.cfg.stageTrapRatios[Math.min(s, 3) - 1];
  }
  // 종료 직후 grace 구간인가(게임이 난이도 상승을 잠깐 멈출 때 참조)
  get graceActive() {
    return this._time < this.graceUntil;
  }
  get gaugeRatio() {
    return Math.max(0, Math.min(1, this.gauge / this.cfg.threshold));
  }
  get timeRatio() {
    if (!this.active) return 0;
    const max = this._maxTimer > 0 ? this._maxTimer : this.cfg.duration;
    return Math.max(0, Math.min(1, this.timer / max));
  }
  // 다음 단계까지 남은 정답 수(게이지 표시용). 3단계면 0.
  get correctToNextStage() {
    if (!this.active || this.stage >= 3) return 0;
    return Math.max(0, this.stage * this.cfg.stageStep - this._feverCorrect);
  }

  _start() {
    this.active = true;
    this.timer = this.cfg.duration;
    this._maxTimer = this.cfg.duration;
    this.stage = 1; // FEVER
    this._feverCorrect = 0;
    this._stageChangedTo = 0;
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
    this.stage = 0; // 단계 초기화(피버 종료 시)
    this._feverCorrect = 0;
    this._stageChangedTo = 0;
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
  // n개의 값을 배수:함정 비율로 만들어 [{value, isMultiple}]로 반환(값 중복 없음, 셔플).
  //   ⚠️ multipleRatio 미지정 시 현재 단계의 trapRatio를 자동 반영한다(1 - trapRatio).
  //      → 게임 파일 수정 없이 FEVER 80% / SUPER 90% / ULTRA 100%(전부 배수) 적용.
  fillValues(n, { multipleRatio } = {}) {
    if (!this.active || this.type !== 'multi' || !this.dan) return [];
    const ratio = multipleRatio != null ? multipleRatio : 1 - this.trapRatio;
    const out = [];
    const used = new Set();
    const nMult = ratio >= 1 ? n : Math.max(1, Math.round(n * ratio));
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
    // 트랙
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();

    const ratio = this.active ? this.timeRatio : this.gaugeRatio;
    if (ratio > 0) {
      roundRect(ctx, x, y, w * ratio, h, h / 2);
      // 채우기 중=파랑 / FEVER=금색 / SUPER=무지개 / ULTRA=백색광 (어둡게·반전 없음 §2.5)
      if (this.active && this.stage >= 3) {
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.5, '#fff3bf');
        g.addColorStop(1, '#ffffff');
        ctx.fillStyle = g;
      } else if (this.active && this.stage >= 2) {
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, '#ff5a7a');
        g.addColorStop(0.25, '#ffb84a');
        g.addColorStop(0.5, '#3ec18f');
        g.addColorStop(0.75, '#4a9eff');
        g.addColorStop(1, '#8b7bff');
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = this.active ? THEME.gold : THEME.accent;
      }
      ctx.fill();
    }

    // 라벨(단계명). ULTRA 바는 밝아 대비를 위해 어두운 글자.
    const label = this.active ? (this.stage >= 3 ? '🌟 ULTRA!' : this.stage >= 2 ? '⚡ SUPER!' : '🔥 FEVER!') : 'FEVER';
    ctx.fillStyle = this.active && this.stage >= 3 ? '#6b4e12' : THEME.text;
    ctx.font = font(Math.round(h * 0.72), 'normal');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2);

    // 다음 단계까지 남은 정답 수(작게, 바 아래) — 예: "SUPER까지 3"
    const remain = this.correctToNextStage;
    if (this.active && remain > 0) {
      const nextName = this.stage >= 2 ? 'ULTRA' : 'SUPER';
      ctx.fillStyle = THEME.gold;
      ctx.font = font(Math.round(h * 0.62), 'normal');
      ctx.fillText(`${nextName}까지 ${remain}`, x + w / 2, y + h + h * 0.9);
    }
    ctx.restore();
  }
}
