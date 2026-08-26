// registry.js — 게임 목록 등록 (SPEC 1.3, Phase0 §11)
// ⚠️ 새 게임을 추가할 때 수정하는 파일은 여기 한 곳뿐이어야 한다.
//    Phase 1부터: src/games/gNN_*.js 를 만들고 아래 IMPLEMENTED 배열에 한 줄 추가.

import { dummyGame } from './_dummy.js';
import { g01Combo } from './g01_combo.js';
import { g02Catch } from './g02_catch.js';
import { g09Balloon } from './g09_balloon.js';
import { g06Stack } from './g06_stack.js';

// 실제로 구현되어 플레이 가능한 게임들 (Phase 0: 더미 1개 / Phase 1: +2종 / Phase 2: +2종)
export const IMPLEMENTED = [
  dummyGame,
  g01Combo, // Phase 1
  g02Catch, // Phase 1
  g09Balloon, // Phase 2
  g06Stack, // Phase 2
];

// 메뉴 표시용 10종 카탈로그 (SPEC §4). 구현 전 게임은 "준비 중"으로 뜬다.
// id가 IMPLEMENTED에 있으면 활성, 없으면 비활성.
export const CATALOG = [
  { id: 'g01_combo', name: '콤보 챌린지', emoji: '⚡' },
  { id: 'g02_catch', name: '떨어지는 캐치', emoji: '🎪' },
  { id: 'g03_racing', name: '레이싱 계산', emoji: '🚀' },
  { id: 'g04_timing', name: '타이밍 퍼즐', emoji: '🎯' },
  { id: 'g05_match', name: '숫자 매칭', emoji: '🧩' },
  { id: 'g06_stack', name: '스택 빌더', emoji: '🏗️' },
  { id: 'g07_shoot', name: '슈팅 계산', emoji: '💣' },
  { id: 'g08_chain', name: '배수 체인', emoji: '🔗' },
  { id: 'g09_balloon', name: '벌룬 팝', emoji: '🎈' },
  { id: 'g10_remain', name: '나머지 보물찾기', emoji: '💎' },
];

// Phase 0 검증용 더미 게임(카탈로그 맨 앞에 활성 상태로 노출)
export const DUMMY_ENTRY = { id: dummyGame.id, name: dummyGame.name, emoji: dummyGame.emoji };

export function getGameById(id) {
  return IMPLEMENTED.find((g) => g.id === id) || null;
}
