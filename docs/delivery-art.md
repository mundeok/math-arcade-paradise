# 두 갈래 배송 토이 아트

승인한 마을·창고·트럭 시안을 내장 ImageGen으로 분리 생성했다. 모바일 조작을 위해 목적지는 하단 좌우에 배치한다. 목적지 숫자, 계산 카드, 시간/점수는 Canvas로 그린다. 정답 배송에는 뒤쪽 트럭, 8개 완료 출발에는 옆모습 트럭을 사용한다. 이미지 실패 시 기존 Canvas 아트로 폴백한다.

## 저장 파일

- `src/art/assets/delivery/background-v1.webp`
- `src/art/assets/delivery/mint-v1.webp`
- `src/art/assets/delivery/peach-v1.webp`
- `src/art/assets/delivery/truck-v1.webp`
- `src/art/assets/delivery/depart-v1.webp`

합계 128,636 bytes (약 129KB). 재처리 스크립트: `scripts/prepare-delivery-art.py`.

## 생성 프롬프트

Use case stylized-concept. Image 1 is approved STYLE reference. Production portrait 5:8 background only for math delivery game. Same soft rounded 3D toy pastel village, gentle daytime, muted low contrast. Empty broad cream road down central 75 percent, small rounded trees houses fences at outer margins only, pale blue lavender sky at upper quarter. Remove both foreground delivery depots and remove truck and parcels. No text numbers symbols UI characters or vehicles. Center must be calm and clear for large math cards and separate depot sprites. Same friendly visual materials and palette as reference.

Use case stylized-concept. Image 1 is STYLE and OBJECT reference. Production sprite sheet with genuine transparent alpha background. Exactly FOUR isolated objects in strict equal 2 by 2 cells with wide clean transparent gutters. TOP LEFT mint delivery depot matching reference, front symmetric, no flag, large BLANK cream horizontal sign at 38 percent of building height and dark wide arched open entrance below; TOP RIGHT identical depot in peach coral. BOTTOM LEFT small yellow and teal delivery truck matching reference seen from behind slightly above carrying two parcels. BOTTOM RIGHT same truck seen side-on facing right carrying parcels. Whole objects visible within separate cells, no contact between cells, no floor no scene no shadows outside objects, no text numbers logos watermarks. Soft polished rounded 3D storybook toy, gentle lighting, depots equally prominent, blank sign large for runtime answer number.

참조: 승인 시안 `exec-b1b354fe-6912-4d3d-8d44-e2e621530a3f.png`.

## 확인

단위 검사 `tests/delivery.test.mjs` 11개 통과. `tests/delivery-browser-check.mjs`에서 마우스/키보드, 8개 출발, 피버 복귀, 시간초과, 결과, 렌더 상태 보존 확인. `tests/delivery-art-live.mjs`는 별도 프로필/외부 요청 차단 환경에서 이미지 정상 및 실패 폴백, 실제 RAF와 연속 입력, 소리 ON/OFF, 일시정지/재개, 재시작, 11개 게임 시작/피버 전환을 검사한다. 화면 기록은 `test-output/delivery-toy/`. 실제 모바일 기기 성능은 미검증.
