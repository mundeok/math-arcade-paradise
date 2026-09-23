// registry.js — 게임 목록 등록 (SPEC 1.3, Phase0 §11)
// ⚠️ 새 게임을 추가할 때 수정하는 파일은 여기 한 곳뿐이어야 한다.
//    Phase 1부터: src/games/gNN_*.js 를 만들고 아래 IMPLEMENTED 배열에 한 줄 추가.

import { dummyGame } from './_dummy.js';
import { g01Combo } from './g01_combo.js';
import { g01Delivery } from './g01_delivery.js';
import { g02Catch } from './g02_catch.js';
import { g09Balloon } from './g09_balloon.js';
import { g06Stack } from './g06_stack.js';
import { g04Timing } from './g04_timing.js';
import { g08Chain } from './g08_chain.js';
import { g05Match } from './g05_match.js';
import { g07Shoot } from './g07_shoot.js';
import { g03Race } from './g03_race.js';
import { g10Treasure } from './g10_treasure.js';
import { g11Farm } from './g11_farm.js';

// 실제로 구현되어 플레이 가능한 게임들 (Phase 0: 더미 1개 / Phase 1: +2종 / Phase 2: +2종 / Phase 3: +2종 / Phase 4: +2종 / Phase 5: +2종)
export const IMPLEMENTED = [
  dummyGame,
  g01Combo, // 기존 버전: 배송 시작 화면의 비교 버튼으로 접근, 기록 보존
  g01Delivery, // 대표작 실험: 메뉴에서는 기존 콤보 자리를 사용
  g02Catch, // Phase 1
  g09Balloon, // Phase 2
  g06Stack, // Phase 2
  g04Timing, // Phase 3
  g08Chain, // Phase 3
  g05Match, // Phase 4
  g07Shoot, // Phase 4
  g03Race, // Phase 5
  g10Treasure, // Phase 5
  g11Farm, // 구성형 체험: 배열을 직접 그려 수확
];

// 메뉴 표시용 기본 10종 + 배열 구성 체험 1종 (추가 명세: GAMEPLAY_REVIEW.md).
// id가 IMPLEMENTED에 있으면 활성, 없으면 비활성.
export const CATALOG = [
  { id: 'g01_delivery', name: '두 갈래 배송', emoji: '📦', description: '계산 카드가 가야 할 정답 창고를 골라 보내요.', control: '왼쪽 또는 오른쪽 선택' },
  { id: 'g02_catch', name: '떨어지는 캐치', emoji: '🎪', description: '떨어지는 숫자 가운데 정답만 빠르게 잡아요.', control: '정답 숫자 탭' },
  { id: 'g03_racing', name: '레이싱 계산', emoji: '🚀', description: '정답 차선으로 달려 숫자 게이트를 통과해요.', control: '좌우 탭 또는 드래그' },
  { id: 'g04_timing', name: '타이밍 퍼즐', emoji: '🎯', description: '계산하고 정답 북을 박자에 맞춰 연주해요.', control: '정답 북 탭' },
  { id: 'g05_match', name: '동물 간식 배달', emoji: '🍪', description: '간식을 골라 정답 숫자를 든 동물에게 배달해요.', control: '간식 탭 → 동물 탭' },
  { id: 'g06_stack', name: '디저트 타워', emoji: '🥞', description: '정답 디저트를 받아 맛있는 타워를 완성해요.', control: '카트 좌우 이동' },
  { id: 'g07_shoot', name: '슈팅 계산', emoji: '💣', description: '정답 숫자 로봇을 조준해 빠르게 발사해요.', control: '이동 후 발사 탭' },
  { id: 'g08_chain', name: '배수 젤리 팡', emoji: '🔗', description: '같은 단의 배수 젤리를 이어서 터뜨려요.', control: '이웃한 젤리 드래그' },
  { id: 'g09_balloon', name: '벌룬 팝', emoji: '🎈', description: '값이 같은 풍선을 모두 찾아 터뜨려요.', control: '같은 값 풍선 탭' },
  { id: 'g10_remain', name: '나머지 보물찾기', emoji: '💎', description: '보석을 똑같이 나눠 남는 수를 찾아요.', control: '수량 조절 후 발사' },
  { id: 'g11_farm', name: '곱셈 농장', emoji: '🌱', description: '밭에 직사각형 배열을 그려 곱셈을 만들어요.', control: '드래그 후 수확' },
];

// Phase 0 검증용 더미 게임(카탈로그 맨 앞에 활성 상태로 노출)
export const DUMMY_ENTRY = { id: dummyGame.id, name: dummyGame.name, emoji: dummyGame.emoji };

export function getGameById(id) {
  return IMPLEMENTED.find((g) => g.id === id) || null;
}
