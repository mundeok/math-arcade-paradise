// 곱셈 농장 — 숫자 선택 대신 직사각형 배열을 구성하는 체험 게임.
// 곱셈: 목표 칸 수를 만드는 배열이면 모두 허용. 나눗셈: 주어진 줄 수 고정.
// 드래그는 미리보기만 한다. 터치 취소가 end로 전달되는 공통 입력에서도
// 실수로 생명을 잃지 않도록 별도의 큰 '수확!' 버튼으로 제출한다.
import { L } from '../core/layout.js';
import { THEME, font, roundRect, hit } from '../core/ui.js';
import { drawPlayBackdrop } from '../art/toyArt.js';

const GRID = 9;
const PLOTS_PER_HARVEST = 4;
const FINISH_PLOTS = 16;

export const g11Farm = {
  id: 'g11_farm',
  name: '곱셈 농장',
  emoji: '🌱',
  category: '구성형',
  maxLevel: 2,
  blankRatio: 0,
  opMode: 'mixed',
  fever: { type: 'easy' },
  comboMilestones: { 5: '쑥쑥!', 10: '풍년이다!' },

  tutorial: {
    text: '밭을 드래그해 칸 수를 맞추고 [수확!]을 눌러봐! 나눗셈은 줄 수가 고정돼.',
    draw(ctx) {
      const cell = L.gu(1.8);
      const x = L.W / 2 - cell * 2;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          roundRect(ctx, x + c * cell, L.gu(2) + r * cell, cell - L.gu(0.1), cell - L.gu(0.1), L.gu(0.15));
          ctx.fillStyle = THEME.correct;
          ctx.fill();
        }
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.04));
      ctx.fillText('12칸 = 3줄 × 4칸', L.W / 2, L.gu(9));
    },
  },

  init(engine) {
    this.engine = engine;
    this.completed = 0;
    this.elapsed = 0;
    this.harvestT = 0;
    this.reward = null;
    this.history = [];
    this.done = false;
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
    // 공통 생성기를 사용해 복습 큐와 최근 문제 중복 방지 정책을 유지한다.
    // 혼합 설정에서는 두 연산을 번갈아 낸다. 교사의 연산 고정은 생성기가 우선한다.
    const mode = this.completed % 2 ? 'divide' : 'multiply';
    this.problem = e.problemGenerator.nextProblem({
      maxLevel: this.wasFever ? 1 : this.maxLevel,
      blankRatio: 0,
      opMode: mode,
    });
    this.division = this.problem.op === '÷';
    this.target = this.division ? this.problem.a : this.problem.answer;
    this.fixedRows = this.division ? this.problem.b : 0;
    this.rows = this.fixedRows || 1;
    this.cols = 1;
    this.hasSelection = false;
    this.dragging = false;
    this.buttonArmed = false;
    this.elapsed = 0;
    e.markQuestionStart();
  },

  _syncMode() {
    if (this.wasFever === this._isFever()) return false;
    if (this.wasFever) {
      this.reward = { text: 'FEVER 수확!', points: this.engine.scoreManager.score - this.feverStartScore, t: 0.7 };
    }
    // 전환 전에 그리던 밭과 제출 예약은 폐기한다. 완료한 밭은 그대로 유지한다.
    this._loadProblem();
    return true;
  },

  update(dt) {
    if (this.done) return;
    this._syncMode();
    this.elapsed += dt;
    this.harvestT = Math.max(0, this.harvestT - dt);
    if (this.reward) {
      this.reward.t -= dt;
      if (this.reward.t <= 0) this.reward = null;
    }
  },

  _select(x, y) {
    const { board, cell } = this._layout();
    // 배열은 하나의 연속 드래그 영역이다. 작은 셀 81개를 각각 탭하지 않는다.
    this.cols = Math.max(1, Math.min(GRID, Math.ceil((x - board.x) / cell)));
    this.rows = this.fixedRows || Math.max(1, Math.min(GRID, Math.ceil((y - board.y) / cell)));
    this.hasSelection = true;
  },

  _submit() {
    if (this.done || !this.hasSelection) return;
    const e = this.engine;
    const p = this.problem;
    const rows = this.rows;
    const cols = this.cols;
    const area = rows * cols;
    const userAnswer = this.division ? cols : area;
    const correct = area === this.target;
    // 버튼 연타/키 반복으로 하나의 밭을 두 번 제출하지 못하게 먼저 해제한다.
    this.hasSelection = false;
    this.dragging = false;
    this.buttonArmed = false;
    if (!correct) {
      // 곱셈의 피드백은 공통 생성기가 준 '가능한 배열 한 가지'이다.
      // 표준 문제 객체를 그대로 기록하므로 복습 큐 키도 훼손하지 않는다.
      e.answerWrong(p, userAnswer, { onResume: () => this._loadProblem() });
      return;
    }

    const quick = this.elapsed <= 4 * (e.settings.timeScale || 1) ? 20 : 0;
    const before = e.scoreManager.score;
    e.answerCorrect(p, userAnswer, 100 + e.scoreManager.combo * 5 + quick);
    this.completed++;
    this.history.push({ rows, cols });
    if (this.completed % PLOTS_PER_HARVEST === 0) {
      // 완주 보너스는 피버 배수와 별개의 고정 보상이다.
      e.scoreManager.addPoints(100);
      this.harvestT = 0.5;
      e.ui.shake(L.gu(0.1), 0.08);
    }
    const { board } = this._layout();
    e.particles.emit(L.W / 2, board.y + board.h / 2, 'sparkle', THEME.correct, this.wasFever ? 24 : 12);
    this.reward = {
      text: this.division ? `${area} ÷ ${rows} = ${cols}` : `${rows} × ${cols} = ${area}`,
      points: e.scoreManager.score - before,
      t: 0.5,
    };
    if (this.completed >= FINISH_PLOTS) {
      this.done = true;
      e.endGame();
      return;
    }
    this._loadProblem(); // 정답 연출을 기다리지 않고 다음 밭을 즉시 시작한다.
  },

  onTouch(x, y, phase) {
    if (this.done || this._syncMode()) return;
    const { board, button } = this._layout();
    if (phase === 'start') {
      this.buttonArmed = this.hasSelection && hit(button, x, y);
      this.dragging = hit(board, x, y);
      if (this.dragging) this._select(x, y);
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
    if (this.done || this._syncMode()) return;
    if (event.key === 'Enter' || event.key === ' ') {
      if (!event.repeat) this._submit();
      return;
    }
    const delta = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
    if (!delta) return;
    this.rows = this.fixedRows || Math.max(1, Math.min(GRID, this.rows + delta[0]));
    this.cols = Math.max(1, Math.min(GRID, this.cols + delta[1]));
    this.hasSelection = true;
  },

  render(ctx) {
    drawPlayBackdrop(ctx, this.id, this.elapsed);
    const { board, cell, button } = this._layout();
    // Quiet footer for the original instructions/progress; does not change hit boxes.
    roundRect(ctx, L.safe, board.y + board.h + L.gu(.22), L.W - L.safe * 2, L.zone.floor - board.y - board.h, L.gu(.35));
    ctx.fillStyle = '#456d60';ctx.fill();
    const cx = L.W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.wasFever ? THEME.gold : THEME.text;
    ctx.font = font(L.font(0.06));
    ctx.fillText(this.division ? `${this.problem.a} ÷ ${this.problem.b} = ?` : `${this.target}칸의 밭!`, cx, L.zone.problem);
    ctx.font = font(L.font(0.027));
    ctx.fillStyle = THEME.subtext;
    ctx.fillText(this.division ? `${this.fixedRows}줄 고정 · 한 줄에 몇 칸?` : '줄 수 × 한 줄의 칸 수를 맞춰봐!', cx, L.zone.playTop + L.gu(1));
    this.engine.fever?.renderGauge(ctx, { x: L.safe, y: L.zone.gauge - L.gu(0.35), w: L.W - L.safe * 2, h: L.gu(0.7) });

    // 완료한 밭은 작은 모양으로 누적한다. 숫자만 오르는 대신 수확한 흔적이 남는다.
    const slot = (L.W - L.safe * 2) / FINISH_PLOTS;
    for (let i = 0; i < FINISH_PLOTS; i++) {
      const plot = this.history[i];
      const maxSide = slot - L.gu(0.15);
      const w = plot ? maxSide * plot.cols / GRID : maxSide;
      const h = plot ? Math.max(L.gu(0.12), L.gu(0.55) * plot.rows / GRID) : L.gu(0.12);
      ctx.fillStyle = plot ? THEME.correct : THEME.disabled;
      ctx.fillRect(L.safe + i * slot, L.zone.playTop + L.gu(1.85) - h / 2, w, h);
    }

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const selected = this.hasSelection && r < this.rows && c < this.cols;
        const disabled = this.division && r >= this.fixedRows;
        const gap = L.gu(0.06);
        roundRect(ctx, board.x + c * cell + gap, board.y + r * cell + gap, cell - gap * 2, cell - gap * 2, L.gu(0.12));
        ctx.fillStyle = selected ? '#4b9060' : disabled ? '#b8ba99' : '#ba8c62';
        ctx.fill();
        if (selected) {
          // 모양으로도 선택 상태를 구분한다(색에만 의존하지 않음).
          ctx.fillStyle = THEME.text;
          ctx.fillRect(board.x + (c + 0.5) * cell - L.gu(0.03), board.y + (r + 0.35) * cell, L.gu(0.06), cell * 0.3);
          ctx.beginPath();
          ctx.ellipse(board.x + (c + 0.43) * cell, board.y + (r + 0.42) * cell, cell * 0.12, cell * 0.06, Math.PI / 5, 0, Math.PI * 2);
          ctx.ellipse(board.x + (c + 0.57) * cell, board.y + (r + 0.37) * cell, cell * 0.12, cell * 0.06, -Math.PI / 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.font = font(L.font(0.028));
    ctx.fillStyle = THEME.text;
    // 드래그 중 정답 합계를 보여주지 않는다. 크기를 바꾸며 정답 숫자만 복사하는 것을 방지.
    ctx.fillText(this.hasSelection ? `${this.rows}줄 · 한 줄 ${this.cols}칸` : '밭 위를 드래그해 크기 정하기', cx, board.y + board.h + L.gu(0.85));

    roundRect(ctx, button.x, button.y, button.w, button.h, L.gu(0.35));
    ctx.fillStyle = this.hasSelection ? THEME.accent : THEME.disabled;
    ctx.fill();
    ctx.fillStyle = THEME.text;
    ctx.font = font(L.font(0.038));
    ctx.fillText('수확!', button.x + button.w / 2, button.y + button.h / 2);
    ctx.font = font(L.font(0.025));
    ctx.fillStyle = this.harvestT > 0 ? THEME.gold : THEME.subtext;
    if (this.reward) {
      // 점수/완성 식은 하단 진행 표시를 잠깐 대체한다. 다음 문제와 밭을 가리지 않는다.
      ctx.fillStyle = THEME.gold;
      ctx.fillText(this.reward.text, L.W / 4, button.y + button.h / 2 - L.gu(0.35));
      ctx.fillText(`+${this.reward.points}`, L.W / 4, button.y + button.h / 2 + L.gu(0.45));
    } else {
      ctx.fillText(`${Math.floor(this.completed / 4)} / 4번 수확`, L.W / 4, button.y + button.h / 2 - L.gu(0.35));
      ctx.fillText(`${this.completed} / ${FINISH_PLOTS}개 밭`, L.W / 4, button.y + button.h / 2 + L.gu(0.45));
    }
  },

  destroy() {
    this.engine = null;
    this.problem = null;
    this.reward = null;
    this.history = [];
    this.dragging = false;
    this.buttonArmed = false;
    this.done = true;
  },
};
