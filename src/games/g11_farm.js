// 곱셈 농장 — 60초 수확 챌린지(재설계 2026-09-15, 시간 러너판).
//   구조: 9×9 '영구 밭'에 직사각형 배열을 끼워 넣어 수확한다. 종료는 밭이 차서가 아니라 **시간(60초)**이며,
//         **연속 수확할수록 시간이 더 붙는다**("잘하면 더 오래" — 피버 정신과 결이 같음).
//   - 밭이 가득 차 현재 목표를 놓을 자리가 없으면 → 라운드 종료가 아니라 **'밭 정리!'**(비우고 보너스 시간·점수)
//     후 새 밭에서 계속. 채우는 공간 전략(방향 전환·겹침 회피·잡초)은 그대로 살린다.
//   - 오답(계산 틀림)=시간 −3초(라이프 미차감). 겹침=무페널티 피드백. 목표 칸수는 작게(≤12) 제한해
//     한 번에 밭을 다 채우지 못하게 한다(여러 번에 걸쳐 채움).
//   드래그는 미리보기만, 제출은 [수확!] 버튼. core/scenes·다른 게임 파일은 건드리지 않는다(§1.3·§6).
import { L } from '../core/layout.js';
import { THEME, font, roundRect, hit } from '../core/ui.js';
import { drawPlayBackdrop } from '../art/toyArt.js';

const GRID = 9;
const CELLS = GRID * GRID;
const EMPTY = 0, CROP = 1, WEED = 2;
const WEED_CAP = Math.floor(CELLS * 0.4); // 잡초 상한(완전 봉쇄 방지)
const MAX_TARGET = 12; // 한 번에 놓는 배열 크기 상한(밭을 여러 번에 걸쳐 채우도록). 3×4·2×6 등 방향전환 살아있음.
const ROUND_SEC = 60;  // 기본 제한시간(교사 timeScale 반영)
const WRONG_PENALTY = 3; // 오답 시 시간 차감(초)
const CLEAR_BONUS_SEC = 7; // '밭 정리' 보너스 시간(초) — 애써 채운 밭을 비우는 보상이므로 넉넉히
const CLEAR_BONUS_PTS = 200; // '밭 정리' 보너스 점수

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
    text: '60초 안에 최대한 많이 수확! 연속 수확하면 시간이 늘어나. 빈 자리에 배열을 끼워 넣자.',
    draw(ctx) {
      const cell = L.gu(1.6);
      const x = L.W / 2 - cell * 3;
      const y = L.gu(2);
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
    this.harvests = 0; // 총 수확 수(결과용)
    this.fieldsCleared = 0; // 정리한 밭 수
    this.bestStreak = 0; // 최고 연속 수확
    this.timeLeft = ROUND_SEC * (engine.settings.timeScale || 1);
    this.timeFlash = 0; // 시간 증감 강조
    this.reward = null; // 정답 피드백 {text, points, t}
    this.blockMsg = 0; // "겹쳐서 안 돼요"
    this.clearMsg = 0; // "밭 정리!"
    this.ending = null; // 시간 종료 배너
    this.wasFever = false;
    this.feverStartScore = 0;
    this.anchor = null;
    this.sel = null;
    this.hasSelection = false;
    this.dragging = false;
    this.buttonArmed = false;
    this.kRows = 1; this.kCols = 1;
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
    // 지금 밭에 들어가는 작은 목표(≤MAX_TARGET)를 찾을 때까지 재생성. 못 찾으면 밭을 정리(비우기)하고 재시도.
    let fits = false;
    for (let t = 0; t < 24 && !fits; t++) {
      const mode = (this.answered + t) % 2 ? 'divide' : 'multiply';
      const lvl = this.wasFever ? 1 : t < 8 ? this.maxLevel : 1; // 안 되면 Lv1(작은 목표)로 낮춰 자리 확보
      const p = e.problemGenerator.nextProblem({ maxLevel: lvl, blankRatio: 0, opMode: mode });
      this.problem = p;
      this.division = p.op === '÷';
      this.target = this.division ? p.a : p.answer;
      this.fixedRows = this.division ? p.b : 0;
      if (this.target <= MAX_TARGET && this._canFitAnywhere()) fits = true;
    }
    this.hasSelection = false;
    this.dragging = false;
    this.buttonArmed = false;
    this.anchor = null;
    this.sel = null;
    this.kRows = this.fixedRows || 1;
    this.kCols = 1;
    this.elapsed = 0;
    e.markQuestionStart();
    // 작은 목표조차 들어갈 자리가 없다 = 밭이 가득 → 라운드 종료가 아니라 '밭 정리'하고 계속(시간 러너).
    if (!fits) this._clearField();
  },

  _clearField() {
    const e = this.engine;
    this.grid = Array.from({ length: GRID }, () => new Array(GRID).fill(EMPTY));
    const filled = this.cropCount;
    this.cropCount = 0;
    this.weedCount = 0;
    this.fieldsCleared++;
    this.timeLeft += CLEAR_BONUS_SEC * (e.settings.timeScale || 1);
    this.timeFlash = 0.5;
    e.scoreManager.addPoints(CLEAR_BONUS_PTS);
    this.clearMsg = 1.0;
    e.ui.showComboText(`🌾 밭 정리! +${CLEAR_BONUS_SEC}초`, true);
    e.ui.flash('rgba(255,220,140,0.3)', 0.1);
    e.particles.emit(L.W / 2, this._layout().board.y + this._layout().board.h / 2, 'sparkle', THEME.gold, Math.min(40, 12 + filled));
    e.sound.play('fanfare');
    this._loadProblem(); // 빈 밭이므로 이번엔 반드시 들어간다(무한루프 없음).
  },

  _targetPairs() {
    const pairs = [];
    if (this.division) {
      const cols = this.target / this.fixedRows;
      if (this.fixedRows >= 1 && this.fixedRows <= GRID && Number.isInteger(cols) && cols >= 1 && cols <= GRID) pairs.push([this.fixedRows, cols]);
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

  // 풍년 타임 전용: 클릭한 칸(cr,cc) 근처에서 목표에 맞는 빈 직사각형을 하나 찾는다(없으면 밭 어디든 첫 자리).
  //   → 아무 곳이나 탭해도 알아서 잘 수확되게(마음껏 수확 해방). 클릭 칸을 포함하는 배치를 최우선.
  _autoFit(cr, cc) {
    let best = null, bestScore = Infinity;
    for (const [rr, cols] of this._targetPairs()) {
      for (let r0 = 0; r0 + rr <= GRID; r0++) for (let c0 = 0; c0 + cols <= GRID; c0++) {
        if (!this._rectEmpty(r0, c0, rr, cols)) continue;
        const contains = cr >= r0 && cr < r0 + rr && cc >= c0 && cc < c0 + cols;
        const dist = Math.abs(r0 + rr / 2 - 0.5 - cr) + Math.abs(c0 + cols / 2 - 0.5 - cc);
        const score = dist - (contains ? 1000 : 0);
        if (score < bestScore) { bestScore = score; best = { r0, c0, rows: rr, cols }; }
      }
    }
    return best;
  },

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

  _growWeeds() {
    if (this._isFever()) return; // 피버 중 잡초 정지(해방 구간)
    const n = this.answered;
    let add = 0;
    if (n <= 8) add = n % 4 === 0 ? 1 : 0;
    else if (n <= 20) add = n % 2 === 0 ? 1 : 0;
    else add = 1;
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

  // 연속 수확이 붙여주는 시간(초). ⚠️ 이 게임의 수확 한 번은 '계산+빈자리 탐색+배치'라 ~4~7초가 걸리므로,
  //   보너스가 그보다 커야 '잘하면 더 오래' 루프가 실제로 성립한다. 콤보와 목표 크기(큰 배열=더 오래 걸림)로
  //   ~3.3~5.5초. 능숙한 연속은 시간을 벌고, 헤매면 자연 종료된다.
  _timeBonus(combo) {
    const sec = Math.min(5.5, 3 + combo * 0.2 + (this.target - 6) * 0.15);
    return sec * (this.engine.settings.timeScale || 1);
  },

  _submit() {
    if (this.ending || !this.hasSelection || !this.sel) return;
    const e = this.engine;
    const sel = this.sel;
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
    if (!correct) {
      // 오답 = 시간 −3초(라이프 미차감). 1.2초 정답표시·복습은 기존 처리 재사용.
      this.timeLeft = Math.max(0, this.timeLeft - WRONG_PENALTY * (e.settings.timeScale || 1));
      this.timeFlash = 0.5;
      e.answerWrong(p, userAnswer, { loseLife: false, onResume: () => this._loadProblem() });
      return;
    }
    // 정답: 작물 배치 + 점수 + 연속 수확 시간 보너스 + 잡초 성장 + 다음 문제.
    const quick = this.elapsed <= 4 * (e.settings.timeScale || 1) ? 20 : 0;
    const before = e.scoreManager.score;
    e.answerCorrect(p, userAnswer, 100 + e.scoreManager.combo * 5 + quick);
    const combo = e.scoreManager.combo;
    this.bestStreak = Math.max(this.bestStreak, combo);
    const tb = this._timeBonus(combo);
    this.timeLeft += tb;
    this.timeFlash = 0.5;
    this.answered++;
    this.harvests++;
    this._plant(sel);
    const { board, cell } = this._layout();
    e.particles.emit(board.x + (sel.c0 + sel.cols / 2) * cell, board.y + (sel.r0 + sel.rows / 2) * cell, 'sparkle', THEME.correct, this.wasFever ? 20 : 12);
    this.reward = {
      text: this.division ? `${this.target} ÷ ${rows} = ${cols}` : `${rows} × ${cols} = ${this.target}`,
      points: e.scoreManager.score - before, time: tb, t: 0.6,
    };
    this._growWeeds();
    this._loadProblem(); // 자리 없으면 _loadProblem 안에서 '밭 정리' 후 계속
  },

  _timeUp() {
    if (this.ending) return;
    this.ending = { t: 0, dur: 1.6 };
    this.hasSelection = false; this.sel = null;
    this.engine.ui.showComboText(`⏱ 시간 종료! ${this.harvests}수확`, true);
    this.engine.sound.play('fanfare');
  },

  _syncMode() {
    if (this.wasFever === this._isFever()) return false;
    if (this.wasFever) {
      // 풍년 타임 종료: 그동안 번 점수를 배너로.
      this.reward = { text: 'FEVER 수확!', points: this.engine.scoreManager.score - this.feverStartScore, time: 0, t: 0.7 };
    } else {
      // 풍년 타임 진입: 시간 정지(update)·점수 배수(엔진)에 더해, 기존 잡초가 시들어 사라지고 금빛 연출.
      this._witherWeeds();
      this.engine.ui.showComboText('🌻 풍년 타임! 시간 정지', true);
      this.engine.ui.flash('rgba(255,220,120,0.4)', 0.1);
      this.engine.sound.play('fanfare');
    }
    this._loadProblem();
    return true;
  },

  // 풍년 타임 진입 시 기존 잡초를 모두 없앤다(밭이 넓어지는 해방 연출). 작물은 유지.
  _witherWeeds() {
    const { board } = this._layout();
    const w = this.weedCount;
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) if (this.grid[r][c] === WEED) this.grid[r][c] = EMPTY;
    this.weedCount = 0;
    if (w > 0) this.engine.particles.emit(L.W / 2, board.y + board.h / 2, 'sparkle', THEME.gold, Math.min(30, 10 + w * 2));
  },

  update(dt) {
    if (this.ending) {
      this.ending.t += dt;
      if (this.ending.t >= this.ending.dur) this.engine.endGame();
      return;
    }
    this._syncMode();
    this.elapsed += dt;
    // ⚠️ 피버(풍년 타임)=시간 해방: 지속 동안 타이머가 멈춘다(반사신경 게임의 무적에 해당).
    if (!this._isFever()) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this._timeUp(); return; }
    }
    if (this.timeFlash > 0) this.timeFlash = Math.max(0, this.timeFlash - dt);
    if (this.blockMsg > 0) this.blockMsg = Math.max(0, this.blockMsg - dt);
    if (this.clearMsg > 0) this.clearMsg = Math.max(0, this.clearMsg - dt);
    if (this.reward) { this.reward.t -= dt; if (this.reward.t <= 0) this.reward = null; }
  },

  onTouch(x, y, phase) {
    if (this.ending || this._syncMode()) return;
    const { board, button, cell } = this._layout();
    // 풍년 타임: 밭 아무 곳이나 탭하면 맞는 배열을 자동으로 찾아 즉시 수확(드래그·버튼 불필요).
    if (this._isFever()) {
      if (phase === 'start' && hit(board, x, y)) {
        const cc = Math.max(0, Math.min(GRID - 1, Math.floor((x - board.x) / cell)));
        const cr = Math.max(0, Math.min(GRID - 1, Math.floor((y - board.y) / cell)));
        const fit = this._autoFit(cr, cc);
        if (fit) { this._setSel(fit.r0, fit.c0, fit.rows, fit.cols); this._submit(); }
      }
      return;
    }
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
    // 풍년 타임: 아무 키(Enter/Space)로도 자동 수확.
    if (this._isFever()) {
      if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
        const mid = Math.floor(GRID / 2);
        const fit = this._autoFit(mid, mid);
        if (fit) { this._setSel(fit.r0, fit.c0, fit.rows, fit.cols); this._submit(); }
      }
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      if (!event.repeat) this._submit();
      return;
    }
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

    this.engine.fever?.renderGauge(ctx, { x: L.safe, y: L.zone.gauge - L.gu(0.35), w: L.W - L.safe * 2, h: L.gu(0.7) });

    // 문제
    ctx.fillStyle = this.wasFever ? THEME.gold : THEME.text;
    ctx.font = font(L.font(0.05));
    ctx.fillText(this.division ? `${this.problem.a} ÷ ${this.problem.b} = ?` : `${this.target}칸의 밭!`, cx, L.zone.problem - L.gu(0.2));

    // ⏱ 시간 바(가장 크게). 낮으면 빨강+⏱ 아이콘+맥박(§2.5 — 색만 의존 안 함).
    const full = ROUND_SEC * (this.engine.settings.timeScale || 1);
    const ratio = Math.max(0, Math.min(1, this.timeLeft / full));
    const tw = L.W - L.safe * 2, th = L.gu(0.95), tx = L.safe, ty = L.zone.playTop + L.gu(0.45);
    const fever = this._isFever();
    const low = !fever && this.timeLeft <= 10;
    const pulse = low ? 0.7 + 0.3 * Math.sin(this.elapsed * 6) : 1;
    roundRect(ctx, tx, ty, tw, th, th / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fill();
    if (fever) {
      // 풍년 타임: 시간 정지 → 바를 금빛으로 가득 채워 '멈춤'을 알린다.
      roundRect(ctx, tx, ty, tw, th, th / 2);
      ctx.fillStyle = THEME.gold;
      ctx.fill();
    } else if (ratio > 0) {
      roundRect(ctx, tx, ty, Math.max(th * 1.6, tw * ratio), th, th / 2); // 저값에서도 '바'로 읽히게 최소 폭
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = low ? THEME.wrong : ratio > 0.4 ? THEME.correct : THEME.gold;
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = fever ? '#5a4410' : THEME.text; // 금빛 바 위엔 어두운 글자(대비)
    ctx.font = font(L.font(0.036));
    ctx.fillText(fever ? '🌻 풍년 타임! 시간 정지' : `${low ? '⏱ ' : ''}${Math.ceil(this.timeLeft)}초`, cx, ty + th / 2);

    // 채움% + 수확 수(작게)
    ctx.font = font(L.font(0.024), 'normal');
    ctx.fillStyle = THEME.subtext;
    ctx.textAlign = 'left';
    ctx.fillText(`🌾 ${this.harvests}수확 · 밭 ${this._fillPct()}%`, L.safe, ty + th + L.gu(0.7));
    ctx.textAlign = 'right';
    ctx.fillText(this.fieldsCleared > 0 ? `정리 ${this.fieldsCleared}판` : '연속 수확=시간↑', L.W - L.safe, ty + th + L.gu(0.7));
    ctx.textAlign = 'center';

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

    // 풍년 타임: 밭 위에 금빛 빛번짐(밝게만 — §2.5, lighter 합성)
    if (this._isFever()) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,205,80,${0.1 + 0.05 * (0.5 + 0.5 * Math.sin(this.elapsed * 4))})`;
      roundRect(ctx, board.x, board.y, board.w, board.h, L.gu(0.3));
      ctx.fill();
      ctx.restore();
    }

    // 배치 미리보기
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
        ctx.globalAlpha = 0.8; ctx.strokeStyle = '#fff'; ctx.lineWidth = L.gu(0.08);
        for (let d = -ph; d < pw; d += L.gu(0.6)) { ctx.beginPath(); ctx.moveTo(px + Math.max(0, d), py + Math.max(0, -d)); ctx.lineTo(px + Math.min(pw, d + ph), py + Math.min(ph, ph - d)); ctx.stroke(); }
      }
      ctx.restore();
    }

    // 하단 정보 줄
    ctx.font = font(L.font(0.027), 'normal');
    let info;
    if (this._isFever()) info = '🌻 밭 아무 곳이나 탭하면 바로 수확!';
    else if (this.clearMsg > 0) info = '🌾 밭 정리 완료! 새 밭에서 계속';
    else if (this.blockMsg > 0) info = '⛔ 겹쳐서 안 돼요 — 자리를 다시 골라봐';
    else if (sel && !sel.correctArea) info = `${sel.rows}줄 · ${sel.cols}칸 = ${sel.rows * sel.cols}칸 (목표 ${this.target})`;
    else if (this.hasSelection) info = `${sel.rows}줄 · 한 줄 ${sel.cols}칸 — [수확!]`;
    else info = this.division ? `${this.fixedRows}줄 고정 · 빈 자리에 끼워 넣기` : '방향 바꿔가며 빈 자리에 끼워 넣기!';
    ctx.fillStyle = this.blockMsg > 0 ? THEME.wrong : this.clearMsg > 0 ? THEME.gold : THEME.text;
    ctx.fillText(info, cx, board.y + board.h + L.gu(0.85));

    // 수확 버튼 (풍년 타임엔 탭만으로 수확되므로 안내 라벨로 바뀜)
    const fever2 = this._isFever();
    const canHarvest = fever2 || (this.hasSelection && sel && !sel.overlap && sel.inGrid && sel.correctArea);
    roundRect(ctx, button.x, button.y, button.w, button.h, L.gu(0.35));
    ctx.fillStyle = canHarvest ? THEME.accent : THEME.disabled;
    ctx.fill();
    ctx.fillStyle = THEME.text;
    ctx.font = font(L.font(0.038));
    ctx.fillText(fever2 ? '🌻 탭 수확!' : '수확!', button.x + button.w / 2, button.y + button.h / 2);

    // 좌하단: 보상(식·점수·+시간)
    ctx.font = font(L.font(0.026));
    if (this.reward) {
      ctx.fillStyle = THEME.gold;
      ctx.fillText(this.reward.text, L.W / 4, button.y + button.h / 2 - L.gu(0.4));
      const extra = this.reward.time > 0 ? `  +${this.reward.time.toFixed(1)}초` : '';
      ctx.fillText(`+${this.reward.points}${extra}`, L.W / 4, button.y + button.h / 2 + L.gu(0.45));
    } else {
      ctx.fillStyle = THEME.subtext;
      ctx.fillText(`연속 ${this.engine.scoreManager.combo}`, L.W / 4, button.y + button.h / 2 - L.gu(0.4));
      ctx.fillText(`최고연속 ${this.bestStreak}`, L.W / 4, button.y + button.h / 2 + L.gu(0.45));
    }

    // 시간 종료 배너
    if (this.ending) {
      const prog = this.ending.t / this.ending.dur;
      ctx.save();
      ctx.globalAlpha = prog < 0.85 ? 1 : Math.max(0, 1 - (prog - 0.85) / 0.15);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = THEME.gold;
      ctx.font = font(L.font(0.058));
      ctx.lineWidth = L.gu(0.22); ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.strokeText(`⏱ 시간 종료!`, cx, L.y(0.46));
      ctx.fillText(`⏱ 시간 종료!`, cx, L.y(0.46));
      ctx.font = font(L.font(0.038), 'normal');
      ctx.fillStyle = THEME.text;
      ctx.fillText(`총 ${this.harvests}수확 · 정리 ${this.fieldsCleared}판 · 최고연속 ${this.bestStreak}`, cx, L.y(0.46) + L.gu(2.4));
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
  ctx.fillStyle = '#8a3b3b';
  ctx.beginPath(); ctx.arc(x, y, s * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
