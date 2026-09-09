// adminScene.js — 관리자 화면 (SPEC §랭킹 4)
// ⚠️ 메뉴에 노출하지 않는다. URL ?admin=1 로만 진입 → 비밀번호 입력.
//   기능: 게임 선택 → 신고순 정렬 목록 확인 → 개별 삭제(필터 통과했지만 부적절한 이름 수동 삭제).
//   ⚠️ 가림막 수준 보안(SPEC §랭킹 보안 한계). 실제 방어선은 Firestore 규칙.
// 모든 좌표·크기·폰트는 L 헬퍼.

import { THEME, font, roundRect, hit } from '../core/ui.js';
import { L } from '../core/layout.js';
import { CATALOG } from '../games/registry.js';
import * as ranking from '../core/ranking.js';
import { promptPassword } from '../core/overlayInput.js';

export const adminScene = {
  async enter(engine) {
    this.engine = engine;
    this.authed = false;
    this.password = '';
    this.gameId = CATALOG[0].id;
    this.entries = [];
    this.scroll = 0;
    this.hoverPt = null;
    this._build();

    const pw = await promptPassword('관리자 비밀번호');
    if (!this.engine || this.engine.scene !== this) return; // 이탈됨
    if (pw == null) {
      this.engine.setState('MENU');
      return;
    }
    if (await ranking.adminAuth(pw)) {
      this.authed = true;
      this.password = pw;
      this._load();
    } else {
      this.engine.ui.showComboText('비밀번호가 틀렸어요', false);
      this.engine.setState('MENU');
    }
  },

  _build() {
    const cols = 6;
    const gap = L.gu(0.25);
    const areaW = L.W - L.safe * 2;
    const cw = (areaW - gap * (cols - 1)) / cols;
    const ch = L.minTouch * 0.92;
    const top = L.gu(2.6);
    this.chips = CATALOG.map((g, i) => ({
      id: g.id, emoji: g.emoji, name: g.name,
      x: L.safe + (i % cols) * (cw + gap), y: top + Math.floor(i / cols) * (ch + gap), w: cw, h: ch,
    }));
    this.listTop = top + 2 * (ch + gap) + L.gu(1.4);
    this.backBtn = { x: L.safe, y: L.H - L.safe - L.gu(2.6), w: L.W - L.safe * 2, h: L.gu(2.6) };
    this.listBottom = this.backBtn.y - L.gu(0.6);
    this.rowH = L.gu(2.1);
  },

  async _load() {
    this.loading = true;
    this.scroll = 0;
    try {
      this.entries = await ranking.adminList(this.gameId);
    } catch (e) {
      this.entries = [];
      this.loadError = true;
    }
    if (!this.engine || this.engine.scene !== this) return;
    this.loading = false;
  },

  update() {},

  render(ctx) {
    const cx = L.W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.wrong;
    ctx.font = font(L.font(0.045));
    ctx.fillText('🛠 관리자', cx, L.gu(1.3));

    if (!this.authed) {
      ctx.fillStyle = THEME.subtext;
      ctx.font = font(L.font(0.03), 'normal');
      ctx.fillText('인증 대기 중…', cx, L.y(0.5));
      return;
    }

    for (const c of this.chips) {
      const sel = c.id === this.gameId;
      roundRect(ctx, c.x, c.y, c.w, c.h, L.gu(0.4));
      ctx.fillStyle = sel ? THEME.gold : THEME.panel;
      ctx.fill();
      ctx.fillStyle = sel ? THEME.bg : '#fff';
      ctx.font = font(L.gu(1.0));
      ctx.fillText(c.emoji, c.x + c.w / 2, c.y + c.h * 0.44);
      ctx.font = font(L.font(0.017), 'normal');
      ctx.fillText(c.name, c.x + c.w / 2, c.y + c.h * 0.82);
    }

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
    } else if (!this.entries.length) {
      ctx.fillStyle = THEME.subtext;
      ctx.font = font(L.font(0.028), 'normal');
      ctx.fillText(this.loadError ? '불러오기 실패(연결 확인)' : '기록이 없어요', cx, ly + lh / 2);
    } else {
      this._renderList(ctx, lx, ly, lw, lh);
    }

    const b = this.backBtn;
    roundRect(ctx, b.x, b.y, b.w, b.h, L.gu(0.5));
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = font(L.font(0.034));
    ctx.fillText('🏠 나가기', b.x + b.w / 2, b.y + b.h / 2);
  },

  _renderList(ctx, lx, ly, lw, lh) {
    ctx.save();
    roundRect(ctx, lx, ly, lw, lh, L.gu(0.5));
    ctx.clip();
    const startY = ly + L.gu(0.5) - this.scroll;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      const ry = startY + i * this.rowH;
      if (ry + this.rowH < ly || ry > ly + lh) continue;
      const cyr = ry + this.rowH / 2;
      const reported = e.reported || 0;
      if (reported >= 3) {
        roundRect(ctx, lx + L.gu(0.2), ry + L.gu(0.1), lw - L.gu(0.4), this.rowH - L.gu(0.2), L.gu(0.3));
        ctx.fillStyle = 'rgba(255,90,90,0.18)';
        ctx.fill();
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.03));
      ctx.fillText(e.nick, lx + L.gu(0.8), cyr - L.gu(0.35));
      ctx.fillStyle = THEME.subtext;
      ctx.font = font(L.font(0.02), 'normal');
      ctx.fillText(`${e.score}점 · 신고 ${reported}`, lx + L.gu(0.8), cyr + L.gu(0.5));
      // 삭제 버튼
      const del = this._delRectFor(i);
      roundRect(ctx, del.x, del.y, del.w, del.h, L.gu(0.3));
      ctx.fillStyle = THEME.wrong;
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = font(L.font(0.024));
      ctx.fillText('삭제', del.x + del.w / 2, del.y + del.h / 2);
    }
    ctx.restore();
  },

  _delRectFor(i) {
    const startY = this.listTop + L.gu(0.5) - this.scroll;
    const ry = startY + i * this.rowH;
    const lw = L.W - L.safe * 2;
    const w = L.gu(2.4);
    const h = this.rowH - L.gu(0.5);
    return { x: L.safe + lw - w - L.gu(0.4), y: ry + L.gu(0.25), w, h };
  },
  _maxScroll() {
    const lh = this.listBottom - this.listTop;
    return Math.max(0, this.entries.length * this.rowH + L.gu(1) - lh);
  },

  onTouch(x, y, phase) {
    if (!this.authed) return;
    if (phase === 'start') {
      this.dragging = true;
      this.dragMoved = 0;
      this.lastY = y;
      return;
    }
    if (phase === 'move') {
      if (!this.dragging) return;
      if (y >= this.listTop && y <= this.listBottom) {
        this.scroll = Math.max(0, Math.min(this._maxScroll(), this.scroll + (this.lastY - y)));
      }
      this.dragMoved += Math.abs(this.lastY - y);
      this.lastY = y;
      return;
    }
    this.dragging = false;
    if (this.dragMoved > L.gu(0.4)) return;

    for (const c of this.chips) {
      if (hit(c, x, y)) {
        if (c.id !== this.gameId) { this.gameId = c.id; this._load(); }
        return;
      }
    }
    if (hit(this.backBtn, x, y)) { this.engine.setState('MENU'); return; }
    if (this.entries.length && y >= this.listTop && y <= this.listBottom) {
      for (let i = 0; i < this.entries.length; i++) {
        if (hit(this._delRectFor(i), x, y)) { this._delete(this.entries[i]); return; }
      }
    }
  },

  async _delete(entry) {
    const r = await ranking.adminDelete(this.gameId, entry.id, this.password);
    if (r.ok) {
      this.engine.ui.showComboText('삭제했어요', false);
      this._load();
    } else {
      this.engine.ui.showComboText('삭제 실패', false);
    }
  },

  onHover(x, y) {
    this.hoverPt = { x, y };
    return hit(this.backBtn, x, y);
  },
  clearHover() { this.hoverPt = null; },
  onKey(e) { if (e.key === 'Escape') this.engine.setState('MENU'); },
};
