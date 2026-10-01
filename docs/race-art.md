# 레이싱 계산 토이풍 아트

승인한 시안의 파스텔 레이싱 트랙을 적용했다. 기존 1인칭 게이트, 연료, 부스터, 조향 판정은 유지하고 새 풍경을 기존 `landscape` 이미지 슬롯에 연결해 로더와 실패 폴백 계약을 보존했다. 시안의 세 차량은 투명 스프라이트로 준비했으며, 1인칭 화면에서는 차량 번호가 게이트 숫자와 겹치지 않도록 런타임 게이트에 숫자를 계속 그린다.

## 파일

- `src/art/assets/race/toy-landscape-v1.png` (359,541 bytes)
- `src/art/assets/race/teal-car-v1.webp`
- `src/art/assets/race/pink-car-v1.webp`
- `src/art/assets/race/yellow-car-v1.webp`
- 재처리: `scripts/prepare-race-toy.py`

## 생성 프롬프트

시안: Use case stylized-concept. Asset type: single portrait 5:8 gameplay concept illustration for a children's math racing game. Soft rounded polished 3D toy storybook style matching the pastel delivery village, falling gifts, toy robots and plush bear assets. A cheerful toy race track viewed from behind three-quarter angle: three small rounded toy race cars on three clearly separated lanes, teal, coral pink, and sunny yellow, moving upward toward the horizon. Each car has a large completely blank cream rectangular number plate on its rear reserved for runtime lane values, with no printed text or numbers. A friendly pastel landscape with rolling hills, small clouds, flags and simple trees at the outer edges, wide uncluttered center for a runtime equation and HUD. A small checkered finish arch in the far background, gentle daylight, tactile plastic and painted wood materials, colorful but low contrast behind the cars so numbers stay readable. Clear mobile-friendly lane separation, no collisions, no danger, no realistic racing violence. No words, no numbers, no letters, no logos, no watermark, no UI buttons. One coherent gameplay scene, not an asset sheet.

배경·차량은 시안 이미지를 스타일/구도 참고로 사용해 별도 생성했다. 숫자·게이트·HUD는 코드 렌더링이다.

## 검증

`tests/race-fuel.test.mjs` 10개 통과. 실제 브라우저 검사에서 32개 게이트, 실제 터치 조향, 부스터, 니어미스, 오답, 일시정지/재개, 자연스러운 피버 전환, 소리 ON, RAF 진행을 통과했다. 같은 검사 후반의 기존 g11 자원 HUD를 하트 HUD로 간주하는 회귀 단언에서 중단되어 11개 게임 전체 회귀 결과는 미완료로 기록한다. 새 이미지 로더는 기존 5개 슬롯과 PNG 실패 폴백을 유지한다.
