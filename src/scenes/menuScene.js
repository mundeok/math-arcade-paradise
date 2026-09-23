// menuScene.js — 순환형 게임 선택 캐러셀.
// 한 화면에 한 게임을 충분히 설명하되, 양옆 카드를 보여 스와이프 가능함을 바로 알린다.

import { LOGICAL_W, LOGICAL_H, SAFE, THEME, font, roundRect, hit } from '../core/ui.js';
import { L } from '../core/layout.js';
import { ScoreManager } from '../core/scoreManager.js';
import { CATALOG, getGameById } from '../games/registry.js';
import { drawGameCard, drawGameIcon } from '../art/toyArt.js';
import { menuCardImage, menuImage, preloadMenuAssets } from '../art/menuAssets.js';

const LONGPRESS_SEC = 1.5;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const menuScene = {
  enter(engine) {
    this.engine = engine;
    this._build();
    this.gearHold = 0;
    this.gearPressing = false;
    this.t = 0;
    this.hoverPt = null;
    this.drag = null;
    this.pressTarget = null;
    this.carouselOffset = 0;
    preloadMenuAssets();
  },

  _build() {
    const items = shuffleInPlace([...CATALOG]);
    this.carouselRect = { x: 0, y: L.gu(5.2), w: L.W, h: L.gu(12.55) };
    this.cardW = L.gu(11.5);
    this.cardH = L.gu(10.55);
    this.cardSlot = L.gu(11.3);
    this.cardY = this.carouselRect.y + L.gu(.55);
    this.selectedIndex = 0;

    // cells 이름은 메뉴 레이아웃 검증과 기존 도구의 호환을 위해 유지한다.
    this.cells = items.map((it) => {
      const game = getGameById(it.id);
      return {
        x: (L.W - this.cardW) / 2,
        y: this.cardY,
        w: this.cardW,
        h: this.cardH,
        id: it.id,
        name: it.name,
        emoji: it.emoji,
        description: it.description,
        control: it.control,
        active: !!game,
        opMode: game?.opMode ?? null,
        highScore: ScoreManager.getHighScores(it.id)[0]?.score ?? null,
        achievements: ScoreManager.getAchievements(it.id),
      };
    });

    this.leftArrow = { x: L.safe, y: this.carouselRect.y + L.gu(5.1), w: L.minTouch, h: L.minTouch };
    this.rightArrow = { x: L.W - L.safe - L.minTouch, y: this.leftArrow.y, w: L.minTouch, h: L.minTouch };
    this.descriptionPanel = { x: L.safe, y: L.gu(18.35), w: L.W - L.safe * 2, h: L.gu(9.7) };
    this.startBtn = { x: L.safe + L.gu(1), y: this.descriptionPanel.y + L.gu(6.05), w: L.W - L.safe * 2 - L.gu(2), h: L.gu(2.55) };

    const gap = L.gu(.5);
    const bw = (LOGICAL_W - SAFE * 2 - gap) / 2;
    const by = LOGICAL_H - SAFE - L.minTouch;
    this.reportBtn = { x: SAFE, y: by, w: bw, h: L.minTouch, label: '📊 학습 리포트' };
    this.rankBtn = { x: SAFE + bw + gap, y: by, w: bw, h: L.minTouch, label: '🏆 랭킹' };
    this.gearRect = { x: LOGICAL_W - SAFE - L.minTouch, y: SAFE, w: L.minTouch, h: L.minTouch };
  },

  _selectedCard() {
    return this.cells[this.selectedIndex];
  },

  update(dt) {
    this.t += dt;
    if (!this.drag && Math.abs(this.carouselOffset) > .1) {
      this.carouselOffset *= Math.exp(-dt * 13);
      if (Math.abs(this.carouselOffset) < .25) this.carouselOffset = 0;
    }
    if (this.gearPressing) {
      this.gearHold += dt;
      if (this.gearHold >= LONGPRESS_SEC) {
        this.gearPressing = false;
        this.gearHold = 0;
        this.engine.setState('SETTINGS');
      }
    }
  },

  _moveSelection(delta, dragOffset = 0) {
    if (!delta || !this.cells.length) return;
    this.selectedIndex = (this.selectedIndex + delta + this.cells.length) % this.cells.length;
    // 새 중앙 카드가 손가락이 놓인 위치에서 시작해 가운데로 정착한다.
    this.carouselOffset = (delta > 0 ? this.cardSlot : -this.cardSlot) + dragOffset;
    this.engine?.sound?.play?.('move');
  },

  render(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this._drawBackdrop(ctx);
    this._drawHeader(ctx);
    this._drawGear(ctx);
    this._drawCarousel(ctx);
    this._drawDescription(ctx);
    this._drawBottomButtons(ctx);
  },

  _drawBackdrop(ctx) {
    const bg = ctx.createLinearGradient(0, 0, 0, L.H);
    bg.addColorStop(0, '#07162d');
    bg.addColorStop(.48, '#102b55');
    bg.addColorStop(1, '#07162a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, L.W, L.H);

    const glow = ctx.createRadialGradient(L.W / 2, L.gu(12), 0, L.W / 2, L.gu(12), L.gu(12));
    glow.addColorStop(0, 'rgba(39,137,230,.28)');
    glow.addColorStop(1, 'rgba(7,22,45,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, L.W, L.H);

    ctx.save();
    for (let i = 0; i < 18; i++) {
      const x = (i * 137 + 41) % L.W;
      const y = (i * 83 + 29) % L.gu(18);
      const pulse = .45 + .25 * Math.sin(this.t * 1.4 + i);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = i % 3 === 0 ? THEME.gold : '#76cfff';
      ctx.beginPath(); ctx.arc(x, y, L.gu(i % 4 === 0 ? .055 : .035), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },

  _drawHeader(ctx) {
    const header = { x: L.safe, y: L.safe, w: L.W - L.safe * 2, h: L.gu(4.55) };
    roundRect(ctx, header.x, header.y, header.w, header.h, L.gu(.7));
    const headerFill = ctx.createLinearGradient(header.x, header.y, header.x + header.w, header.y + header.h);
    headerFill.addColorStop(0, 'rgba(16,56,105,.97)');
    headerFill.addColorStop(1, 'rgba(13,35,70,.95)');
    ctx.fillStyle = headerFill; ctx.fill();
    ctx.strokeStyle = 'rgba(83,157,247,.34)'; ctx.lineWidth = L.gu(.05); ctx.stroke();
    ctx.save();
    roundRect(ctx, header.x, header.y, header.w, header.h, L.gu(.7)); ctx.clip();
    const hero = menuImage('hero');
    if (hero) {
      const h = L.gu(3.75), w = h * hero.naturalWidth / hero.naturalHeight;
      ctx.globalAlpha = .98;
      ctx.drawImage(hero, header.x + header.w - w - L.gu(2.2), header.y + L.gu(.35), w, h);
    } else {
      ctx.fillStyle = 'rgba(83,218,221,.18)';
      ctx.beginPath(); ctx.arc(header.x + header.w - L.gu(4.2), header.y + L.gu(2.25), L.gu(1.75), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,211,103,.18)';
      ctx.beginPath(); ctx.arc(header.x + header.w - L.gu(2.6), header.y + L.gu(1.15), L.gu(.6), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff'; ctx.font = font(L.font(.034));
    ctx.fillText('곱셈나눗셈', header.x + L.gu(.7), header.y + L.gu(1.18));
    ctx.fillStyle = THEME.gold; ctx.font = font(L.font(.03));
    ctx.fillText('아케이드 천국', header.x + L.gu(.7), header.y + L.gu(2.18));
    ctx.fillStyle = '#bfe8ff'; ctx.font = font(L.font(.015));
    ctx.fillText('오늘은 어떤 게임을 해볼까?', header.x + L.gu(.72), header.y + L.gu(3.2));
    ctx.textAlign = 'center';
  },

  _drawCarousel(ctx) {
    const cx = L.W / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, this.carouselRect.y, L.W, this.carouselRect.h); ctx.clip();
    const cards = [];
    for (let k = -2; k <= 2; k++) {
      const index = (this.selectedIndex + k + this.cells.length) % this.cells.length;
      const centerX = cx + k * this.cardSlot + this.carouselOffset;
      const distance = Math.abs(centerX - cx) / this.cardSlot;
      cards.push({ c: this.cells[index], centerX, distance });
    }
    cards.sort((a, b) => b.distance - a.distance);
    for (const item of cards) this._drawCarouselCard(ctx, item.c, item.centerX, item.distance);
    ctx.restore();

    this._drawArrow(ctx, this.leftArrow, '‹');
    this._drawArrow(ctx, this.rightArrow, '›');
    const indicatorY = this.carouselRect.y + this.carouselRect.h - L.gu(.36);
    ctx.fillStyle = '#e7f3ff'; ctx.font = font(L.font(.019));
    ctx.fillText(`${this.selectedIndex + 1} / ${this.cells.length}`, cx, indicatorY - L.gu(.46));
    const dotGap = L.gu(.36), dotsW = (this.cells.length - 1) * dotGap;
    for (let i = 0; i < this.cells.length; i++) {
      ctx.beginPath(); ctx.arc(cx - dotsW / 2 + i * dotGap, indicatorY, i === this.selectedIndex ? L.gu(.1) : L.gu(.075), 0, Math.PI * 2);
      ctx.fillStyle = i === this.selectedIndex ? THEME.gold : '#46648d'; ctx.fill();
    }
  },

  _drawCarouselCard(ctx, c, centerX, distance) {
    const scale = 1 - .28 * clamp(distance, 0, 1);
    const w = this.cardW * scale, h = this.cardH * scale;
    const r = { x: centerX - w / 2, y: this.cardY + (this.cardH - h) / 2, w, h };
    ctx.save();
    ctx.globalAlpha = clamp(1 - distance * .45, .32, 1);
    drawGameCard(ctx, c.id, r, c.active);
    const artwork = menuCardImage(c.id);
    if (artwork) {
      const inset = L.gu(.12) * scale;
      const imageRect = { x: r.x + inset, y: r.y + inset, w: r.w - inset * 2, h: r.h - inset * 2 };
      ctx.save();
      roundRect(ctx, imageRect.x, imageRect.y, imageRect.w, imageRect.h, L.gu(.48) * scale);
      ctx.clip();
      const sourceRatio = artwork.naturalWidth / artwork.naturalHeight;
      const targetRatio = imageRect.w / imageRect.h;
      let sx = 0, sy = 0, sw = artwork.naturalWidth, sh = artwork.naturalHeight;
      if (sourceRatio > targetRatio) {
        sw = artwork.naturalHeight * targetRatio;
        sx = (artwork.naturalWidth - sw) / 2;
      } else {
        sh = artwork.naturalWidth / targetRatio;
        sy = (artwork.naturalHeight - sh) / 2;
      }
      ctx.drawImage(artwork, sx, sy, sw, sh, imageRect.x, imageRect.y, imageRect.w, imageRect.h);
      const shade = ctx.createLinearGradient(0, imageRect.y, 0, imageRect.y + imageRect.h);
      shade.addColorStop(0, 'rgba(7,20,39,.04)');
      shade.addColorStop(.72, 'rgba(7,20,39,0)');
      shade.addColorStop(1, 'rgba(7,20,39,.5)');
      ctx.fillStyle = shade; ctx.fillRect(imageRect.x, imageRect.y, imageRect.w, imageRect.h);
      ctx.restore();
    } else {
      drawGameIcon(ctx, c.id, centerX, r.y + h * .56, L.gu(5.65) * scale);
    }

    const signW = w * .82, signH = L.gu(1.42) * scale;
    const sign = { x: centerX - signW / 2, y: r.y + L.gu(.26) * scale, w: signW, h: signH };
    roundRect(ctx, sign.x, sign.y, sign.w, sign.h, sign.h * .28);
    ctx.fillStyle = distance < .36 ? '#fff0cc' : 'rgba(245,235,218,.9)'; ctx.fill();
    ctx.strokeStyle = distance < .36 ? '#d98c31' : 'rgba(154,105,73,.75)';
    ctx.lineWidth = L.gu(.09) * scale; ctx.stroke();
    ctx.fillStyle = '#67351f'; ctx.font = font(L.font(.026) * scale);
    ctx.fillText(c.name, centerX, sign.y + sign.h / 2 + L.gu(.025));
    ctx.font = font(L.font(.016) * scale, 'normal');
    ctx.fillStyle = c.highScore != null ? THEME.gold : '#bfe8ff';
    ctx.fillText(c.highScore != null ? `최고 ${c.highScore.toLocaleString()}점` : '새 게임', centerX, r.y + h - L.gu(.66) * scale);
    if (distance < .36) this._drawOpBadge(ctx, c, r);
    ctx.restore();
  },

  _drawArrow(ctx, r, glyph) {
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, r.w / 2);
    ctx.fillStyle = this._hovered(r) ? '#385786' : 'rgba(25,43,72,.9)'; ctx.fill();
    ctx.strokeStyle = 'rgba(173,209,255,.72)'; ctx.lineWidth = L.gu(.05); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = font(L.font(.048), 'normal');
    ctx.fillText(glyph, r.x + r.w / 2, r.y + r.h / 2 - L.gu(.08));
    ctx.restore();
  },

  _drawDescription(ctx) {
    const c = this._selectedCard(), p = this.descriptionPanel;
    ctx.save();
    roundRect(ctx, p.x, p.y, p.w, p.h, L.gu(.65));
    const panel = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
    panel.addColorStop(0, '#17416c'); panel.addColorStop(1, '#112747');
    ctx.fillStyle = panel; ctx.fill();
    ctx.strokeStyle = 'rgba(114,181,235,.52)'; ctx.lineWidth = L.gu(.045); ctx.stroke();

    const iconBox = { x: p.x + L.gu(.65), y: p.y + L.gu(.65), w: L.gu(2.45), h: L.gu(2.45) };
    roundRect(ctx, iconBox.x, iconBox.y, iconBox.w, iconBox.h, L.gu(.48));
    ctx.fillStyle = 'rgba(55,124,170,.48)'; ctx.fill();
    ctx.strokeStyle = 'rgba(126,216,241,.35)'; ctx.lineWidth = L.gu(.04); ctx.stroke();
    drawGameIcon(ctx, c.id, iconBox.x + iconBox.w / 2, iconBox.y + iconBox.h / 2, L.gu(1.75));

    const textX = p.x + L.gu(3.5);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = font(L.font(.031));
    ctx.fillText(c.name, textX, p.y + L.gu(1.08), p.w - L.gu(4.25));
    ctx.fillStyle = '#cde7ff'; ctx.font = font(L.font(.018), 'normal');
    ctx.fillText(c.description, textX, p.y + L.gu(2.08), p.w - L.gu(4.25));

    const chip = { x: textX, y: p.y + L.gu(2.55), w: L.gu(7.5), h: L.gu(1.22) };
    roundRect(ctx, chip.x, chip.y, chip.w, chip.h, chip.h / 2);
    ctx.fillStyle = 'rgba(70,112,163,.42)'; ctx.fill();
    ctx.strokeStyle = 'rgba(141,196,255,.56)'; ctx.lineWidth = L.gu(.04); ctx.stroke();
    ctx.fillStyle = '#f2f8ff'; ctx.font = font(L.font(.017));
    ctx.fillText(`☝ ${c.control}`, chip.x + L.gu(.45), chip.y + chip.h / 2);

    ctx.textAlign = 'right'; ctx.font = font(L.font(.014), 'normal');
    ctx.fillStyle = c.highScore != null ? THEME.gold : '#9fb8d7';
    ctx.fillText(c.highScore != null ? `최고 ${c.highScore.toLocaleString()}점` : '첫 기록에 도전!', p.x + p.w - L.gu(.65), chip.y + chip.h / 2);
    this._drawBadges(ctx, c, p.x + p.w - L.gu(.65), p.y + L.gu(.92));

    const b = this.startBtn;
    roundRect(ctx, b.x, b.y, b.w, b.h, L.gu(.55));
    const button = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    button.addColorStop(0, '#ffc34d'); button.addColorStop(1, '#f57916');
    ctx.fillStyle = button; ctx.fill();
    ctx.strokeStyle = '#ffda79'; ctx.lineWidth = L.gu(.06); ctx.stroke();
    if (this._hovered(b)) { ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fill(); }
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = font(L.font(.034));
    ctx.fillText('▶  게임 시작', b.x + b.w / 2, b.y + b.h / 2);
    ctx.restore();
  },

  _drawBottomButtons(ctx) {
    for (const r of [this.reportBtn, this.rankBtn]) {
      roundRect(ctx, r.x, r.y, r.w, r.h, L.gu(.5));
      const fill = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
      if (r === this.rankBtn) { fill.addColorStop(0, '#287fd9'); fill.addColorStop(1, '#3ca8ff'); }
      else { fill.addColorStop(0, '#27456e'); fill.addColorStop(1, '#1b3152'); }
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = r === this.rankBtn ? 'rgba(103,175,255,.62)' : 'rgba(115,142,190,.3)';
      ctx.lineWidth = L.gu(.045); ctx.stroke();
      if (this._hovered(r)) { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill(); }
      ctx.fillStyle = '#fff'; ctx.font = font(L.font(.026));
      ctx.fillText(r.label, r.x + r.w / 2, r.y + r.h / 2);
    }
  },

  _drawOpBadge(ctx, c, r) {
    const text = c.opMode === 'multiply' ? '× 곱셈' : c.opMode === 'divide' ? '÷ 나눗셈' : c.opMode === 'mixed' ? '×÷ 혼합' : null;
    if (!text) return;
    const w = L.gu(2.45), h = L.gu(.76), inset = L.gu(.28);
    const x = r.x + r.w - w - inset, y = r.y + L.gu(1.58);
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(18,31,52,.88)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,213,74,.78)'; ctx.lineWidth = L.gu(.04); ctx.stroke();
    ctx.fillStyle = '#fff1b0'; ctx.font = font(L.font(.014));
    ctx.fillText(text, x + w / 2, y + h / 2 + L.gu(.015));
  },

  _drawBadges(ctx, c, right, y) {
    const badges = { bronze: '🥉', silver: '🥈', gold: '🥇' };
    const owned = c.achievements || [];
    ctx.font = font(L.font(.022)); ctx.textAlign = 'right';
    let x = right;
    for (const key of ['gold', 'silver', 'bronze']) {
      if (owned.includes(key)) { ctx.fillText(badges[key], x, y); x -= L.gu(.75); }
    }
  },

  _drawGear(ctx) {
    const g = this.gearRect;
    roundRect(ctx, g.x, g.y, g.w, g.h, L.gu(.45));
    ctx.fillStyle = 'rgba(29,39,64,.95)'; ctx.fill();
    if (this._hovered(g)) { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill(); }
    ctx.font = font(L.font(.039)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    ctx.fillText('⚙️', g.x + g.w / 2, g.y + g.h / 2);
    if (this.gearPressing && this.gearHold > .1) {
      const p = Math.min(1, this.gearHold / LONGPRESS_SEC);
      ctx.beginPath(); ctx.arc(g.x + g.w / 2, g.y + g.h / 2, g.w * .56, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      ctx.strokeStyle = THEME.gold; ctx.lineWidth = L.gu(.15); ctx.stroke();
    }
  },

  _targetRect(name) {
    return name === 'start' ? this.startBtn : name === 'report' ? this.reportBtn : name === 'rank' ? this.rankBtn : null;
  },

  _startSelected() {
    const card = this._selectedCard();
    const game = card && getGameById(card.id);
    if (game) this.engine.goTutorial(game);
  },

  onTouch(x, y, phase) {
    if (phase === 'start') {
      if (hit(this.gearRect, x, y)) {
        this.gearPressing = true; this.gearHold = 0; return;
      }
      if (hit(this.carouselRect, x, y)) {
        this.drag = { startX: x, startY: y }; this.carouselOffset = 0; return;
      }
      this.pressTarget = hit(this.startBtn, x, y) ? 'start' : hit(this.reportBtn, x, y) ? 'report' : hit(this.rankBtn, x, y) ? 'rank' : null;
      return;
    }
    if (phase === 'move') {
      if (this.gearPressing && !hit(this.gearRect, x, y)) { this.gearPressing = false; this.gearHold = 0; }
      if (this.drag) this.carouselOffset = clamp(x - this.drag.startX, -this.cardSlot * .92, this.cardSlot * .92);
      if (this.pressTarget) {
        const r = this._targetRect(this.pressTarget);
        if (!r || !hit(r, x, y)) this.pressTarget = null;
      }
      return;
    }
    if (phase !== 'end') return;
    if (this.gearPressing) {
      this.gearPressing = false; this.gearHold = 0; return;
    }
    if (this.drag) {
      const dx = x - this.drag.startX;
      this.drag = null;
      if (Math.abs(dx) >= L.gu(1.05)) this._moveSelection(dx < 0 ? 1 : -1, dx);
      else if (hit(this.leftArrow, x, y) || x < L.W / 2 - this.cardW * .34) this._moveSelection(-1);
      else if (hit(this.rightArrow, x, y) || x > L.W / 2 + this.cardW * .34) this._moveSelection(1);
      else this.carouselOffset = 0;
      return;
    }
    const target = this.pressTarget;
    this.pressTarget = null;
    if (target === 'start' && hit(this.startBtn, x, y)) { this._startSelected(); return; }
    if (target === 'report' && hit(this.reportBtn, x, y)) { this.engine.setState('REPORT'); return; }
    if (target === 'rank' && hit(this.rankBtn, x, y)) { this.engine._rankGameId = null; this.engine.setState('RANKING'); }
  },

  onHover(x, y) {
    this.hoverPt = { x, y };
    return [this.gearRect, this.leftArrow, this.rightArrow, this.startBtn, this.reportBtn, this.rankBtn].some(r => hit(r, x, y));
  },
  clearHover() { this.hoverPt = null; },
  _hovered(rect) { return this.hoverPt && hit(rect, this.hoverPt); },

  onKey(e) {
    if (e.repeat) return;
    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') { e.preventDefault?.(); this._moveSelection(-1); }
    else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') { e.preventDefault?.(); this._moveSelection(1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault?.(); this._startSelected(); }
  },
};
