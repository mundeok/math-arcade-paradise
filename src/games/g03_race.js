// g03_race.js — 1인칭 레이싱 계산. 연료를 생존/3초 부스터에 나눠 쓰는 엔드리스.
// 시각은 src/art/raceCockpit.js, 판정은 이 파일. 배경 가속과 게이트 시간은 독립.
// 오답 통과 연료−25, answerWrong(loseLife:false), 피버 함정 무해.
// 콤보로만 게이트 간격을 계산하며 최소1.4초, 출제는 maxLevel4 유지.
import { L } from '../core/layout.js';
import { THEME, font } from '../core/ui.js';
import { ScoreManager } from '../core/scoreManager.js'; // 개인 최고점 조회(getHighScores, 읽기 전용 — core 미수정)
import { cockpitLayout, roadProjection, drawCockpitWorld, drawCockpitGate, drawCockpitQuestion, drawCockpit, drawCockpitPreview } from '../art/raceCockpit.js';
import { drawRewardText } from '../art/toyArt.js';

// ── 상수 ──────────────────────────────────────────────────
const FUEL_MAX = 100;
const BOOST_COST = 20;
const MANUAL_BOOST_DUR = 3;
const LANES = 3; // 0 좌 / 1 중 / 2 우

const MIN_GATE_SEC = 1.4; // ⚠️ 게이트 하강 시간 하한(계산할 시간). 콤보·피버·배율과 무관하게 절대 지킨다.
const GATE_TIERS = [2.4, 2.1, 1.8, 1.6, 1.4]; // 콤보 0~4 / 5~9 / 10~14 / 15~19 / 20+ (하한 1.4)
const LOCK_SEC = 0.4; // 게이트 도달 이 시간 전부터 차선 변경 잠금(판정 확정)
const NEARMISS_SEC = 0.5; // 도달 직전 이 시간 이내에 차선을 바꿔 정답 → 니어미스

const BOOST_DUR = 0.42; // 부스터 연출(파티클 상한 내)
const CRASH_DUR = 0.4; // 충돌 범퍼 튕김/연기
const FINISH_HOLD = 0.7; // 연료 소진 후 통과 수를 짧게 보여준다.
const SHAKE_TIME = 0.1; // 화면 흔들림(0.08~0.12)

const BASE_SCROLL = 0.085; // 촘촘한 원근 차선이 고속에서 역행해 보이지 않도록 주기 제한.
const MAX_TILT = 0.22; // 차선 이동 시 핸들 회전 기준각(rad)

export const g03Race = {
  id: 'g03_racing', // ⚠️ CATALOG/저장 키와 일치(파일명 g03_race와 별개)
  name: '레이싱 계산',
  emoji: '🚀',
  category: '경쟁형',
  maxLevel: 4, // 출제 상한 Lv4 (SPEC 2.1 사고형이지만 운전 반응이 섞여 Lv4로 제한)
  blankRatio: 0.25, // 판단형 비율
  opMode: 'mixed',
  fever: { type: 'multi' }, // multi=피버 중 "N단!" 배수 차선 게이트(간격 단축·속도감 강화) (§2.6/§7.6)
  comboMilestones: { 5: 'FAST!', 10: 'TURBO!', 20: 'NITRO!', 30: 'CHAMPION!' },

  tutorial: {
    text: '정답으로 연료를 채워 달려! 연료 20으로 부스터, 3초간 점수 1.5배!',
    draw(ctx) {
      drawCockpitPreview(ctx);
    },
  },

  // ── 초기화 ────────────────────────────────────────────────
  init(engine) {
    this.engine = engine;
    this.time = 0;
    this.raceElapsed = 0; // 활성 주행 시간(오답 정지 중에는 update 미호출로 자연 제외)
    this.fuel = FUEL_MAX;
    this.manualBoostT = 0;
    this.boostVisual = 0; // 가속 연출만 부드럽게 보간. 점수/판정에는 사용하지 않는다.

    // 차선/차체
    this.targetLane = 1; // 중앙에서 시작
    this.laneF = 1; // 부드러운 시각 보간값
    this.carTilt = 0;
    this.carBounce = 0;

    // 게이트
    this.problem = null;
    this.gate = null; // {values,correctLane,p,sec,locked,judged,judgeLane}
    this.gatesPassed = 0;

    // A(개인 최고점 목표 바): 이전 판 최고점. 기록이 없으면(첫 판) null → 바 자체를 숨긴다.
    //   ⚠️ 실시간 라이벌이 아니라 '내 최고점까지'의 목표 표시(시간별 득점 재현이 불가하므로).
    this.bestScore = ScoreManager.getHighScores(this.id)[0]?.score ?? null;
    this.beatBest = false; // 이번 판에 최고점 돌파 시 1회 연출

    // 입력 상태
    this.touchStartX = null;
    this.touchMoved = false;
    this.touchControl = null;
    this.lastLaneChangeAt = -999;
    this.laneChangedThisGate = false;

    // 게이트 간격 조정(연료30 이하는 _gateSec에서, 연속 오답 2회는 slowTier로 한 단계 되돌림)
    this.consecWrong = 0;
    this.slowTier = false;

    // 연출
    this.boostT = 0;
    this.crashT = 0;
    this.carZoom = 0;
    this.floats = [];
    this.smoke = []; // 만화 연기 구름 [{x,y,t,dur,r}]
    this.scrollPhase = 0; // 차선선 스크롤 위상
    // 풍경은 raceCockpit의 고정 배열/이동 위상으로 그린다.

    // 연료 소진/피버
    this.finishing = false;
    this.finishTimer = 0;
    this.wasFever = false;
    this.feverBanner = null;
    this.feverChain = 0; // 피버 중 배수 게이트 연속 통과(×2/×3/MAX BOOST 누적)
    // 피버 정답 차선 고정: 한 차선에 3~4개 연속 배치 → 옆 차선(±1)으로 전환(예고 후).
    this.feverLane = 1; // 현재 배수 게이트가 놓이는 차선
    this.feverRunLeft = 0; // 이 차선에 남은 게이트 수(0이면 다음 spawn에서 전환)
    this.feverNextLane = null; // 예고된 다음 정답 차선(전환 직전 게이트에서만 세팅)

    // 연산 모드 선택: 교사 설정이 특정 연산이면 바로 시작, '혼합'이면 선택 화면.
    const teacher = engine.settings.operation || 'mixed';
    if (teacher === 'multiply' || teacher === 'divide') {
      this.runtimeOp = teacher;
      this.mode = 'play';
    } else {
      this.runtimeOp = 'multiply'; // 선택 전 기본값
      this.mode = 'select';
    }
    if (this.mode === 'play') this._spawnGate();
  },

  // ── 게이트 구성 ───────────────────────────────────────────
  _spawnGate() {
    if (this.finishing || this.fuel <= 0) return;
    const e = this.engine;
    // 피버(multi): "N단!" 배수 차선 게이트로 전환(1정답 배수 + 2오답 비배수).
    if (e.fever && e.fever.active && e.fever.type === 'multi') {
      this._spawnMultiGate();
      return;
    }
    // 런타임 선택 연산(runtimeOp)으로만 출제. 교사 설정이 특정 연산이면 core가 그것을 우선한다.
    this.problem = e.problemGenerator.nextProblem({ maxLevel: this.maxLevel, blankRatio: this.blankRatio, opMode: this.runtimeOp });
    const combo = e.scoreManager.combo;
    const closeness = clamp(0.3 + combo * 0.03, 0.3, 0.9); // 축 B: 콤보↑ → 근접 오답
    const distractors = e.problemGenerator.makeDistractors(this.problem, LANES - 1, closeness);
    const vals = shuffle([this.problem.answer, ...distractors]).slice(0, LANES);
    // 후보 부족 안전장치(makeDistractors가 항상 채우지만 방어적으로)
    while (vals.length < LANES) vals.push(this.problem.answer + vals.length + 1);
    if (!vals.includes(this.problem.answer)) vals[0] = this.problem.answer;
    this.gate = {
      values: vals,
      correctLane: vals.indexOf(this.problem.answer),
      p: 0,
      sec: this._gateSec(),
      locked: false,
      judged: false,
      judgeLane: null,
    };
    this.laneChangedThisGate = false;
  },

  // 옆 차선(한 칸만). lane 1은 무작위 좌/우, 끝 차선은 안쪽으로만 → 급격한 2칸 이동 방지.
  _adjacentLane(lane) {
    if (lane <= 0) return 1;
    if (lane >= LANES - 1) return LANES - 2;
    return Math.random() < 0.5 ? lane - 1 : lane + 1;
  },

  // 피버(multi) 배수 게이트: 3차선 중 1개만 fever.dan의 배수, 나머지 2개는 비배수.
  //   ⚠️ 세 게이트가 전부 정답이 되지 않게 — 오답 2개는 randomTrap(비배수)으로만 채운다.
  //   ⚠️ 정답 차선은 한 번 정하면 3~4개 연속 유지(feverLane) → "달리는" 감각. 전환은 옆 차선(±1)으로만,
  //      전환 직전 게이트(feverRunLeft가 0이 되는 게이트)에 다음 차선을 예고(gate.nextLane)한다.
  _spawnMultiGate() {
    const fv = this.engine.fever;
    // 이 차선의 연속 배치가 끝났으면 예고된 옆 차선으로 전환하고 새 구간(3~4개) 시작.
    if (this.feverRunLeft <= 0) {
      this.feverLane = this.feverNextLane != null ? this.feverNextLane : this._adjacentLane(this.feverLane);
      this.feverRunLeft = 3 + Math.floor(Math.random() * 2); // 3~4개
      this.feverNextLane = null;
    }
    const correctLane = this.feverLane;
    this.feverRunLeft -= 1;
    // 이 게이트가 구간의 마지막이면 다음 정답 차선을 지금 정해 예고(gate.nextLane).
    let nextLane = null;
    if (this.feverRunLeft <= 0) {
      this.feverNextLane = this._adjacentLane(this.feverLane);
      nextLane = this.feverNextLane;
    }
    const vals = new Array(LANES);
    const correctVal = fv.randomMultiple();
    vals[correctLane] = correctVal;
    const used = new Set([correctVal]);
    for (let i = 0; i < LANES; i++) {
      if (i === correctLane) continue;
      let v;
      let guard = 0;
      do {
        v = fv.randomTrap(); // 비배수 보장 → 정답 차선은 항상 1개뿐
        guard++;
      } while (used.has(v) && guard < 40);
      used.add(v);
      vals[i] = v;
    }
    this.gate = { values: vals, correctLane, p: 0, sec: this._gateSec(), locked: false, judged: false, judgeLane: null, multi: true, fromLane: correctLane, nextLane };
    this.laneChangedThisGate = false;
  },

  // 콤보 → 게이트 간격 단계 인덱스(순수 콤보 기준, 조정 전). 속도감 계산에도 쓴다.
  _comboTier() {
    const combo = this.engine.scoreManager.combo;
    return combo < 5 ? 0 : combo < 10 ? 1 : combo < 15 ? 2 : combo < 20 ? 3 : 4;
  },

  // 게이트 하강 시간(초). 콤보 단계로 단축(2.4→1.4)하되 1.4초 하한을 절대 지킨다(피버·콤보·배율 무관).
  //   연료30 이하·연속 오답 2회(slowTier)면 한 단계씩 되돌린다. 피버도 하한을 유지한다.
  _gateSec() {
    const e = this.engine;
    let ti = e.fever?.active ? GATE_TIERS.length - 1 : this._comboTier();
    if (this.fuel <= 30) ti -= 1; // 연료 부족 시 한 단계 여유를 준다.
    if (this.slowTier) ti -= 1; // 연속 오답 2회 → 한 단계 되돌림
    ti = clamp(ti, 0, GATE_TIERS.length - 1);
    let sec = GATE_TIERS[ti] * (e.settings.timeScale || 1);
    if (sec < MIN_GATE_SEC) sec = MIN_GATE_SEC; // ⚠️ 1.4초 절대 하한
    return sec;
  },

  // ── 좌표: 원근 투영 ──────────────────────────────────────
  _horizonY() { return cockpitLayout().horizon; },
  _carLineY() { return cockpitLayout().dash; },
  _proj(p) { return roadProjection(this, p); },
  _laneX(lane, p) {
    const pr = this._proj(p);
    return pr.cx + (lane - 1) * pr.laneSpacing;
  },
  _carPos() {
    // 1인칭 보상은 전방 중심. 운전석 조작이나 문제 위로 파티클을 보내지 않는다.
    return { x: L.W / 2, y: cockpitLayout().dash - L.gu(.7) };
  },

  // 속도감 배수. ⚠️ 게이트 간격이 짧아질수록 도로 흐름도 함께 빨라진다(간격만 줄고 속도감이 그대로면
  //   게이트가 촘촘해진 느낌만 난다). 간격 단계(콤보)로 계산 + 점수 세션 가산 + 피버.
  _speedFeel() {
    const e = this.engine;
    const gateFactor = clamp(GATE_TIERS[0] / GATE_TIERS[this._comboTier()], 1, 1.9); // 2.4/현재간격 (1.0→1.71)
    let f = gateFactor;
    f *= e.scoreManager.speedFactor; // 점수/콤보 세션 가산(공통, 시각 속도감만)
    if (e.fever && e.fever.active) f *= 2.0; // 피버 속도감 2.0배(재조정: 1.5→2.0)
    else if (e.fever) f *= e.fever.speedMultiplier; // 종료 램프 반영
    f *= 1 + this.boostVisual * 1.6; // 부스터 배경 최대2.6배, 계산/판정 시간 불변.
    return f;
  },

  // ── 업데이트 ──────────────────────────────────────────────
  update(dt) {
    this.time += dt;

    // 연산 모드 선택 화면 동안은 주행 로직 정지(선택 후 시작).
    if (this.mode === 'select') return;

    // 소진 후에는 피버 전환이 새 게이트를 만들지 않도록 먼저 종료 상태를 처리한다.
    if (this.finishing) {
      this.finishTimer -= dt;
      this._decayEffects(dt);
      if (this.finishTimer <= 0) this.engine.endGame();
      return;
    }
    this.manualBoostT = Math.max(0, this.manualBoostT - dt);
    const targetBoost = this.manualBoostT > 0 ? 1 : 0;
    this.boostVisual += (targetBoost - this.boostVisual) * (1 - Math.exp(-dt * (targetBoost ? 12 : 5)));
    if (this.boostVisual < .001) this.boostVisual = 0;

    // 피버 진입/종료 전이(상태는 core, 연출만 게임)
    const fev = this.engine.fever;
    const active = !!(fev && fev.active);
    if (active && !this.wasFever) {
      this.engine.ui.flash('rgba(255,210,120,0.5)', 0.09);
      this.engine.ui.showComboText('🔥 FEVER!', true);
      if (fev.type === 'multi') {
        this.feverChain = 0;
        // 정답 차선을 하나 정해 3~4개 연속 배치(_spawnMultiGate가 feverRunLeft로 관리).
        this.feverLane = Math.floor(Math.random() * LANES);
        this.feverRunLeft = 3 + Math.floor(Math.random() * 2);
        this.feverNextLane = null;
        this.gate = null;
        this._spawnGate(); // 배수 차선 게이트로 전환(fever.active=true → _spawnMultiGate)
      }
    } else if (!active && this.wasFever) {
      this.feverBanner = { points: fev ? fev.pointsEarned : 0, t: 0, dur: 1.4 };
      this.engine.ui.flash('rgba(120,200,255,0.4)', 0.09);
      if (this.gate && this.gate.multi) {
        this.gate = null;
        this._spawnGate(); // 남은 배수 게이트 정리 → 새 문제 게이트(fever.active=false → 일반)
      }
    }
    this.wasFever = active;
    if (this.feverBanner) {
      this.feverBanner.t += dt;
      if (this.feverBanner.t >= this.feverBanner.dur) this.feverBanner = null;
    }

    this.raceElapsed += dt;

    // 배경/스크롤(속도감)
    const feel = this._speedFeel();
    this.scrollPhase = (this.scrollPhase + dt * BASE_SCROLL * feel) % 1;

    // 차선 보간 + 차체 기울기/바운스
    this.laneF += (this.targetLane - this.laneF) * (1 - Math.pow(0.0009, dt));
    this.carTilt = clamp(this.targetLane - this.laneF, -1, 1) * MAX_TILT * 5; // 이동 중 기울기(수렴하면 0)
    this.carTilt = clamp(this.carTilt, -MAX_TILT, MAX_TILT);

    // 게이트 하강 + 잠금 + 판정
    const g = this.gate;
    if (g && !g.judged) {
      g.p += dt / g.sec;
      const lockP = Math.max(0, 1 - LOCK_SEC / g.sec);
      if (!g.locked && g.p >= lockP) {
        g.locked = true;
        g.judgeLane = this.targetLane; // 확정 순간 차선 고정
      }
      if (g.p >= 1) {
        g.judged = true;
        this._judge();
      }
    }

    this._decayEffects(dt);
  },

  _decayEffects(dt) {
    if (this.boostT > 0) this.boostT = Math.max(0, this.boostT - dt);
    if (this.crashT > 0) this.crashT = Math.max(0, this.crashT - dt);
    if (this.carZoom > 0) this.carZoom = Math.max(0, this.carZoom - dt);
    // 충돌 범퍼 튕김(위로 살짝 튀었다 복귀 — 스핀/파손 아님)
    this.carBounce = this.crashT > 0 ? Math.sin((1 - this.crashT / CRASH_DUR) * Math.PI) * L.gu(0.5) : 0;
    for (let i = this.floats.length - 1; i >= 0; i--) {
      this.floats[i].t += dt;
      if (this.floats[i].t >= this.floats[i].dur) this.floats.splice(i, 1);
    }
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      this.smoke[i].t += dt;
      if (this.smoke[i].t >= this.smoke[i].dur) this.smoke.splice(i, 1);
    }
  },

  // ── 판정 ──────────────────────────────────────────────────
  _judge() {
    const e = this.engine;
    const g = this.gate;
    if (!g || g.resolved || this.finishing) return;
    g.resolved = true;
    const lane = g.judgeLane != null ? g.judgeLane : Math.round(clamp(this.laneF, 0, LANES - 1));
    const chosen = g.values[lane];
    const correct = lane === g.correctLane;

    this.gatesPassed += 1;
    const cp = this._carPos();

    // 피버 배수 게이트: 배수 차선=정답(연속 BOOST), 아닌 차선=무해(무적).
    if (g.multi) {
      this._judgeMulti(chosen, cp);
      return;
    }

    if (correct) {
      this.consecWrong = 0;
      this.slowTier = false; // 정답 → 간격 되돌림 해제
      const combo = e.scoreManager.combo;
      const pts = this._boostPoints(100 + combo * 10);
      // 니어미스: 도달 직전(0.5초 이내)에 차선을 바꿔 정답
      const nearMiss = this.laneChangedThisGate && this.raceElapsed - this.lastLaneChangeAt <= NEARMISS_SEC;
      this.fuel = Math.min(FUEL_MAX, this.fuel + 8 + (nearMiss ? 5 : 0));
      const before = e.scoreManager.score;
      e.answerCorrect(this.problem, chosen, pts); // 점수배수·게이지·정답음·콤보문구·위기밝힘 자동
      const shown = e.scoreManager.score - before; // 이번 정답으로 피버가 켜져도 실제 가산과 일치.
      this._boost(shown, cp);
      if (nearMiss) e.reportNearMiss(cp.x, cp.y - L.gu(1.4));
      this._checkBest(cp);
      this.gate = null;
      this._spawnGate(); // 멈춤 없이 다음 게이트(≤0.15초는 즉시)
    } else {
      this.fuel = Math.max(0, this.fuel - 25);
      this._cancelControl();
      this.consecWrong += 1;
      if (this.consecWrong >= 2) this.slowTier = true; // 연속 오답 2회 → 간격 한 단계 되돌림
      this._crash(cp);
      this.gate = null; // 지나친 오답 게이트는 즉시 제거(정지 오버레이가 덮음)
      // 연료 소진도 정답 피드백을 끝까지 보여준 뒤 종료한다. 하트는 차감하지 않는다.
      e.answerWrong(this.problem, chosen, {
        loseLife: false,
        onResume: () => {
          if (this.fuel <= 0) this._finish();
          else this._spawnGate();
        },
      });
    }
  },

  // 피버 배수 게이트 판정: 배수 차선=정답(연속 BOOST 누적), 아닌 차선=무해(연료·콤보 불변).
  _judgeMulti(chosen, cp) {
    const e = this.engine;
    const fv = e.fever;
    const dan = fv.dan;
    if (fv.isMultiple(chosen)) {
      this.feverChain += 1;
      const boost = this.feverChain >= 4 ? 4 : this.feverChain; // 1/2/3/4(MAX)
      const q = Math.round(chosen / dan);
      const prob = { a: dan, b: q, op: '×', answer: chosen, remainder: null, text: `${dan} × ${q}`, blank: null, level: 1 };
      const pts = this._boostPoints((100 + e.scoreManager.combo * 10) * boost);
      const nearMiss = this.laneChangedThisGate && this.raceElapsed - this.lastLaneChangeAt <= NEARMISS_SEC;
      this.fuel = Math.min(FUEL_MAX, this.fuel + 8 + (nearMiss ? 5 : 0));
      const before = e.scoreManager.score;
      e.answerCorrect(prob, chosen, pts); // 점수배수·게이지·정답음·콤보문구 자동(무적)
      const shown = e.scoreManager.score - before;
      this._feverBoost(shown, cp, boost);
      if (nearMiss) e.reportNearMiss(cp.x, cp.y - L.gu(1.4));
      this._checkBest(cp); // A: 피버 통과로도 최고점 돌파 감지
    } else {
      // 아닌 차선 통과 → 무해(무적). 연속 BOOST만 초기화. 세션엔 기록(복습 미등록).
      this.feverChain = 0;
      const prob = { a: chosen, b: dan, op: '÷', answer: Math.floor(chosen / dan), remainder: chosen % dan, text: `${chosen} ÷ ${dan}`, blank: null, level: 1 };
      e.answerWrong(prob, chosen, { loseLife: false, affectLevel: false, freeze: false });
      this.floats.push({ x: cp.x, y: cp.y - L.gu(1.6), text: '아쉽!', color: THEME.subtext, size: L.font(0.032), t: 0, dur: 0.5 });
      this.engine.particles.emit(cp.x, cp.y - L.gu(0.3), 'pop', '#c9d2e0', 8);
    }
    this.gate = null;
    this._spawnGate(); // 즉시 다음 배수 게이트(피버 중이면 _spawnMultiGate)
  },

  // 피버 통과 보상: 전방 불꽃·점수 부양·후드 반동·연속 BOOST 문구.
  _feverBoost(shownPts, cp, boost) {
    const e = this.engine;
    this.boostT = BOOST_DUR;
    this.carZoom = 0.16;
    // 점수 여러 개 튀어오름
    const n = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      this.floats.push({ x: cp.x + (Math.random() - 0.5) * L.gu(3), y: cp.y - L.gu(1.8) - Math.random() * L.gu(1), text: `+${shownPts}`, color: THEME.gold, size: L.font(0.04), t: 0, dur: 0.6 });
    }
    // 게이트가 화려하게 부서짐(불꽃 3배 — 기존 16 → 48)
    e.particles.emit(cp.x, cp.y + L.gu(0.9), 'explode', THEME.gold, 48);
    e.particles.emit(cp.x, cp.y, 'sparkle', THEME.gold, 30);
    e.particles.emit(cp.x, cp.y - L.gu(1), 'pop', '#ffe9a8', 20);
    e.ui.shake(9, SHAKE_TIME);
    e.sound.play('pop');
    this._haptic(18);
    if (boost >= 2) e.ui.showComboText(boost >= 4 ? 'MAX BOOST!' : `×${boost} BOOST!`, boost >= 4);
  },

  // 정답 통과: 전방 파티클 + 속도선 강화 + 짧은 반동 + 햅틱.
  _boost(shownPts, cp) {
    const e = this.engine;
    const gold = e.fever && e.fever.active;
    const flame = gold ? THEME.gold : '#ff9a3d';
    this.boostT = BOOST_DUR;
    this.carZoom = 0.12;
    this.floats.push({ x: cp.x, y: cp.y - L.gu(1.8), text: `+${shownPts}`, color: gold ? THEME.gold : THEME.correct, size: L.font(0.04), t: 0, dur: 0.6 });
    e.particles.emit(cp.x, cp.y + L.gu(0.9), 'explode', flame, 16); // 후드 앞 보상 불꽃
    e.particles.emit(cp.x, cp.y + L.gu(1.1), 'sparkle', flame, 12);
    e.ui.shake(7, SHAKE_TIME);
    e.sound.play('pop'); // 부스터 whoosh(중립적 짧은 소리)
    this._haptic(15);
  },

  // 충돌: 만화적 표현만 — 범퍼 튕김(carBounce) + 연기 구름. ⚠️ 스핀/파손/현실적 사고 금지(§2.5).
  _crash(cp) {
    const e = this.engine;
    this.crashT = CRASH_DUR;
    for (let i = 0; i < 3; i++) {
      this.smoke.push({ x: cp.x + (Math.random() - 0.5) * L.gu(1.4), y: cp.y - L.gu(0.4), t: 0, dur: CRASH_DUR, r: L.gu(0.9 + Math.random() * 0.5) });
    }
    e.particles.emit(cp.x, cp.y - L.gu(0.3), 'pop', '#c9d2e0', 14); // 회색 연기 튀김
    e.ui.shake(13, 0.32);
    this._haptic(20);
  },

  // A: 현재 점수가 개인 최고점을 막 넘은 순간 1회만 축하(기록 없으면 아무것도 안 함).
  _checkBest(cp) {
    if (this.bestScore == null || this.beatBest) return;
    if (this.engine.scoreManager.score > this.bestScore) {
      this.beatBest = true;
      this.engine.particles.emit(cp.x, cp.y - L.gu(1), 'sparkle', THEME.gold, 22);
      this.engine.ui.showComboText('🏆 최고점 돌파!', false);
      this.engine.sound.play('pop');
    }
  },

  _finish() {
    if (this.finishing) return;
    this.finishing = true;
    this.finishTimer = FINISH_HOLD;
    this.gate = null;
    this.manualBoostT = 0;
    this.feverBanner = null;
    this.boostVisual = 0;
    this._cancelControl();
  },

  getSurvivalHUD() {
    return { label: '연료', value: this.fuel, max: FUEL_MAX,
      color: this.fuel <= 15 ? '#ffab91' : this.fuel <= 30 ? THEME.gold : '#80e8cb',
      note: this.fuel <= 15 ? '매우 낮음' : this.fuel <= 30 ? '낮음' : '정답 +8' };
  },
  _boostPoints(points) {
    return Math.round(points * (this.manualBoostT > 0 ? 1.5 : 1));
  },
  _boostRect() {
    return cockpitLayout().boost;
  },
  _inBoost(x, y) {
    const r = this._boostRect();
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  },
  _useManualBoost() {
    if (this.mode !== 'play' || this.finishing || this.engine.isFrozen?.() || this.manualBoostT > 0 || this.fuel < BOOST_COST) return false;
    this.fuel -= BOOST_COST;
    this.manualBoostT = MANUAL_BOOST_DUR;
    this.boostT = BOOST_DUR;
    this.engine.sound.play('pop');
    this._haptic(15);
    if (this.fuel === 0) this._finish();
    return true;
  },
  _cancelControl() {
    this.touchStartX = null;
    this.touchMoved = false;
    this.touchControl = null;
  },

  // ── 연산 모드 선택 화면 ───────────────────────────────────
  _modeButtons() {
    const w = L.w(0.36); // ≥ L.minTouch
    const h = L.gu(3.5);
    const gap = L.gu(1.2);
    const totalW = w * 2 + gap;
    const x0 = (L.W - totalW) / 2;
    const y = L.y(0.52);
    return [
      { op: 'multiply', label: '× 곱셈', x: x0, y, w, h, color: THEME.accent },
      { op: 'divide', label: '÷ 나눗셈', x: x0 + w + gap, y, w, h, color: '#3ec1a0' },
    ];
  },
  _drawModeSelect(ctx) {
    drawCockpitWorld(ctx, this);
    drawCockpit(ctx, this);
    const cx = L.W / 2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 제목 칩
    const chipW = L.w(0.82);
    ctx.fillStyle = 'rgba(16,24,40,0.72)';
    roundRectPath(ctx, cx - chipW / 2, L.y(0.3), chipW, L.gu(3), L.gu(0.5));
    ctx.fill();
    ctx.fillStyle = THEME.text;
    ctx.font = font(L.font(0.058));
    ctx.fillText('어떤 연산으로 달릴까?', cx, L.y(0.3) + L.gu(1.5));
    // 버튼
    for (const b of this._modeButtons()) {
      roundRectPath(ctx, b.x, b.y, b.w, b.h, L.gu(0.5));
      ctx.fillStyle = b.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = L.gu(0.1);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = font(L.font(0.06));
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    }
    ctx.restore();
  },

  // ── 입력: 차선 이동(탭 좌/우 절반 · 드래그 · 키보드) ─────
  onTouch(x, y, phase) {
    // 연산 모드 선택: 버튼 탭 → runtimeOp 덮어쓰고 주행 시작.
    if (this.mode === 'select') {
      if (phase !== 'start') return;
      for (const b of this._modeButtons()) {
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          this.runtimeOp = b.op;
          this.mode = 'play';
          this._spawnGate();
          this.engine.sound.play('tick');
          return;
        }
      }
      return;
    }
    if (this.finishing) return;
    if (phase === 'start') {
      this._cancelControl();
      if (this._inBoost(x, y)) {
        this.touchControl = 'boost';
        this._useManualBoost(); // 버튼에서 시작한 제스처 전체를 소비해 조향 오작동 방지.
        return;
      }
      if (y < L.zone.hudBottom || y >= cockpitLayout().dash) return;
      this.touchControl = 'steer';
      this.touchStartX = x;
      this.touchMoved = false;
    } else if (phase === 'move') {
      if (this.touchControl !== 'steer') return;
      if (this._inBoost(x, y) || y < L.zone.hudBottom || y >= cockpitLayout().dash) { this._cancelControl(); return; }
      if (this.touchStartX == null) return;
      const dx = x - this.touchStartX;
      const thresh = L.w(0.11); // 이 이상 끌면 한 차선 이동
      if (Math.abs(dx) > thresh) {
        this._steer(Math.sign(dx));
        this.touchStartX = x; // 이어서 더 끌면 또 이동
        this.touchMoved = true;
      }
    } else if (phase === 'end') {
      if (this.touchControl === 'steer' && !this._inBoost(x, y) && y >= L.zone.hudBottom && y < cockpitLayout().dash && !this.touchMoved && this.touchStartX != null) {
        this._steer(x < L.W / 2 ? -1 : 1); // 탭: 좌/우 절반
      }
      this._cancelControl();
    }
  },

  onKey(e) {
    if (this.mode === 'select') {
      // 데스크톱: 1/x=곱셈, 2=나눗셈
      if (e.key === '1' || e.key === 'x' || e.key === 'X') { this.runtimeOp = 'multiply'; this.mode = 'play'; this._spawnGate(); }
      else if (e.key === '2') { this.runtimeOp = 'divide'; this.mode = 'play'; this._spawnGate(); }
      return;
    }
    if (this.finishing) return;
    const k = e.key;
    if (k === ' ') {
      e.preventDefault?.();
      if (!e.repeat) this._useManualBoost();
      return;
    }
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') this._steer(-1);
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') this._steer(1);
  },

  _steer(dir) {
    if (this.gate && this.gate.locked) return; // 판정 확정 구간엔 반영 안 함
    const nl = clamp(this.targetLane + dir, 0, LANES - 1);
    if (nl !== this.targetLane) {
      this.targetLane = nl;
      this.lastLaneChangeAt = this.raceElapsed;
      this.laneChangedThisGate = true;
      this.engine.sound.play('tick');
    }
  },

  onHover(x, y) {
    return this.mode === 'play' && !this.finishing && this._inBoost(x, y);
  },
  clearHover() {},

  // ── 렌더 ──────────────────────────────────────────────────
  render(ctx) {
    if (this.mode === 'select') { this._drawModeSelect(ctx); return; }
    drawCockpitWorld(ctx, this);
    this._drawFeverTelegraph(ctx);
    drawCockpitGate(ctx, this);
    for (const s of this.smoke) drawSmoke(ctx, s);
    drawCockpit(ctx, this);
    if (this.engine.fever) {
      this.engine.fever.renderGauge(ctx, { x: L.safe, y: L.zone.hudBottom + L.gu(.25), w: L.W - L.safe * 2, h: L.gu(.4) });
    }
    drawCockpitQuestion(ctx, this);
    this._drawFloats(ctx);
    if (this.finishing) this._drawFinishBanner(ctx);
    this._drawFeverBanner(ctx);
    this._drawFuelCrisis(ctx);
  },

  _drawFuelCrisis(ctx) {
    if (this.fuel > 30 || this.finishing) return;
    const severe = this.fuel <= 15;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * Math.PI * 2); // 1Hz, 밝은 가장자리만.
    ctx.save();
    ctx.strokeStyle = severe ? '#ffbc9e' : '#ffe5a0';
    ctx.globalAlpha = (severe ? 0.25 : 0.12) + pulse * (severe ? 0.3 : 0.15);
    ctx.lineWidth = L.gu(severe ? 0.5 : 0.25);
    ctx.strokeRect(L.gu(0.3), L.zone.hudBottom, L.W - L.gu(0.6), L.H - L.zone.hudBottom - L.gu(0.3));
    ctx.restore();
  },

  // 전환 예고는 게이트와 겹치지 않는 도로 하단에만. 1Hz 맥박.
  _drawFeverTelegraph(ctx) {
    const g = this.gate;
    if (!g?.multi || g.nextLane == null) return;
    ctx.save();
    ctx.globalAlpha = .8 + .2 * Math.sin(this.time * Math.PI * 2);
    ctx.fillStyle = THEME.gold; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(L.gu(.8));
    const dir = g.nextLane > g.fromLane ? '오른쪽 →' : '← 왼쪽';
    drawRewardText(ctx, '다음은 ' + dir, L.W / 2, cockpitLayout().dash - L.gu(.8));
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
      ctx.fillText(t.text, t.x, t.y - p * L.gu(2.2));
      ctx.restore();
    }
  },

  _drawFinishBanner(ctx) {
    const p = 1 - this.finishTimer / FINISH_HOLD;
    ctx.save();
    ctx.globalAlpha = p < 0.85 ? 1 : Math.max(0, 1 - (p - 0.85) / 0.15);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.gold;
    ctx.font = font(L.font(0.06));
    ctx.lineWidth = L.gu(0.25);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    const title = '연료를 다 썼어요';
    ctx.strokeText(title, L.W / 2, L.y(0.44));
    ctx.fillText(title, L.W / 2, L.y(0.44));
    ctx.fillStyle = THEME.text;
    ctx.font = font(L.font(0.04), 'normal');
    ctx.fillText(`이번 주행 · ${this.gatesPassed}개 통과`, L.W / 2, L.y(0.44) + L.gu(2.4));
    ctx.restore();
  },

  // ── 피버 연출 ─────────────────────────────────────────────
  _feverIntensity() {
    const f = this.engine.fever;
    if (!f) return 0;
    if (f.active) return 1;
    const peak = (f.cfg && f.cfg.speedMult ? f.cfg.speedMult : 1.35) - 1;
    return peak > 0 ? Math.max(0, (f.speedMultiplier - 1) / peak) : 0;
  },
  _drawFeverTint(ctx) {
    const mult = this._feverIntensity();
    if (mult <= 0) return;
    const a = 0.16 * mult; // ⚠️ 더 화사한 쪽으로만(어둡게/반전 금지 §2.6)
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
    ctx.font = font(L.gu(1));
    ctx.lineWidth = L.gu(0.25);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(`FEVER +${b.points}`, L.W / 2, L.zone.playTop + L.gu(2.3));
    ctx.fillStyle = THEME.gold;
    ctx.fillText(`FEVER +${b.points}`, L.W / 2, L.zone.playTop + L.gu(2.3));
    ctx.restore();
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

  destroy() {
    this.engine = null;
    this.problem = null;
    this.gate = null;
    this.floats = [];
    this.smoke = [];
    this.feverBanner = null;
  },
};

// ══════════════════════════════════════════════════════════
// 씬 그리기(모듈 로컬 — core 미수정). ⚠️ 나중에 스프라이트 이미지로 교체할 때 이 함수들만 바꾸면 된다.
//   각 함수는 원시 좌표/크기만 받아 그린다(게임 상태에서 L 헬퍼로 계산해 전달).
// ══════════════════════════════════════════════════════════

// 만화 연기 구름(충돌)
function drawSmoke(ctx, s) {
  const prog = s.t / s.dur;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 0.55 * (1 - prog));
  ctx.fillStyle = '#d7deeb';
  const r = s.r * (0.7 + prog * 1.2);
  for (const [dx, dy, sc] of [[0, 0, 1], [-0.6, -0.2, 0.7], [0.6, -0.1, 0.7], [0, -0.6, 0.6]]) {
    ctx.beginPath();
    ctx.arc(s.x + dx * r, s.y + dy * r - prog * L.gu(1), r * sc * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ── 공용 헬퍼 ─────────────────────────────────────────────
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
