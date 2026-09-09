// rankingScene.js — 온라인 랭킹 화면 (SPEC §랭킹 5)
// 메뉴에서 접근. 게임 선택 → 그 게임 TOP 100. 내 순위 강조. 각 항목에 신고 버튼.
//   오프라인/연결 실패 시: 로컬 TOP 5(내 기기 최고점)만 + "인터넷 연결을 확인해주세요".
//   ⚠️ 랭킹 실패가 게임 플레이를 막지 않는다(이 화면은 메뉴 갈래일 뿐).
// 모든 좌표·크기·폰트는 L 헬퍼.

import { THEME, font, roundRect, hit } from '../core/ui.js';
import { L } from '../core/layout.js';
import { CATALOG } from '../games/registry.js';
import { ScoreManager } from '../core/scoreManager.js';
import * as ranking from '../core/ranking.js';

export const rankingScene = {
  enter(engine) {
    this.engine = engine;
    this.gameId = engine._rankGameId || CATALOG[0].id;
    this.scroll = 0;
    this.dragging = false;
    this.dragMoved = 0;
    this.lastY = 0;
    this.hoverPt = null;
    this._buildChips();
    this._load();
  },

  _buildChips() {
    // 게임 선택 칩 2줄(6+5). 각 칸 ≥ 최소 터치.
    const cols = 6;
    const gap = L.gu(0.25);
    const areaW = L.W - L.safe * 2;
    const cw = (areaW - gap * (cols - 1)) / cols;
    const ch = L.minTouch * 0.92;
    const top = L.gu(2.6);
    this.chips = CATALOG.map((g, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return { id: g.id, emoji: g.emoji, name: g.name, x: L.safe + col * (cw + gap), y: top + row * (ch + gap), w: cw, h: ch };
    });
    this.listTop = top + 2 * (ch + gap) + L.gu(1.4);
    this.backBtn = { x: L.safe, y: L.H - L.safe - L.gu(2.6), w: L.W - L.safe * 2, h: L.gu(2.6) };
    this.listBottom = this.backBtn.y - L.gu(0.6);
    this.rowH = L.gu(1.9);
  },

  async _load() {
    this.loading = true;
    this.offline = false;
    this.entries = [];
    this.scroll = 0;
    const res = await ranking.fetchTop(this.gameId);
    // 이미 다른 게임으로 바꿨으면 결과 폐기(경합 방지)
    if (!this.engine || this.engine.scene !== this) return;
    this.loading = false;
    this.offline = res.offline;
    if (res.offline) {
      // 로컬 TOP 5(내 기기 최고점)만 — 닉네임 없음
      this.localTop = ScoreManager.getHighScores(this.gameId).slice(0, 5);
      this.entries = [];
    } else {
      this.entries = ranking.visibleEntries(res.entries);
    }
    this.myId = ranking.myEntryId(this.gameId);
  },

  update() {},

  render(ctx) {
    const cx = L.W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = THEME.gold;
    ctx.font = font(L.font(0.05));
    ctx.fillText('🏆 온라인 랭킹', cx, L.gu(1.3));

    // 게임 선택 칩
    for (const c of this.chips) {
      const sel = c.id === this.gameId;
      roundRect(ctx, c.x, c.y, c.w, c.h, L.gu(0.4));
      ctx.fillStyle = sel ? THEME.gold : THEME.panel;
      ctx.fill();
      if (!sel && this._hovered(c)) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fill();
      }
      ctx.fillStyle = sel ? THEME.bg : '#fff';
      ctx.font = font(L.gu(1.0));
      ctx.fillText(c.emoji, c.x + c.w / 2, c.y + c.h * 0.44);
      ctx.font = font(L.font(0.017), 'normal');
      ctx.fillText(c.name, c.x + c.w / 2, c.y + c.h * 0.82);
    }

    // 선택 게임 이름
    const g = CATALOG.find((x) => x.id === this.gameId);
    ctx.fillStyle = THEME.text;
    ctx.font = font(L.font(0.03));
    ctx.fillText(`${g.emoji} ${g.name} TOP 100`, cx, this.listTop - L.gu(0.8));

    // 리스트 영역
    const lx = L.safe;
    const lw = L.W - L.safe * 2;
    const ly = this.listTop;
    const lh = this.listBottom - this.listTop;
    roundRect(ctx, lx, ly, lw, lh, L.gu(0.5));
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();

    if (this.loading) {
      ctx.fillStyle = THEME.subtext;
      ctx.font = font(L.font(0.028), 'normal');
      ctx.fillText('불러오는 중…', cx, ly + lh / 2);
    } else if (this.offline) {
      this._renderOffline(ctx, lx, ly, lw, lh);
    } else if (!this.entries.length) {
      ctx.fillStyle = THEME.subtext;
      ctx.font = font(L.font(0.028), 'normal');
      ctx.fillText('아직 기록이 없어요. 1등이 되어보세요!', cx, ly + lh / 2);
    } else {
      this._renderList(ctx, lx, ly, lw, lh);
    }

    // 뒤로
    const b = this.backBtn;
    roundRect(ctx, b.x, b.y, b.w, b.h, L.gu(0.5));
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    if (this._hovered(b)) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.font = font(L.font(0.034));
    ctx.fillText('🏠 메뉴로', b.x + b.w / 2, b.y + b.h / 2);
  },

  _renderOffline(ctx, lx, ly, lw, lh) {
    const cx = L.W / 2;
    ctx.fillStyle = THEME.wrong;
    ctx.font = font(L.font(0.03));
    ctx.fillText('인터넷 연결을 확인해주세요', cx, ly + L.gu(1.4));
    ctx.fillStyle = THEME.subtext;
    ctx.font = font(L.font(0.024), 'normal');
    ctx.fillText('내 기기 최고 기록 (오프라인)', cx, ly + L.gu(2.7));
    if (!this.localTop || !this.localTop.length) {
      ctx.fillText('저장된 기록이 없어요', cx, ly + lh / 2);
      return;
    }
    let yy = ly + L.gu(4);
    ctx.textAlign = 'left';
    ctx.font = font(L.font(0.03), 'normal');
    this.localTop.forEach((s, i) => {
      ctx.fillStyle = THEME.gold;
      ctx.fillText(`${i + 1}위`, lx + L.gu(0.8), yy);
      ctx.fillStyle = THEME.text;
      ctx.textAlign = 'right';
      ctx.fillText(`${s.score}점`, lx + lw - L.gu(0.8), yy);
      ctx.textAlign = 'left';
      yy += L.gu(1.7);
    });
    ctx.textAlign = 'center';
  },

  _renderList(ctx, lx, ly, lw, lh) {
    ctx.save();
    roundRect(ctx, lx, ly, lw, lh, L.gu(0.5));
    ctx.clip();
    const rowH = this.rowH;
    const pad = L.gu(0.5);
    const startY = ly + pad - this.scroll;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      const ry = startY + i * rowH;
      if (ry + rowH < ly || ry > ly + lh) continue; // 화면 밖 스킵
      const cyr = ry + rowH / 2;
      const mine = this.myId && e.id === this.myId;
      if (mine) {
        roundRect(ctx, lx + L.gu(0.2), ry + L.gu(0.1), lw - L.gu(0.4), rowH - L.gu(0.2), L.gu(0.3));
        ctx.fillStyle = 'rgba(255,213,74,0.22)';
        ctx.fill();
      }
      // 순위
      ctx.textAlign = 'left';
      ctx.font = font(L.font(0.026));
      ctx.fillStyle = i < 3 ? THEME.gold : THEME.subtext;
      ctx.fillText(`${i + 1}`, lx + L.gu(0.7), cyr);
      // 닉
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.028), mine ? 'bold' : 'normal');
      ctx.fillText(e.nick, lx + L.gu(2.1), cyr);
      // 점수 + 정답률(작게)
      ctx.textAlign = 'right';
      ctx.fillStyle = THEME.gold;
      ctx.font = font(L.font(0.026));
      ctx.fillText(`${e.score}점`, lx + lw - L.gu(2.4), cyr);
      ctx.fillStyle = THEME.subtext;
      ctx.font = font(L.font(0.018), 'normal');
      ctx.fillText(`정답률 ${e.accuracy}%`, lx + lw - L.gu(2.4), cyr + L.gu(0.55));
      // 신고 버튼
      ctx.textAlign = 'center';
      ctx.font = font(L.font(0.028));
      ctx.fillStyle = THEME.subtext;
      ctx.fillText('🚩', lx + lw - L.gu(1.0), cyr);
    }
    ctx.restore();
  },

  _maxScroll() {
    const lh = this.listBottom - this.listTop;
    const contentH = this.entries.length * this.rowH + L.gu(1);
    return Math.max(0, contentH - lh);
  },
  _reportRectFor(i, ly) {
    const rowH = this.rowH;
    const startY = ly + L.gu(0.5) - this.scroll;
    const ry = startY + i * rowH;
    const lw = L.W - L.safe * 2;
    const s = L.gu(1.0);
    return { x: L.safe + lw - L.gu(1.0) - s / 2, y: ry, w: s, h: rowH };
  },

  onTouch(x, y, phase) {
    if (phase === 'start') {
      this.dragging = true;
      this.dragMoved = 0;
      this.lastY = y;
      this._downPt = { x, y };
      return;
    }
    if (phase === 'move') {
      if (!this.dragging) return;
      const inList = y >= this.listTop && y <= this.listBottom;
      if (inList && !this.offline && this.entries.length) {
        this.scroll = Math.max(0, Math.min(this._maxScroll(), this.scroll + (this.lastY - y)));
      }
      this.dragMoved += Math.abs(this.lastY - y);
      this.lastY = y;
      return;
    }
    // end
    this.dragging = false;
    if (this.dragMoved > L.gu(0.4)) return; // 스크롤이면 탭 무시

    // 칩 선택
    for (const c of this.chips) {
      if (hit(c, x, y)) {
        if (c.id !== this.gameId) {
          this.gameId = c.id;
          this._load();
        }
        return;
      }
    }
    // 뒤로
    if (hit(this.backBtn, x, y)) {
      this.engine._rankGameId = null;
      this.engine.setState('MENU');
      return;
    }
    // 신고 버튼(리스트 내부)
    if (!this.offline && this.entries.length && y >= this.listTop && y <= this.listBottom) {
      for (let i = 0; i < this.entries.length; i++) {
        if (hit(this._reportRectFor(i, this.listTop), x, y)) {
          this._reportEntry(this.entries[i]);
          return;
        }
      }
    }
  },

  async _reportEntry(entry) {
    const r = await ranking.report(this.gameId, entry.id);
    if (r.ok) {
      this.engine.ui.showComboText('신고했어요', false);
      this._load(); // 신고 3회 이상이면 목록에서 사라짐
    }
  },

  onHover(x, y) {
    this.hoverPt = { x, y };
    if (hit(this.backBtn, x, y)) return true;
    for (const c of this.chips) if (hit(c, x, y)) return true;
    return false;
  },
  clearHover() {
    this.hoverPt = null;
  },
  _hovered(r) {
    return this.hoverPt && hit(r, this.hoverPt);
  },
  onKey(e) {
    if (e.key === 'Escape') this.engine.setState('MENU');
  },
};
