// 여섯 문제를 먼저 만들고 그 답으로 판을 구성한다. 중복 답 후보는 출제 수로 세지 않는다.
// 복습 큐의 원본은 지우지 않는다: 실제 정답 기록 시 core가 제거한다.
export function createBalloonBoard(generator, options, count = 6) {
  const probe = Object.assign(Object.create(Object.getPrototypeOf(generator)), generator, {
    recentKeys: generator.recentKeys.slice(), reviewQueue: generator.reviewQueue.slice(),
  });
  const problems = [], answers = new Set();
  for (let attempt = 0; attempt < 600 && problems.length < count; attempt++) {
    const served = probe.served, recent = probe.recentKeys.slice();
    const p = probe.nextProblem(options);
    if (!Number.isFinite(p.answer) || answers.has(p.answer)) {
      probe.served = served; probe.recentKeys = recent;
      // 같은 답을 가진 복습은 이번 판에서 제외하되 원본 큐에는 보존한다.
      probe.reviewQueue = probe.reviewQueue.filter(q => q.problem.answer !== p.answer);
      continue;
    }
    problems.push(p); answers.add(p.answer);
    probe.reviewQueue = probe.reviewQueue.filter(q => q.problem.answer !== p.answer);
  }
  if (problems.length !== count) throw new Error('현재 출제 범위에서 서로 다른 정답 6개를 구성하지 못했습니다.');
  generator.served = probe.served;
  generator.recentKeys = probe.recentKeys;
  return problems;
}
