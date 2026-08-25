// problemGenerator.js — 문제 생성 + 오답지 + 복습 큐 + 레벨 조정
// SPEC 2.1(레벨표), 2.2(오답지), 2.3(복습 큐), 2.4(중복 방지)를 모두 구현한다.
//
// 설계 원칙(SPEC 2.1): "수학 난이도(level)" 축은 오직 여기서만 관리한다.
//   게임 로직은 level 값을 읽지 않는다. 게임은 nextProblem({maxLevel})만 호출한다.

// 정수 난수 유틸
function ri(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class ProblemGenerator {
  constructor(settings) {
    // settings: 교사 설정 객체 (연산 종류, 단 선택, 레벨 고정)
    this.settings = settings || {};

    this.currentLevel = 1; // 축 A — 수학 난이도 (1~5)
    this.consecutiveWrong = 0; // 2연속 오답 시 레벨 하향용

    this.recentKeys = []; // 최근 5문제 중복 방지
    this.reviewQueue = []; // 복습 큐 [{problem, dueAt}]
    this.served = 0; // 출제한 문제 수 (복습 due 계산 기준)
  }

  // 교사 설정이 바뀌면 갱신 (레벨 고정 반영)
  setSettings(settings) {
    this.settings = settings || {};
    if (this.settings.fixedLevel) {
      // 레벨 고정 모드: 지정 레벨로 고정
      this.currentLevel = clamp(this.settings.fixedLevelValue || 1, 1, 5);
    }
  }

  reset() {
    this.consecutiveWrong = 0;
    this.recentKeys = [];
    this.reviewQueue = [];
    this.served = 0;
    if (this.settings.fixedLevel) {
      this.currentLevel = clamp(this.settings.fixedLevelValue || 1, 1, 5);
    } else {
      this.currentLevel = 1;
    }
  }

  // ── 레벨 조정 (SPEC 2.1) ─────────────────────────────────
  // 상향: 콤보가 8의 배수에 도달할 때 +1 (최대 5)
  raiseLevel() {
    if (this.settings.fixedLevel) return; // 고정 모드면 조정 안 함
    this.currentLevel = clamp(this.currentLevel + 1, 1, 5);
  }
  // 하향: 2연속 오답 시 -1 (최소 1)
  lowerLevel() {
    if (this.settings.fixedLevel) return;
    this.currentLevel = clamp(this.currentLevel - 1, 1, 5);
  }

  // 정답/오답 결과를 알려주면 복습 큐와 레벨 하향을 관리한다.
  // 레벨 상향은 콤보 기준이라 engine이 raiseLevel()을 직접 호출한다.
  reportResult(problem, correct) {
    if (correct) {
      this.consecutiveWrong = 0;
      // 복습 큐에 있던 문제를 맞히면 큐에서 제거
      this.removeFromReview(problem);
    } else {
      this.consecutiveWrong += 1;
      if (this.consecutiveWrong >= 2) {
        this.lowerLevel();
        this.consecutiveWrong = 0; // 재트리거 방지
      }
      this.addToReview(problem);
    }
  }

  addToReview(problem) {
    // 이미 큐에 있으면 dueAt만 갱신
    const key = problemKey(problem);
    const existing = this.reviewQueue.find((q) => q.key === key);
    const dueAt = this.served + ri(2, 3); // 2~3문제 뒤 재출제 (SPEC 2.3)
    if (existing) {
      existing.dueAt = dueAt;
    } else {
      this.reviewQueue.push({ key, problem: cloneProblem(problem), dueAt });
    }
  }

  removeFromReview(problem) {
    const key = problemKey(problem);
    this.reviewQueue = this.reviewQueue.filter((q) => q.key !== key);
  }

  // ── 다음 문제 ───────────────────────────────────────────
  // maxLevel: 게임별 출제 레벨 상한 (SPEC 2.1 표). 실제 출제 레벨 = min(현재레벨, maxLevel)
  // blankRatio: 빈칸형(□) 출제 비율 (게임 유형별로 다름, 기본 0.25 — SPEC 2.1)
  nextProblem({ maxLevel = 5, blankRatio = 0.25 } = {}) {
    this.served += 1;

    // 1) 복습 큐에서 due가 된 문제가 있으면 우선 출제 (중복 방지 예외)
    const due = this.reviewQueue.find((q) => q.dueAt <= this.served);
    if (due) {
      const p = cloneProblem(due.problem);
      p.fromReview = true;
      return p;
    }

    // 2) 새 문제 생성 (최근 5문제와 중복되지 않을 때까지 재시도)
    const effLevel = clamp(this.currentLevel, 1, Math.max(1, maxLevel));
    let problem = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      const cand = this.generateForLevel(effLevel, blankRatio);
      if (!cand) continue;
      const key = problemKey(cand);
      if (!this.recentKeys.includes(key)) {
        problem = cand;
        break;
      }
    }
    // 30번 시도해도 다 겹치면(문제 공간이 좁은 경우) 그냥 마지막 후보 사용
    if (!problem) problem = this.generateForLevel(effLevel, blankRatio);

    // 최근 목록 갱신 (최대 5개)
    this.recentKeys.push(problemKey(problem));
    if (this.recentKeys.length > 5) this.recentKeys.shift();

    problem.fromReview = false;
    return problem;
  }

  // 설정(연산 모드)을 반영해 해당 레벨의 문제 하나를 만든다.
  // 연산 모드별로 독립된 5단계 사다리를 쓴다 (SPEC 2.1).
  //  - multiply: 곱셈만 사다리 (× 기호만)
  //  - divide:   나눗셈만 사다리 (÷ 기호만, □×형 미출제)
  //  - mixed:    혼합 사다리 (□×, ÷□ 빈칸 모두 가능)
  generateForLevel(level, blankRatio = 0.25) {
    const mode = this.settings.operation || 'mixed';
    if (mode === 'multiply') return this.genMultiplyOnly(level);
    if (mode === 'divide') return this.genDivideOnly(level, blankRatio);
    return this.genMixed(level, blankRatio);
  }

  // 활성화된 단(dan) 목록 (교사 설정). 없으면 전체 2~9
  activeDans(range) {
    let dans = this.settings.dans && this.settings.dans.length ? this.settings.dans.slice() : [2, 3, 4, 5, 6, 7, 8, 9];
    // 레벨별 허용 범위와 교집합
    dans = dans.filter((d) => range.includes(d));
    if (!dans.length) dans = range.slice(); // 교집합이 비면 레벨 기본 범위 사용
    return dans;
  }

  // ── 곱셈만 모드 사다리 ───────────────────────────────────
  genMultiplyOnly(level) {
    switch (level) {
      case 1:
        return this.mkGugudan([2, 3, 4, 5], 1); // 곱셈구구 2~5단
      case 2:
        return this.mkGugudan([6, 7, 8, 9], 2); // 곱셈구구 6~9단
      case 3:
        return this.mkTwoByOne(false, 3); // 두 자리×한 자리 올림 없음 (21×3)
      case 4:
        return this.mkTwoByOne(true, 4); // 두 자리×한 자리 올림 있음 (47×2)
      default:
        return this.mkThreeByOne(5); // 세 자리×한 자리
    }
  }

  // ── 나눗셈만 모드 사다리 ─────────────────────────────────
  // ⚠️ 이 모드에서는 □×7=42 형태(× 기호)를 출제하지 않는다 (SPEC 3.9).
  genDivideOnly(level, blankRatio) {
    switch (level) {
      case 1:
        return this.mkDivGugudan([2, 3, 4, 5], 1); // 2~5단 역산
      case 2:
        return this.mkDivGugudan([6, 7, 8, 9], 2); // 6~9단 역산
      case 3: {
        // 빈칸 역산(48÷□=6) blankRatio + 6~9단 역산 나눗셈 나머지.
        // ⚠️ Lv3은 6~9단만. 2~5단 나눗셈(16÷2 등)은 Lv1~2 전용이라 여기서 금지.
        const base = this.mkDivGugudan([6, 7, 8, 9], 3);
        if (blankRatio > 0 && Math.random() < blankRatio) return this.toBlankDiv(base);
        return base;
      }
      case 4:
        return this.mkTwoDivOne(false, 4); // 두 자리÷한 자리 나누어떨어짐 (96÷4)
      default:
        return this.mkTwoDivOne(true, 5); // 나머지 있는 나눗셈
    }
  }

  // ── 혼합 모드 사다리 (SPEC 2.1 원본) ─────────────────────
  genMixed(level, blankRatio) {
    switch (level) {
      case 1:
        return this.mkGugudan([2, 3, 4, 5], 1);
      case 2:
        return this.mkGugudan([6, 7, 8, 9], 2);
      case 3: {
        // 나눗셈 역산 + 빈칸(□× 와 ÷□ 둘 다 가능)
        // ⚠️ Lv3은 6~9단만. 2~5단 나눗셈은 Lv1~2 전용.
        const base = this.mkDivGugudan([6, 7, 8, 9], 3);
        if (blankRatio > 0 && Math.random() < blankRatio) {
          return Math.random() < 0.5 ? this.toBlankTimes(base) : this.toBlankDiv(base);
        }
        return base;
      }
      case 4:
        // 두 자리×한 자리(올림 포함) 또는 두 자리÷한 자리(나누어떨어짐)
        return Math.random() < 0.5 ? this.mkTwoByOne(true, 4) : this.mkTwoDivOne(false, 4);
      default:
        // 세 자리×한 자리 또는 나머지 있는 나눗셈
        return Math.random() < 0.5 ? this.mkThreeByOne(5) : this.mkTwoDivOne(true, 5);
    }
  }

  // ── 문제 빌더 ───────────────────────────────────────────
  mkGugudan(range, level) {
    const a = pick(this.activeDans(range)); // 단 = 2~9 (항상 ≥2)
    const b = ri(2, 9); // ×1 자명값 금지 (규칙2)
    return mkProblem(a, b, '×', a * b, null, level);
  }

  // 두 자리 × 한 자리. carry=올림 발생 여부 지정.
  mkTwoByOne(carry, level) {
    let a = 23,
      b = 3,
      guard = 0;
    do {
      a = ri(11, 99);
      b = ri(2, 9);
      guard++;
    } while (hasCarry(a, b) !== carry && guard < 80);
    return mkProblem(a, b, '×', a * b, null, level);
  }

  mkThreeByOne(level) {
    // 백의 자리를 1~4로 제한 (규칙3). 553×8 같은 큰 수 금지.
    const a = ri(1, 4) * 100 + ri(0, 99); // 100~499
    const b = ri(2, 9);
    return mkProblem(a, b, '×', a * b, null, level);
  }

  // 구구단 역산 나눗셈 (나누어떨어짐). range=제수 범위.
  // 몫 하한(규칙1): Lv3 이상은 몫 ≥ 3, Lv1~2는 몫 ≥ 2. 몫 1·제수 1 금지.
  mkDivGugudan(range, level) {
    const divisor = pick(this.activeDans(range)); // 제수 = 2~9 (항상 ≥2)
    const qMin = level >= 3 ? 3 : 2;
    const quotient = ri(qMin, 9);
    const dividend = divisor * quotient;
    return mkProblem(dividend, divisor, '÷', quotient, null, level);
  }

  // 두 자리 ÷ 한 자리. withRemainder면 나머지>0, 아니면 나누어떨어짐. 피제수는 두 자리 보장.
  mkTwoDivOne(withRemainder, level) {
    const divisor = pick(this.activeDans([2, 3, 4, 5, 6, 7, 8, 9]));
    // 몫 하한(규칙1): Lv3 이상 몫 ≥ 3
    const minQ = level >= 3 ? 3 : 2;
    const qMin = Math.max(minQ, Math.ceil(10 / divisor));
    // 나머지 최대(divisor-1)까지 더해도 두 자리(≤99)를 넘지 않도록 몫 상한 계산
    const maxDividend = withRemainder ? 99 - (divisor - 1) : 99;
    const qMax = Math.max(qMin, Math.floor(maxDividend / divisor));
    const quotient = ri(qMin, qMax);
    const remainder = withRemainder ? ri(1, divisor - 1) : 0;
    const dividend = divisor * quotient + remainder;
    return mkProblem(dividend, divisor, '÷', quotient, withRemainder ? remainder : null, level);
  }

  // 나눗셈(dividend÷divisor=quotient) → □×divisor=dividend 형태 (답=몫, × 기호). 혼합 모드 전용.
  toBlankTimes(p) {
    const q = mkProblem(p.answer, p.b, '×', p.answer, null, p.level); // a=몫, b=제수, answer=몫
    q.blank = 'a';
    q.text = `□ × ${p.b} = ${p.a}`;
    return q;
  }

  // 나눗셈 → dividend ÷ □ = quotient 형태 (답=제수, ÷ 기호).
  toBlankDiv(p) {
    const q = mkProblem(p.a, p.b, '÷', p.b, null, p.level); // a=피제수, b=제수, answer=제수
    q.blank = 'b';
    q.text = `${p.a} ÷ □ = ${p.answer}`;
    return q;
  }

  // ── 오답지 생성 (SPEC 2.2) ───────────────────────────────
  // count: 필요한 오답 개수. closeness: 0~1, 높을수록 정답에 가까운 오답.
  makeDistractors(problem, count, closeness = 0.5) {
    const answer = problem.answer;
    const a = problem.a;
    const b = problem.b;
    const isDiv = problem.op === '÷' && problem.blank == null;
    const lowLevel = (problem.level || 1) <= 2;

    // 답 자릿수/유형별 분기 (SPEC 2.2 확장)
    if (isDiv && answer >= 10) return this._distractorsDivTwoDigit(problem, count);
    if (!isDiv && answer >= 100) return this._distractorsBigProduct(problem, count);

    // 이하: 답이 두 자리 이하인 경우 기존 전략
    const candidates = new Set();

    // 전략 1: 인접 구구단 값 (a±, b±의 곱) — 가까운 오답
    for (const da of [-1, 0, 1]) {
      for (const db of [-1, 0, 1]) {
        if (da === 0 && db === 0) continue;
        const na = a + da;
        const nb = b + db;
        if (na > 0 && nb > 0) candidates.add(na * nb);
      }
    }
    // 전략 6: 나눗셈 몫 오차 (±1, ±2)
    if (isDiv) {
      for (const d of [-2, -1, 1, 2]) candidates.add(answer + d);
    }
    // 전략 2: 자릿수 뒤집기
    const rev = reverseDigits(answer);
    if (rev !== answer) candidates.add(rev);
    // 전략 3: 덧셈 혼동 값 (Lv1~2에서만)
    if (lowLevel) candidates.add(a + b);
    // 전략 4: ±1, ±2 근접값 (가까움)
    for (const d of [-2, -1, 1, 2]) candidates.add(answer + d);
    // 전략 5: ±10 근접값 (멂)
    for (const d of [-10, 10, -20, 20]) candidates.add(answer + d);

    // 유효성: 양의 정수 & 정답과 다름
    let pool = [...candidates].filter((v) => Number.isInteger(v) && v > 0 && v !== answer);

    // closeness에 따라 정렬 (가까운 것 우선/먼 것 우선)
    pool.sort((x, y) => Math.abs(x - answer) - Math.abs(y - answer));
    if (closeness < 0.5) {
      // 콤보 낮음 → 먼 오답 우선 (SPEC 2.2: 낮을 때 멀리)
      pool.reverse();
    } else {
      // 높음 → 가까운 오답 우선. 단, 완전 결정적이면 지루하니 상위군에서 셔플
    }

    // 상위 후보군에서 약간의 무작위성 부여
    const topN = Math.min(pool.length, count + 4);
    const top = shuffle(pool.slice(0, topN));

    const result = [];
    for (const v of top) {
      if (result.length >= count) break;
      if (!result.includes(v)) result.push(v);
    }

    // 후보 부족 시: 정답 ±무작위(1~15)로 채운다 (SPEC 2.2 제약)
    let guard = 0;
    while (result.length < count && guard < 200) {
      guard++;
      const delta = ri(1, 15) * (Math.random() < 0.5 ? -1 : 1);
      const v = answer + delta;
      if (v > 0 && v !== answer && !result.includes(v)) result.push(v);
    }
    return result.slice(0, count);
  }

  // 답이 세 자리 이상인 곱셈 오답: 올림 관련 실수 위주.
  // ⚠️ ±1, ±2, 자릿수 뒤집기 금지.
  _distractorsBigProduct(problem, count) {
    const { a, b, answer } = problem;
    const cands = new Set();

    // 올림 누락: 일의 자리에서 올려야 할 값을 빼먹음 (47×7=329 → 289)
    const onesCarry = Math.floor(((a % 10) * b) / 10);
    if (onesCarry > 0) cands.add(answer - onesCarry * 10);
    // 올림 오류: 올림을 잘못 더함 (329 → 349)
    cands.add(answer + 10);
    cands.add(answer + 20);
    // 한 자리 오답: a의 한 자리를 ±1로 잘못 계산 (47×7을 37×7로 등)
    const digits = String(Math.abs(a)).length;
    for (let k = 0; k < digits; k++) {
      const place = Math.pow(10, k);
      for (const d of [-1, 1]) {
        const a2 = a + d * place;
        if (a2 > 0 && a2 !== a) cands.add(a2 * b);
      }
    }
    // ±10, ±100
    for (const d of [-10, 10, -100, 100]) cands.add(answer + d);

    const rev = reverseDigits(answer);
    // 유효성: 양의 정수·정답과 다름·±1/±2 및 자릿수 뒤집기 제외
    const pool = [...cands].filter(
      (v) => Number.isInteger(v) && v > 0 && v !== answer && Math.abs(v - answer) > 2 && v !== rev
    );
    const result = shuffle(pool).slice(0, count);

    // 부족 시 ±10 단위로 채움 (±1,±2 회피)
    let guard = 0;
    while (result.length < count && guard < 200) {
      guard++;
      const v = answer + ri(1, 15) * 10 * (Math.random() < 0.5 ? -1 : 1);
      if (v > 0 && v !== answer && !result.includes(v)) result.push(v);
    }
    return result.slice(0, count);
  }

  // 몫이 두 자리인 나눗셈 오답: 혼동·자릿수 실수 위주.
  // ⚠️ ±1은 최대 1개.
  _distractorsDivTwoDigit(problem, count) {
    const { a, b, answer } = problem;
    const cands = [];
    const push = (v) => {
      if (Number.isInteger(v) && v > 0 && v !== answer && !cands.includes(v)) cands.push(v);
    };
    push(b); // 나누는 수와 몫 혼동 (60÷5=12 → 5)
    push(Math.floor(answer / 2)); // ÷2 오류 (12 → 6)
    push(answer * 2); // ×2 오류 (12 → 24)
    push(a % 10 === 0 ? Math.floor(a / 10) : null); // 자릿수 착각 (60÷5 → 6)
    push(Math.floor(answer / 10)); // 자릿수 착각 (12 → 1)
    push(reverseDigits(answer)); // 자릿수 뒤집기 (12 → 21)
    push(Math.random() < 0.5 ? answer - 1 : answer + 1); // ±1 후보

    // 선택: |v-answer|≤1(±1)인 값은 최대 1개만 채택 (제수가 우연히 답±1인 경우 포함)
    const result = [];
    let near1Used = 0;
    for (const v of shuffle(cands)) {
      if (result.length >= count) break;
      const near1 = Math.abs(v - answer) <= 1;
      if (near1 && near1Used >= 1) continue;
      result.push(v);
      if (near1) near1Used++;
    }
    // 부족 시 ±(2~12)로 채움 (추가 ±1 금지)
    let guard = 0;
    while (result.length < count && guard < 200) {
      guard++;
      const v = answer + ri(2, 12) * (Math.random() < 0.5 ? -1 : 1);
      if (v > 0 && v !== answer && !result.includes(v)) result.push(v);
    }
    return result.slice(0, count);
  }
}

// ── 헬퍼 ───────────────────────────────────────────────────
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function hasCarry(a, b) {
  // a(두 자리) × b(한 자리)에서 올림이 발생하는지 (일의 자리 곱이 10 이상)
  const ones = a % 10;
  if (ones * b >= 10) return true;
  const tens = Math.floor(a / 10) % 10;
  return tens * b >= 10;
}

function reverseDigits(n) {
  return parseInt(String(n).split('').reverse().join(''), 10);
}

function mkProblem(a, b, op, answer, remainder, level) {
  const text = `${a} ${op} ${b}`;
  return { a, b, op, answer, remainder: remainder == null ? null : remainder, level, text, blank: null };
}

function cloneProblem(p) {
  return { ...p };
}

// 문제 식별 키 (중복/복습 판정용)
function problemKey(p) {
  return `${p.a}${p.op}${p.b}|${p.blank || ''}|${p.answer}`;
}
