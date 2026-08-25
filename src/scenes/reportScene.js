// reportScene.js — 학습 리포트 (SPEC 3.8 mathArcade.report)
// 저장된 세션 기록으로 단(dan)별 정답률을 집계해 보여준다.
//
// 참고: 전체 리포트 UI 완성은 Phase 6이다. Phase 0에서는 데이터 흐름 검증을 위한
//   최소 집계 화면만 둔다(세션 기록 → 저장 → 재집계가 실제로 도는지 확인용).

import { LOGICAL_W, LOGICAL_H, SAFE, THEME, font, roundRect, hit } from '../core/ui.js';
import { Session } from '../core/session.js';

export const reportScene = {
  enter(engine) {
    this.engine = engine;
    this.data = this._aggregate(Session.getReport());
    this.backBtn = { x: SAFE, y: LOGICAL_H - SAFE - 110, w: LOGICAL_W - SAFE * 2, h: 110, label: '← 메뉴로' };
  },

  // 단(dan)별 정답률 집계 (SPEC §3.7 리포트 집계 규칙)
  //  - 한 자리×한 자리 → 양쪽 단 모두 (+1씩)   예: 6×7 → 6단, 7단
  //  - 나눗셈 → 제수(b)의 단                     예: 42÷7 → 7단
  //  - 두 자리 이상 × 한 자리 → 한 자리 쪽 단   예: 23×3 → 3단
  //  - 세 자리×한 자리, 나머지 있는 나눗셈 → 단 제외, 'Lv5' 항목으로 별도 카운트
  _aggregate(report) {
    const dan = {}; // dan → {correct, total}
    const lv5 = { correct: 0, total: 0 };
    let total = 0,
      correct = 0;

    const bump = (bucket, ok) => {
      bucket.total++;
      if (ok) bucket.correct++;
    };
    const addDan = (d, ok) => {
      if (d < 2 || d > 9) return;
      if (!dan[d]) dan[d] = { correct: 0, total: 0 };
      bump(dan[d], ok);
    };

    for (const e of report) {
      total++;
      const ok = e.correct;
      if (ok) correct++;
      const q = e.question;

      if (q.op === '×') {
        const single = q.a < 10 ? q.a : q.b < 10 ? q.b : null; // 한 자리 쪽
        const other = q.a < 10 ? q.b : q.a;
        if (q.a < 10 && q.b < 10) {
          // 한 자리 × 한 자리 → 양쪽 단
          addDan(q.a, ok);
          addDan(q.b, ok);
        } else if (single != null && other >= 100) {
          bump(lv5, ok); // 세 자리 × 한 자리
        } else if (single != null) {
          addDan(single, ok); // 두 자리 × 한 자리 → 한 자리 쪽 단
        } else {
          bump(lv5, ok); // 그 외(두 자리×두 자리 등)는 별도
        }
      } else if (q.op === '÷') {
        if (q.remainder != null && q.remainder > 0) {
          bump(lv5, ok); // 나머지 있는 나눗셈
        } else {
          addDan(q.b, ok); // 제수의 단
        }
      }
    }
    return { dan, lv5, total, correct };
  },

  update() {},

  render(ctx) {
    const cx = LOGICAL_W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = THEME.gold;
    ctx.font = font(56);
    ctx.fillText('📊 학습 리포트', cx, 110);

    const d = this.data;
    if (d.total === 0) {
      ctx.fillStyle = THEME.subtext;
      ctx.font = font(38);
      ctx.fillText('아직 기록이 없어요.', cx, 400);
      ctx.fillText('게임을 플레이하면 여기에 쌓여요!', cx, 460);
    } else {
      ctx.fillStyle = THEME.text;
      ctx.font = font(40);
      ctx.fillText(`전체 정답률 ${Math.round((d.correct / d.total) * 100)}%  (${d.correct}/${d.total})`, cx, 210);

      // 단별 막대
      ctx.textAlign = 'left';
      ctx.font = font(30);
      let y = 290;
      const barX = 180;
      const barW = LOGICAL_W - SAFE - barX - 100;
      const rows = [];
      for (let dan = 2; dan <= 9; dan++) rows.push([`${dan}단`, d.dan[dan]]);
      rows.push(['Lv5', d.lv5.total ? d.lv5 : null]); // 세 자리×한자리·나머지 나눗셈 별도 항목
      for (const [label, rec] of rows) {
        const rate = rec ? rec.correct / rec.total : 0;
        ctx.fillStyle = THEME.text;
        ctx.fillText(label, SAFE, y + 24);
        // 배경 바
        roundRect(ctx, barX, y, barW, 48, 12);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fill();
        // 채움 바
        if (rec) {
          roundRect(ctx, barX, y, Math.max(6, barW * rate), 48, 12);
          ctx.fillStyle = rate >= 0.7 ? THEME.correct : THEME.wrong;
          ctx.fill();
        }
        ctx.fillStyle = THEME.subtext;
        ctx.font = font(26, 'normal');
        ctx.fillText(rec ? `${Math.round(rate * 100)}%` : '-', barX + barW + 16, y + 24);
        ctx.font = font(30);
        y += 60;
      }
      ctx.textAlign = 'center';
    }

    // 뒤로 버튼
    const b = this.backBtn;
    roundRect(ctx, b.x, b.y, b.w, b.h, 20);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = font(40);
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
  },

  onTouch(x, y, phase) {
    if (phase !== 'end') return;
    if (hit(this.backBtn, x, y)) this.engine.setState('MENU');
  },

  onKey(e) {
    if (e.key === 'Escape') this.engine.setState('MENU');
  },
};
