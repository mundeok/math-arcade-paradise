// storage.js — localStorage 래퍼
// 왜: 교실 태블릿/사파리 시크릿 모드 등 localStorage가 막힌 환경에서도 게임이 죽으면 안 된다.
//     모든 접근을 try/catch로 감싸고, 실패 시 메모리 폴백 객체를 쓴다.

const NS = 'mathArcade.'; // 네임스페이스 (SPEC 1.4)

// localStorage 차단 환경용 인메모리 폴백
const memoryFallback = new Map();

let available = true;
try {
  const t = '__mathArcade_test__';
  window.localStorage.setItem(t, '1');
  window.localStorage.removeItem(t);
} catch (e) {
  // 왜: 프라이빗 모드 등에서 setItem이 예외를 던진다. 이 경우 메모리 폴백으로 조용히 전환.
  available = false;
}

export const storage = {
  isPersistent() {
    return available;
  },

  // 원시 문자열 저장
  setRaw(key, value) {
    const k = NS + key;
    try {
      if (available) {
        window.localStorage.setItem(k, value);
        return true;
      }
    } catch (e) {
      // 저장 실패 시(용량 초과 등) 폴백으로
      available = false;
    }
    memoryFallback.set(k, value);
    return false;
  },

  getRaw(key) {
    const k = NS + key;
    try {
      if (available) {
        return window.localStorage.getItem(k);
      }
    } catch (e) {
      available = false;
    }
    return memoryFallback.has(k) ? memoryFallback.get(k) : null;
  },

  // JSON 객체 저장/로드
  set(key, obj) {
    try {
      return this.setRaw(key, JSON.stringify(obj));
    } catch (e) {
      return false;
    }
  },

  get(key, fallback = null) {
    const raw = this.getRaw(key);
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },

  remove(key) {
    const k = NS + key;
    try {
      if (available) window.localStorage.removeItem(k);
    } catch (e) {
      /* 무시 */
    }
    memoryFallback.delete(k);
  },
};
