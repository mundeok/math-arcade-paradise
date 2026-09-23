# 타이밍 퍼즐 토이 아트

내장 ImageGen으로 생성한 무대 배경과 투명 북 이미지를 적용했다. 숫자, 박자 테두리, 타격 변형은 런타임 Canvas로 그린다. 이미지 실패 시 기존 북과 월드 그림을 사용한다. 동물 연주단은 기존 그림을 유지한다.

## 파일

- `src/art/assets/timing/drum-v1.webp`
- `src/art/assets/world/timing-bg-v1.webp`
- 재처리: `scripts/prepare-timing-art.py`
- 화면: `test-output/timing-toy/phone.png`, `fever.png`, `fallback.png`

## 생성 프롬프트

북: Use case stylized-concept. Production transparent PNG game sprite: ONE large adorable pastel lavender and gold toy drum, viewed from slightly above, front symmetric view. Broad blank cream oval drumhead filling upper half, rounded lavender cylindrical wooden body and golden rim, subtle cords. Soft polished 3D storybook toy rendering, friendly children's math rhythm game, no face, no sticks, no text, no numbers, no logo, no floor, no scene. Entire drum visible centered with transparent margins. Genuine transparent alpha background. Clear simple silhouette. Drumhead must be empty for runtime number overlay.

무대: Use case stylized-concept. Portrait 5:8 background only for children's math rhythm game. Cute soft rounded 3D storybook toy music stage, pastel lavender curtains confined to left right edges, tiny gold stars at top border, pale warm wooden stage floor bottom, soft lilac backdrop. Central 80 percent quiet empty very low contrast pale lavender and cream for runtime drums and math UI. Gentle bright lighting, friendly daytime, no people animals drums instruments text numbers letters logo watermark. Simple elegant stage not ornate.

## 검증

단위 9개 통과. 기존 timing-browser 검사에서 60초 가상 진행 및 실제 35초 클릭/RAF, 오답/시간초과/피버/일시정지/결과/재시작, 소리 ON/OFF 통과. timing-art-check에서 이미지 로드 및 차단 폴백, 모바일 화면, 연속 8회 정답, 11개 게임 시작·피버 전환 통과. 브라우저 예외 없음. 실제 갤럭시탭 기기 성능은 미검증.
