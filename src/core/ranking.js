// ranking.js — 온라인 랭킹 (Firestore REST 직접 호출, SDK/번들러 없음 = "외부 리소스 0개" 유지)
// SPEC §랭킹. Firebase JS SDK 대신 fetch로 Firestore REST API를 호출한다(오프라인 캐시·실시간 동기화 미사용).
//
// 무료 티어 최적화:
//   - 게임당 문서 1개(rankings/{gameId})에 TOP 100을 배열로 저장 → 조회 1회 = 읽기 1번.
//   - 클라이언트 5분 캐시(메모리 + localStorage). 오프라인/실패 시 localStorage로 폴백.
//   - 쓰기는 TOP 100 안에 들 때만. 신고도 최소.
//
// ⚠️ 저장 항목은 닉네임·점수·최고콤보·정답률·날짜만. 학교명/학년/실명 등 개인정보 저장 금지.
//
// ⚠️ 보안 한계(백엔드 없음): API 키는 비밀이 아니며(클라 코드용) 접근 제어는 Firestore 보안 규칙으로 한다.
//    관리자 비밀번호는 '아이들이 우연히 못 들어오게' 하는 가림막(obscurity)일 뿐 — 소스에 노출되므로
//    진짜 인증이 아니다. 규칙으로 데이터 형태·크기를 제한하고, 진짜 관리자 인증이 필요하면 Cloud Functions가
//    필요하다(현재 무백엔드 제약상 범위 밖). 부정 방지는 §6 수준(최소한)만 가능.

// ── 설정 상수 (사용자 제공) ───────────────────────────────
export const RANKING_CONFIG = {
  projectId: 'md3xx-d7ab5',
  apiKey: 'AIzaSyCEMJAdNrw_VmbQn9B6-Vgd3heDPPqDtf4',
  // 관리자 비밀번호는 평문 대신 솔트 SHA-256 해시로 저장(소스를 봐도 바로 알 수 없게).
  //   ⚠️ 그래도 우회 가능하다: 4자리 PIN은 클라이언트에서 무차별 대입(10^4)이 즉시 가능하고, 관리자
  //      삭제는 결국 클라 쓰기라 Firestore 규칙이 실제 방어선이다. SPEC §랭킹 보안 한계 참고.
  adminSalt: 'mathArcade::rank::admin::',
  adminPasswordHash: 'd160ada1c54f14034c3ef72430a0379aafc5d413d86c8460e5d22d28a8050964', // SHA-256(salt + '0528')
};

// 솔트 SHA-256 hex (crypto.subtle). 관리자 인증 비교용.
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const TOP_N = 100; // 게임당 보관 순위 수
const HIDE_REPORTS = 3; // 이 횟수 이상 신고되면 표시에서 숨김
const CACHE_MS = 5 * 60 * 1000; // 5분 캐시
const SUBMIT_COOLDOWN_MS = 60 * 1000; // 같은 닉 1분 내 재기록 거부
const MAX_POINTS_PER_SEC = 3000; // 부정 방지: 플레이 초당 허용 점수 상한(넉넉히)
const SCORE_BASE_ALLOWANCE = 5000; // + 기본 허용치(짧은 판에도 여유)

const BASE = `https://firestore.googleapis.com/v1/projects/${RANKING_CONFIG.projectId}/databases/(default)/documents`;

// ── Firestore 값 코덱 (REST의 typed value ↔ JS) ───────────
function toValue(v) {
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (v && typeof v === 'object') {
    const fields = {};
    for (const k of Object.keys(v)) fields[k] = toValue(v[k]);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}
function fromValue(val) {
  if (!val) return null;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return val.booleanValue;
  if ('arrayValue' in val) return (val.arrayValue.values || []).map(fromValue);
  if ('mapValue' in val) {
    const o = {};
    const f = (val.mapValue.fields) || {};
    for (const k of Object.keys(f)) o[k] = fromValue(f[k]);
    return o;
  }
  return null;
}

// ── REST 입출력 ───────────────────────────────────────────
async function restGetEntries(gameId) {
  const res = await fetch(`${BASE}/rankings/${encodeURIComponent(gameId)}?key=${RANKING_CONFIG.apiKey}`);
  if (res.status === 404) return []; // 아직 문서 없음
  if (!res.ok) throw new Error(`rank read ${res.status}`);
  const doc = await res.json();
  const f = doc.fields && doc.fields.entries;
  return f ? fromValue(f) : [];
}
async function restPutEntries(gameId, entries) {
  const url = `${BASE}/rankings/${encodeURIComponent(gameId)}?key=${RANKING_CONFIG.apiKey}&updateMask.fieldPaths=entries`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { entries: toValue(entries) } }),
  });
  if (!res.ok) throw new Error(`rank write ${res.status}`);
}

// ── 캐시 (메모리 + localStorage) ──────────────────────────
const memCache = new Map(); // gameId → { entries, at }
function lsKey(gameId) {
  return `mathArcade.rank.cache.${gameId}`;
}
function saveLocal(gameId, entries) {
  try {
    localStorage.setItem(lsKey(gameId), JSON.stringify({ entries, at: Date.now() }));
  } catch (e) {
    /* 무시 */
  }
}
function loadLocal(gameId) {
  try {
    const raw = localStorage.getItem(lsKey(gameId));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function sortTrim(entries) {
  return entries.slice().sort((a, b) => b.score - a.score).slice(0, TOP_N);
}

// ── 공개 API ──────────────────────────────────────────────

// TOP 100 조회. 5분 캐시 사용. 실패/오프라인이면 localStorage 폴백(offline:true).
//   반환: { entries, offline, fromCache }
export async function fetchTop(gameId, { force = false } = {}) {
  const cached = memCache.get(gameId);
  if (!force && cached && Date.now() - cached.at < CACHE_MS) {
    return { entries: cached.entries, offline: false, fromCache: true };
  }
  try {
    const entries = sortTrim(await restGetEntries(gameId));
    memCache.set(gameId, { entries, at: Date.now() });
    saveLocal(gameId, entries);
    return { entries, offline: false, fromCache: false };
  } catch (e) {
    const local = loadLocal(gameId);
    return { entries: local ? local.entries : [], offline: true, fromCache: !!local };
  }
}

// 표시용: 신고 3회 이상 자동 숨김.
export function visibleEntries(entries) {
  return (entries || []).filter((e) => (e.reported || 0) < HIDE_REPORTS);
}

// 점수가 TOP 100 안에 드는가(닉네임 입력 화면을 띄울지 판단).
export function qualifies(entries, score) {
  const list = entries || [];
  if (list.length < TOP_N) return true;
  const min = Math.min(...list.map((e) => e.score));
  return score > min;
}

// 부정 방지(최소한): 플레이 시간 대비 불가능 점수 / 같은 닉 1분 내 반복.
function antiCheat(nick, score, playSeconds) {
  if (typeof playSeconds === 'number' && playSeconds > 0) {
    const ceiling = MAX_POINTS_PER_SEC * playSeconds + SCORE_BASE_ALLOWANCE;
    if (score > ceiling) return { ok: false, reason: 'impossible_score' };
  }
  try {
    const raw = localStorage.getItem('mathArcade.rank.lastSubmit');
    if (raw) {
      const last = JSON.parse(raw);
      if (last.nick === nick && Date.now() - last.at < SUBMIT_COOLDOWN_MS) {
        return { ok: false, reason: 'too_soon' };
      }
    }
  } catch (e) {
    /* 무시 */
  }
  return { ok: true };
}

// 기록 등록. nick은 UI가 nicknameFilter로 이미 검증한 값. entry: {score, maxCombo, accuracy, playSeconds}
//   반환: { ok, rank } 또는 { ok:false, reason }
export async function submit(gameId, nick, data) {
  const ac = antiCheat(nick, data.score, data.playSeconds);
  if (!ac.ok) return { ok: false, reason: ac.reason };

  let entries;
  try {
    entries = sortTrim(await restGetEntries(gameId)); // 경합 최소화 위해 직전 재조회
  } catch (e) {
    return { ok: false, reason: 'offline' };
  }
  if (!qualifies(entries, data.score)) return { ok: false, reason: 'not_top' };

  const entry = {
    id: `${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    nick,
    score: data.score | 0,
    maxCombo: data.maxCombo | 0,
    accuracy: Math.max(0, Math.min(100, Math.round(data.accuracy || 0))),
    date: Date.now(),
    reported: 0,
  };
  const merged = sortTrim([...entries, entry]);
  if (!merged.some((e) => e.id === entry.id)) return { ok: false, reason: 'not_top' }; // 잘려나감

  try {
    await restPutEntries(gameId, merged);
  } catch (e) {
    return { ok: false, reason: 'offline' };
  }
  memCache.set(gameId, { entries: merged, at: Date.now() });
  saveLocal(gameId, merged);
  try {
    localStorage.setItem('mathArcade.rank.lastSubmit', JSON.stringify({ nick, at: Date.now() }));
    localStorage.setItem(`mathArcade.rank.mine.${gameId}`, entry.id); // 내 순위 강조용
  } catch (e) {
    /* 무시 */
  }
  const rank = merged.findIndex((e) => e.id === entry.id) + 1;
  return { ok: true, rank, id: entry.id };
}

// 신고: 해당 기록 reported +1 (읽기 1 + 쓰기 1). 3회 이상이면 표시에서 자동 숨김.
export async function report(gameId, entryId) {
  let entries;
  try {
    entries = await restGetEntries(gameId);
  } catch (e) {
    return { ok: false, reason: 'offline' };
  }
  const target = entries.find((e) => e.id === entryId);
  if (!target) return { ok: false, reason: 'not_found' };
  target.reported = (target.reported || 0) + 1;
  try {
    await restPutEntries(gameId, sortTrim(entries));
  } catch (e) {
    return { ok: false, reason: 'offline' };
  }
  memCache.delete(gameId); // 다음 조회 때 갱신
  return { ok: true, reported: target.reported };
}

// 내 기록 id(강조용) / 자동 닉네임 저장.
export function myEntryId(gameId) {
  try {
    return localStorage.getItem(`mathArcade.rank.mine.${gameId}`);
  } catch (e) {
    return null;
  }
}
export function getSavedNick() {
  try {
    return localStorage.getItem('mathArcade.rank.mynick') || '';
  } catch (e) {
    return '';
  }
}
export function saveNick(nick) {
  try {
    localStorage.setItem('mathArcade.rank.mynick', nick);
  } catch (e) {
    /* 무시 */
  }
}

// ── 관리자 (가림막 수준) ──────────────────────────────────
// 입력 비밀번호를 솔트+해시해 저장된 해시와 비교(평문 노출 방지). ⚠️ 여전히 우회 가능(위 주석).
export async function adminAuth(password) {
  const h = await sha256Hex(RANKING_CONFIG.adminSalt + String(password || ''));
  return h === RANKING_CONFIG.adminPasswordHash;
}
// 신고된(혹은 전체) 목록 조회. password 확인 후 사용.
export async function adminList(gameId) {
  const entries = await restGetEntries(gameId);
  return entries.slice().sort((a, b) => (b.reported || 0) - (a.reported || 0) || b.score - a.score);
}
// 개별 삭제(부적절 이름 수동 삭제). ⚠️ 클라 쓰기라 규칙이 실제 방어선.
export async function adminDelete(gameId, entryId, password) {
  if (!(await adminAuth(password))) return { ok: false, reason: 'auth' };
  let entries;
  try {
    entries = await restGetEntries(gameId);
  } catch (e) {
    return { ok: false, reason: 'offline' };
  }
  const next = entries.filter((e) => e.id !== entryId);
  try {
    await restPutEntries(gameId, sortTrim(next));
  } catch (e) {
    return { ok: false, reason: 'offline' };
  }
  memCache.delete(gameId);
  return { ok: true };
}
