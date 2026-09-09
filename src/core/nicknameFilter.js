// nicknameFilter.js — 온라인 랭킹 닉네임 검증 + 금칙어 필터 (SPEC §랭킹)
// Firebase와 무관한 순수 모듈(네트워크·저장 없음). 랭킹 UI가 닉네임 확정 전에 이걸로 검사한다.
//
// 목적: TOP 100에 든 아이가 닉네임을 남길 때 부적절한 이름을 촘촘히 걸러낸다.
//   ⚠️ 완벽할 수 없다(변형은 무한하다). 이 필터는 '1차 방어'이고, 뚫린 것은 신고·관리자 삭제
//      체계(§랭킹 4)가 2차로 막는다. 여기서는 흔한 우회를 최대한 잡는다.
//
// 설계 원칙:
//   1) 입력을 좁힌다 — 완성형 한글(가~힣) 2~6자만 허용. 영어·숫자·특수문자·공백·자모(ㄱ~ㅣ) 전부 차단.
//      → 'ㅅㅂ', 'ㅄ', 'ㅗ', 's2', '시 발', '시.발', '시1발' 류는 검사 이전에 형식에서 걸린다.
//   2) 금칙어는 정규화 후 검사한다 — 유사문자 치환 → 완성형만 추림 → 반복 축약 → 자모 분해(초성 ㅇ 묵음
//      제거) → 된소리 완화(ㅆ→ㅅ)·유사모음(ㅢ→ㅣ). 완성형·자모 두 표현에서 부분일치를 본다.
//   3) 안전 우선 — 과잉 차단(무고한 이름이 가끔 막힘)이 미검출(욕설 통과)보다 낫다. 단, 게임 앱 특성상
//      '게임'을 막지 않도록 오검출이 큰 소수 단어(게이 등)는 '전체 일치'로만 막는다.
//   4) 차단 시 '무엇이' 걸렸는지 알려주지 않는다(우회 학습 방지). 형식 오류만 도움말을 준다.
//
// ⚠️ 금칙어 목록은 이 파일에 하드코딩한다. 카테고리별 배열로 나눠 두었으니 새 단어는 해당 배열에 한 줄
//    추가하면 된다(정규화는 자동 적용). 맥락상 무고할 수 있는 일반어(음식명 등)는 넣지 않았다 → 신고/관리자로 보완.

// ── 한글 자모 테이블 ──────────────────────────────────────
const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

const SYL_START = 0xac00;
const SYL_END = 0xd7a3;

// 유사 문자 치환(defense-in-depth): 라틴/숫자 → 한글. 입력 검증이 이미 비한글을 막지만, isBannedNickname을
//   직접 호출하거나 규칙이 느슨해질 때를 대비한다. 치환 후 완성형만 남기므로 삽입된 글자는 사라진다.
const LEET = { 1: 'ㅣ', l: 'ㅣ', i: 'ㅣ', '!': 'ㅣ', '|': 'ㅣ', 0: 'ㅇ', o: 'ㅇ', '@': 'ㅇ' };
// 된소리 완화 + 유사 모음(씌/싀 → 시). 자모 표현에만 적용.
const JAMO_SIMPLIFY = { ㄲ: 'ㄱ', ㄸ: 'ㄷ', ㅃ: 'ㅂ', ㅆ: 'ㅅ', ㅉ: 'ㅈ', ㅢ: 'ㅣ' };

function isCompleteSyllable(ch) {
  const c = ch.charCodeAt(0);
  return c >= SYL_START && c <= SYL_END;
}

// 완성형 → 자모 문자열. dropNullInitial=true면 초성 ㅇ(묵음)을 뺀다
//   → '시이이발'의 '이'(ㅇㅣ)가 'ㅣ'로 축약되어 반복 제거 후 '시발'로 잡힌다.
function decomposeJamo(str, dropNullInitial) {
  let out = '';
  for (const ch of str) {
    if (isCompleteSyllable(ch)) {
      const idx = ch.charCodeAt(0) - SYL_START;
      const cho = CHO[Math.floor(idx / 588)];
      const jung = JUNG[Math.floor((idx % 588) / 28)];
      const jong = JONG[idx % 28];
      if (!(dropNullInitial && cho === 'ㅇ')) out += cho;
      out += jung;
      if (jong) out += jong;
    } else {
      out += ch;
    }
  }
  return out;
}

function collapseRepeats(s) {
  return s.replace(/(.)\1+/g, '$1'); // 연속 반복 1개로: '하하하'→'하'
}
function applyLeet(s) {
  return s.replace(/[1li!|0o@]/g, (m) => LEET[m]);
}
function simplifyJamo(s) {
  return s.replace(/[ㄲㄸㅃㅆㅉㅢ]/g, (m) => JAMO_SIMPLIFY[m]);
}

// 검사용 2표현: 완성형(유사치환·반복축약) / 자모(초성ㅇ제거·된소리완화·유사모음)
function normalizedForms(name) {
  const cleaned = applyLeet((name || '').toLowerCase()).replace(/[^가-힣]/g, ''); // 완성형만
  const syll = collapseRepeats(cleaned);
  const jamo = collapseRepeats(simplifyJamo(decomposeJamo(syll, true)));
  return { syll, jamo };
}

// ── 금칙어 목록 (카테고리별, 확장 지점) ───────────────────
// 부분일치로 막는다(변형 흡수). ⚠️ 대표 시드이며 완전하지 않다.

// 욕설 및 변형
const PROFANITY = ['시발', '씨발', '시팔', '씨팔', '시벌', '개새끼', '새끼', '쌔끼', '병신', '븅신', '빙신', '지랄', '지럴', '좆', '존나', '존내', '좆같', '조까', '개좆', '닥쳐', '꺼져', '엿먹', '썅', '쌍놈', '쌍년', '개년', '개놈', '개소리', '등신', '또라이', '돌아이', '미친놈', '미친년', '주둥이', '아가리', '창녀', '걸레', '보빨'];

// 성적 표현
const SEXUAL = ['섹스', '섹슈', '야동', '자지', '보지', '잠지', '딸딸', '딸잡', '정액', '강간', '성기', '자위', '변태', '음란', '몸캠', '조건만남', '후장', '항문', '젖탱', '가슴만'];

// 일베·극우 커뮤니티 용어 / 고인·재난 비하
//   ⚠️ 재난 비하 단어(어묵·압사 등)는 일반어와 겹쳐 오검출이 크므로 넣지 않고 신고/관리자로 보완한다.
const HATE_COMM = ['노무', '운지', '놈현', '부엉이바위', '뇌물현', '산업재해', '뒤진', '뒈진', '민주화'];

// 패드립 (부모 관련 비속어)
const FAMILY = ['애미', '애비', '느금', '느검', '엄창', '니미', '늬믜', '엠창', '패드립'];

// 혐오 표현 (지역·성별·장애·인종)
const DISCRIM = ['홍어', '전라디언', '한남', '김치녀', '된장녀', '맘충', '틀딱', '급식충', '짱깨', '짱께', '쪽바리', '쪽발이', '흑형', '애자', '벙어리', '귀머거리', '절름발이', '외퀴'];

// 정치인·연예인 실명 조롱(대표 변형 위주 — 실명 자체는 신고/관리자로 보완)
const MOCK = ['쥐박이', '닭근혜', '찢재명', '문죄인', '이죄명'];

// 성정체성 관련 — 교사 정책상 닉네임(표시명)에서 제외. 자극적 소재(성적·정치·정체성)를 30명이 보는
//   표시명에 두지 않겠다는 정책 선택이며, 사람/정체성에 대한 가치판단이 아니다.
//   ⚠️ '게이'는 부분일치 시 '게임'이 막혀(자모상 게이⊂게임) BANNED_EXACT(전체일치)로 뺐다.
const IDENTITY = ['동성애', '호모', '레즈', '레즈비언', '동성혼'];

export const BANNED_WORDS = [...PROFANITY, ...SEXUAL, ...HATE_COMM, ...FAMILY, ...DISCRIM, ...MOCK, ...IDENTITY];

// '전체 일치'로만 막는 단어: 부분일치로 막으면 무고한 일반어를 크게 오검출한다.
//   예) 부분일치로 막으면 '게임' 같은 핵심어가 막힌다. 그래서 닉네임 전체가 정확히 이 값일 때만 차단.
//   '게이'는 여기(전체일치)에만 둔다 — 부분일치로 두면 앱 핵심어 '게임'이 막힌다(자모상 게이⊂게임).
const BANNED_EXACT = ['굥', '게이'];

// 금칙어를 검사용 표현으로 미리 분해(런타임 비용 절감)
const BANNED_FORMS = BANNED_WORDS.map((w) => {
  const nf = normalizedForms(w);
  return { syll: nf.syll, jamo: nf.jamo };
});
const BANNED_EXACT_FORMS = BANNED_EXACT.map((w) => normalizedForms(w).syll);

// 금칙어 포함 여부. 완성형 부분일치 OR 자모 부분일치(길이 3+에서만 — 잡음 최소화) OR 전체일치.
export function isBannedNickname(name) {
  const f = normalizedForms(name);
  if (BANNED_EXACT_FORMS.includes(f.syll)) return true;
  for (const b of BANNED_FORMS) {
    if (b.syll.length >= 1 && f.syll.includes(b.syll)) return true;
    if (b.jamo.length >= 3 && f.jamo.includes(b.jamo)) return true;
  }
  return false;
}

// ── 최종 검증 ─────────────────────────────────────────────
// 반환: { ok, code } — code: 'ok' | 'length' | 'charset' | 'jamo_only' | 'repeat' | 'banned'
//   { ok } 만 봐도 되고(사유 비노출), 형식 오류 code는 도움말 문구 선택에만 쓴다. banned는 사유를 숨긴다.
export function validateNickname(raw) {
  const name = (raw || '').trim();

  if (name.length < 2 || name.length > 6) return { ok: false, code: 'length' };

  for (const ch of name) {
    if (!isCompleteSyllable(ch)) {
      const c = ch.charCodeAt(0);
      if (c >= 0x3131 && c <= 0x3163) return { ok: false, code: 'jamo_only' }; // 호환 자모(ㄱ~ㅣ)
      return { ok: false, code: 'charset' };
    }
  }

  if (/(.)\1\1/.test(name)) return { ok: false, code: 'repeat' }; // 같은 글자 3회 이상 연속

  if (isBannedNickname(name)) return { ok: false, code: 'banned' };

  return { ok: true, code: 'ok' };
}

// UI 표시용 메시지. 금칙어는 이유를 숨긴다(우회 학습 방지).
export function nicknameMessage(code) {
  switch (code) {
    case 'length':
      return '한글 2~6자로 입력해주세요';
    case 'charset':
      return '한글만 쓸 수 있어요';
    case 'jamo_only':
      return '완성된 한글로 입력해주세요';
    case 'repeat':
      return '같은 글자를 너무 많이 반복했어요';
    case 'banned':
      return '다른 이름을 써주세요';
    default:
      return '';
  }
}
