# 곱셈나눗셈 아케이드 천국 — 프로젝트 전체 요약 (PROJECT_FULL_SUMMARY)

> 이 문서는 프로젝트 전체를 한눈에 파악하기 위한 **개괄 요약**이다.
> 규범적 단일 진실 공급원(SSOT)은 여전히 [`SPEC.md`](SPEC.md)이며, 충돌 시 SPEC.md가 우선한다.
> 이 파일은 배포 산출물(`dist/`)에 포함되지 않는다 (아래 "빌드/배포" 참조).

---

## 0. 개요

| 항목 | 내용 |
|---|---|
| 제목 | 곱셈나눗셈 아케이드 천국 (Math Arcade Paradise) |
| 대상 | 초등학교 3학년 (곱셈·나눗셈) |
| 콘셉트 | 컴투스 '미니게임천국' 감성의 초고속 캐주얼 아케이드 미니게임 모음 |
| 사용 환경 | 교실 — 삼성 갤럭시 탭, 학생 1인 1대, 동시 최대 30대 (가정용 폰도 목표) |
| 최종 산출물 | 외부 리소스 0개인 단일 HTML (`dist/index.html`) |
| 저장소 | GitHub `mundeok/math-arcade-paradise` (브랜치 `master`) |
| 배포 | 정적 호스팅 (GitHub → Vercel/Cloudflare Pages) |

**설계 철학**
1. 재미가 먼저다 — "학습 게임"이 아니라 "수학이 소재인 아케이드 게임".
2. 틀리는 것은 벌이 아니다 — 오답은 즉시 정답을 알려주고 다시 만나는 기회.
3. 교실은 통제 가능해야 한다 — 교사가 범위·속도·소리를 제어.
4. 3초 안에 이해된다 — 튜토리얼은 그림 한 장 + 문장 하나.

---

## 1. 기술 사양 (전 구간 공통)

- **HTML5 Canvas 2D만.** WebGL 금지.
- **외부 리소스 0개** — CDN·폰트파일·이미지·오디오 전부 금지. 아이콘은 도형 드로잉 또는 이모지.
- **효과음은 Web Audio 신디사이저로 코드 생성** (`soundManager`). 오디오 파일 금지.
- `requestAnimationFrame` + **delta-time** 기반. 프레임 수 의존 로직 금지.
- **논리 캔버스 800×1280 고정** (갤럭시 탭 세로). `object-fit: contain` 레터박스, devicePixelRatio 반영.
- 터치는 화면 좌표 → 논리 좌표 변환 후 처리 (`getBoundingClientRect()` 기준, 이중 차감 주의).
- 터치 타겟 최소 96×96(논리), 문제 텍스트 최소 80px, 안전 여백 24px.
- ES6 모듈 + class, 전역 변수 금지, localStorage 네임스페이스 `mathArcade.*`, 주석은 한글("왜").

---

## 2. 아키텍처

```
/
├─ index.html            개발용 (module script 로드)
├─ build.js              dist/ 생성 (허용목록 복사) — 아래 참조
├─ package.json          "build": "node build.js" (외부 의존성 0)
├─ SPEC.md               규범 SSOT
├─ TODO.md / GAMEPLAY_REVIEW.md / PROJECT_FULL_SUMMARY.md   문서(배포 제외)
├─ src/
│  ├─ main.js            부트스트랩
│  ├─ core/              엔진·시스템 (게임에서 절대 수정 금지)
│  │  ├─ engine.js           루프·상태머신·캔버스/스케일·정답오답 처리
│  │  ├─ input.js            터치·마우스·키보드 통합 입력
│  │  ├─ layout.js           반응형 좌표/크기/폰트 헬퍼 (L)
│  │  ├─ problemGenerator.js 문제·오답지·복습 큐·레벨 조정
│  │  ├─ scoreManager.js     점수·콤보·라이프·속도가산
│  │  ├─ soundManager.js     Web Audio 신디사이저
│  │  ├─ particle.js         파티클
│  │  ├─ fever.js            피버 시스템 (easy/multi)
│  │  ├─ storage.js          localStorage 래퍼
│  │  ├─ ui.js               공용 UI·HUD·연출
│  │  ├─ session.js          세션 기록(문제/정답/반응시간)
│  │  └─ mathText.js         문제 → 식 문자열 변환
│  ├─ scenes/            menu / tutorial / result / settings / report
│  └─ games/             gNN_*.js + registry.js
```

**확장 규칙(핵심):** 새 게임은 `src/games/gNN_*.js`를 만들고 `registry.js`의 `IMPLEMENTED` 배열에 **한 줄만** 추가한다. `core/`·`scenes/`·기존 게임 파일은 **수정하지 않는다**. core 변경이 필요하면 먼저 보고한다. (예외: 레벨 사다리 재조정 등 명시적으로 승인된 core 수정.)

**상태 머신:** `MENU → TUTORIAL → PLAYING ⇄ PAUSED → RESULT → MENU` (+ SETTINGS/REPORT).

---

## 3. 확정 게임 인터페이스 (SPEC §7)

게임 객체는 아래를 구현한다:
```js
export const gXX = {
  id, name, emoji, category, maxLevel,        // 메타
  opMode: 'multiply'|'divide'|'mixed',        // 선택, 게임별 연산 고정 (교사 설정이 우선)
  comboMilestones: { 5:'BURST!' },            // 선택, 게임 고유 콤보 문구
  fever: { type: 'easy'|'multi' },            // 선택, 피버 opt-in
  tutorial: { text, draw(ctx) },
  init(engine), update(dt), render(ctx),
  onTouch(x,y,phase), onKey(e),               // phase: start|move|end
  onHover(x,y), clearHover(),                  // 선택(PC 커서)
  destroy(),
};
```

**게임이 쓰는 엔진 API (이것만):**
- `engine.problemGenerator.nextProblem({maxLevel, blankRatio, opMode})` → 문제
- `engine.problemGenerator.makeDistractors(problem, count, closeness)` → 오답 배열
- `engine.scoreManager.combo/.score/.lives` (읽기 — 게임 난이도 축 B 계산)
- `engine.answerCorrect(problem, userAnswer, points)` — 점수·콤보·라이프·복습·레벨·정답음 전부 처리
- `engine.answerWrong(problem, userAnswer, {loseLife, onResume, freeze, affectLevel, missed})`
- `engine.timeUp(problem, opts)` — 시간초과(=answerWrong 별칭)
- `engine.particles.emit(x,y,preset,color,count)` (`explode`/`pop`/`sparkle`/`gem`)
- `engine.sound.play(name)`, `engine.ui.showComboText(t,big)`, `engine.reportNearMiss(x,y)`
- `engine.settings.timeScale`, `engine.fever`(§4)

**손맛/HUD/위기 테두리/점수 카운트업은 엔진·ui가 자동.** 게임은 플레이 영역만 그린다. 모든 좌표·폰트는 `L` 헬퍼(픽셀 리터럴 금지).

---

## 4. 난이도 2축 분리 + 문제 생성

**절대 규칙:** 두 난이도 축을 분리한다.
- **축 A — 수학 난이도(`level` 1~5):** `problemGenerator`만 관리. "무엇을 물을까." 게임은 **읽지 않는다**(단, 상대 난이도 프레이밍·표기 단계 도입 목적의 `currentLevel`/`problem.level` 읽기는 허용).
- **축 B — 게임 난이도(속도/개수/오답 근접도):** 오직 `scoreManager.combo`로만 계산.

### 레벨 사다리 (아케이드 재조정판)
세 자리×한 자리(213×5)와 올림 있는 두 자리 곱셈(47×7)은 **필산 수준이라 아케이드 3초 암산에 부적합** → 전 레벨에서 제거. 상한은 **몇십×몇**(20×6, 구구단 확장)과 **두 자리×한 자리 올림 없음**(21×3).

| Lv | 혼합(mixed) | 곱셈만(multiply) | 나눗셈만(divide) |
|---|---|---|---|
| 1 | 곱셈구구 2~5단 | 곱셈구구 2~5단 | 나눗셈 2~5단 역산 |
| 2 | 곱셈구구 6~9단 | 곱셈구구 6~9단 | 나눗셈 6~9단 역산 |
| 3 | 나눗셈 역산 + 빈칸(□×, ÷□) | 빈칸 역산(□×7=42)+구구단 | 빈칸 역산(48÷□=6) |
| 4 | 몇십×몇 / 몇십몇÷몇 | 몇십×몇 | 몇십몇÷몇(나누어떨어짐) |
| 5 | 두자리×한자리 올림없음 / 나머지 나눗셈 | 두자리×한자리 올림없음 | 나머지 있는 나눗셈 |

- 레벨 상향: 콤보 8의 배수 도달 시 +1(최대 5). 하향: 2연속 오답 시 −1(최소 1). 교사 '레벨 고정' 시 조정 없음.
- 빈칸형(□) 비율은 게임별 `blankRatio`로 조절(반사신경 게임은 낮게).

### 오답지(distractor) 불변식
1. 나눗셈 오답은 **몫(answer) 기준**으로만 생성(피제수로 만들면 무관한 큰 수가 나옴).
2. 오답은 **정답과 같은 자릿수**(계산 없이 자릿수만으로 답을 골라내지 못하게).
- 전략: 인접 구구단, 자릿수 뒤집기, ±1·±2, ±10(두 자리+), 덧셈 혼동(Lv1~2). 콤보 낮을수록 먼 오답.
- 검증 자동화: 세 자리×한자리 / 올림 있는 두자리 곱셈 / 오답 자릿수 불일치 / 몫·제수 1 / ×1 형태 = **각 0건**.

### 복습 큐 · 중복 방지
- 오답 문제는 복습 큐에 → **2~3문제 뒤 재출제**. 맞히면 제거. 최근 5문제 중복 금지(복습은 예외).

---

## 5. 피버 시스템 (재미 표준의 핵심)

게이지(정답 +10 / 니어미스 +5 / 오답 −20, 100에서 발동), **6초 지속**, 속도 1.35배·판정 1.2배.
- **피버 중 무적:** 오답을 내도 라이프·콤보 유지, 1.2초 정답표시 없음, 즉시 다음 문제. (세션엔 기록·복습 큐 등록, 정답률·게이지·레벨엔 무영향.)
- **점수 3배** + 연타 보너스(1초 내 2연속 4배, 3연속+ 5배).
- **두 유형 (`fever.type`):**
  - **`easy`** — 문제를 Lv1~2로 낮추고 오답을 멀게. "화면은 빨라 보이는데 술술 풀린다."
  - **`multi`** — 문제가 "N단!"(2~5단)으로 바뀌고 화면의 ~80%를 그 단의 배수로 채움. 배수를 쓸어담기. core가 `dan/isMultiple/randomMultiple/randomTrap/fillValues` 헬퍼 제공.

**연출 시간 상한:** 순간정지 0.03~0.06 / 플래시 0.05~0.10 / 흔들림 0.08~0.12 / 파티클 0.30~0.50 / 콤보문구 0.40~0.70 / 다음 문제 즉시~0.15초.

---

## 6. 게임 목록 (11종)

메뉴 기본 10종 + 배열 구성 체험 1종. (`registry.js`의 `CATALOG`/`IMPLEMENTED`)

| # | id | 이름 | 유형 | 한 줄 설명 | 피버 |
|---|---|---|---|---|---|
| 1 | g01_combo | ⚡ 콤보 챌린지 | 선택형 | 상단 문제 + 하단 2×2 선택지, 제한시간 게이지 | multi |
| 2 | g02_catch | 🎪 떨어지는 캐치 | 반사신경 | 떨어지는 숫자 원 중 '정답만' 터치 | multi |
| 3 | g03_racing | 🚀 레이싱 계산 | 경쟁형 | 3차선 운전 — 정답 차선 게이트를 통과 | multi |
| 4 | g04_timing | 🎯 타이밍 퍼즐 | 정밀형 | 회전 바늘이 정답 위를 지날 때 탭 | multi |
| 5 | g05_match | 🧩 숫자 매칭 | 전략형 | 문제 카드 ↔ 답 카드 탭-탭 짝짓기 | easy |
| 6 | g06_stack | 🏗️ 스택 빌더 | 축적형 | 카트를 움직여 정답 블록을 받아 쌓기 | multi |
| 7 | g07_shoot | 💣 슈팅 계산 | 액션 | 내려오는 숫자 로봇 중 정답을 조준 발사 | multi |
| 8 | g08_chain | 🔗 배수 체인 | 연쇄형 | N단 배수를 찾아 탭(순서대로 이으면 보너스) | easy |
| 9 | g09_balloon | 🎈 벌룬 팝 | 개념확장 | 값이 같은 풍선을 모두 터뜨리기(등식, 표기 단계화) | multi |
| 10 | g10_remain | 💎 나머지 보물찾기 | 나눗셈 심화 | 보석을 해적에게 똑같이 나눠 나머지 찾기 | easy |
| 11 | g11_farm | 🌱 곱셈 농장 | 구성형 체험 | 직사각형 배열을 직접 그려 수확(곱셈/나눗셈) | easy |

**주요 게임별 특이 규칙(최근 개정):**
- **g03 레이싱:** 유령/최고기록 제거, 곱셈/나눗셈 모드 선택, 게이트 간격 콤보 단축(1.4초 하한). 피버(multi): 정답 차선을 3~4개 연속 고정 후 옆 차선으로 전환(예고 하이라이트+화살표), 연속 통과 ×2/×3/MAX BOOST.
- **g08 체인:** 순서 강제 → 보너스 유도. 배수는 아무거나 정답(순서대로 이으면 체인 보너스 ×1.5/×2/×3), 순서 끊겨도 라이프 무영향, 함정만 라이프 −1.
- **g09 벌룬:** 등식 표기를 레벨로 단계 도입 — Lv1 숫자만 → Lv2 +곱셈식 → Lv3 +나눗셈식.
- **g10 보물찾기:** 돌리기 제한(Lv1~2 자유 / Lv3~4 3번 / Lv5 예측 모드), 오버 배분은 라이프 대신 시간 차감(오버 없이 완료 시 +100), 균등 분배 강제(적게 받은 해적부터).

---

## 7. 교사 설정 · 학습 리포트 (scenes)

- **교사 설정(settingsScene):** 연산 종류(혼합/곱셈만/나눗셈만), 단(dan) 선택, 레벨 고정(ON/OFF), 효과음, 제한시간 배율(`timeScale`) 등.
- **학습 리포트(reportScene):** `mathArcade.report`(최근 세션 기록)로 단별 정답률 집계.
  - 한 자리×한 자리 → 양쪽 단 / 나눗셈 → 제수의 단 / 두자리·몇십 × 한자리 → 한 자리 쪽 단 / 나머지 나눗셈 → 'Lv5' 별도.
- **결과 화면(resultScene):** 점수·콤보·별등급 + "틀린 문제 다시보기".

---

## 8. 접근성 · 정서 안전 (필수)

- 화면 어둡게/색 반전 난이도 금지, 위협적 효과음 금지(실패음 220Hz 이하·0.2초).
- 색만으로 정오답 구분 금지 → **색 + 아이콘(⭕/❌) + 모양** 3중(색약 대응).
- 부정적 평가 문구 금지("실패/틀렸어요" → "아쉬워요/다시 해보자"). 깜빡임 초당 3회 이하.

---

## 9. 빌드 · 배포

```bash
npm run build   # = node build.js
```

- `build.js`는 **허용목록(`INCLUDE = ['index.html', 'src']`)만** `dist/`로 그대로 복사한다(내용 변경 없음).
- 따라서 **`SPEC.md`·`TODO.md`·`GAMEPLAY_REVIEW.md`·`PROJECT_FULL_SUMMARY.md`·`build.js`·`.claude/` 등은 `dist/`에 포함되지 않는다.** 이 요약 문서도 배포에서 자동 제외된다. (허용목록 방식이라 루트에 새 문서를 추가해도 `INCLUDE`에 넣지 않는 한 절대 노출되지 않는다.)
- 단일 HTML 인라인 병합(`dist/index.html` 한 파일화)은 Phase 6 작업으로, 현재 build.js는 폴더 복사까지만 한다.
- 로컬 확인: 정적 서버로 `index.html` 서빙(개발 중 PowerShell HttpListener 등, 포트 8124 사용).

---

## 10. 개발 이력(발췌)

Phase 0(엔진+더미) → Phase 1(g01·g02) → Phase 2(g09·g06) → Phase 3(g04·g08, 재미 표준 core 추출) → Phase 4(g05·g07) → Phase 5(g03·g10) → 이후 밸런싱.

최근 커밋(신→구):
- `balance: rework level ladder for 3rd grade arcade pace` — 레벨 사다리 재조정(세 자리·올림 곱셈 제거)
- `feat: g09 staged equations, g10 round limits and prediction`
- `feat: g03 multi fever with lane holding and boost chain`
- `feat: g08 chain bonus instead of forced order`
- `fix: score text overlap, shoot speed and fever rapid fire`
- `feat: convert g01/g04/g07 fever to multi, g05 rhythm`
- `balance: stack wave cycling, block compression, catch speed`
- `feat: score-based speed factor`
- `feat: rebuild stack builder as catch-and-stack`
- `feat: redesign fever mode (invincible, easy/multi types)`
- `Phase 5: rebuild g03 racing as 3-lane arcade driving`

**미완료(TODO.md):** 폰트 비율화, `SAFE`→`L.safe` 통합, 논리 캔버스 가변화(화면 비율 프로필 A/B/C), 단일 HTML 빌드, 교사 모드(Phase 7)·공유 패키지(Phase 8). 밸런스 후속: 곱셈만 Lv5의 `11×b` 반복(올림 없는 두 자리 곱셈의 수학적 제약) 실기 확인 후 조정.

---

## 11. 새로 합류했다면 — 시작 지점

1. **[`SPEC.md`](SPEC.md)** 먼저 읽는다(규범). 이 문서는 지도일 뿐이다.
2. 게임을 고치려면 해당 `src/games/gNN_*.js`만. **`core/`·`scenes/`는 건드리지 않는다**(승인 없이는).
3. 좌표·폰트는 반드시 `core/layout.js`의 `L` 헬퍼로. 픽셀 리터럴 금지.
4. 정답/오답은 반드시 `engine.answerCorrect` / `engine.answerWrong`로만 처리.
5. 새 게임은 `registry.js`의 `IMPLEMENTED`에 한 줄 등록.
