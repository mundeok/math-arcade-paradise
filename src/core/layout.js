// layout.js — 반응형 좌표/크기/폰트 헬퍼 (SPEC §1.2 반응형 대응 원칙)
//
// 목적: 모든 게임이 절대 픽셀 대신 "논리 캔버스 크기(W,H)에 대한 비율"로 배치하도록 한다.
//   Phase 6에서 논리 캔버스 크기가 화면 비율에 따라 달라져도(A/B/C 프로필),
//   이 파일 내부만 바뀌면 모든 게임이 자동으로 따라온다.
//
// 사용 예:
//   import { L } from '../core/layout.js';
//   const btnX = L.x(0.05);      // 왼쪽에서 5%
//   const gaugeY = L.y(0.117);   // 위에서 11.7%
//   ctx.font = font(L.font(0.09)); // 화면 높이의 9%
//
// ⚠️ 기존 g01_combo.js / g02_catch.js 는 이 헬퍼 도입 이전에 작성되어 절대 좌표를 쓴다.
//    Phase 6에서 L 헬퍼로 치환한다 (TODO.md 참조).

import { LOGICAL_W, LOGICAL_H } from './ui.js';

// ── 기준값(비율) ───────────────────────────────────────────
// 아래 비율들은 "정의 당시의 기준 해상도(800×1280)"에서 나온 값이다.
// 논리 캔버스 크기가 바뀌어도 비율로 계산되므로 배치가 함께 스케일된다.
const REF_W = 800; // 안전여백/최소터치 비율을 정의한 기준 폭
const SAFE_PX = 24; // ui.js의 SAFE 상수와 값 일치 (Phase 6에서 L.safe로 통합 예정)
const MIN_TOUCH_PX = 96; // SPEC §1.2 터치 타겟 최소(논리 96px). 지원 폰 폭(~375css)에서 ≈45 CSS px ≥ 44

const SAFE_RATIO = SAFE_PX / REF_W; // 0.03
const MIN_TOUCH_RATIO = MIN_TOUCH_PX / REF_W; // 0.12

const REF_H = 1280; // zone 비율을 정의한 기준 높이

// ── 그리드 단위 ────────────────────────────────────────────
// 세밀한 간격 조정용 기준 단위. H를 32로 나눈 값(기준 해상도에서 40px).
//   근거: 1280 / 32 = 40. HUD 바 높이(96)·안전여백(24)과 잘 맞물리고,
//   40의 배수로 대부분의 간격을 표현할 수 있어 "간격이 제각각"인 것을 막는다.
const GRID_DIV = 32;

// ── 명명된 세로 영역(zone) 비율 ────────────────────────────
// 세로 방향 주요 위치를 "무엇을 위한 곳인지" 이름으로 제공한다.
// 값은 현재 g01·g02의 실제 배치와 맞아떨어지게 정했다(주석의 px는 기준 해상도 1280 기준).
const ZONE = {
  hudBottom: 120 / REF_H, //  120: HUD 바(96) + 안전여백(24) 하단 = 게임 영역 시작
  gauge: 150 / REF_H, //  150: 상단 게이지 위치 (g01 제한시간 바)  ← GAUGE_Y=150
  problem: 220 / REF_H, //  220: 상단 고정 문제 텍스트 기준선 (g02류). g01은 게이지 아래에 크게 배치
  playTop: 244 / REF_H, //  244: 플레이 영역 상단 (문제 아래, 낙하/배치 시작선)
  playBottom: 896 / REF_H, //  896: 플레이 영역 하단 (하단 조작 영역 위)
  controls: 896 / REF_H, //  896: 하단 조작/선택지 영역 상단 (g01 2×2 버튼 첫 행)
  floor: 1190 / REF_H, // 1190: 바닥선 — 낙하물이 사라지는 지점 (H - 90)  ← FLOOR_Y
};

export const L = {
  // 현재 논리 캔버스 크기 (Phase 6에서 가변화되면 여기 값만 바뀌면 됨)
  get W() {
    return LOGICAL_W;
  },
  get H() {
    return LOGICAL_H;
  },

  // 비율 → 논리 좌표/크기
  x: (ratio) => LOGICAL_W * ratio, // 가로 위치
  y: (ratio) => LOGICAL_H * ratio, // 세로 위치
  w: (ratio) => LOGICAL_W * ratio, // 너비 (x와 계산은 같지만 의미 구분)
  h: (ratio) => LOGICAL_H * ratio, // 높이

  // 폰트 크기 = 화면 높이의 ratio (SPEC §1.2 원칙 3: 문제 텍스트 ≥ H의 6% → L.font(0.06))
  font: (ratio) => LOGICAL_H * ratio,

  // 안전 여백 (현재 24 논리px = ui.js SAFE와 일치). 폭 비율 기반이라 캔버스가 커지면 함께 늘어난다.
  get safe() {
    return LOGICAL_W * SAFE_RATIO;
  },

  // 터치 타겟 최소 크기 (논리값). 실제 화면에서 최소 44 CSS px가 되도록 하는 값.
  //   지원 최소 폰 폭 ~375 CSS px 기준 scale≈0.47 → 96 * 0.47 ≈ 45 CSS px ≥ 44.
  get minTouch() {
    return LOGICAL_W * MIN_TOUCH_RATIO;
  },

  // 그리드 단위: 세밀한 간격을 기준 단위(H/32 ≈ 40)의 배수로. 예: L.gu(2) = 두 칸 간격.
  gu: (n) => (LOGICAL_H / GRID_DIV) * n,

  // 명명된 세로 영역. 의미가 드러나는 배치용. 예: const floorY = L.zone.floor;
  zone: {
    get hudBottom() {
      return LOGICAL_H * ZONE.hudBottom;
    }, // HUD 하단 경계 (게임 영역 시작)
    get gauge() {
      return LOGICAL_H * ZONE.gauge;
    }, // 상단 게이지 위치
    get problem() {
      return LOGICAL_H * ZONE.problem;
    }, // 문제 텍스트 기준선
    get playTop() {
      return LOGICAL_H * ZONE.playTop;
    }, // 플레이 영역 상단
    get playBottom() {
      return LOGICAL_H * ZONE.playBottom;
    }, // 플레이 영역 하단
    get floor() {
      return LOGICAL_H * ZONE.floor;
    }, // 바닥선 (낙하물이 사라지는 지점)
    get controls() {
      return LOGICAL_H * ZONE.controls;
    }, // 하단 조작/선택지 영역 상단
  },
};
