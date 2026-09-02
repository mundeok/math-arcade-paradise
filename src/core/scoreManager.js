// scoreManager.js — 점수·콤보·라이프·별등급·업적 (SPEC 3.2~3.6)
// 게임별 독립 상태다. 게임 시작 시 reset(gameId)로 초기화한다.

import { storage } from './storage.js';

const LIFE_MAX = 5;
const LIFE_START = 3;
const RECOVER_LIMIT = 2; // 게임당 최대 회복 2회
const RECOVER_MILESTONES = [10, 20, 30]; // 콤보 회복 마일스톤

export class ScoreManager {
  constructor() {
    this.reset(null);
  }

  reset(gameId) {
    this.gameId = gameId;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lives = LIFE_START;
    this.correctCount = 0;
    this.totalCount = 0;

    // 라이프 회복 중복 차단 (SPEC 3.2). Set으로 도달 마일스톤 기록.
    this.recoveredMilestones = new Set();
    this.recoverCount = 0;

    // 콤보 마일스톤 연출 1회성 발생 추적
    this.firedComboMilestones = new Set();

    // 마지막 registerCorrect에서 라이프가 회복됐는지 (연출용)
    this.lastRecovered = false;
  }

  // 정답 처리. points를 더하고 콤보를 올리며 라이프 회복을 판정한다.
  // 반환: { combo, recovered, milestone } — 연출에 사용
  registerCorrect(points) {
    this.combo += 1;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.score += points;
    this.correctCount += 1;
    this.totalCount += 1;

    // 라이프 회복: 콤보 10/20/30 최초 도달 시 각 1회 (Set으로 중복 차단)
    this.lastRecovered = false;
    for (const m of RECOVER_MILESTONES) {
      if (this.combo >= m && !this.recoveredMilestones.has(m)) {
        this.recoveredMilestones.add(m);
        if (this.recoverCount < RECOVER_LIMIT && this.lives < LIFE_MAX) {
          this.lives += 1;
          this.recoverCount += 1;
          this.lastRecovered = true;
        }
      }
    }

    // 콤보 연출 마일스톤 (5/10/20/30) — 최초 1회만 true
    let milestone = null;
    for (const m of [5, 10, 20, 30]) {
      if (this.combo === m && !this.firedComboMilestones.has(m)) {
        this.firedComboMilestones.add(m);
        milestone = m;
      }
    }

    return { combo: this.combo, recovered: this.lastRecovered, milestone };
  }

  // 콤보·판정과 분리된 순수 점수 가산 (SPEC §7).
  //   정답 '판정'이 아닌 보너스(니어미스, 벌룬 개별 팝 등)에 쓴다.
  //   → 콤보를 건드리지 않고, 세션 기록도 남기지 않으며, 정답 카운트에도 넣지 않는다.
  addPoints(points) {
    this.score += points;
    return this.score;
  }

  // 오답/시간초과 처리. loseLife=false면 라이프 유지(반사신경 게임 등).
  // 반환: { gameOver }
  registerWrong({ loseLife = true } = {}) {
    this.combo = 0;
    this.totalCount += 1;
    if (loseLife) {
      this.lives = Math.max(0, this.lives - 1);
    }
    return { gameOver: this.lives <= 0 };
  }

  get accuracy() {
    if (this.totalCount === 0) return 0;
    return this.correctCount / this.totalCount;
  }

  // 공통 속도 배수 (전 게임 공통, SPEC §3.4). 속도 개념이 있는 게임이 자기 속도 계산에 곱해 쓴다.
  //   = 1 + 콤보 즉각항(최대 +0.3) + 점수 세션항(점수/3000 × 0.1). 상한 1.6배(하드 클램프).
  //   콤보는 오답에 리셋되는 즉각 보상, 점수는 깎이지 않아 세션이 길수록 자연히 빨라지는 상승감.
  //   ⚠️ 이 값은 '가산'일 뿐이며, 게임별 안전장치(라이프1 상한·최소 통과시간·속도 상한 등)를 넘어서면
  //      안 된다. 각 게임은 이 배수를 곱한 뒤 자신의 안전장치 클램프를 뒤에 적용해야 한다.
  get speedFactor() {
    const comboTerm = Math.min(0.3, this.combo * 0.02); // 즉각 보상(콤보 15에서 +0.3 포화)
    const scoreTerm = (this.score / 3000) * 0.1; // 세션 상승감(점수 누적)
    return Math.min(1.6, 1 + comboTerm + scoreTerm);
  }

  // 별 등급 (SPEC 3.5). 정답률 0~1 입력 기준.
  getStars() {
    const acc = this.accuracy;
    if (acc >= 0.95) return 5;
    if (acc >= 0.85) return 4;
    if (acc >= 0.7) return 3;
    if (acc >= 0.5) return 2;
    return 1;
  }

  // 업적 판정 (SPEC 3.6). 최고 콤보 기준.
  getEarnedAchievements() {
    const out = [];
    if (this.maxCombo >= 5) out.push('bronze');
    if (this.maxCombo >= 15) out.push('silver');
    if (this.maxCombo >= 30) out.push('gold');
    return out;
  }

  // ── 영구 저장 (SPEC 3.8) ─────────────────────────────────
  // 최고점수 TOP 5 저장 후, 갱신된 목록 반환
  saveHighScore() {
    if (!this.gameId) return [];
    const key = `highScores.${this.gameId}`;
    const list = storage.get(key, []);
    list.push({
      score: this.score,
      combo: this.maxCombo,
      accuracy: Math.round(this.accuracy * 100),
      date: new Date().toISOString().slice(0, 10),
    });
    list.sort((a, b) => b.score - a.score);
    const top5 = list.slice(0, 5);
    storage.set(key, top5);
    return top5;
  }

  // 업적 병합 저장. 새로 달성한 업적만 반환.
  saveAchievements() {
    if (!this.gameId) return [];
    const key = 'achievements';
    const all = storage.get(key, {});
    const prev = new Set(all[this.gameId] || []);
    const earned = this.getEarnedAchievements();
    const newly = earned.filter((a) => !prev.has(a));
    for (const a of earned) prev.add(a);
    all[this.gameId] = [...prev];
    storage.set(key, all);
    return newly;
  }

  static getHighScores(gameId) {
    return storage.get(`highScores.${gameId}`, []);
  }
  static getAchievements(gameId) {
    const all = storage.get('achievements', {});
    return all[gameId] || [];
  }
}
