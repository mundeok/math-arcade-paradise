# 동물 간식 배달 토이풍 이미지 · 2026-09-21

내장 GPT image_gen 도구로 기존 메뉴 카드 `src/art/assets/menu/cards/g05_match.png`를 스타일 레퍼런스로 사용해 새로 생성했다. 메뉴 그림을 배경으로 재사용하지 않았다.

## 런타임 에셋

- `src/art/assets/world/match-bg-v1.webp`: 800×1280, 56,578 bytes.
- `src/art/assets/match/animals-v1.webp`: 804×1068, 216,024 bytes, 실제 알파. 토끼·강아지·고양이의 대기/먹기/조급함/아쉬움 표정 12개.
- `src/art/assets/match/cookie-v1.webp`: 160×160, 10,174 bytes, 실제 알파.
- 총 282,776 bytes. 원본은 생성 도구 저장소에 보존. `scripts/prepare-match-art.py`는 크기/압축만 처리한다.

배경 → 기존 받침 → 쿠키 쟁반/동물 카드 → 동적 식과 답/게이지 → 효과 순서. 동물 이미지와 쿠키는 튜토리얼에도 사용하며 날아가는 쿠키도 같은 에셋을 사용한다. 스프라이트는 첫 튜토리얼/게임 진입 시 로드한다. 로딩 중/실패 시 기존 도형 그림으로 대체한다. 동물 원래 종류값과 게임 난수·문제·판정은 유지하며 5종 값은 3종 이미지에 매핑한다. 동물 시트는 생성된 실제 배치에 맞춰 소스 영역을 지정한다.

## 생성 프롬프트 (그대로 기록)

### 배경

Create a NEW portrait 800:1280 game background inspired by this reference's soft 3D toy garden snack stall. Empty environment only: no characters, no numbers, no text. Muted mint #b8e7d3 and cream #f8edc8, soft top light. Top 22% a pale mint striped awning, middle 55% a very calm open cream serving space with minimal texture, slim wooden posts and sparse leaves at far edges. Bottom 23% a beautiful wooden snack counter with cookie baskets and carrots tucked only in bottom corners, teal apron fabric and small daisies. Designed behind two columns of gameplay cards, center must be visually quiet. Premium polished soft toy materials matching reference, no dramatic shadows, no UI or buttons.

### 동물 시트

Create a production sprite sheet on REAL transparent alpha background. Exact uniform grid: THREE columns and FOUR rows, 12 separate isolated head-and-shoulders portraits, each centered within its own equal-sized square cell with 12% padding, no overlap between cells, no grid lines or labels. Column 1 white rabbit with blue aviator goggles and teal scarf matching reference, column 2 brown white floppy-eared puppy, column 3 orange cream kitten. Row 1 expectant friendly neutral smile; row 2 happy eating with eyes closed and puffed cheeks; row 3 gently worried waiting expression; row 4 mildly disappointed (not crying or scary). Same character geometry size angle and lighting throughout each column, all ears fit in cell. Soft detailed premium 3D toy storybook materials matching reference. Each is a bust, no cards, no numbers, no writing, no items in hands. Genuine transparency around portraits, not a painted checkerboard.

### 쿠키

Create one isolated delicious round chocolate chip cookie sprite matching the reference's warm soft 3D toy storybook style. Front view, thick golden baked edge, about seven dark chocolate chunks, subtly beveled form. Single centered cookie fills 80% of square image. Genuine transparent alpha background, no plate, no cast ground shadow, no text, no numbers, no other objects.

## 검증

`tests/match-art-browser.mjs`: 별도 브라우저/저장소, 외부 요청 차단. 실제 RAF와 마우스 입력으로 8회 이상 연속 정답, 오답 후 회복, 놓침(잔여 인내심 축소 후 실제 프레임), 피버 시작/종료(상태 경계 설정 후 실제 입력), 일시정지/재개, 소리 ON/OFF, 결과/다시 시작, 375px 모바일, 이미지 요청 강제 실패 후 4회 정답, 기존 11개 게임 시작/피버 전환 렌더를 검사한다. 데스크톱/모바일/피버/폴백 캡처는 `test-output/match-toy`에 저장한다. 갤럭시탭 실기 FPS와 실제 음향 청취는 별도 확인이 필요하다.
