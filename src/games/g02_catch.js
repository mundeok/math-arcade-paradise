// g02_catch.js — 🎪 떨어지는 캐치 (SPEC §4 2️⃣ / Phase 1, 재미 실험판)
// 반사신경형. 상단 문제 고정. 위에서 숫자 원이 떨어지고 '정답만' 터치한다.
// 확정 인터페이스(SPEC §7)만 사용한다. core/scenes는 건드리지 않는다.
//
// ⚠️ 재미 실험(g02 단독): 정답 흐름을 멈추지 않는 손맛 + 피버 모드 + 니어미스 + 위기 연출.
//    비교 기준선인 g01/g06/g09는 건드리지 않는다.
//
// 좌표·크기·폰트는 전부 core/layout.js 의 L 헬퍼로 계산한다(픽셀 리터럴 금지).
//   우선순위: L.zone.* > L.gu(n) > L.x/y/w/h(ratio).
//
// 축 분리(SPEC 2.1): level은 problemGenerator만 관리. 게임 난이도(축 B: 속도·개수·오답근접·피버)는
//   scoreManager.combo/lives 로만 계산. 점수·콤보·라이프·복습큐는 answerCorrect/answerWrong 전담.
//
// 라이프 규칙(반사신경형이라 관대):
//   - 오답 터치        → answerWrong(loseLife:true)  : 라이프 -1 + 콤보 리셋 + 정답표시 1.2초(현행 유지)
//   - 정답 놓쳐 바닥 도달 → answerWrong(loseLife:false, freeze:false, missed) : 콤보만 리셋(현행 유지, 정지 없음)

import { L } from '../core/layout.js';
import { THEME, font, roundRect } from '../core/ui.js';

// ── 시간 상수(초) — 좌표가 아니므로 L 대상이 아니다. 정답 연출은 흐름을 멈추지 않는다(상한 준수). ──
const HITSTOP = 0.05; // 순간 정지(0.03~0.06): 낙하만 잠깐 멈춤. 루프는 계속.
const FLASH_DUR = 0.08; // 플래시(0.05~0.10)
const SHAKE_TIME = 0.1; // 화면 흔들림(0.08~0.12)
const ZOOM_DUR = 0.06; // 미세 확대(0.06초)
const ZOOM_MAX = 0.01; // 1.01배
const POP_DUR = 0.45; // 정답 원 확대→소멸 연출(0.30~0.50)
const FLOAT_DUR = 0.6; // 획득 점수 부양 텍스트(콤보문구 상한 0.70 이내)
const NEARMISS_DUR = 0.5; // "아슬아슬!" 문구(0.5초)
const MISS_DUR = 0.4; // 놓침 "앗!"(현행 유지)

const INPUT_LOCK = 0.1; // 판정 후 중복 입력 무시(100ms)

const BASE_SEC = 1.8; // 콤보 0에서 화면 통과 시간
const MIN_SEC = 0.9; // 화면 통과 최소 시간(하드 클램프)

const FEVER_DUR = 6.0; // 피버 지속
const FEVER_RAMP = 0.3; // 종료 후 속도 복귀 시간
const FEVER_GRACE = 0.5; // 종료 직후 속도 상승 미적용
const GAUGE_MAX = 100;
const GAUGE_CORRECT = 10; // 정답 +10
const GAUGE_NEARMISS = 5; // 니어미스 추가 +5
const GAUGE_WRONG = -20; // 오답 -20

const NEARMISS_TTF = 0.3; // 바닥 닿기 0.3초 이내
const NEARMISS_DIST_RATIO = 0.1; // 또는 남은 거리 화면 높이 10% 이하
const NEARMISS_BONUS = 40; // 니어미스 +40(일반 정답 기본 50을 넘지 않음)

export const g02Catch = {
  id: 'g02_catch',
  name: '떨어지는 캐치',
  emoji: '🎪',
  category: '반사신경',
  maxLevel: 3, // 출제 상한 Lv3 (SPEC 2.1 반사신경형)
  blankRatio: 0, // 반사신경형은 빈칸 미출제
  opMode: 'multiply', // 이 게임은 곱셈만 출제 (교사 설정이 특정 연산이면 교사 우선)
  // 게임 고유 콤보 문구(그 외 5/10/20/30은 core 기본). core가 일원 관리(SPEC §7.1).
  comboMilestones: { 7: 'NICE!', 15: 'AWESOME!' },

  // ── 크기/간격 (전부 L 기반 getter) ──
  get R() {
    return L.w(0.0875);
  }, // 숫자 원 반지름 70
  get HIT_PAD() {
    return L.gu(0.5);
  }, // 터치 판정 여유 20 (시각 원보다 넉넉하게 — 현행 유지)
  get FLOOR_Y() {
    return L.zone.floor;
  }, // 정답이 넘으면 '놓침'
  get PROBLEM_Y() {
    return L.zone.problem;
  }, // 상단 고정 문제 위치
  get STAGGER() {
    return L.gu(5.25);
  }, // 낙하 숫자 수직 진입 간격 210

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
        { x: cx, y: L.gu(6.3), label: '24', finger: true },
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
    this.popEffects = []; // 정답 원 확대→소멸 + 위로 튀는 숫자 [{x,y,value,t,dur}]
    this.floatTexts = []; // 획득 점수·아슬아슬 부양 텍스트 [{x,y,text,color,size,t,dur}]
    this.missEffect = null; // 놓침 "앗!" {x,y,t,dur}
    this.feverBanner = null; // 피버 종료 "FEVER +N" {points,t,dur}

    this.time = 0; // 게임 진행 시간(초) — freeze 중엔 update 미호출이라 멈춤
    this.inputLockUntil = 0; // 중복 입력 방지(100ms)
    this.hitStop = 0; // 순간 정지 타이머
    this.zoomT = 0; // 미세 확대 타이머
    this.holdFlash = 0; // 라이프1에서 정답 시 "버텼다" 테두리 밝힘
    this.curSpeed = 0; // 이번 프레임 낙하 속도(px/s) — 니어미스 계산 공유
    this.tensionTimer = 0; // 라이프1 긴장음 주기
    this.nearMissUsed = false; // 한 문제당 니어미스 1회 제한

    this.consecWrong = 0; // 연속 오답(2회 시 속도 한 단계 ↓)
    this.speedPenalty = 0; // 속도 단계 감점(정답 시 회복)
    this.speedGraceUntil = 0; // 피버 종료 직후 속도 상승 미적용 구간

    this.fever = { active: false, timer: 0, gauge: 0 };
    this.feverRamp = 0; // 종료 후 속도 복귀 램프
    this.feverPoints = 0; // 피버 중 획득 점수 누적

    this._startWave();
  },

  // ── 게임 난이도(축 B) ─────────────────────────────────────
  // 동시 등장 개수: 콤보 0~9→3 / 10~19→4 / 20+→5 (최대 5 하드 캡)
  _simulCount() {
    const combo = this.engine.scoreManager.combo;
    if (combo >= 20) return 5;
    if (combo >= 10) return 4;
    return 3;
  },

  // 현재 낙하 속도(px/s). 콤보 단계표 + 안전장치 + 피버 배속.
  _currentSpeed() {
    const e = this.engine;
    const combo = e.scoreManager.combo;
    // 콤보 단계 배율 (계단식)
    let step = combo >= 20 ? 1.4 : combo >= 15 ? 1.3 : combo >= 10 ? 1.2 : combo >= 5 ? 1.1 : 1.0;
    // 연속 오답 2회 → 한 단계 낮춤
    if (this.speedPenalty > 0) step -= 0.1 * this.speedPenalty;
    // 라이프 1 → 속도 상승 중단(기본 배율로 고정)
    if (e.scoreManager.lives <= 1) step = Math.min(step, 1.0);
    // 피버 종료 직후 0.5초 → 콤보 상승분 미적용
    if (this.time < this.speedGraceUntil) step = Math.min(step, 1.0);
    if (step < 1.0) step = 1.0;
    // 피버 배속(종료 시 0.3초 램프)
    let feverMult = 1.0;
    if (this.fever.active) feverMult = 1.35;
    else if (this.feverRamp > 0) feverMult = 1.0 + 0.35 * (this.feverRamp / FEVER_RAMP);
    step *= feverMult;

    let sec = BASE_SEC / step;
    sec *= this.engine.settings.timeScale || 1;
    if (sec < MIN_SEC) sec = MIN_SEC; // 화면 통과 최소 0.9초 하드 클램프
    return L.H / sec;
  },

  // 피버 중 정답 원은 크기 10%·판정 20% 확대(성공 가능성 유지). 오답 원은 그대로.
  _visR(f) {
    return f.correct && this.fever.active ? this.R * 1.1 : this.R;
  },
  _judgeR(f) {
    const pad = f.correct && this.fever.active ? this.HIT_PAD * 1.2 : this.HIT_PAD;
    return this._visR(f) + pad;
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
    // 피버 중엔 수직 간격 넓히고 가로 흔들림 줄여 겹침·완전 가림 방지(성공 가능성 유지)
    const stag = this.STAGGER * (this.fever.active ? 1.3 : 1.0);
    const jitterScale = this.fever.active ? 0.3 : 1.0;

    this.fallers = items.map((it, i) => {
      const gap = Math.max(0, laneW - 2 * R);
      const jitter = (Math.random() - 0.5) * gap * jitterScale;
      const x = minX + laneW * (i + 0.5) + jitter;
      const rank = order.indexOf(i);
      // 화면 위에서 계단식 진입(정답도 등장 직후 최소 낙하거리 확보 → 300ms 내 이탈 없음)
      const y = -R - rank * stag - Math.random() * L.gu(1.5);
      return { value: it.value, correct: it.correct, x, y, age: 0, judged: false };
    });

    this.nearMissUsed = false;
  },

  update(dt) {
    this.time += dt;

    // 피버 타이머
    if (this.fever.active) {
      this.fever.timer -= dt;
      if (this.fever.timer <= 0) this._endFever();
    }
    if (this.feverRamp > 0) this.feverRamp = Math.max(0, this.feverRamp - dt);

    // 각종 연출 타이머
    if (this.hitStop > 0) this.hitStop = Math.max(0, this.hitStop - dt);
    if (this.zoomT > 0) this.zoomT = Math.max(0, this.zoomT - dt);
    if (this.holdFlash > 0) this.holdFlash = Math.max(0, this.holdFlash - dt);

    // 라이프 1 긴장음 한 겹(효과음 ON일 때만, 무음 기본 유지). 위협음 아님(부드러운 저음).
    if (this.engine.scoreManager.lives <= 1) {
      this.tensionTimer -= dt;
      if (this.tensionTimer <= 0) {
        if (this.engine.sound && this.engine.sound.tone) this.engine.sound.tone(110, 0, 0.5, { type: 'sine', vol: 0.1 });
        this.tensionTimer = 2.0;
      }
    } else {
      this.tensionTimer = 0;
    }

    // 낙하 이동 (hitStop 동안은 정지 — 순간 임팩트). 속도는 매 프레임 재계산(피버/램프 즉시 반영).
    this.curSpeed = this._currentSpeed();
    if (this.hitStop <= 0) {
      for (const f of this.fallers) {
        f.y += this.curSpeed * dt;
        f.age += dt;
      }
    } else {
      for (const f of this.fallers) f.age += dt;
    }

    // 정답이 바닥을 넘으면 '놓침' (현행 유지: 정지 없음, 무음, 라이프 유지, missed)
    const correct = this.fallers.find((f) => f.correct && !f.judged);
    if (correct && correct.y >= this.FLOOR_Y && correct.age > 0.3) {
      this.engine.answerWrong(this.problem, null, { loseLife: false, freeze: false, affectLevel: false, missed: true });
      this.engine.particles.emit(correct.x, this.FLOOR_Y, 'pop', THEME.wrong, 16);
      this.missEffect = { x: correct.x, y: this.FLOOR_Y, t: 0, dur: MISS_DUR };
      this._startWave();
      return;
    }

    // 오답은 화면 밖으로 나가면 조용히 제거
    this.fallers = this.fallers.filter((f) => f.correct || f.y - this.R <= L.H);

    // 연출 갱신
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

  // ── 피버 ──────────────────────────────────────────────────
  _addFever(delta) {
    if (this.fever.active) return; // 피버 중엔 게이지 변화 없음(시간만 감소)
    this.fever.gauge = Math.max(0, Math.min(GAUGE_MAX, this.fever.gauge + delta));
    if (this.fever.gauge >= GAUGE_MAX) this._startFever();
  },
  _startFever() {
    this.fever.active = true;
    this.fever.timer = FEVER_DUR;
    this.feverPoints = 0;
    this.engine.ui.showComboText('🔥 FEVER!', true);
    this.engine.ui.flash('rgba(255,210,120,0.5)', FLASH_DUR);
  },
  _endFever() {
    this.fever.active = false;
    this.fever.gauge = 0;
    this.feverRamp = FEVER_RAMP; // 0.3초 속도 복귀
    this.speedGraceUntil = this.time + FEVER_GRACE; // 0.5초 상승 미적용
    // 피버 종료가 콤보를 끊지 않는다(콤보는 그대로 유지) — 아무 리셋도 하지 않음
    this.feverBanner = { points: this.feverPoints, t: 0, dur: 1.4 };
    this.engine.ui.flash('rgba(120,200,255,0.4)', FLASH_DUR);
  },

  onTouch(x, y, phase) {
    if (phase !== 'start') return; // 누르는 즉시 반응
    if (this.time < this.inputLockUntil) return; // 판정 후 100ms 중복 입력 무시
    if (!this.fallers.length) return;

    // 판정 반경 안에서 가장 가까운 '아직 판정 안 된' 낙하물 선택
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

    target.judged = true; // 같은 원 중복 판정 방지
    this.inputLockUntil = this.time + INPUT_LOCK; // 멀티터치·연타로 라이프 여러 번 감소 방지

    if (target.correct) this._judgeCorrect(target);
    else this._judgeWrong(target);
  },

  _judgeCorrect(target) {
    const e = this.engine;
    const combo = e.scoreManager.combo; // answerCorrect가 올리기 전 값

    // 니어미스: 바닥 0.3초 이내 or 남은 거리 화면 10% 이하 (한 문제 1회)
    const remaining = this.FLOOR_Y - target.y;
    const ttf = this.curSpeed > 0 ? remaining / this.curSpeed : 999;
    const nearMiss = !this.nearMissUsed && (ttf <= NEARMISS_TTF || remaining <= L.H * NEARMISS_DIST_RATIO);

    let pts = 50 + combo * 5; // 기본: 50 + 콤보×5
    if (nearMiss) {
      pts += NEARMISS_BONUS; // +40 (기본 50을 넘지 않음)
      this.nearMissUsed = true;
    }
    if (this.fever.active) pts *= 2; // 피버 중 점수 2배

    e.answerCorrect(this.problem, target.value, pts);
    if (this.fever.active) this.feverPoints += pts;

    // ── 손맛(겹쳐서 동시 발생) ──
    this._emitCorrectParticles(target, nearMiss);
    this.popEffects.push({ x: target.x, y: target.y, value: target.value, t: 0, dur: POP_DUR });
    this.floatTexts.push({ x: target.x, y: target.y, text: `+${pts}`, color: this.fever.active ? THEME.gold : THEME.correct, size: L.font(0.04), t: 0, dur: FLOAT_DUR });
    this.hitStop = HITSTOP;
    this.zoomT = ZOOM_DUR;
    e.ui.flash(this.fever.active ? 'rgba(255,220,140,0.35)' : 'rgba(255,255,255,0.28)', FLASH_DUR);
    e.ui.shake(nearMiss ? 10 : 7, SHAKE_TIME);
    this._playCorrectSound(combo);
    this._haptic(15);

    if (nearMiss) {
      this.floatTexts.push({ x: target.x, y: target.y - L.gu(1.6), text: '아슬아슬!', color: THEME.gold, size: L.font(0.045), t: 0, dur: NEARMISS_DUR });
    }

    // 피버 게이지
    this._addFever(GAUGE_CORRECT + (nearMiss ? GAUGE_NEARMISS : 0));

    // 위기 회복 피드백: 라이프 1에서 정답 → 테두리 잠깐 밝아짐("버텼다")
    if (e.scoreManager.lives <= 1) this.holdFlash = 0.25;

    // 연속 오답/속도 감점 회복
    this.consecWrong = 0;
    this.speedPenalty = 0;

    this._startWave(); // 흐름을 멈추지 않고 즉시 다음 웨이브
  },

  _judgeWrong(target) {
    const e = this.engine;
    this._addFever(GAUGE_WRONG); // 오답 -20
    this.consecWrong += 1;
    if (this.consecWrong >= 2) {
      this.speedPenalty = 1; // 연속 오답 2회 → 속도 한 단계 ↓ (정답 시 회복)
      this.consecWrong = 0;
    }
    // 오답 터치는 이해 오류 → 정답 표시 1.2초 정지(현행 유지). onResume에서 다음 웨이브.
    e.answerWrong(this.problem, target.value, { loseLife: true, onResume: () => this._startWave() });
  },

  _emitCorrectParticles(target, nearMiss) {
    const e = this.engine;
    const mult = this.fever.active ? 1.5 : 1; // 피버 중 파티클 밀도 증가
    const base = nearMiss ? 44 : 30; // 기본 파티클 3배 수준(원 색상 기반 방사형)
    e.particles.emit(target.x, target.y, 'explode', THEME.accent, Math.round(base * mult));
    e.particles.emit(target.x, target.y, 'pop', THEME.gold, Math.round(16 * mult));
    e.particles.emit(target.x, target.y, 'sparkle', THEME.correct, Math.round(8 * mult));
  },

  // 콤보에 따라 반음씩 상승(12음마다 한 옥타브 위, 상한 +2옥타브). 효과음 OFF면 무음(tone이 처리).
  _playCorrectSound(combo) {
    const snd = this.engine.sound;
    if (!snd) return;
    if (typeof snd.tone !== 'function') {
      if (snd.play) snd.play('pop');
      return;
    }
    const octave = Math.min(Math.floor(combo / 12), 2) + (this.fever.active ? 1 : 0);
    const semi = combo % 12;
    const f = 523.25 * Math.pow(2, octave + semi / 12); // C5 기준
    snd.tone(f, 0, 0.09, { type: 'triangle', vol: 0.25 });
    snd.tone(f * 1.5, 0.05, 0.09, { type: 'triangle', vol: 0.15 }); // 5도 위 살짝
  },

  _haptic(ms) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch (e) {
        /* 미지원/차단 — 무시 */
      }
    }
  },

  // ── 렌더 ──────────────────────────────────────────────────
  render(ctx) {
    this._drawFeverBg(ctx); // 피버 배경(밝고 화사하게 — 어둡게 금지)
    this._drawCrisisBorder(ctx); // 위기 테두리
    this._drawFeverGauge(ctx); // 피버 게이지

    // 플레이 콘텐츠(미세 확대 적용). HUD/파티클은 엔진이 그리므로 확대 대상 아님.
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

    this._drawFeverBanner(ctx); // "FEVER +N" 크게
  },

  _drawProblem(ctx) {
    const cx = L.W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.text;
    ctx.font = font(L.font(0.07)); // ≥80px 규정
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
      const r = this._visR(f); // 색은 모두 동일(정답 노출 금지). 피버 중 정답만 크기 10%↑(성공 보정)
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
      // 원이 1.3배로 순간 확대 후 축소하며 소멸
      const scale = prog < 0.3 ? 1 + 0.3 * (prog / 0.3) : 1.3 * (1 - (prog - 0.3) / 0.7);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog);
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.R * Math.max(0.01, scale), 0, Math.PI * 2);
      ctx.strokeStyle = THEME.correct;
      ctx.lineWidth = L.gu(0.15);
      ctx.stroke();
      // 위로 튀어오르는 숫자 + ⭕
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
      ctx.fillText(t.text, t.x, t.y - prog * L.gu(2.2)); // 위로 튀어오르며 페이드
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

  // 피버 배경: 밝고 화사한 워시(따뜻한 골드→핑크→하늘색, 낮은 알파). 어둡게/반전 금지.
  _drawFeverBg(ctx) {
    let mult = 0;
    if (this.fever.active) mult = 1;
    else if (this.feverRamp > 0) mult = this.feverRamp / FEVER_RAMP;
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

  // 위기 테두리: 라이프 2 옅은 경고 / 라이프 1 굵고 느린 맥박(≤0.8Hz) / 정답 시 잠깐 초록.
  _drawCrisisBorder(ctx) {
    const lives = this.engine.scoreManager.lives;
    if (lives >= 3 && this.holdFlash <= 0) return;
    let rgb, lw, alpha;
    if (lives === 2) {
      rgb = '255,180,80';
      lw = L.gu(0.25);
      alpha = 0.35;
    } else if (lives <= 1) {
      rgb = '255,90,60';
      lw = L.gu(0.5);
      alpha = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(this.time * Math.PI * 2 * 0.8)); // 0.8Hz 맥박
    } else {
      rgb = '120,230,150';
      lw = L.gu(0.3);
      alpha = 0;
    }
    if (this.holdFlash > 0) {
      rgb = '120,230,150';
      alpha = Math.max(alpha, this.holdFlash / 0.25);
      lw = Math.max(lw, L.gu(0.4));
    }
    if (alpha <= 0) return;
    ctx.save();
    ctx.strokeStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
    ctx.lineWidth = lw;
    ctx.strokeRect(lw / 2, lw / 2, L.W - lw, L.H - lw);
    ctx.restore();
  },

  _drawFeverGauge(ctx) {
    const x = L.safe;
    const y = L.zone.gauge;
    const w = L.W - L.safe * 2;
    const h = L.gu(0.5);
    ctx.save();
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
    let ratio, col, label;
    if (this.fever.active) {
      ratio = this.fever.timer / FEVER_DUR;
      col = THEME.gold;
      label = '🔥 FEVER!';
    } else {
      ratio = this.fever.gauge / GAUGE_MAX;
      col = THEME.accent;
      label = 'FEVER 게이지';
    }
    ratio = Math.max(0, Math.min(1, ratio));
    if (ratio > 0) {
      ctx.fillStyle = col;
      roundRect(ctx, x, y, w * ratio, h, h / 2);
      ctx.fill();
    }
    ctx.fillStyle = THEME.text;
    ctx.font = font(L.font(0.022), 'normal');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, L.W / 2, y + h / 2);
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

  // 마우스 hover: 떨어지는 원(판정 반경) 위인지 반환 → 커서 pointer.
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

// 배열 셔플 (게임 내부 배치용 — 문제/오답 생성은 core가 담당)
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
