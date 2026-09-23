# 메뉴 대표 그림 · 2026-09-17

첫 화면을 ‘장난감 놀이공원 입구’처럼 보이게 하는 대표 PNG 1장을 추가했다. 기존 카드의 게임명·최고점·업적 배지·터치 판정은 Canvas 코드로 유지하고, 이미지는 상단 장식으로만 사용한다.

## 에셋

- `src/art/assets/menu/menu-hero-v1.png`
- 1536×1024, 실제 알파 투명 배경, 약 2.3MB
- 중앙 오렌지 자동차, 왼쪽 토끼, 오른쪽 새싹 농부, 주변 수학 기호 장식
- `src/art/menuAssets.js`에서 같은 출처로 지연 로드하며 로드 실패 시 코드 폴백

## 생성 프롬프트

```text
Use case: stylized-concept. Asset type: transparent game menu hero illustration for a children's math arcade game. Create a polished colorful 3D storybook-style mascot parade: a small cheerful orange delivery car in the center, a friendly rabbit holding a cookie on the left, a happy green sprout farmer on the right, plus a few floating colorful math stars and sparkles around them. Front-facing playful composition, characters arranged in a shallow arc, rich material detail, warm soft lighting, teal/blue/golden palette matching a toy arcade cabinet. Transparent background with genuine alpha around every character and between objects. Designed to sit above a separate dark navy menu panel, so keep the lower edges clean and no ground plane. No text, no numbers, no logos, no UI, no cards, no buttons, no checkerboard painted into the image, no watermark. Wide horizontal composition, generous transparent padding, production-ready raster asset.
```

내장 image_gen 모드로 생성했으며 외부 API/런타임 리소스는 사용하지 않았다.

## 메뉴 적용 구조

- 11개 동시 그리드 대신 중앙 1장 중심의 가로 순환 캐러셀을 사용한다.
- 양옆 카드를 일부 노출해 스와이프 방향을 알리고, 화살표·키보드 좌우 입력도 함께 지원한다.
- 중앙 카드 아래에는 `현재 / 전체`, 위치 점, 연산 배지, 한 줄 설명, 조작법과 시작 버튼을 코드로 그린다.
- 연산 배지는 삭제하지 않고 `곱셈`·`나눗셈`·`혼합` 텍스트가 있는 작은 칩으로 유지한다.
- 메뉴에 다시 들어올 때 카드 순서를 섞되, 캐러셀의 양 끝은 서로 이어진다.
- 대표 PNG가 로드되지 않아도 게임 선택·설명·시작 동작은 모두 코드 폴백으로 유지된다.
