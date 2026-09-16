# g03 레이싱 이미지 에셋 · 2026-09-16

사용자 승인으로 로컬 PNG 5종을 추가. 내장 image_gen 사용(API/CLI 미사용). 외부 요청 없이 같은 정적 사이트에서 읽는다. 생성 원본은 Codex generated_images에 보존했다. 배경/대시보드는 RGB, 핸들/나무는 실제 알파 PNG다. 버려진 체커보드 대시보드 시안은 게임에 포함하지 않았다.

## 에셋

- src/art/assets/race/countryside-v1.png
- src/art/assets/race/dashboard-v1.png
- src/art/assets/race/wheel-v1.png
- src/art/assets/race/tree-v1.png
- src/art/assets/race/asphalt-v1.png

풍경은 원경, 나무는 원근 스프라이트, 운전석은 고정 전경, 핸들은 독립 회전 스프라이트다. 숫자·도로·판정은 이미지에 굽지 않고 코드로 처리한다. 이미지 로드 실패 시 기존 코드 드로잉으로 폴백한다. 아스팔트도 이미지 텍스처로 읽어 원근 띠에 합성한다.

원본 PNG 합계는 11,329,206바이트(약 11.3MB)이며 아직 전송 용량 최적화는 하지 않았다. 레이싱 화면을 처음 그릴 때 요청하고 이후 모듈 캐시를 재사용한다. 느린 연결에서는 이미지가 준비되기 전까지 코드 드로잉이 표시된다. 실제 태블릿 하드웨어에서의 성능은 별도 실기 확인 대상이다.

## 검증

- 레이싱 단위 검사 10개 통과: 연료/부스터 경계, 게이트 숫자 읽기 영역, 차선·게이트·기둥 공통 원근 포함.
- 격리 Chrome의 실제 키/터치 입력으로 32게이트 연속 진행, 자연 피버 진입·종료, 연료 소진 결과 전환, 일시정지/재시작 확인.
- 이미지 5개 로드 성공 및 모든 이미지 요청을 막은 폴백 플레이 각각 확인. 브라우저 예외 0건.
- 다른 10개 게임의 시작·피버 전환 렌더 검사 통과. 다른 게임의 전체 실플레이를 대신하는 검사는 아니다.
- 로컬 Chrome 렌더 측정(각 실행 첫 600프레임, 2회): 중앙값 2.7~3.5ms, 95백분위 5.7~8ms. 기기/실행에 따라 달라질 수 있다.
- 전체 단위 검사 92개 중 88개 통과, g11 농장 검사 4개 실패. 이 작업에서는 g11 코드와 검사를 수정하지 않았다. 전체 테스트가 통과한 상태로 보고하지 않는다.

## 최종 생성 프롬프트

### landscape

```text
Use case: stylized-concept. Asset type: production game environment background plate. Image 1 is a STYLE REFERENCE ONLY from an approved racing game mockup. Create only its bright beautifully rendered sunny countryside, not its UI or cockpit. Premium polished stylized 3D illustration with organic detailed foliage, painterly distant mountains, volumetric white clouds, soft sunlight, inviting turquoise stream at far right, small cream windmill on left hill, hillside village on right. Portrait 4:5 canvas. Top 45 percent mostly clear blue sky, land meets sky at central vanishing point around (50%, 52%); layered mountains on left and right with a valley opening in the center. Bottom half is a gently sloping open green meadow with soft grass texture and scattered wildflowers at outer margins; no large foreground objects in central 70 percent. This background will sit behind a separately programmed road. CRITICAL: NO ROAD, no pavement, no lane stripes, no guardrails, no gates, no numbers, no text, no interface, no vehicle, no wheel, no speed streaks. Keep visual detail on the hillsides, calm open central meadow. Rich depth/material quality like the reference, not flat vector/cartoon circles. Single finished opaque background plate, edge to edge.
```

### dashboard

```text
Create a production game cockpit texture, wide 3:1 rectangle. Use the reference ONLY for dark padded leather and orange paint material style. FULLY OPAQUE IMAGE: absolutely no transparency, checkerboard, gray squares, sky, background, landscape or empty space. Every pixel belongs to the cockpit. The topmost 12% of the entire rectangle is a continuous bright glossy orange hood/bonnet painted surface, flat across the FULL width and touching the top edge; its bottom edge has a very gentle curved metallic rim. Beneath that a premium dark navy charcoal padded leather dashboard with subtle stitching and realistic 3D shading. Two generously sized EMPTY dark display recesses with rounded bevels occupy the outer left and outer right of the LOWER HALF, each approximately 28% of image width, separated by a smooth central steering column mounting area. NO STEERING WHEEL, no hands, no buttons, no markings, no text, numbers, labels, logos or instruments. Straight-on centered driver's viewpoint, sunlight from upper left, polished stylized 3D materials. The image must entirely fill the rectangular canvas with cockpit surfaces, including top corners. It is a reusable dashboard texture, not a mockup of a dashboard on a background. Orange hood must touch all of the top edge. Dark dashboard must touch all of the bottom edge. 3:1 wide landscape aspect.
```

### wheel

```text
Use case: stylized-concept. Asset type: single game steering wheel sprite on genuinely transparent background. Image 1 is a style and material reference only. Premium sporty chunky black leather steering wheel with dark metallic three spokes and a small blank orange hub ring, matching the orange-and-charcoal cockpit in reference. Straight-on front view, symmetric centered wheel, complete circular outline fully visible, generous 5% transparent padding, no perspective tilt, no hands, no dashboard, no environment, no drop shadow outside the silhouette, NO logos, letters, labels, symbols, numbers or interface. Fine stitched leather surface, subtle rubber grain, realistic soft daylight highlights from upper left, polished stylized 3D render. Square canvas, transparent holes between spokes with genuine alpha so this sprite can rotate cleanly over a separately rendered dashboard. Not a mockup, one isolated production asset. No checkerboard painted in image.
```

### tree

```text
Use case: stylized-concept. Asset type: single roadside tree billboard sprite on genuinely transparent background. Image 1 is a STYLE REFERENCE ONLY. One lush mature deciduous tree viewed from a driver's eye-level distance, entire tree and trunk visible. Organic rounded crown made of richly detailed clusters of bright green leaves, warm golden sun on upper left, deep cool green shading underneath, branching sturdy warm brown trunk, beautifully rendered stylized 3D foliage matching premium sunny racing game reference. Not a tree made of smooth spheres. Upright isolated object, crown about twice the trunk width, include narrow trunk extending to image bottom center, 5 percent transparent padding, square canvas. NO landscape, ground, grass mound, environment, shadow ellipse, sky, text, labels or border. Genuine alpha transparency surrounding tree and gaps in foliage; no painted checkerboard. Reusable production sprite.
```

### asphalt

```text
Use case: stylized-concept. Asset type: seamless tileable asphalt road albedo texture for a sunny high-quality stylized racing game. Square 1024x1024, flat orthographic directly overhead view, edge to edge surface only. Medium cool gray asphalt, tiny natural irregular aggregate stones, subtle warm sunlit variation and gentle worn grain. Refined premium 3D-game material, neither flat solid color nor gritty ruined pavement. Fine restrained detail intended for a fast moving road. Uniform neutral diffuse lighting, no baked directional shadows, no specular hotspot, no obvious focal shapes, seamless on every edge. Absolutely no lane markings, lines, stripes, cracks, potholes, curbs, grass, debris, road signs, wheels, labels, text, perspective or horizon. This is a reusable MATERIAL TEXTURE, not a scene or a product mockup.
```
