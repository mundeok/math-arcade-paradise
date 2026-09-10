// resultScene.js — 결과 화면 (Phase0 §10)
// 최종점수 / 최고콤보 / 정답률 / 별등급 / 틀린 문제 다시보기 목록 / [다시하기] [메뉴로]

import { LOGICAL_W, LOGICAL_H, SAFE, THEME, font, roundRect, hit } from '../core/ui.js';
import { oneLineEquation } from '../core/mathText.js';
import * as ranking from '../core/ranking.js';
import { promptNickname } from '../core/overlayInput.js';

// 결과 화면 '의견 보내기' → 구글 폼(새 탭). ⚠️ 폼을 만든 뒤 이 URL만 바꾸면 된다.
//   문항 예시: 1) 제일 재밌었던 게임 2) 어려웠던 점(주관식) 3) 학년.
const FEEDBACK_FORM_URL = 'https://forms.gle/REPLACE_WITH_YOUR_FORM';

export const resultScene = {
  enter(engine) {
    this.engine = engine;
    this.game = engine.game;

    // 기록 저장 (SPEC 3.8) — enter 시 1회
    this.topScores = engine.scoreManager.saveHighScore();
    this.newAchievements = engine.scoreManager.saveAchievements();
    this.stars = engine.scoreManager.getStars();
    this.wrongList = engine.session.getWrongList();

    // 팡파레 (효과음 ON일 때만 소리남)
    engine.sound.play('fanfare');

    this.retryBtn = { x: SAFE, y: LOGICAL_H - SAFE - 130, w: (LOGICAL_W - SAFE * 3) / 2, h: 130, label: '🔄 다시하기' };
    this.menuBtn = {
      x: SAFE * 2 + (LOGICAL_W - SAFE * 3) / 2,
      y: LOGICAL_H - SAFE - 130,
      w: (LOGICAL_W - SAFE * 3) / 2,
      h: 130,
      label: '🏠 메뉴로',
    };
    this.hoverPt = null;

    // 의견 보내기(작고 눈에 안 띄게 — 좌상단). 탭하면 구글 폼을 새 탭으로 연다.
    this.feedbackBtn = { x: SAFE, y: SAFE, w: 200, h: 58, label: '💬 의견 보내기' };

    // ── 온라인 랭킹 등록 훅 (SPEC §랭킹) — 게임 파일은 건드리지 않고 결과 화면에서만 호출 ──
    this.rankBtn = { x: SAFE, y: this.retryBtn.y - 128, w: LOGICAL_W - SAFE * 2, h: 106 };
    this.rankStatus = 'checking'; // 'checking'|'canRank'|'no'|'offline'
    this.submitted = false;
    this.submitting = false;
    this.myRank = 0;
    // 플레이 시간(부정 방지용) — 세션 기록 타임스탬프에서 도출.
    const ts = engine.session.current.map((x) => x.timestamp);
    this.playSeconds = ts.length > 1 ? (Math.max(...ts) - Math.min(...ts)) / 1000 : 0;
    this._checkRank();
  },

  async _checkRank() {
    const e = this.engine;
    const score = e.scoreManager.score;
    if (score <= 0) {
      this.rankStatus = 'no';
      return;
    }
    const res = await ranking.fetchTop(this.game.id);
    if (!this.engine || this.engine.scene !== this) return; // 화면 이탈 시 폐기
    if (res.offline) this.rankStatus = 'offline';
    else this.rankStatus = ranking.qualifies(res.entries, score) ? 'canRank' : 'no';
  },

  async _register() {
    const e = this.engine;
    const nick = await promptNickname(ranking.getSavedNick());
    if (nick == null) return; // 취소
    ranking.saveNick(nick);
    this.submitting = true;
    const sm = e.scoreManager;
    const r = await ranking.submit(this.game.id, nick, {
      score: sm.score,
      maxCombo: sm.maxCombo,
      accuracy: Math.round((sm.accuracy || 0) * 100),
      playSeconds: this.playSeconds,
    });
    this.submitting = false;
    if (!this.engine || this.engine.scene !== this) return;
    if (r.ok) {
      this.submitted = true;
      this.myRank = r.rank;
      e.ui.showComboText(`🏆 ${r.rank}위!`, true);
    } else {
      const msg = {
        not_top: '아쉽! 순위 밖이에요',
        too_soon: '잠시 후 다시 시도해요',
        impossible_score: '점수를 확인할 수 없어요',
        offline: '인터넷 연결을 확인해주세요',
        nick: '다른 이름을 써주세요',
      }[r.reason] || '등록에 실패했어요';
      e.ui.showComboText(msg, false);
    }
  },

  update() {},

  render(ctx) {
    const e = this.engine;
    const sm = e.scoreManager;
    const cx = LOGICAL_W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 제목 (긍정적 문구 — SPEC 2.5)
    ctx.fillStyle = THEME.gold;
    ctx.font = font(60);
    ctx.fillText('잘했어요! 🎉', cx, 110);

    // 별 등급
    let starStr = '';
    for (let i = 0; i < 5; i++) starStr += i < this.stars ? '⭐' : '☆';
    ctx.font = font(64);
    ctx.fillText(starStr, cx, 210);

    // 점수 패널
    roundRect(ctx, SAFE, 280, LOGICAL_W - SAFE * 2, 230, 24);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    ctx.fillStyle = THEME.text;
    ctx.font = font(44);
    ctx.fillText(`최종 점수  ${sm.score}점`, cx, 340);
    ctx.font = font(36);
    ctx.fillStyle = THEME.subtext;
    ctx.fillText(`최고 콤보 ${sm.maxCombo}   ·   정답률 ${Math.round(sm.accuracy * 100)}%`, cx, 410);
    ctx.fillText(`맞힘 ${sm.correctCount} / 총 ${sm.totalCount}문제`, cx, 460);

    // 새 업적
    if (this.newAchievements.length) {
      const map = { bronze: '🥉 초급', silver: '🥈 중급', gold: '🥇 고급' };
      ctx.fillStyle = THEME.gold;
      ctx.font = font(34);
      ctx.fillText('새 업적: ' + this.newAchievements.map((a) => map[a]).join('  '), cx, 505);
    }

    // 틀린 문제 다시보기
    ctx.textAlign = 'left';
    ctx.fillStyle = THEME.text;
    ctx.font = font(38);
    ctx.fillText('📒 틀린 문제 다시보기', SAFE, 570);

    const listTop = 610;
    const listH = this.rankBtn.y - 40 - listTop; // 랭킹 버튼/상태줄 자리를 남긴다
    roundRect(ctx, SAFE, listTop, LOGICAL_W - SAFE * 2, listH, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();

    ctx.font = font(34, 'normal');
    if (this.wrongList.length === 0) {
      ctx.fillStyle = THEME.correct;
      ctx.textAlign = 'center';
      ctx.font = font(40);
      ctx.fillText('전부 맞혔어요! 완벽해요 💯', cx, listTop + listH / 2);
      ctx.textAlign = 'left';
    } else {
      let yy = listTop + 46;
      const maxRows = Math.floor((listH - 20) / 52);
      const shown = this.wrongList.slice(0, maxRows);
      ctx.fillStyle = THEME.text;
      for (const q of shown) {
        ctx.fillText('• ' + oneLineEquation(q), SAFE + 24, yy);
        yy += 52;
      }
      if (this.wrongList.length > maxRows) {
        ctx.fillStyle = THEME.subtext;
        ctx.fillText(`… 외 ${this.wrongList.length - maxRows}문제 더`, SAFE + 24, yy);
      }
    }

    // 랭킹 등록/보기
    this._drawRank(ctx);

    // 버튼
    ctx.textAlign = 'center';
    for (const b of [this.retryBtn, this.menuBtn]) {
      roundRect(ctx, b.x, b.y, b.w, b.h, 24);
      ctx.fillStyle = b === this.retryBtn ? THEME.correct : THEME.panel;
      ctx.fill();
      if (this.hoverPt && hit(b, this.hoverPt.x, this.hoverPt.y)) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fill();
      }
      ctx.fillStyle = '#fff';
      ctx.font = font(42);
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    }

    // 의견 보내기(작고 은은하게)
    const fb = this.feedbackBtn;
    roundRect(ctx, fb.x, fb.y, fb.w, fb.h, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    if (this.hoverPt && hit(fb, this.hoverPt.x, this.hoverPt.y)) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
    }
    ctx.fillStyle = THEME.subtext;
    ctx.font = font(26, 'normal');
    ctx.fillText(fb.label, fb.x + fb.w / 2, fb.y + fb.h / 2);
  },

  // 랭킹 상태줄 + 버튼(등록 가능하면 등록, 아니면 보기).
  _drawRank(ctx) {
    const b = this.rankBtn;
    const cx = LOGICAL_W / 2;
    let status = '';
    let label = '🏅 랭킹 보기';
    let color = THEME.panel;
    if (this.rankStatus === 'checking') {
      status = '랭킹 확인 중…';
    } else if (this.submitted) {
      status = `🎉 ${this.myRank}위에 등록됐어요!`;
    } else if (this.rankStatus === 'canRank') {
      status = '🏆 TOP 100에 들었어요!';
      label = this.submitting ? '등록 중…' : '🏆 랭킹에 등록하기!';
      color = THEME.correct;
    } else if (this.rankStatus === 'offline') {
      status = '오프라인 — 로컬 기록만 볼 수 있어요';
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (status) {
      ctx.fillStyle = THEME.gold;
      ctx.font = font(30);
      ctx.fillText(status, cx, b.y - 24);
    }
    roundRect(ctx, b.x, b.y, b.w, b.h, 24);
    ctx.fillStyle = color;
    ctx.fill();
    if (this.hoverPt && hit(b, this.hoverPt.x, this.hoverPt.y)) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.font = font(40);
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2);
  },

  onTouch(x, y, phase) {
    if (phase !== 'end') return;
    if (hit(this.feedbackBtn, x, y)) {
      if (FEEDBACK_FORM_URL.includes('REPLACE')) {
        this.engine.ui.showComboText('의견 폼 링크를 설정하세요', false);
      } else {
        try {
          window.open(FEEDBACK_FORM_URL, '_blank', 'noopener');
        } catch (e) {
          /* 팝업 차단 등 — 무시 */
        }
      }
      return;
    }
    if (hit(this.rankBtn, x, y)) {
      if (this.rankStatus === 'canRank' && !this.submitted && !this.submitting) {
        this._register();
      } else {
        this.engine._rankGameId = this.game.id;
        this.engine.setState('RANKING');
      }
      return;
    }
    if (hit(this.retryBtn, x, y)) {
      this.engine.startGame(this.game); // 같은 게임 다시 시작
      return;
    }
    if (hit(this.menuBtn, x, y)) {
      this.engine.quitToMenu();
    }
  },

  onHover(x, y) {
    this.hoverPt = { x, y };
    return hit(this.retryBtn, x, y) || hit(this.menuBtn, x, y) || hit(this.rankBtn, x, y) || hit(this.feedbackBtn, x, y);
  },
  clearHover() {
    this.hoverPt = null;
  },

  onKey() {},
};
