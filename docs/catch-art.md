# 떨어지는 캐치 토이 아트

승인한 곰·선물 시안을 내장 ImageGen으로 배경과 투명 스프라이트로 분리 생성했다. 기존 정답 탭 방식과 낙하/판정 규칙을 유지한다. 정답 선물은 곰의 바구니로 이동하며 작아진다. 숫자는 이미지 밖에서 Canvas로 표시하며 색상은 정오답과 무관한 위치 기준이다.

## 파일

- `src/art/assets/catch/mint-v1.webp`
- `src/art/assets/catch/peach-v1.webp`
- `src/art/assets/catch/yellow-v1.webp`
- `src/art/assets/catch/bear-v1.webp`
- `src/art/assets/world/catch-bg-v1.webp`

전체 109,366 bytes. `scripts/prepare-catch-art.py`로 원본 PNG에서 알파를 보존해 자르고 축소/압축한다. 이미지 로딩 실패 시 기존 젤리와 월드 아트 사용.

## 생성 프롬프트

Use case stylized-concept. Image 1 approved STYLE reference. Background only for portrait 5:8 children's falling math gift game. Same cute soft 3D storybook pastel park, blue lavender sky, cream clouds only at far side margins, distant small park trees pastel cottages and flowers only at very bottom 15 percent and outer edges. Central 80 percent empty quiet pale blue lavender sky for falling numbered gifts. Very low contrast muted backdrop gentle daylight. Remove bear basket and ALL gift boxes. No characters objects in center text numbers UI logos or watermark.

Use case stylized-concept. Image1 is approved STYLE and character reference. Production genuine transparent alpha sprite sheet, exactly FOUR fully isolated objects in strict equal 2x2 cells, generous transparent gutters. TOP LEFT ONE mint gift box; TOP RIGHT ONE peach gift box; BOTTOM LEFT ONE pale yellow gift box. All three boxes identical proportions front-facing straight level upright NOT tilted, minimal visible side, small bow above, LARGE completely blank flat cream label on front occupying most box face, unobstructed by ribbons. BOTTOM RIGHT ONE full body adorable honey brown plush teddy bear holding wide empty open woven basket, matching reference. Soft rounded 3D storybook toy materials gentle lighting. Every object fits within own cell, no overlap, no scene floor shadows outside objects text numbers logo watermark. True transparent background.

참조 시안: `exec-90ae9173-b5a3-4222-97bc-6ca08064ed57.png`.

## 검증

`tests/catch-art-browser.mjs`: 별도 브라우저 세션, 외부 요청 차단. 실제 25초 클릭과 RAF 진행에서 정답 124회, 이미지 차단 폴백 7초 정답 7회. 오답/회복, 놓침과 라이프 유지, 피버 진입/종료, 일시정지/재개, 결과/재시작, 소리 ON/OFF, 375×667 모바일 화면, 11개 게임 시작/피버 전환 검사 통과. 브라우저 예외 없음. 실제 휴대폰 기기 성능은 미검증.

화면: `test-output/catch-toy/phone.png`, `fallback.png`.
