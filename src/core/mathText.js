// mathText.js — 문제를 사람이 읽는 식 문자열로 변환
// 오답 피드백(SPEC 2.3)과 결과 화면의 '틀린 문제 다시보기'가 공유한다.

// 문제의 "전체 식"을 표시용 줄 배열로 반환한다.
// 나머지 있는 나눗셈은 2줄: "17 ÷ 5 = 3 … 2" + "17 = 5 × 3 + 2"
export function fullEquationLines(p) {
  if (p.op === '÷') {
    // 빈칸형 나눗셈(a ÷ □ = 몫)도 완성식으로
    const quotient = p.blank === 'b' ? Math.floor(p.a / p.b) : p.answer;
    if (p.remainder != null && p.remainder > 0) {
      return [
        `${p.a} ÷ ${p.b} = ${p.answer} … ${p.remainder}`,
        `${p.a} = ${p.b} × ${p.answer} + ${p.remainder}`,
      ];
    }
    return [`${p.a} ÷ ${p.b} = ${quotient}`];
  }
  // 곱셈 (빈칸형 □ × b = 곱 포함): a × b = a*b 로 완성
  return [`${p.a} × ${p.b} = ${p.a * p.b}`];
}

// 한 줄 요약 (결과 화면 목록용). 원래 문제 형태(빈칸 포함) + 정답.
export function oneLineEquation(p) {
  if (p.blank === 'a') return `□ × ${p.b} = ${p.a * p.b}  (답 ${p.answer})`;
  if (p.blank === 'b') return `${p.a} ÷ □ = ${Math.floor(p.a / p.b)}  (답 ${p.answer})`;
  if (p.op === '÷' && p.remainder != null && p.remainder > 0) {
    return `${p.a} ÷ ${p.b} = ${p.answer} … ${p.remainder}`;
  }
  return `${p.text} = ${p.answer}`;
}
