// g03_race.js — 🚀 레이싱 계산 (SPEC §4 3️⃣ / Phase 5, 재개정안)
// 경쟁형(자기 최고기록과의 경주). 확정 인터페이스(SPEC §7)만 사용한다. core/scenes는 절대 건드리지 않는다.
//
// ⚠️ 재개정(원 '갈림길 카드 선택' 폐기): 갈림길 카드 선택은 결국 4지선다에 그림을 입힌 구조라
//   조작 감각이 다른 게임(1·5·7 등)과 겹쳤다. 그래서 '실제로 운전해서 정답 차선 게이트를
//   통과'하는 카트라이더/아웃런 계열 아케이드 드라이빙으로 전면 재구축한다.
//   - 3차선(0 좌 / 1 중 / 2 우) 도로. 화면 하단 고정 플레이어 자동차.
//   - 조작: 화면 좌/우 절반 탭 또는 좌우 드래그로 한 차선씩 이동, 키보드 ← → / A D.
//   - 상단 문제 텍스트. 3개 차선을 따라 숫자 게이트가 내려온다(1정답 + 2오답 makeDistractors).
//   - 게이트가 자동차 선에 도달할 때 '현재 차선의 값'으로 판정한다.
//   - 정답 통과: answerCorrect + 부스터 연출(불꽃·속도선·짧은 흔들림·햅틱). 멈추지 않고 다음 게이트.
//   - 오답 통과: answerWrong(라이프 -1) + 만화적 충돌(범퍼 튕김·연기). ⚠️ 스핀/파손 금지(§2.5, 초3).
//
// ⚠️ 놓침 ≠ 오답 완충(중요): 손이 늦어 오답 차선을 지나는 것과 계산을 틀린 것을 구분할 수 없으므로,
//   (1) 게이트 도달 0.4초 전부터 차선 변경을 막고(판정 확정), 확정 순간 현재 차선 게이트를 강조한다.
//   (2) 게이트 간격(하강 시간)은 콤보에 따라 단계적으로 줄이되 1.4초 하한을 절대 지킨다(피버·콤보 무관).
//       라이프1·연속 오답 2회 시 한 단계 되돌린다. 간격이 줄면 도로 흐름 속도도 함께 빨라진다.
//   (3) 라이프 1개일 때는 간격을 한 단계 늘려 여유를 준다.
//
// 연산 모드: 게임 시작(튜토리얼 이후) 시 곱셈/나눗셈을 고른다(런타임 opMode 덮어쓰기).
//   교사 설정이 특정 연산(곱셈만/나눗셈만)이면 선택 화면을 건너뛰고 그 연산으로 시작한다.
//   (유령/최고기록 별도 저장은 제거 — 최고 점수는 core scoreManager가 관리한다.)
//
// 진행: 총 30개 게이트를 통과하면 완주 → 결과 화면. 라이프 3, 오답으로만 깎인다.
//   니어미스: 게이트 도달 직전(0.5초 이내)에 차선을 바꿔 정답 통과.
//
// 피버(multi): "N단!" 배수 차선 게이트(간격 1.0초·속도감 2.0배). ⚠️ 정답 차선을 3~4개 연속 고정한 뒤
//   옆 차선(±1)으로만 전환하고, 전환 직전 게이트에서 빛나는 레인 하이라이트+방향 화살표로 예고한다
//   (매 게이트 좌우 이동을 강요하지 않아 "달리는" 감각·연속 BOOST가 산다). 세 게이트 중 정답은 항상 1개.
// 재미 표준(§2.6): fever(속도감 1.5배·불꽃 골드·점수 배수, 단 게이트 1.4초 하한 유지), comboMilestones,
//   정답 즉시 진행(멈춤 없음), 손맛, L 헬퍼 좌표.
//
// ⚠️ 축 분리(§2.1): 이 게임은 문제 난이도 프레이밍(currentLevel 읽기)을 하지 않는다. 게이트 하강 속도·
//   오답 근접도 등 게임 난이도(축 B)는 오직 engine.scoreManager.combo 로만 계산한다. 문제는
//   nextProblem({maxLevel:4})로만 뽑는다.
//
// 🎨 시각(3D 엔진 없이 Canvas 2D 도형만, 외부 에셋 0): 도로를 사다리꼴로 그려 원근을 만들고,
//   차선 구분선이 위→아래로 흘러 속도감을 낸다(속도가 오르면 흐름도 빨라짐). 게이트는 위에서 작게
//   나타나 아래로 오며 커진다. 배경은 하늘 그라디언트 + 좌우로 지나가는 단순 실루엣(가까울수록 빠름).
//   ⚠️ 나중에 스프라이트 이미지로 교체하기 쉽도록, 씬 그리기는 전부 모듈 로컬 함수로 분리했다
//      (drawSky/drawGround/drawSideObject/drawRoad/drawStripes/drawGate/drawCar/drawFlame/drawSpeedLines).

import { L } from '../core/layout.js';
import { THEME, font } from '../core/ui.js';
import { drawWorldHeader } from '../art/arcadeWorld.js';
import { drawRewardText } from '../art/toyArt.js';

// ── 상수 ──────────────────────────────────────────────────
const TRACK = 30; // 총 게이트 수
const LANES = 3; // 0 좌 / 1 중 / 2 우

const MIN_GATE_SEC = 1.4; // ⚠️ 게이트 하강 시간 하한(계산할 시간). 콤보·피버·배율과 무관하게 절대 지킨다.
const GATE_TIERS = [2.4, 2.1, 1.8, 1.6, 1.4]; // 콤보 0~4 / 5~9 / 10~14 / 15~19 / 20+ (하한 1.4)
const LOCK_SEC = 0.4; // 게이트 도달 이 시간 전부터 차선 변경 잠금(판정 확정)
const NEARMISS_SEC = 0.5; // 도달 직전 이 시간 이내에 차선을 바꿔 정답 → 니어미스

const BOOST_DUR = 0.42; // 부스터 연출(파티클 상한 내)
const CRASH_DUR = 0.4; // 충돌 범퍼 튕김/연기
const FINISH_HOLD = 1.3; // 완주 배너 유지 후 결과(초)
const SHAKE_TIME = 0.1; // 화면 흔들림(0.08~0.12)

const BASE_SCROLL = 0.5; // 차선선 스크롤 기본(사이클/초, 속도감 배수 곱함)
const SIDE_SPEED = 0.42; // 좌우 실루엣이 다가오는 기본 속도
const MAX_TILT = 0.22; // 차선 이동 시 차체 최대 기울기(rad)

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
    text: '좌우로 운전해서 정답 차선 게이트를 통과해! 내 최고기록 유령과 겨뤄보자!',
    draw(ctx) {
      // 카드 영역(엔진이 translate(0,260)) 안에 3차선 도로 + 게이트 + 내 차 미리보기.
      const cx = L.W / 2;
      const topY = L.gu(0.6);
      const botY = L.gu(8.6);
      const topHalf = L.w(0.06);
      const botHalf = L.w(0.4);
      // 도로 사다리꼴
      ctx.fillStyle = '#2b2f3a';
      ctx.beginPath();
      ctx.moveTo(cx - topHalf, topY);
      ctx.lineTo(cx + topHalf, topY);
      ctx.lineTo(cx + botHalf, botY);
      ctx.lineTo(cx - botHalf, botY);
      ctx.closePath();
      ctx.fill();
      // 차선 구분선(2줄)
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = L.gu(0.1);
      ctx.setLineDash([L.gu(0.5), L.gu(0.5)]);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * topHalf / 3, topY);
        ctx.lineTo(cx + s * botHalf / 3, botY);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // 게이트(3칸 숫자) — 정답 노출 안 함(스스로 계산)
      const gy = topY + (botY - topY) * 0.42;
      const gHalf = topHalf + (botHalf - topHalf) * 0.42;
      const labels = ['18', '42', '36'];
      for (let i = 0; i < 3; i++) {
        const gx = cx + (i - 1) * (gHalf * 2 / 3);
        drawGatePanel(ctx, gx, gy, gHalf * 0.6, L.gu(1.3), labels[i], false);
      }
      // 내 차(하단 중앙)
      drawCar(ctx, cx, botY - L.gu(0.9), L.w(0.15), L.gu(2.2), 0, '#e8663d', 1);
      // 문제 + 조작 안내
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.045));
      ctx.fillText('6 × 7 = ?', cx, botY + L.gu(1));
      ctx.fillStyle = THEME.subtext;
      ctx.font = font(L.font(0.03), 'normal');
      ctx.fillText('◀ 왼쪽 탭   ·   오른쪽 탭 ▶   (드래그도 OK)', cx, botY + L.gu(2.1));
    },
  },

  // ── 초기화 ────────────────────────────────────────────────
  init(engine) {
    this.engine = engine;
    this.time = 0;
    this.raceElapsed = 0; // 활성 주행 시간(오답 정지 중에는 update 미호출로 자연 제외)

    // 차선/차체
    this.targetLane = 1; // 중앙에서 시작
    this.laneF = 1; // 부드러운 시각 보간값
    this.carTilt = 0;
    this.carBounce = 0;

    // 게이트
    this.problem = null;
    this.gate = null; // {values,correctLane,p,sec,locked,judged,judgeLane}
    this.gatesPassed = 0;

    // 입력 상태
    this.touchStartX = null;
    this.touchMoved = false;
    this.lastLaneChangeAt = -999;
    this.laneChangedThisGate = false;

    // 게이트 간격 조정(라이프1은 _gateSec에서, 연속 오답 2회는 slowTier로 한 단계 되돌림)
    this.consecWrong = 0;
    this.slowTier = false;

    // 연출
    this.boostT = 0;
    this.crashT = 0;
    this.carZoom = 0;
    this.floats = [];
    this.smoke = []; // 만화 연기 구름 [{x,y,t,dur,r}]
    this.scrollPhase = 0; // 차선선 스크롤 위상
    this.side = this._initSide(); // 좌우 실루엣

    // 완주/피버
    this.finishing = false;
    this.finishTimer = 0;
    this.finishTime = 0;
    this.wasFever = false;
    this.feverBanner = null;
    this.feverChain = 0; // 피버 중 배수 게이트 연속 통과(×2/×3/MAX BOOST 누적)
    this.feverZoomT = 0; // 피버 통과 시 짧은 화면 확대(0.08초)
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
  //   라이프1·연속 오답 2회(slowTier)면 한 단계 되돌린다(간격 늘림). 교사 배율은 늘리는 방향만 유효.
  _gateSec() {
    const e = this.engine;
    // ⚠️ 피버 중엔 간격 1.0초로 단축(배수 판별은 곱셈보다 빠름). 일반 1.4초 하한은 아래에서 유지.
    if (e.fever && e.fever.active) return 1.0 * (e.settings.timeScale || 1);
    let ti = this._comboTier();
    if (e.scoreManager.lives <= 1) ti -= 1; // 라이프1 → 한 단계 되돌림(더 여유)
    if (this.slowTier) ti -= 1; // 연속 오답 2회 → 한 단계 되돌림
    ti = clamp(ti, 0, GATE_TIERS.length - 1);
    let sec = GATE_TIERS[ti] * (e.settings.timeScale || 1);
    if (sec < MIN_GATE_SEC) sec = MIN_GATE_SEC; // ⚠️ 1.4초 절대 하한
    return sec;
  },

  // ── 좌표: 원근 투영 ──────────────────────────────────────
  _horizonY() {
    return L.zone.playTop + L.gu(0.6); // 도로 소실선(문제 텍스트 아래)
  },
  _carLineY() {
    return L.zone.playBottom + L.gu(3.8); // 판정선 = 자동차 중심 y (p=1 지점)
  },
  // p: 0(소실선/멀리) ~ 1(자동차선/가까이). 완만한 ease-in으로 원근·속도감을 주되,
  //   ⚠️ 너무 급하면 게이트 숫자가 소실선에 오래 붙어 초3이 못 읽는다 → 곡선을 완만히,
  //   먼 게이트도 읽을 수 있게 최소 스케일을 넉넉히 둔다(SPEC §1.2 문제 텍스트 가독성).
  _proj(p) {
    const topY = this._horizonY();
    const botY = this._carLineY();
    const topHalf = L.w(0.05);
    const botHalf = L.w(0.44);
    const t = p * (0.5 + 0.5 * p); // 0.5p + 0.5p² — 완만한 가속(멀리도 꾸준히 내려온다)
    const y = topY + (botY - topY) * t;
    const half = topHalf + (botHalf - topHalf) * t;
    return { y, half, laneSpacing: (half * 2) / LANES, cx: L.W / 2, scale: 0.28 + 0.72 * t };
  },
  _laneX(lane, p) {
    const pr = this._proj(p);
    return pr.cx + (lane - 1) * pr.laneSpacing;
  },
  _carPos() {
    return { x: this._laneX(this.laneF, 1), y: this._carLineY() - this.carBounce };
  },

  // ── 좌우 실루엣(배경) ────────────────────────────────────
  _initSide() {
    const kinds = ['tree', 'building', 'tree', 'building', 'cloud'];
    const arr = [];
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < 5; i++) {
        arr.push({ side: s, z: i / 5 + Math.random() * 0.08, kind: kinds[i % kinds.length], seed: Math.random() });
      }
    }
    return arr;
  },
  _updateSide(dt, feel) {
    for (const o of this.side) {
      const spd = o.kind === 'cloud' ? SIDE_SPEED * 0.25 : SIDE_SPEED; // 구름은 멀리서 천천히
      o.z += dt * spd * feel;
      if (o.z >= 1) {
        o.z -= 1;
        o.seed = Math.random();
        o.kind = Math.random() < 0.2 ? 'cloud' : Math.random() < 0.5 ? 'tree' : 'building';
      }
    }
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
    return f;
  },

  // ── 업데이트 ──────────────────────────────────────────────
  update(dt) {
    this.time += dt;

    // 연산 모드 선택 화면 동안은 주행 로직 정지(선택 후 시작).
    if (this.mode === 'select') return;

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

    // 완주 배너 → 결과
    if (this.finishing) {
      this.finishTimer -= dt;
      this._decayEffects(dt);
      if (this.finishTimer <= 0) this.engine.endGame();
      return;
    }

    this.raceElapsed += dt;

    // 배경/스크롤(속도감)
    const feel = this._speedFeel();
    this.scrollPhase = (this.scrollPhase + dt * BASE_SCROLL * feel) % 1;
    this._updateSide(dt, feel);

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
    if (this.feverZoomT > 0) this.feverZoomT = Math.max(0, this.feverZoomT - dt);
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
    const lane = g.judgeLane != null ? g.judgeLane : Math.round(clamp(this.laneF, 0, LANES - 1));
    const chosen = g.values[lane];
    const correct = lane === g.correctLane;

    this.gatesPassed += 1;
    const last = this.gatesPassed >= TRACK;
    const cp = this._carPos();

    // 피버 배수 게이트: 배수 차선=정답(연속 BOOST), 아닌 차선=무해(무적).
    if (g.multi) {
      this._judgeMulti(chosen, cp, last);
      return;
    }

    if (correct) {
      this.consecWrong = 0;
      this.slowTier = false; // 정답 → 간격 되돌림 해제
      const combo = e.scoreManager.combo;
      const pts = 100 + combo * 10;
      // 니어미스: 도달 직전(0.5초 이내)에 차선을 바꿔 정답
      const nearMiss = this.laneChangedThisGate && this.raceElapsed - this.lastLaneChangeAt <= NEARMISS_SEC;
      e.answerCorrect(this.problem, chosen, pts); // 점수배수·게이지·정답음·콤보문구·위기밝힘 자동
      const shown = pts * (e.fever && e.fever.active ? e.fever.scoreMultiplier : 1);
      this._boost(shown, cp);
      if (nearMiss) e.reportNearMiss(cp.x, cp.y - L.gu(1.4));
      this.gate = null;
      if (last) return this._finish();
      this._spawnGate(); // 멈춤 없이 다음 게이트(≤0.15초는 즉시)
    } else {
      this.consecWrong += 1;
      if (this.consecWrong >= 2) this.slowTier = true; // 연속 오답 2회 → 간격 한 단계 되돌림
      this._crash(cp);
      this.gate = null; // 지나친 오답 게이트는 즉시 제거(정지 오버레이가 덮음)
      // 오답: 라이프 -1 + 정답 1.2초 표시(core). 정지 종료 후 다음 진행.
      e.answerWrong(this.problem, chosen, {
        loseLife: true,
        onResume: () => {
          if (this.gatesPassed >= TRACK) this._finish();
          else this._spawnGate();
        },
      });
    }
  },

  // 피버 배수 게이트 판정: 배수 차선=정답(연속 BOOST 누적), 아닌 차선=무해(라이프·콤보 불변).
  _judgeMulti(chosen, cp, last) {
    const e = this.engine;
    const fv = e.fever;
    const dan = fv.dan;
    if (fv.isMultiple(chosen)) {
      this.feverChain += 1;
      const boost = this.feverChain >= 4 ? 4 : this.feverChain; // 1/2/3/4(MAX)
      const q = Math.round(chosen / dan);
      const prob = { a: dan, b: q, op: '×', answer: chosen, remainder: null, text: `${dan} × ${q}`, blank: null, level: 1 };
      const pts = (100 + e.scoreManager.combo * 10) * boost; // 연속 보너스 × (core 피버 배수는 자동 곱)
      e.answerCorrect(prob, chosen, pts); // 점수배수·게이지·정답음·콤보문구 자동(무적)
      const shown = Math.round(pts * (fv.active ? fv.scoreMultiplier : 1));
      this._feverBoost(shown, cp, boost);
    } else {
      // 아닌 차선 통과 → 무해(무적). 연속 BOOST만 초기화. 세션엔 기록(복습 미등록).
      this.feverChain = 0;
      const prob = { a: chosen, b: dan, op: '÷', answer: Math.floor(chosen / dan), remainder: chosen % dan, text: `${chosen} ÷ ${dan}`, blank: null, level: 1 };
      e.answerWrong(prob, chosen, { affectLevel: false, freeze: false });
      this.floats.push({ x: cp.x, y: cp.y - L.gu(1.6), text: '아쉽!', color: THEME.subtext, size: L.font(0.032), t: 0, dur: 0.5 });
      this.engine.particles.emit(cp.x, cp.y - L.gu(0.3), 'pop', '#c9d2e0', 8);
    }
    this.gate = null;
    if (last) return this._finish();
    this._spawnGate(); // 즉시 다음 배수 게이트(피버 중이면 _spawnMultiGate)
  },

  // 피버 통과 보상 폭발: 불꽃 3배·게이트 부서짐·점수 여러 개·짧은 화면 확대·연속 BOOST 문구.
  _feverBoost(shownPts, cp, boost) {
    const e = this.engine;
    this.boostT = BOOST_DUR;
    this.carZoom = 0.16;
    this.feverZoomT = 0.08; // 화면 확대 0.08초(1.03배)
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

  // 부스터: 뒤쪽 불꽃 파티클 + 속도선 강화 + 짧은 흔들림 + 햅틱 + 부스터음
  _boost(shownPts, cp) {
    const e = this.engine;
    const gold = e.fever && e.fever.active;
    const flame = gold ? THEME.gold : '#ff9a3d';
    this.boostT = BOOST_DUR;
    this.carZoom = 0.12;
    this.floats.push({ x: cp.x, y: cp.y - L.gu(1.8), text: `+${shownPts}`, color: gold ? THEME.gold : THEME.correct, size: L.font(0.04), t: 0, dur: 0.6 });
    e.particles.emit(cp.x, cp.y + L.gu(0.9), 'explode', flame, 16); // 뒤쪽 불꽃
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

  _finish() {
    const e = this.engine;
    this.finishTime = this.raceElapsed;
    this.finishing = true;
    this.finishTimer = FINISH_HOLD;
    this.gate = null;
    const cp = this._carPos();
    e.particles.emit(cp.x, cp.y - L.gu(1), 'explode', THEME.gold, 36);
    e.particles.emit(L.W / 2, L.y(0.4), 'sparkle', THEME.gold, 24);
    e.ui.flash('rgba(255,220,140,0.4)', 0.1);
    e.ui.showComboText('🏁 완주!', true);
    e.sound.play('fanfare');
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
    drawSky(ctx, this);
    drawGround(ctx, this);
    drawRoad(ctx, this);
    drawStripes(ctx, this);
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
      this.touchStartX = x;
      this.touchMoved = false;
    } else if (phase === 'move') {
      if (this.touchStartX == null) return;
      const dx = x - this.touchStartX;
      const thresh = L.w(0.11); // 이 이상 끌면 한 차선 이동
      if (Math.abs(dx) > thresh) {
        this._steer(Math.sign(dx));
        this.touchStartX = x; // 이어서 더 끌면 또 이동
        this.touchMoved = true;
      }
    } else if (phase === 'end') {
      if (!this.touchMoved && this.touchStartX != null) {
        this._steer(x < L.W / 2 ? -1 : 1); // 탭: 좌/우 절반
      }
      this.touchStartX = null;
      this.touchMoved = false;
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

  onHover() {
    return false; // 운전 조작만 — 포인터 대상 없음
  },
  clearHover() {},

  // ── 렌더 ──────────────────────────────────────────────────
  render(ctx) {
    // 연산 모드 선택 화면
    if (this.mode === 'select') {
      this._drawModeSelect(ctx);
      return;
    }
    const feel = this._speedFeel();
    // 피버 통과 시 짧은 화면 확대(0.08초, 1.03배) — 씬만 확대(HUD는 고정).
    const fz = this.feverZoomT > 0 ? 1 + 0.03 * (this.feverZoomT / 0.08) : 1;
    ctx.save();
    if (fz !== 1) {
      ctx.translate(L.W / 2, L.H / 2);
      ctx.scale(fz, fz);
      ctx.translate(-L.W / 2, -L.H / 2);
    }
    // 배경(하늘·해·먼 언덕·지면) → 좌우 실루엣 → 도로 → 차선선 → 게이트 → 속도선 → 내 차
    drawSky(ctx, this);
    this._drawFeverTint(ctx);
    drawGround(ctx, this);
    for (const o of this.side) drawSideObject(ctx, this, o);
    drawRoad(ctx, this);
    drawStripes(ctx, this);
    this._drawFeverTelegraph(ctx); // 전환 예고 레인 하이라이트(게이트 아래에 깔림)
    if (this.gate && !this.gate.judged) this._drawGate(ctx);
    drawSpeedLines(ctx, this, feel);
    this._drawPlayerCar(ctx);

    // 연기 구름(충돌)
    for (const s of this.smoke) drawSmoke(ctx, s);
    ctx.restore();

    // 상단 UI: 피버 게이지 · 문제 · 진행/유령 라벨
    drawWorldHeader(ctx, this.id);
    if (this.engine.fever) {
      this.engine.fever.renderGauge(ctx, { x: L.safe, y: L.zone.gauge, w: L.W - L.safe * 2, h: L.gu(0.5) });
    }
    this._drawProblem(ctx);
    this._drawHudLabels(ctx);

    this._drawFloats(ctx);
    if (this.finishing) this._drawFinishBanner(ctx);
    this._drawFeverBanner(ctx);
    // 위기 테두리는 ui가 자동으로 그린다.
  },

  _drawProblem(ctx) {
    const cx = L.W / 2;
    // 피버 배수 게이트: 문제 대신 "N단!"
    if (this.gate && this.gate.multi && this.engine.fever && this.engine.fever.dan) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = `${this.engine.fever.dan}단!`;
      ctx.font = font(L.font(0.07));
      const tw = ctx.measureText(label).width;
      const padX = L.gu(1);
      const chipY = L.zone.problem - L.gu(1);
      ctx.fillStyle = 'rgba(16,24,40,0.55)';
      roundRectPath(ctx, cx - tw / 2 - padX, chipY, tw + padX * 2, L.gu(2), L.gu(0.5));
      ctx.fill();
      ctx.fillStyle = THEME.gold;
      ctx.fillText(label, cx, L.zone.problem);
      ctx.fillStyle = this.gate.nextLane != null ? THEME.gold : THEME.text;
      ctx.font = font(L.font(0.024), 'normal');
      // Keep the instruction beside, not on top of, distant gate values.
      const hintX = L.safe + L.gu(2.2);
      drawRewardText(ctx, this.gate.nextLane != null ? '➜ 곧 옆' : '배수 차선으로', hintX, L.zone.problem + L.gu(1.2));
      drawRewardText(ctx, this.gate.nextLane != null ? '차선으로!' : '통과!', hintX, L.zone.problem + L.gu(2.1));
      ctx.restore();
      return;
    }
    const p = this.problem;
    if (!p) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 가독성 배경 칩
    const label = p.blank ? p.text : `${p.text} = ?`;
    ctx.font = font(L.font(0.055));
    const tw = ctx.measureText(label).width;
    const padX = L.gu(0.8);
    const chipY = L.zone.problem - L.gu(0.9);
    ctx.fillStyle = 'rgba(16,24,40,0.55)';
    roundRectPath(ctx, cx - tw / 2 - padX, chipY, tw + padX * 2, L.gu(1.8), L.gu(0.5));
    ctx.fill();
    ctx.fillStyle = THEME.text;
    ctx.fillText(label, cx, L.zone.problem);
    if (p.fromReview) {
      ctx.font = font(L.font(0.026));
      ctx.fillStyle = THEME.gold;
      ctx.fillText('🔁 다시 도전!', cx, L.zone.problem + L.gu(1.5));
    }
    ctx.restore();
  },

  _drawHudLabels(ctx) {
    ctx.save();
    ctx.textBaseline = 'middle';
    // 진행 라벨(좌하단 근처, 도로 밖)
    ctx.fillStyle = THEME.subtext;
    ctx.font = font(L.font(0.03), 'normal');
    ctx.textAlign = 'left';
    drawRewardText(ctx, `🏁 ${this.gatesPassed} / ${TRACK}`, L.safe, this._carLineY() + L.gu(2.6));
    ctx.restore();
  },

  // 피버 전환 예고: 다음 정답 차선을 도로 위 빛나는 레인 스트립 + 이동 방향 화살표로 미리 알린다.
  //   ⚠️ 빠른 속도에서 놓치지 않도록: (1) 도로 전체에 깔리는 펄스 하이라이트, (2) 차 옆 큰 방향 화살표.
  _drawFeverTelegraph(ctx) {
    const g = this.gate;
    if (!g || !g.multi || g.nextLane == null) return;
    const nl = g.nextLane;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 9); // 0~1 펄스
    // (1) 다음 차선 위에 사다리꼴 하이라이트(소실선 → 판정선)
    const p0 = 0.06;
    const a = this._proj(p0);
    const b = this._proj(1);
    const xaC = this._laneX(nl, p0);
    const xbC = this._laneX(nl, 1);
    const wa = a.laneSpacing * 0.42;
    const wb = b.laneSpacing * 0.42;
    ctx.save();
    ctx.globalAlpha = 0.22 + 0.28 * pulse;
    const grad = ctx.createLinearGradient(0, a.y, 0, b.y);
    grad.addColorStop(0, 'rgba(255,213,74,0.15)');
    grad.addColorStop(1, 'rgba(255,213,74,0.9)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(xaC - wa, a.y);
    ctx.lineTo(xaC + wa, a.y);
    ctx.lineTo(xbC + wb, b.y);
    ctx.lineTo(xbC - wb, b.y);
    ctx.closePath();
    ctx.fill();
    // (2) 이동 방향 화살표(차 높이, 크게). fromLane→nextLane 부호로 좌/우.
    const dir = Math.sign(nl - g.fromLane) || 1;
    const ay = this._carLineY() - L.gu(1.2);
    const ax = this._laneX(g.fromLane, 1) + dir * L.gu(2.2);
    const s = L.gu(1.1);
    ctx.globalAlpha = 0.7 + 0.3 * pulse;
    ctx.fillStyle = THEME.gold;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = L.gu(0.12);
    for (let k = 0; k < 2; k++) {
      const ox = ax + dir * k * s * 0.8;
      ctx.beginPath();
      ctx.moveTo(ox, ay - s);
      ctx.lineTo(ox + dir * s, ay);
      ctx.lineTo(ox, ay + s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  },

  // 게이트: 3차선 숫자 패널 + 연결 바(원근 스케일). 잠금 시 판정 차선 강조.
  _drawGate(ctx) {
    const g = this.gate;
    const pr = this._proj(g.p);
    const cellW = pr.laneSpacing * 0.72;
    const cellH = L.gu(1.4) * pr.scale + L.gu(0.5);
    // 연결 바(문틀 느낌)
    ctx.save();
    ctx.fillStyle = 'rgba(74,158,255,0.28)';
    const barY = pr.y - cellH / 2 - L.gu(0.25) * pr.scale;
    ctx.fillRect(this._laneX(0, g.p) - cellW / 2, barY, this._laneX(2, g.p) - this._laneX(0, g.p) + cellW, L.gu(0.28) * pr.scale + 2);
    ctx.restore();
    for (let i = 0; i < LANES; i++) {
      const gx = this._laneX(i, g.p);
      const highlight = g.locked && i === g.judgeLane;
      drawGatePanel(ctx, gx, pr.y, cellW / 2, cellH, String(g.values[i]), highlight);
    }
  },

  _drawPlayerCar(ctx) {
    const cp = this._carPos();
    const z = 1 + (this.carZoom > 0 ? 0.18 * (this.carZoom / 0.12) : 0);
    const carW = L.w(0.15) * z;
    const carH = L.gu(3) * z;
    const fev = this.engine.fever;
    const gold = fev && fev.active;
    // 피버: 차체가 앞으로 살짝 기울고(위로 눌린 느낌) 미세 진동 — 속도감 강조.
    let carY = cp.y;
    let tilt = this.carTilt;
    if (gold) {
      carY += Math.sin(this.time * 42) * L.gu(0.09); // 미세 진동
      tilt += Math.sin(this.time * 33) * 0.02; // 미세 흔들
    }
    // 부스터 불꽃(차 뒤). 피버 중엔 더 길게.
    if (this.boostT > 0) drawFlame(ctx, cp.x, carY + carH * 0.5, carW * (gold ? 0.62 : 0.5), L.gu(gold ? 2.2 : 1.6) * (this.boostT / BOOST_DUR), gold ? THEME.gold : '#ff9a3d');
    drawCar(ctx, cp.x, carY, carW, carH, tilt, THEME.wrong, 1);
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
    ctx.font = font(L.font(0.09));
    ctx.lineWidth = L.gu(0.25);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    const title = '🏁 완주!';
    ctx.strokeText(title, L.W / 2, L.y(0.44));
    ctx.fillText(title, L.W / 2, L.y(0.44));
    ctx.fillStyle = THEME.text;
    ctx.font = font(L.font(0.04), 'normal');
    ctx.fillText(`${this.finishTime.toFixed(1)}초`, L.W / 2, L.y(0.44) + L.gu(2.4));
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
    ctx.font = font(L.font(0.07));
    ctx.lineWidth = L.gu(0.25);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(`FEVER +${b.points}`, L.W / 2, L.H * 0.5);
    ctx.fillStyle = THEME.gold;
    ctx.fillText(`FEVER +${b.points}`, L.W / 2, L.H * 0.5);
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
    this.side = [];
    this.feverBanner = null;
  },
};

// ══════════════════════════════════════════════════════════
// 씬 그리기(모듈 로컬 — core 미수정). ⚠️ 나중에 스프라이트 이미지로 교체할 때 이 함수들만 바꾸면 된다.
//   각 함수는 원시 좌표/크기만 받아 그린다(게임 상태에서 L 헬퍼로 계산해 전달).
// ══════════════════════════════════════════════════════════

// 하늘: 아웃런 계열 노을 그라디언트(고정 배경 — 어둡게/반전 아님, §2.5)
function drawSky(ctx, game) {
  const horizonY = game._horizonY();
  const g = ctx.createLinearGradient(0, 0, 0, horizonY);
  g.addColorStop(0, '#95cfe5');
  g.addColorStop(0.55, '#bedee4');
  g.addColorStop(1, '#ffedc6');
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.W, horizonY + 2);
  // 해(노을)
  ctx.fillStyle = 'rgba(255,220,140,0.9)';
  ctx.beginPath();
  ctx.arc(L.W / 2, horizonY - L.gu(1.2), L.gu(2.2), 0, Math.PI * 2);
  ctx.fill();
  // 먼 언덕 실루엣
  ctx.fillStyle = '#94c6a5';
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  ctx.quadraticCurveTo(L.W * 0.2, horizonY - L.gu(1.4), L.W * 0.4, horizonY);
  ctx.quadraticCurveTo(L.W * 0.65, horizonY - L.gu(1.8), L.W * 0.85, horizonY);
  ctx.quadraticCurveTo(L.W * 0.95, horizonY - L.gu(0.9), L.W, horizonY);
  ctx.lineTo(L.W, horizonY + 2);
  ctx.lineTo(0, horizonY + 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// 지면(도로 양옆 잔디)
function drawGround(ctx, game) {
  const horizonY = game._horizonY();
  const g = ctx.createLinearGradient(0, horizonY, 0, L.H);
  g.addColorStop(0, '#bedb9f');
  g.addColorStop(1, '#83bba2');
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, horizonY, L.W, L.H - horizonY);
  ctx.restore();
}

// 좌우 실루엣(나무/건물/구름). z: 0(멀리) → 1(가까이). 원근으로 커지며 바깥으로 흘러 지나간다.
function drawSideObject(ctx, game, o) {
  if (o.z <= 0.01) return;
  const pr = game._proj(o.z);
  const edge = pr.cx + o.side * (pr.half + L.w(0.02) * pr.scale); // 도로 바깥 가장자리
  const x = edge + o.side * L.w(0.06) * pr.scale;
  const y = pr.y;
  const s = pr.scale;
  ctx.save();
  ctx.globalAlpha = Math.min(1, 0.35 + o.z);
  if (o.kind === 'tree') {
    ctx.fillStyle = '#bd956b';
    ctx.fillRect(x - L.gu(0.15) * s, y - L.gu(1.2) * s, L.gu(0.3) * s, L.gu(1.4) * s);
    ctx.fillStyle = '#61a991';
    for (const dx of [-0.45, 0, 0.45]) {
      ctx.beginPath();
      ctx.ellipse(x + L.gu(dx) * s, y - L.gu(dx === 0 ? 2 : 1.5) * s, L.gu(.7) * s, L.gu(.85) * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (o.kind === 'building') {
    const bw = L.gu(1.6) * s;
    const bh = L.gu(3.4) * s * (0.7 + o.seed * 0.6);
    ctx.fillStyle = '#e5b994';
    ctx.fillRect(x - bw / 2, y - bh, bw, bh);
    ctx.fillStyle = 'rgba(255,220,140,0.5)'; // 창문
    const ws = L.gu(0.3) * s;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) ctx.fillRect(x - bw / 2 + ws + c * ws * 2.2, y - bh + ws + r * ws * 2.2, ws, ws);
  } else {
    // 구름(멀리 천천히)
    ctx.fillStyle = 'rgba(255,240,220,0.55)';
    for (const [dx, dy, rr] of [[0, 0, 1], [-0.7, 0.15, 0.7], [0.7, 0.15, 0.7]]) {
      ctx.beginPath();
      ctx.arc(x + dx * L.gu(1) * s, y + dy * L.gu(1) * s, L.gu(0.8) * s * rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// 도로: 사다리꼴(아래 넓고 위로 좁음) + 갓길 + 하단 아스팔트 앞치마
function drawRoad(ctx, game) {
  const top = game._proj(0);
  const bot = game._proj(1);
  const cx = L.W / 2;
  ctx.save();
  // 갓길(밝은 테두리)
  ctx.fillStyle = '#c8ccd6';
  ctx.beginPath();
  ctx.moveTo(cx - top.half - L.gu(0.4) * top.scale, top.y);
  ctx.lineTo(cx + top.half + L.gu(0.4) * top.scale, top.y);
  ctx.lineTo(cx + bot.half + L.gu(0.6), L.H);
  ctx.lineTo(cx - bot.half - L.gu(0.6), L.H);
  ctx.closePath();
  ctx.fill();
  // 아스팔트(하단까지 앞치마로 연장 — 몰입감)
  ctx.fillStyle = '#33373f';
  ctx.beginPath();
  ctx.moveTo(cx - top.half, top.y);
  ctx.lineTo(cx + top.half, top.y);
  ctx.lineTo(cx + bot.half, L.H);
  ctx.lineTo(cx - bot.half, L.H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// 차선 구분선: 위→아래로 흘러내린다(스크롤 위상). 원근으로 가까울수록 크고 빠르게 보인다.
function drawStripes(ctx, game) {
  const N = 9;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < N; i++) {
    let p = (i / N + game.scrollPhase) % 1;
    if (p <= 0.02) continue;
    const pEnd = Math.min(1, p + 0.5 / N);
    for (const s of [-0.5, 0.5]) {
      // 두 차선 경계(±0.5 차선칸)
      const a = game._proj(p);
      const b = game._proj(pEnd);
      const xa = a.cx + s * a.laneSpacing;
      const xb = b.cx + s * b.laneSpacing;
      const wa = L.gu(0.12) * a.scale;
      const wb = L.gu(0.12) * b.scale;
      ctx.beginPath();
      ctx.moveTo(xa - wa, a.y);
      ctx.lineTo(xa + wa, a.y);
      ctx.lineTo(xb + wb, b.y);
      ctx.lineTo(xb - wb, b.y);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

// 게이트 숫자 패널(1칸). highlight=판정 확정된 현재 차선.
function drawGatePanel(ctx, cx, cy, halfW, h, label, highlight) {
  ctx.save();
  roundRectPath(ctx, cx - halfW, cy - h / 2, halfW * 2, h, Math.min(halfW, h) * 0.28);
  ctx.fillStyle = highlight ? 'rgba(255,213,74,0.92)' : 'rgba(29,39,64,0.92)';
  ctx.fill();
  ctx.lineWidth = Math.max(2, h * 0.06);
  ctx.strokeStyle = highlight ? '#fff' : 'rgba(255,255,255,0.4)';
  ctx.stroke();
  ctx.fillStyle = highlight ? '#1d2740' : '#fff';
  ctx.font = font(h * 0.6);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy + h * 0.02);
  ctx.restore();
}

// 자동차(후면 뷰, 단순 도형). tilt=차체 기울기(rad). 스프라이트 교체 지점.
function drawCar(ctx, x, y, w, h, tilt, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(tilt);
  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, h * 0.5, w * 0.55, h * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  // 바퀴
  ctx.fillStyle = '#15181f';
  ctx.fillRect(-w * 0.55, -h * 0.28, w * 0.16, h * 0.5);
  ctx.fillRect(w * 0.39, -h * 0.28, w * 0.16, h * 0.5);
  // 차체
  roundRectPath(ctx, -w * 0.42, -h * 0.5, w * 0.84, h, w * 0.18);
  const paint = ctx.createLinearGradient(-w * 0.42, 0, w * 0.42, 0);
  paint.addColorStop(0, color);
  paint.addColorStop(0.3, '#ffe8c7');
  paint.addColorStop(0.55, color);
  paint.addColorStop(1, color);
  ctx.fillStyle = paint;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = Math.max(2, w * 0.03);
  ctx.stroke();
  // 뒷유리
  roundRectPath(ctx, -w * 0.3, -h * 0.34, w * 0.6, h * 0.26, w * 0.08);
  ctx.fillStyle = 'rgba(180,220,255,0.85)';
  ctx.fill();
  // 유리 반사와 중앙 레이싱 스트라이프 — 차체 범위 안의 장난감 도장.
  ctx.fillStyle = '#eafff1';
  ctx.beginPath();
  ctx.moveTo(-w * 0.23, -h * 0.3);
  ctx.lineTo(w * 0.06, -h * 0.3);
  ctx.lineTo(-w * 0.23, -h * 0.13);
  ctx.closePath();
  ctx.fill();
  roundRectPath(ctx, -w * 0.075, h * 0.01, w * 0.15, h * 0.38, w * 0.03);
  ctx.fillStyle = '#fff2d5';
  ctx.fill();
  roundRectPath(ctx, -w * 0.45, h * 0.35, w * 0.9, h * 0.09, w * 0.04);
  ctx.fillStyle = '#273950';
  ctx.fill();
  // 후미등(색만이 아니라 위치·모양으로도 구분)
  ctx.fillStyle = '#ffd54a';
  ctx.fillRect(-w * 0.38, h * 0.22, w * 0.14, h * 0.12);
  ctx.fillRect(w * 0.24, h * 0.22, w * 0.14, h * 0.12);
  ctx.restore();
}

// 부스터 불꽃(차 뒤). 단순 삼각 불꽃 2겹.
function drawFlame(ctx, x, y, w, hLen, color) {
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x, y + hLen);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.moveTo(x - w * 0.5, y);
  ctx.lineTo(x + w * 0.5, y);
  ctx.lineTo(x, y + hLen * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// 속도선(화면 가장자리). 부스터·피버 강도에 따라 진해진다.
function drawSpeedLines(ctx, game, feel) {
  const feverActive = game.engine.fever && game.engine.fever.active;
  const boost = game.boostT > 0 ? game.boostT / BOOST_DUR : 0;
  const fev = feverActive ? 0.85 : 0; // 피버 중 강하게(굵고 길게)
  const inten = Math.max(boost, fev, Math.min(0.35, (feel - 1) * 0.5));
  if (inten <= 0.02) return;
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${(0.5 * inten).toFixed(3)})`;
  ctx.lineWidth = L.gu(0.12) * (feverActive ? 1.9 : 1); // 피버 중 굵게
  const n = feverActive ? 7 : 5;
  for (let i = 0; i < n; i++) {
    const f = (i / n + game.scrollPhase * 2) % 1;
    const y = f * L.H;
    const len = L.gu(1.5 + inten * 3) * (feverActive ? 1.6 : 1); // 피버 중 길게
    for (const s of [-1, 1]) {
      const x = s < 0 ? L.gu(0.6) : L.W - L.gu(0.6);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + len);
      ctx.stroke();
    }
  }
  ctx.restore();
}

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
