// fever.js — 피버 시스템 공통 모듈 (재미 표준: g02_catch에서 검증한 피버를 core로 추출)
// SPEC §2.5 '재미 표준' / §7. 게임은 선택적으로 opt-in 한다(게임 객체의 fever 필드).
//
// 역할 분담:
//   - 게이지·타이머·램프·grace 등 '피버 상태'는 이 모듈이 전담한다.
//   - 배수(점수·속도·판정완화)는 '값'만 제공하고, 실제 적용은 게임/엔진이 조회해서 한다.
//     · 점수 2배·게이지 가감은 engine.answerCorrect/answerWrong 이 자동 처리(피버 opt-in 시).
//     · 속도 1.35배·판정 1.2배·크기 1.1배는 게임이 자기 로직에 곱해 쓴다(게임마다 다르므로).
//   - 게이지 바 렌더는 위치만 받아 그린다(게임이 L 헬퍼로 위치 지정).
//   - 진입/종료 콜백(onEnter/onExit)으로 게임이 자체 연출(플래시·문구 등)을 붙인다.
//
// ⚠️ 효과음/좌표 규칙: 이 모듈은 소리를 직접 내지 않는다(연출은 콜백으로 게임이 처리).
//    렌더 좌표는 호출자가 L 헬퍼로 계산해 넘긴다.

import { THEME, font, roundRect } from './ui.js';

const DEFAULTS = {
  gainPerCorrect: 10, // 정답 시 게이지 +
  gainNearMiss: 5, // 니어미스 추가 게이지 +
  lossWrong: 20, // 오답 시 게이지 - (양수로 지정, 내부에서 차감)
  threshold: 100, // 이 값 도달 시 발동
  duration: 6, // 지속(초)
  rampDown: 0.3, // 종료 후 속도 복귀 램프(초)
  grace: 0.5, // 종료 직후 난이도 상승 미적용(초)
  scoreMult: 2, // 피버 중 점수 배수
  speedMult: 1.35, // 피버 중 속도 배수
  hitScale: 1.2, // 피버 중 판정 범위 배수(성공 가능성 유지)
  sizeScale: 1.1, // 피버 중 정답 크기 배수
  onEnter: null, // () => {}  진입 콜백(게임 연출)
  onExit: null, // (pointsEarned) => {}  종료 콜백(게임 연출 — 예: "FEVER +N")
};

export class Fever {
  constructor(config = {}) {
    this.cfg = Object.assign({}, DEFAULTS, config || {});
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

  // ── 배수/판정 완화 (게임이 조회) ──────────────────────────
  get scoreMultiplier() {
    return this.active ? this.cfg.scoreMult : 1;
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
    if (typeof this.cfg.onEnter === 'function') this.cfg.onEnter();
  }
  _end() {
    this.active = false;
    this.gauge = 0;
    this.ramp = this.cfg.rampDown;
    this.graceUntil = this._time + this.cfg.grace;
    // 피버 종료가 콤보를 끊지 않는다(콤보는 scoreManager가 관리 — 여기선 아무 것도 리셋 안 함)
    if (typeof this.cfg.onExit === 'function') this.cfg.onExit(this.pointsEarned);
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
