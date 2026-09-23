# 슈팅 적용 및 타이밍 개선

내장 ImageGen으로 생성. 타이밍은 입체 곰 연주자와 청록·분홍·노랑 북을 추가하고 기존 보라색 북과 함께 사용한다. 숫자는 각 이미지 가죽면 중심에 표시한다. 슈팅은 우주 배경, 3색 로봇, 우주선을 추가했다. 둥근 청록 에너지 공은 움직이는 Canvas 효과다.

## 저장 경로

- `src/art/assets/timing/{bear,teal,pink,yellow}-v1.webp`
- `src/art/assets/shoot/{teal,purple,peach,ship}-v1.webp`
- `src/art/assets/world/shoot-bg-v1.webp`
- 재처리: `scripts/prepare-shoot-timing.py`

## 프롬프트

Production game sprite sheet, genuine transparent alpha background. Exactly FOUR isolated objects in strict equal 2x2 cells with large clear gutters, no touching. Top left one cute 3D honey-brown teddy bear musician holding two little drumsticks, full body front view. Top right ONE teal and gold toy drum. Bottom left ONE coral pink and gold toy drum. Bottom right ONE pale yellow and gold toy drum. Drums front symmetric slightly above perspective, large blank cream oval drumhead upper half, squat rounded cylinder body, identical proportions. Soft polished 3D storybook toy aesthetic, gentle lighting. No letters numbers faces on drums, no floor or scene. Bear friendly plush soft cheeks. Each object fully within its own cell, transparent margins.

Use the previous approved pastel space robot concept as inspiration: production transparent PNG sheet with exactly FOUR separated sprites in strict 2x2 grid, generous transparent margins per cell. Top left teal friendly floating toy robot; top right lavender robot; bottom left peach robot; bottom right small white teal gold toy spaceship launcher viewed from behind slightly above, aimed upward, with tiny blue pilot in bubble canopy. Robots symmetric frontal with small smiling head and LARGE blank cream belly screen, gold trim, compact rounded arms feet, no flames. All whole objects fully visible, no overlap. Soft rounded 3D storybook style. Genuinely transparent alpha background, no floor shadows, no scene, no words numbers logos.

Portrait 5:8 game background only. Soft rounded 3D toy storybook pastel space playground: lavender blue sky, friendly pastel planets only in upper corners, small gold stars confined to outer edges, teal floating platforms on lower left and right, bottom small circular cream gold landing pad. Central 75 percent empty calm low contrast lavender haze for moving robots and numbers. Soft gentle illumination cheerful child friendly, same pastel space playground aesthetic as toy robots. No robots no spaceship no projectiles no characters no text no numbers no UI no watermark.

## 검증

두 게임 단위 테스트 18개 통과. 각각 실제 브라우저 35초 연속 입력 및 60초 가상 프레임 검사, 피버 진입/종료, 일시정지/재개, 결과/재시작 통과. 이미지 로드와 실패 폴백, 휴대폰 뷰포트 확인. 실제 모바일 기기 성능은 미검증.
