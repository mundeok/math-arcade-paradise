// 곱셈 농장 — 숫자 선택 대신 직사각형 배열을 '영구 밭'에 채워 넣는 구성형 게임(재설계 2026-09-15).
//   ⚠️ 재설계 핵심(SPEC §4 1️⃣1️⃣): 밭은 라운드 끝까지 유지된다. 정답을 낼 때마다 배치한 칸이 작물로
//      남고, 다음 문제도 같은 밭의 남은 빈 칸에 넣어야 한다. 이미 심긴 작물·잡초 때문에 "목표 칸이면
//      아무 배열이나 정답"이 진짜 전략이 된다(3×4는 안 들어가지만 6×2는 들어간다).
//   - 잡초: 정답을 낼수록 빈 칸을 막아 압박을 준다(느리게 시작→점점 빨라짐, 40% 상한, 피버 중 정지).
//   - 종료: 현재 목표를 놓을 자리가 밭 어디에도 없으면 라운드 종료(engine.endGame). '오답' 아님.
//   - 드래그는 미리보기만(터치 취소로 실수 오답 방지). 제출은 별도의 큰 [수확!] 버튼으로만.
//   core/scenes·다른 게임 파일은 건드리지 않는다(SPEC §1.3·§6).
import { L } from '../core/layout.js';
import { THEME, font, roundRect, hit } from '../core/ui.js';
import { drawPlayBackdrop } from '../art/toyArt.js';

const GRID = 9;
const CELLS = GRID * GRID;
const EMPTY = 0, CROP = 1, WEED = 2;
const WEED_CAP = Math.floor(CELLS * 0.4); // 잡초 상한(완전 봉쇄 방지)

export const g11Farm = {
  id: 'g11_farm',
  name: '곱셈 농장',
  emoji: '🌱',
  category: '구성형',
  maxLevel: 2,
  blankRatio: 0,
  opMode: 'mixed',
  fever: { type: 'easy' },
  comboMilestones: { 5: '쑥쑥!', 10: '풍년이다!', 20: '대풍년!' },

  tutorial: {
    text: '밭에 배열을 그려 목표 칸을 채워! 빈 자리가 없어지기 전에 최대한 많이 수확하자.',
    draw(ctx) {
      const cell = L.gu(1.6);
      const x = L.W / 2 - cell * 3;
      const y = L.gu(2);
      // 이미 심긴 작물(좌) + 잡초(가시덤불) 사이에 새 배열을 끼워 넣는 그림
      const map = [
        [1, 1, 0, 0, 2, 0],
        [1, 1, 0, 0, 0, 0],
        [2, 0, 0, 0, 0, 1],
      ];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 6; c++) {
          const cx = x + c * cell, cy = y + r * cell;
          roundRect(ctx, cx + L.gu(0.06), cy + L.gu(0.06), cell - L.gu(0.12), cell - L.gu(0.12), L.gu(0.15));
          const v = map[r][c];
          ctx.fillStyle = v === 1 ? '#4b9060' : v === 2 ? '#6f7a3f' : '#ba8c62';
          ctx.fill();
          if (v === 2) drawWeed(ctx, cx + cell / 2, cy + cell / 2, cell);
        }
      }
      // 끼워 넣을 후보(2×2) 강조
      ctx.strokeStyle = THEME.gold;
      ctx.lineWidth = L.gu(0.14);
      roundRect(ctx, x + 2 * cell + L.gu(0.06), y + L.gu(0.06), cell * 2 - L.gu(0.12), cell * 2 - L.gu(0.12), L.gu(0.15));
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.032));
      ctx.fillText('빈 자리에 맞는 배열을 끼워 넣기!', L.W / 2, y + cell * 3 + L.gu(1));
      ctx.fillStyle = THEME.subtext;
      ctx.font = font(L.font(0.026), 'normal');
      ctx.fillText('가시덤불(잡초)엔 못 심어 · 방향을 바꿔보자', L.W / 2, y + cell * 3 + L.gu(2));
    },
  },

  init(engine) {
    this.engine = engine;
    this.grid = Array.from({ length: GRID }, () => new Array(GRID).fill(EMPTY));
    this.cropCount = 0;
    this.weedCount = 0;
    this.answered = 0; // 정답 누적(잡초 성장 속도 기준)
    this.reward = null; // 정답 점수 피드백 {text, points, t}
    this.blockMsg = 0; // "겹쳐서 안 돼요" 잔여 시간
    this.ending = null; // 종료 스냅샷 배너 {t, dur}
    this.harvestT = 0;
    this.wasFever = false;
    this.feverStartScore = 0;
    this.anchor = null;
    this.sel = null;
    this.hasSelection = false;
    this.dragging = false;
    this.buttonArmed = false;
    this.kRows = 1; this.kCols = 1; // 키보드 폴백용 크기
    this.elapsed = 0;
    this._loadProblem();
  },

  _layout() {
    const y = L.zone.playTop + L.gu(2.5);
    const size = Math.min(L.W - L.safe * 2, L.zone.floor - L.minTouch - L.gu(2) - y);
    return {
      board: { x: (L.W - size) / 2, y, w: size, h: size },
      button: { x: L.W / 2, y: L.zone.floor - L.minTouch, w: L.W / 2 - L.safe, h: L.minTouch },
      cell: size / GRID,
    };
  },

  _isFever() {
    return !!(this.engine.fever?.active && this.engine.fever.type === 'easy');
  },

  _loadProblem() {
    const e = this.engine;
    if (this._isFever() && !this.wasFever) this.feverStartScore = e.scoreManager.score;
    this.wasFever = this._isFever();
    // 공통 생성기를 사용해 복습 큐·중복 방지를 유지. 혼합에서는 두 연산을 번갈아, 교사 고정은 생성기 우선.
    const mode = this.answered % 2 ? 'divide' : 'multiply';
    this.problem = e.problemGenerator.nextProblem({
      maxLevel: this.wasFever ? 1 : this.maxLevel,
      blankRatio: 0,
      opMode: mode,
    });
    this.division = this.problem.op === '÷';
    this.target = this.division ? this.problem.a : this.problem.answer;
    this.fixedRows = this.division ? this.problem.b : 0;
    this.hasSelection = false;
    this.dragging = false;
    this.buttonArmed = false;
    this.anchor = null;
    this.sel = null;
    this.kRows = this.fixedRows || 1;
    this.kCols = 1;
    this.elapsed = 0;
    e.markQuestionStart();
    // ⚠️ 이 문제를 놓을 자리가 밭 어디에도 없으면 라운드 종료(오답 아님).
    if (!this._canFitAnywhere()) this._endRound();
  },

  // 현재 문제로 놓을 수 있는 (줄, 칸) 조합. 곱셈은 방향 전환 포함 모든 약수쌍, 나눗셈은 줄 수 고정 1쌍.
  _targetPairs() {
    const pairs = [];
    if (this.division) {
      const cols = this.target / this.fixedRows;
      if (this.fixedRows >= 1 && this.fixedRows <= GRID && Number.isInteger(cols) && cols >= 1 && cols <= GRID) {
        pairs.push([this.fixedRows, cols]);
      }
    } else {
      for (let r = 1; r <= GRID; r++) {
        if (this.target % r !== 0) continue;
        const c = this.target / r;
        if (c >= 1 && c <= GRID) pairs.push([r, c]);
      }
    }
    return pairs;
  },

  _rectEmpty(r0, c0, rows, cols) {
    if (r0 < 0 || c0 < 0 || r0 + rows > GRID || c0 + cols > GRID) return false;
    for (let r = r0; r < r0 + rows; r++) for (let c = c0; c < c0 + cols; c++) if (this.grid[r][c] !== EMPTY) return false;
    return true;
  },

  _canFitAnywhere() {
    for (const [rr, cc] of this._targetPairs()) {
      for (let r0 = 0; r0 + rr <= GRID; r0++) for (let c0 = 0; c0 + cc <= GRID; c0++) if (this._rectEmpty(r0, c0, rr, cc)) return true;
    }
    return false;
  },

  // 배치 선택 확정: 격자 좌표·크기·유효성 플래그를 sel에 담는다.
  _setSel(r0, c0, rows, cols) {
    r0 = Math.max(0, Math.min(GRID - 1, r0));
    c0 = Math.max(0, Math.min(GRID - 1, c0));
    rows = Math.max(1, Math.min(GRID - r0, rows));
    cols = Math.max(1, Math.min(GRID - c0, cols));
    const inGrid = r0 + rows <= GRID && c0 + cols <= GRID;
    const overlap = !this._rectEmpty(r0, c0, rows, cols);
    const correctArea = rows * cols === this.target;
    this.sel = { r0, c0, rows, cols, inGrid, overlap, correctArea };
    this.hasSelection = true;
  },

  // 드래그: 앵커(누른 칸)→현재 칸의 사각형. 나눗셈은 줄 수(제수) 고정, 위치만 자유.
  _select(x, y) {
    const { board, cell } = this._layout();
    const cc = Math.max(0, Math.min(GRID - 1, Math.floor((x - board.x) / cell)));
    const cr = Math.max(0, Math.min(GRID - 1, Math.floor((y - board.y) / cell)));
    if (this.anchor == null) this.anchor = { r: cr, c: cc };
    const c0 = Math.min(this.anchor.c, cc);
    const cols = Math.abs(this.anchor.c - cc) + 1;
    let r0, rows;
    if (this.division) {
      rows = Math.min(this.fixedRows, GRID);
      r0 = Math.max(0, Math.min(GRID - rows, Math.min(this.anchor.r, cr)));
    } else {
      r0 = Math.min(this.anchor.r, cr);
      rows = Math.abs(this.anchor.r - cr) + 1;
    }
    this._setSel(r0, c0, rows, cols);
  },

  _plant(sel) {
    for (let r = sel.r0; r < sel.r0 + sel.rows; r++) for (let c = sel.c0; c < sel.c0 + sel.cols; c++) {
      if (this.grid[r][c] === EMPTY) { this.grid[r][c] = CROP; this.cropCount++; }
    }
  },

  // 정답 뒤 잡초 성장(피버 중 정지). 느리게 시작 → 점점 빨라짐. 40% 상한.
  _growWeeds() {
    if (this._isFever()) return;
    const n = this.answered;
    let add = 0;
    if (n <= 8) add = n % 4 === 0 ? 1 : 0;        // ~정답 4개당 1
    else if (n <= 20) add = n % 2 === 0 ? 1 : 0;  // 점점 빨라짐
    else add = 1;                                  // 정답마다 1
    for (let k = 0; k < add && this.weedCount < WEED_CAP; k++) this._addWeed();
  },

  _addWeed() {
    const empties = [];
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) if (this.grid[r][c] === EMPTY) empties.push([r, c]);
    if (!empties.length) return;
    const [r, c] = empties[Math.floor(Math.random() * empties.length)];
    this.grid[r][c] = WEED;
    this.weedCount++;
  },

  _fillPct() {
    return Math.round(((this.cropCount + this.weedCount) / CELLS) * 100);
  },

  _submit() {
    if (this.ending || !this.hasSelection || !this.sel) return;
    const e = this.engine;
    const sel = this.sel;
    // ① 겹침: 제출을 막고 피드백만(오답 아님 — 위치를 다시 고르게).
    if (sel.overlap || !sel.inGrid) {
      this.blockMsg = 0.9;
      this.hasSelection = false; this.sel = null; this.anchor = null;
      e.sound.play('tick');
      e.ui.shake(L.gu(0.08), 0.08);
      return;
    }
    const p = this.problem;
    const rows = sel.rows, cols = sel.cols;
    const userAnswer = this.division ? cols : rows * cols;
    const correct = rows * cols === this.target;
    this.hasSelection = false; this.sel = null; this.anchor = null; this.buttonArmed = false; this.dragging = false;
    // ② 넓이가 틀리면 오답(계산 오류) — 기존 오답 처리 재사용(라이프 -1·복습·1.2초 표시).
    if (!correct) {
      e.answerWrong(p, userAnswer, { onResume: () => this._loadProblem() });
      return;
    }
    // ③ 정답: 작물 영구 배치 + 점수 + 잡초 성장 + 다음 문제.
    const quick = this.elapsed <= 4 * (e.settings.timeScale || 1) ? 20 : 0;
    const before = e.scoreManager.score;
    e.answerCorrect(p, userAnswer, 100 + e.scoreManager.combo * 5 + quick);
    this.answered++;
    this._plant(sel);
    e.particles.emit(this._layout().board.x + (sel.c0 + sel.cols / 2) * this._layout().cell,
      this._layout().board.y + (sel.r0 + sel.rows / 2) * this._layout().cell, 'sparkle', THEME.correct, this.wasFever ? 20 : 12);
    this.reward = {
      text: this.division ? `${this.target} ÷ ${rows} = ${cols}` : `${rows} × ${cols} = ${this.target}`,
      points: e.scoreManager.score - before, t: 0.6,
    };
    this.harvestT = 0.35;
    this._growWeeds();
    this._loadProblem(); // 다음 문제(자리 없으면 _loadProblem 안에서 종료)
  },

  _endRound() {
    // 라운드 종료: 최종 밭 스냅샷을 짧게 보여준 뒤 결과 화면. ⚠️ 오답/라이프와 무관.
    if (this.ending) return;
    this.ending = { t: 0, dur: 1.4 };
    this.hasSelection = false; this.sel = null;
    this.engine.ui.showComboText('🌾 밭이 가득 찼어!', true);
    this.engine.ui.flash('rgba(255,220,140,0.35)', 0.1);
    this.engine.sound.play('fanfare');
  },

  _syncMode() {
    if (this.wasFever === this._isFever()) return false;
    if (this.wasFever) this.reward = { text: 'FEVER 수확!', points: this.engine.scoreManager.score - this.feverStartScore, t: 0.7 };
    this._loadProblem(); // 전환 시 그리던 밭은 폐기, 심은 작물·잡초는 유지
    return true;
  },

  update(dt) {
    if (this.ending) {
      this.ending.t += dt;
      if (this.ending.t >= this.ending.dur) this.engine.endGame();
      return;
    }
    this._syncMode();
    this.elapsed += dt;
    this.harvestT = Math.max(0, this.harvestT - dt);
    if (this.blockMsg > 0) this.blockMsg = Math.max(0, this.blockMsg - dt);
    if (this.reward) { this.reward.t -= dt; if (this.reward.t <= 0) this.reward = null; }
  },

  onTouch(x, y, phase) {
    if (this.ending || this._syncMode()) return;
    const { board, button } = this._layout();
    if (phase === 'start') {
      this.buttonArmed = this.hasSelection && hit(button, x, y);
      this.dragging = hit(board, x, y);
      if (this.dragging) { this.anchor = null; this._select(x, y); }
    } else if (phase === 'move' && this.dragging) {
      this._select(x, y);
    } else if (phase === 'end') {
      if (this.dragging) this._select(x, y);
      const submit = this.buttonArmed && hit(button, x, y);
      this.dragging = false;
      this.buttonArmed = false;
      if (submit) this._submit();
    }
  },

  onKey(event) {
    if (this.ending || this._syncMode()) return;
    if (event.key === 'Enter' || event.key === ' ') {
      if (!event.repeat) this._submit();
      return;
    }
    // 키보드 폴백: (0,0) 앵커에서 크기만 조절(위치 이동은 터치 드래그가 주 조작).
    const delta = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
    if (!delta) return;
    this.kRows = this.fixedRows || Math.max(1, Math.min(GRID, this.kRows + delta[0]));
    this.kCols = Math.max(1, Math.min(GRID, this.kCols + delta[1]));
    this._setSel(0, 0, this.kRows, this.kCols);
  },

  render(ctx) {
    drawPlayBackdrop(ctx, this.id, this.elapsed);
    const { board, cell, button } = this._layout();
    const cx = L.W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 피버 게이지
    this.engine.fever?.renderGauge(ctx, { x: L.safe, y: L.zone.gauge - L.gu(0.35), w: L.W - L.safe * 2, h: L.gu(0.7) });

    // 문제 텍스트
    ctx.fillStyle = this.wasFever ? THEME.gold : THEME.text;
    ctx.font = font(L.font(0.055));
    ctx.fillText(this.division ? `${this.problem.a} ÷ ${this.problem.b} = ?` : `${this.target}칸의 밭!`, cx, L.zone.problem);
    ctx.font = font(L.font(0.026), 'normal');
    ctx.fillStyle = THEME.subtext;
    ctx.fillText(this.division ? `${this.fixedRows}줄 고정 · 빈 자리에 놓기` : '방향 바꿔가며 빈 자리에 끼워 넣기!', cx, L.zone.playTop + L.gu(0.9));

    // 채움 % 게이지(밭이 얼마나 찼는지) — 작물(초록) + 잡초(덤불색)
    const pct = this._fillPct();
    const gw = L.W - L.safe * 2, gh = L.gu(0.55), gx = L.safe, gy = L.zone.playTop + L.gu(1.55);
    roundRect(ctx, gx, gy, gw, gh, gh / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fill();
    const cropW = gw * (this.cropCount / CELLS), weedW = gw * (this.weedCount / CELLS);
    if (cropW + weedW > 0) {
      roundRect(ctx, gx, gy, cropW + weedW, gh, gh / 2);
      ctx.fillStyle = '#6f7a3f';
      ctx.fill();
      if (cropW > 0) { roundRect(ctx, gx, gy, cropW, gh, gh / 2); ctx.fillStyle = THEME.correct; ctx.fill(); }
    }
    ctx.fillStyle = THEME.text;
    ctx.font = font(L.font(0.024), 'normal');
    ctx.fillText(`밭 ${pct}% 채움`, cx, gy + gh / 2);

    // 9×9 밭
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const gap = L.gu(0.06);
        const bx = board.x + c * cell + gap, by = board.y + r * cell + gap, bs = cell - gap * 2;
        roundRect(ctx, bx, by, bs, bs, L.gu(0.12));
        const v = this.grid[r][c];
        ctx.fillStyle = v === CROP ? '#4b9060' : v === WEED ? '#6f7a3f' : '#ba8c62';
        ctx.fill();
        if (v === CROP) drawCrop(ctx, bx + bs / 2, by + bs / 2, bs);
        else if (v === WEED) drawWeed(ctx, bx + bs / 2, by + bs / 2, bs);
      }
    }

    // 배치 미리보기(드래그/선택) — 유효(초록)·겹침(빨강 빗금)·넓이불일치(노랑)
    const sel = this.sel;
    if (sel) {
      const px = board.x + sel.c0 * cell, py = board.y + sel.r0 * cell, pw = sel.cols * cell, ph = sel.rows * cell;
      ctx.save();
      const ok = !sel.overlap && sel.inGrid && sel.correctArea;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = sel.overlap ? THEME.wrong : ok ? THEME.correct : THEME.gold;
      roundRect(ctx, px + L.gu(0.06), py + L.gu(0.06), pw - L.gu(0.12), ph - L.gu(0.12), L.gu(0.12));
      ctx.fill();
      if (sel.overlap) {
        // 겹침은 색만 아니라 빗금(모양)으로도 표시(§2.5)
        ctx.globalAlpha = 0.8; ctx.strokeStyle = '#fff'; ctx.lineWidth = L.gu(0.08);
        for (let d = -ph; d < pw; d += L.gu(0.6)) { ctx.beginPath(); ctx.moveTo(px + Math.max(0, d), py + Math.max(0, -d)); ctx.lineTo(px + Math.min(pw, d + ph), py + Math.min(ph, ph - d)); ctx.stroke(); }
      }
      ctx.restore();
    }

    // 하단 정보 줄
    ctx.font = font(L.font(0.027), 'normal');
    ctx.fillStyle = THEME.text;
    let info;
    if (this.blockMsg > 0) info = '⛔ 겹쳐서 안 돼요 — 자리를 다시 골라봐';
    else if (sel && !sel.correctArea) info = `${sel.rows}줄 · ${sel.cols}칸 = ${sel.rows * sel.cols}칸 (목표 ${this.target})`;
    else if (this.hasSelection) info = `${sel.rows}줄 · 한 줄 ${sel.cols}칸 — [수확!]`;
    else info = '밭 위를 드래그해 배열 그리기';
    ctx.fillStyle = this.blockMsg > 0 ? THEME.wrong : THEME.text;
    ctx.fillText(info, cx, board.y + board.h + L.gu(0.85));

    // 수확 버튼
    const canHarvest = this.hasSelection && sel && !sel.overlap && sel.inGrid && sel.correctArea;
    roundRect(ctx, button.x, button.y, button.w, button.h, L.gu(0.35));
    ctx.fillStyle = canHarvest ? THEME.accent : THEME.disabled;
    ctx.fill();
    ctx.fillStyle = THEME.text;
    ctx.font = font(L.font(0.038));
    ctx.fillText('수확!', button.x + button.w / 2, button.y + button.h / 2);

    // 좌하단: 보상 식 / 채움 안내
    ctx.font = font(L.font(0.026));
    if (this.reward) {
      ctx.fillStyle = THEME.gold;
      ctx.fillText(this.reward.text, L.W / 4, button.y + button.h / 2 - L.gu(0.35));
      ctx.fillText(`+${this.reward.points}`, L.W / 4, button.y + button.h / 2 + L.gu(0.45));
    } else {
      ctx.fillStyle = THEME.subtext;
      ctx.fillText(`🌾 수확 ${this.answered}개`, L.W / 4, button.y + button.h / 2 - L.gu(0.35));
      ctx.fillText(`밭 ${pct}% 채움`, L.W / 4, button.y + button.h / 2 + L.gu(0.45));
    }

    // 종료 스냅샷 배너
    if (this.ending) {
      const prog = this.ending.t / this.ending.dur;
      ctx.save();
      ctx.globalAlpha = prog < 0.8 ? 1 : Math.max(0, 1 - (prog - 0.8) / 0.2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = THEME.gold;
      ctx.font = font(L.font(0.06));
      ctx.lineWidth = L.gu(0.22); ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.strokeText(`🌾 ${pct}% 수확 완료!`, cx, L.y(0.5));
      ctx.fillText(`🌾 ${pct}% 수확 완료!`, cx, L.y(0.5));
      ctx.restore();
    }
  },

  destroy() {
    this.engine = null;
    this.problem = null;
    this.grid = null;
    this.reward = null;
    this.sel = null;
    this.ending = null;
    this.dragging = false;
    this.buttonArmed = false;
  },
};

// ── 모듈 로컬 그림(core 미수정) ────────────────────────────
// 작물: 부드러운 새싹 두 잎.
function drawCrop(ctx, x, y, s) {
  ctx.save();
  ctx.fillStyle = '#bff0c4';
  ctx.beginPath();
  ctx.ellipse(x - s * 0.12, y - s * 0.02, s * 0.14, s * 0.08, -Math.PI / 4, 0, Math.PI * 2);
  ctx.ellipse(x + s * 0.12, y - s * 0.06, s * 0.14, s * 0.08, Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2f6a3d'; ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y + s * 0.18); ctx.lineTo(x, y - s * 0.05); ctx.stroke();
  ctx.restore();
}

// 잡초(가시덤불): 색만이 아니라 뾰족한 모양으로 구분(§2.5). 어둡게/반전 없음.
function drawWeed(ctx, x, y, s) {
  ctx.save();
  ctx.strokeStyle = '#3f4a1f'; ctx.lineWidth = s * 0.06; ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * s * 0.32, y + Math.sin(a) * s * 0.32);
    ctx.stroke();
  }
  ctx.fillStyle = '#8a3b3b'; // 작은 열매(붉은 점) — 대비
  ctx.beginPath(); ctx.arc(x, y, s * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
