// settingsScene.js — 교사 설정 (SPEC 3.9)
// 메뉴 우측 상단 ⚙️를 1.5초 롱프레스로 진입(학생 오조작 방지).
// ⚠️ 효과음 기본 OFF 필수. 여기서만 켤 수 있다.
//
// 참고: Phase 0 지시서는 "빈 화면이라도 롱프레스만" 요구하지만,
//   효과음 OFF·레벨 고정은 Phase 0 태블릿 체크리스트 검증에 필요하므로 실동작으로 구현했다.

import { LOGICAL_W, LOGICAL_H, SAFE, THEME, font, roundRect, hit } from '../core/ui.js';
import { Session } from '../core/session.js';

export const settingsScene = {
  enter(engine) {
    this.engine = engine;
    this.toast = ''; // "초기화 완료" 등 안내
    this.toastT = 0;
    this.hoverPt = null;
  },

  update(dt) {
    if (this.toastT > 0) this.toastT -= dt;
  },

  // 화면에 그릴 & 히트테스트할 컨트롤 목록을 한 곳에서 생성 (렌더/입력 일치 보장)
  _controls() {
    const s = this.engine.settings;
    const list = [];
    const chipH = 70;
    const startX = SAFE;

    // 세그먼트 헬퍼: 여러 칩을 가로로 배치
    const seg = (y, options, isSel, onSel) => {
      let x = startX;
      const gap = 16;
      for (const o of options) {
        const w = o.w || 150;
        list.push({
          x,
          y,
          w,
          h: chipH,
          label: o.label,
          selected: isSel(o.value),
          onSel: () => onSel(o.value),
        });
        x += w + gap;
      }
    };

    // 연산 종류
    this._rowY = { operation: 200 };
    seg(
      200,
      [
        { value: 'multiply', label: '곱셈만' },
        { value: 'divide', label: '나눗셈만', w: 180 },
        { value: 'mixed', label: '혼합' },
      ],
      (v) => s.operation === v,
      (v) => this.engine.saveSettings({ operation: v })
    );

    // 단 선택 (2~9)
    let dx = startX;
    for (let d = 2; d <= 9; d++) {
      list.push({
        x: dx,
        y: 360,
        w: 82,
        h: chipH,
        label: `${d}단`,
        selected: s.dans.includes(d),
        onSel: () => this._toggleDan(d),
      });
      dx += 82 + 10;
    }

    // 레벨 고정 (OFF / 1~5)
    const lvOpts = [{ value: 'off', label: 'OFF', w: 110 }];
    for (let i = 1; i <= 5; i++) lvOpts.push({ value: i, label: `Lv${i}`, w: 100 });
    seg(
      520,
      lvOpts,
      (v) => (v === 'off' ? !s.fixedLevel : s.fixedLevel && s.fixedLevelValue === v),
      (v) => {
        if (v === 'off') this.engine.saveSettings({ fixedLevel: false });
        else this.engine.saveSettings({ fixedLevel: true, fixedLevelValue: v });
      }
    );

    // 제한시간 배율
    seg(
      680,
      [
        { value: 0.8, label: '0.8×' },
        { value: 1.0, label: '1.0×' },
        { value: 1.5, label: '1.5×' },
      ],
      (v) => Math.abs(s.timeScale - v) < 0.01,
      (v) => this.engine.saveSettings({ timeScale: v })
    );

    // 효과음
    seg(
      840,
      [
        { value: true, label: 'ON' },
        { value: false, label: 'OFF' },
      ],
      (v) => s.sound === v,
      (v) => this.engine.saveSettings({ sound: v })
    );

    // 배경음악
    seg(
      1000,
      [
        { value: true, label: 'ON' },
        { value: false, label: 'OFF' },
      ],
      (v) => s.music === v,
      (v) => this.engine.saveSettings({ music: v })
    );

    // 리포트 초기화 버튼
    list.push({
      x: startX,
      y: 1110,
      w: 360,
      h: 80,
      label: '학습 리포트 초기화',
      danger: true,
      onSel: () => {
        Session.clearReport();
        this.toast = '학습 기록을 초기화했어요';
        this.toastT = 2;
      },
    });

    // 닫기
    this.closeBtn = { x: LOGICAL_W - SAFE - 200, y: SAFE, w: 200, h: 90, label: '✓ 완료' };

    return list;
  },

  _toggleDan(d) {
    const s = this.engine.settings;
    let dans = s.dans.slice();
    if (dans.includes(d)) dans = dans.filter((x) => x !== d);
    else dans.push(d);
    if (dans.length === 0) dans = [d]; // 최소 1개 유지
    dans.sort((a, b) => a - b);
    this.engine.saveSettings({ dans });
  },

  render(ctx) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = THEME.gold;
    ctx.font = font(54);
    ctx.fillText('⚙️ 교사 설정', SAFE, 100);

    const labels = [
      [155, '연산 종류'],
      [315, '단(dan) 선택'],
      [475, '레벨 고정'],
      [635, '제한시간 배율'],
      [795, '효과음  (교실: OFF 권장)'],
      [955, '배경음악'],
    ];
    ctx.fillStyle = THEME.subtext;
    ctx.font = font(32);
    for (const [y, t] of labels) ctx.fillText(t, SAFE, y);

    // 컨트롤 칩
    for (const c of this._controls()) {
      roundRect(ctx, c.x, c.y, c.w, c.h, 14);
      ctx.fillStyle = c.danger ? THEME.wrong : c.selected ? THEME.accent : THEME.panel;
      ctx.fill();
      if (c.selected) {
        ctx.strokeStyle = THEME.gold;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      if (this.hoverPt && hit(c, this.hoverPt.x, this.hoverPt.y)) {
        roundRect(ctx, c.x, c.y, c.w, c.h, 14);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fill();
      }
      ctx.fillStyle = '#fff';
      ctx.font = font(c.w > 300 ? 30 : 30);
      ctx.textAlign = 'center';
      ctx.fillText(c.label, c.x + c.w / 2, c.y + c.h / 2);
      ctx.textAlign = 'left';
    }

    // 닫기 버튼
    const cb = this.closeBtn;
    roundRect(ctx, cb.x, cb.y, cb.w, cb.h, 16);
    ctx.fillStyle = THEME.correct;
    ctx.fill();
    if (this.hoverPt && hit(cb, this.hoverPt.x, this.hoverPt.y)) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.font = font(38);
    ctx.textAlign = 'center';
    ctx.fillText(cb.label, cb.x + cb.w / 2, cb.y + cb.h / 2);

    // 토스트
    if (this.toastT > 0) {
      ctx.globalAlpha = Math.min(1, this.toastT);
      ctx.fillStyle = THEME.text;
      ctx.font = font(34);
      ctx.fillText(this.toast, LOGICAL_W / 2, 1230);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
  },

  onTouch(x, y, phase) {
    if (phase !== 'end') return;
    if (hit(this.closeBtn, x, y)) {
      this.engine.setState('MENU');
      return;
    }
    for (const c of this._controls()) {
      if (hit(c, x, y)) {
        c.onSel();
        return;
      }
    }
  },

  onHover(x, y) {
    this.hoverPt = { x, y };
    const list = this._controls(); // this.closeBtn도 여기서 설정됨
    if (this.closeBtn && hit(this.closeBtn, x, y)) return true;
    for (const c of list) if (hit(c, x, y)) return true;
    return false;
  },
  clearHover() {
    this.hoverPt = null;
  },

  onKey(e) {
    if (e.key === 'Escape') this.engine.setState('MENU');
  },
};
