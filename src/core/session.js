// session.js — 세션 기록 (SPEC 3.7)
// 복습 큐(problemGenerator)와 학습 리포트(reportScene)가 이 기록을 공유한다.
// current: 이번 판의 기록 (결과 화면 '틀린 문제 다시보기'용)
// 영구: mathArcade.report 에 최근 200개 누적 (단별 정답률 집계용)

import { storage } from './storage.js';

const REPORT_MAX = 200;

export class Session {
  constructor() {
    this.current = []; // 이번 판 기록
  }

  startGame() {
    this.current = [];
  }

  // SPEC 3.7 구조 그대로 기록
  record({ gameId, question, userAnswer, correct, responseMs }) {
    const entry = {
      gameId,
      question: {
        text: question.text,
        a: question.a,
        b: question.b,
        op: question.op,
        answer: question.answer,
        remainder: question.remainder ?? null,
        level: question.level,
        blank: question.blank ?? null,
      },
      userAnswer,
      correct,
      responseMs,
      timestamp: Date.now(),
    };
    this.current.push(entry);

    // 영구 리포트에 누적 (최근 200개 유지)
    const report = storage.get('report', []);
    report.push(entry);
    if (report.length > REPORT_MAX) report.splice(0, report.length - REPORT_MAX);
    storage.set('report', report);
  }

  // 이번 판에서 틀린 문제 목록 (결과 화면용). 중복 문제는 1개로.
  getWrongList() {
    const seen = new Set();
    const out = [];
    for (const e of this.current) {
      if (e.correct) continue;
      const k = e.question.text + '=' + e.question.answer;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e.question);
    }
    return out;
  }

  static getReport() {
    return storage.get('report', []);
  }
  static clearReport() {
    storage.remove('report');
  }
}
