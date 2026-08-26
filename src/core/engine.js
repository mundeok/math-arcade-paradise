// engine.js — 게임 루프, 상태 머신, 캔버스/스케일 관리 (SPEC 1.2, 3.1 / Phase0 §1)
// 논리 캔버스 800×1280 고정. 모든 좌표 계산은 이 좌표계로만 한다.
// devicePixelRatio를 반영해 backing store를 확대하고, CSS로 letterbox 스케일링한다.

import { Input } from './input.js';
import { ProblemGenerator } from './problemGenerator.js';
import { ScoreManager } from './scoreManager.js';
import { SoundManager } from './soundManager.js';
import { ParticleSystem } from './particle.js';
import { Session } from './session.js';
import { UI, LOGICAL_W, LOGICAL_H, THEME, font, roundRect } from './ui.js';
import { storage } from './storage.js';

export const STATE = {
  MENU: 'MENU',
  TUTORIAL: 'TUTORIAL',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  RESULT: 'RESULT',
  SETTINGS: 'SETTINGS',
  REPORT: 'REPORT',
  ORIENTATION_WARNING: 'ORIENTATION_WARNING',
};

const DEFAULT_SETTINGS = {
  operation: 'mixed', // 'multiply' | 'divide' | 'mixed'
  dans: [2, 3, 4, 5, 6, 7, 8, 9], // 활성 단
  fixedLevel: false, // 레벨 고정 ON/OFF
  fixedLevelValue: 1,
  timeScale: 1.0, // 제한시간 배율 0.8 / 1.0 / 1.5
  sound: false, // ⚠️ 효과음 기본 OFF (필수)
  music: false, // 배경음악 기본 OFF
};

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // 화면 변환 정보 (input.js가 참조) — CSS 픽셀 기준 스케일/오프셋
    this.viewport = { scale: 1, offsetX: 0, offsetY: 0 };

    // 교사 설정 로드
    this.settings = Object.assign({}, DEFAULT_SETTINGS, storage.get('settings', {}));

    // 공통 모듈 (게임은 engine을 통해 이들에 접근한다)
    this.problemGenerator = new ProblemGenerator(this.settings);
    this.scoreManager = new ScoreManager();
    this.sound = new SoundManager();
    this.particles = new ParticleSystem();
    this.session = new Session();
    this.ui = new UI(this);
    this.storage = storage;

    this.sound.setEnabled(this.settings.sound);
    this.sound.setMusicEnabled(this.settings.music);

    // 상태
    this.state = STATE.MENU;
    this.scenes = {}; // {menu, tutorial, result, settings, report}
    this.scene = null; // 현재 씬 객체 (PLAYING이 아닐 때)
    this.game = null; // 현재 게임 객체 (PLAYING/PAUSED)
    this.pendingGame = null; // 튜토리얼→플레이로 넘길 게임

    // 정답 표시 오버레이(1.2초 완전 정지) 상태
    this.freeze = { active: false, timer: 0, dur: 1.2, problem: null, onResume: null, gameOver: false };

    // 문제 응답시간 측정 시작점
    this.questionStartMs = 0;

    // 가로 모드 복귀용
    this.stateBeforeOrientation = null;

    this._gestured = false;
    this._lastTs = 0;

    this._setupCanvas();
    this.input = new Input(this);
    this._setupListeners();

    // RAF 루프 시작
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  registerScene(name, scene) {
    this.scenes[name] = scene;
  }

  // ── 캔버스/스케일 ─────────────────────────────────────────
  _setupCanvas() {
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3); // 과도한 backing store 방지
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // object-fit: contain — 논리 비율(800:1280)을 유지하며 화면에 맞춤
    const scale = Math.min(vw / LOGICAL_W, vh / LOGICAL_H);
    const cssW = LOGICAL_W * scale;
    const cssH = LOGICAL_H * scale;
    const offsetX = (vw - cssW) / 2;
    const offsetY = (vh - cssH) / 2;

    // 화면 표시 크기(CSS px)
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.canvas.style.left = offsetX + 'px';
    this.canvas.style.top = offsetY + 'px';

    // backing store: 논리 크기 × dpr
    this.canvas.width = Math.round(LOGICAL_W * dpr);
    this.canvas.height = Math.round(LOGICAL_H * dpr);

    // 논리 좌표(800×1280)로 그리면 되도록 스케일 세팅
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // input.js가 쓰는 CSS 픽셀 기준 변환값
    this.viewport = { scale, offsetX, offsetY };

    this._checkOrientation();
  }

  _checkOrientation() {
    const landscape = window.innerWidth > window.innerHeight;
    if (landscape && this.state !== STATE.ORIENTATION_WARNING) {
      // 가로 진입 → 경고 + 자동 일시정지
      this.stateBeforeOrientation = this.state;
      this.state = STATE.ORIENTATION_WARNING;
    } else if (!landscape && this.state === STATE.ORIENTATION_WARNING) {
      // 세로 복귀 → 이전 상태로. 게임 중이었다면 안전하게 일시정지 상태로 복귀.
      const prev = this.stateBeforeOrientation;
      this.stateBeforeOrientation = null;
      if (prev === STATE.PLAYING) {
        this.state = STATE.PAUSED;
      } else {
        this.state = prev || STATE.MENU;
      }
    }
  }

  _setupListeners() {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 100));

    // 이탈 방지: 게임 중 새로고침/닫기 경고 (SPEC 3.10)
    window.addEventListener('beforeunload', (e) => {
      if (this.state === STATE.PLAYING || this.state === STATE.PAUSED) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    });

    // 안드로이드 뒤로가기(popstate) → 일시정지 (SPEC 3.10)
    window.addEventListener('popstate', () => {
      if (this.state === STATE.PLAYING) {
        this.pause();
        history.pushState({ inGame: true }, ''); // 다시 스택에 넣어 앱 종료 방지
      }
    });
  }

  // 첫 사용자 제스처 — AudioContext resume (SPEC 3.10)
  markUserGesture() {
    if (this._gestured) return;
    this._gestured = true;
    this.sound.resume();
  }

  // ── 상태 전환 ─────────────────────────────────────────────
  setState(state) {
    this.state = state;
    if (this.scenes[stateToSceneKey(state)]) {
      this.scene = this.scenes[stateToSceneKey(state)];
      if (this.scene.enter) this.scene.enter(this);
    }
  }

  // 메뉴에서 게임 선택 → 튜토리얼
  goTutorial(game) {
    this.pendingGame = game;
    this.setState(STATE.TUTORIAL);
  }

  // 튜토리얼 [시작!] 또는 결과 [다시하기] → 실제 플레이 시작
  startGame(game) {
    this.game = game;
    this.scene = null;
    this.session.startGame();
    this.scoreManager.reset(game.id);
    this.problemGenerator.setSettings(this.settings);
    this.problemGenerator.reset();
    this.ui.reset();
    this.particles.clear();
    this.freeze.active = false;

    this.state = STATE.PLAYING;
    game.init(this);
    this.markQuestionStart();

    // 뒤로가기 대응용 히스토리 엔트리
    try {
      history.pushState({ inGame: true }, '');
    } catch (e) {
      /* file:// 등에서 실패 가능 — 무시 */
    }
  }

  // 문제 제시 시각 기록 (반응시간 측정용)
  markQuestionStart() {
    this.questionStartMs = performance.now();
  }
  get responseMs() {
    return Math.round(performance.now() - this.questionStartMs);
  }

  pause() {
    if (this.state === STATE.PLAYING) this.state = STATE.PAUSED;
  }
  resumeGame() {
    if (this.state === STATE.PAUSED) {
      this.state = STATE.PLAYING;
      this.markQuestionStart(); // 일시정지 시간은 반응시간에서 제외
    }
  }

  quitToMenu() {
    this.game = null;
    this.setState(STATE.MENU);
  }

  // ── 정답/오답 공통 처리 (게임이 호출) ────────────────────
  // 정답: 점수·콤보·라이프회복·연출·복습큐·레벨상향까지 일괄 처리
  answerCorrect(problem, userAnswer, points) {
    const rMs = this.responseMs;
    const res = this.scoreManager.registerCorrect(points);
    this.session.record({ gameId: this.game.id, question: problem, userAnswer, correct: true, responseMs: rMs });
    this.problemGenerator.reportResult(problem, true);
    // 레벨 상향: 콤보가 8의 배수 도달 시 (SPEC 2.1)
    if (res.combo > 0 && res.combo % 8 === 0) this.problemGenerator.raiseLevel();

    this.sound.play('correct');
    if (res.milestone) this._playComboMilestone(res.milestone);
    if (res.recovered) this.ui.showComboText('LIFE +1', false);

    this.markQuestionStart();
    return res;
  }

  // 오답/시간초과: 콤보 리셋 + (옵션)라이프 -1 + 정답 1.2초 표시 + 복습큐 + 레벨하향
  // opts.loseLife: 라이프 차감 여부 (반사신경 게임은 false 가능)
  // opts.onResume: 1.2초 후 다음 진행 콜백 (게임이 다음 문제 로드 등)
  // opts.freeze:    기본 true. false면 1.2초 정답표시 오버레이/화면정지/실패음을 생략하고
  //                 게임 흐름을 멈추지 않는다. 콤보 리셋·세션 기록만 처리(반사신경 '놓침'용).
  //                 이때 onResume은 쓰지 않는다(게임이 스스로 계속 진행).
  // opts.affectLevel: 기본 true. false면 problemGenerator.reportResult(레벨 하향·복습큐 등록)를
  //                 건너뛴다. '놓침'은 이해 부족이 아니라 반응 속도 문제라 수학 난이도 근거가 아니다.
  // opts.missed:    기본 false. 세션 기록에 '놓침' 여부를 남긴다(오답 '터치'와 구분 — 결과 화면용).
  answerWrong(problem, userAnswer, opts = {}) {
    const { loseLife = true, onResume = null, freeze = true, affectLevel = true, missed = false } = opts;
    const rMs = this.responseMs;
    const res = this.scoreManager.registerWrong({ loseLife });
    this.session.record({ gameId: this.game.id, question: problem, userAnswer, correct: false, responseMs: rMs, missed });
    // 레벨 하향·복습큐 등록 (반사신경 '놓침'은 affectLevel:false로 제외)
    if (affectLevel) this.problemGenerator.reportResult(problem, false);

    // freeze:false → 게임을 멈추지 않고 즉시 반환. 실패음도 재생하지 않는다(시각 연출만).
    if (!freeze) {
      if (res.gameOver) this.endGame(); // 안전장치(놓침은 loseLife:false라 실제 도달 안 함)
      return res;
    }

    this.sound.play('wrong');
    this.ui.shake(16, 0.35);

    // 정답 표시 오버레이 시작 (이 동안 게임 완전 정지)
    this.freeze.active = true;
    this.freeze.timer = 0;
    this.freeze.problem = problem;
    this.freeze.onResume = onResume;
    this.freeze.gameOver = res.gameOver;

    return res;
  }

  // 시간초과를 오답과 동일하게 처리하고 싶을 때 사용하는 별칭
  timeUp(problem, opts = {}) {
    return this.answerWrong(problem, null, opts);
  }

  _playComboMilestone(m) {
    const map = { 5: 'GREAT!', 10: 'PERFECT!', 20: 'AMAZING!', 30: 'LEGEND!' };
    const text = map[m] || 'COMBO!';
    this.ui.showComboText(text, m >= 20);
    this.sound.play('combo');
    if (m >= 10) {
      this.particles.emit(LOGICAL_W / 2, LOGICAL_H * 0.4, m >= 20 ? 'explode' : 'sparkle', THEME.gold, m >= 20 ? 40 : 20);
    }
  }

  endGame() {
    this.state = STATE.RESULT;
    this.scene = this.scenes.result;
    if (this.scene && this.scene.enter) this.scene.enter(this);
  }

  isFrozen() {
    return this.freeze.active;
  }

  // ── 루프 ─────────────────────────────────────────────────
  _loop(ts) {
    if (!this._lastTs) this._lastTs = ts;
    let dt = (ts - this._lastTs) / 1000;
    this._lastTs = ts;
    // dt 상한 클램프: 탭 전환 후 큰 점프로 물체가 순간이동하는 것 방지 (SPEC Phase0 §1)
    if (dt > 0.05) dt = 0.05;

    this._update(dt);
    this._render();

    requestAnimationFrame(this._loop);
  }

  _update(dt) {
    // 오버레이/파티클은 항상 갱신 (정지 중에도 정답 표시가 진행돼야 함)
    this.ui.update(dt);

    if (this.state === STATE.PLAYING) {
      if (this.freeze.active) {
        // 정답 표시 중 — 게임 로직 완전 정지, 타이머만 진행
        this.freeze.timer += dt;
        if (this.freeze.timer >= this.freeze.dur) {
          this.freeze.active = false;
          const gameOver = this.freeze.gameOver;
          const cb = this.freeze.onResume;
          this.freeze.onResume = null;
          if (gameOver) {
            this.endGame();
          } else {
            this.markQuestionStart();
            if (cb) cb();
          }
        }
        this.particles.update(dt);
      } else {
        if (this.game && this.game.update) this.game.update(dt);
        this.particles.update(dt);
      }
    } else {
      // 씬 업데이트 (애니메이션 등)
      this.particles.update(dt);
      if (this.scene && this.scene.update) this.scene.update(dt);
    }
  }

  _render() {
    const ctx = this.ctx;
    // 배경
    ctx.save();
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // 화면 흔들림 적용
    const shake = this.ui.getShakeOffset();
    ctx.translate(shake.x, shake.y);

    switch (this.state) {
      case STATE.PLAYING:
      case STATE.PAUSED: {
        if (this.game && this.game.render) this.game.render(ctx);
        this.particles.render(ctx);
        this.ui.drawHUD(ctx, {
          score: this.scoreManager.score,
          combo: this.scoreManager.combo,
          lives: this.scoreManager.lives,
          showPause: this.state === STATE.PLAYING,
        });
        this.ui.renderComboOverlays(ctx);
        if (this.freeze.active) {
          this.ui.renderAnswerFeedback(ctx, this.freeze.problem, this.freeze.timer / this.freeze.dur);
        }
        if (this.state === STATE.PAUSED) this._renderPauseOverlay(ctx);
        break;
      }
      case STATE.ORIENTATION_WARNING:
        this._renderOrientationWarning(ctx);
        break;
      default: {
        if (this.scene && this.scene.render) this.scene.render(ctx);
        this.particles.render(ctx);
        this.ui.renderComboOverlays(ctx);
        break;
      }
    }

    this.ui.renderFlash(ctx);
    ctx.restore();
  }

  _renderPauseOverlay(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(10,15,25,0.8)';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.text;
    ctx.font = font(72);
    ctx.fillText('잠깐 쉬는 중', LOGICAL_W / 2, 360);

    this._pauseButtons().forEach((b) => this.ui.drawButton(ctx, b));
    ctx.restore();
  }
  _pauseButtons() {
    const w = 480,
      h = 130,
      x = (LOGICAL_W - w) / 2;
    return [
      { x, y: 520, w, h, label: '▶ 계속하기', color: THEME.correct, action: 'resume' },
      { x, y: 690, w, h, label: '메뉴로 나가기', color: THEME.panel, action: 'menu' },
    ];
  }

  _renderOrientationWarning(ctx) {
    ctx.save();
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(160);
    ctx.fillText('📱', LOGICAL_W / 2, LOGICAL_H / 2 - 120);
    ctx.fillStyle = THEME.text;
    ctx.font = font(56);
    ctx.fillText('기기를 세로로', LOGICAL_W / 2, LOGICAL_H / 2 + 60);
    ctx.fillText('돌려주세요', LOGICAL_W / 2, LOGICAL_H / 2 + 140);
    ctx.restore();
  }

  // ── 입력 라우팅 ───────────────────────────────────────────
  dispatchTouch(x, y, phase) {
    switch (this.state) {
      case STATE.PLAYING:
        // 일시정지 버튼은 항상 우선
        if (phase === 'start' && this.ui.hitPause(x, y)) {
          this.pause();
          return;
        }
        // 정답 표시 중(정지)에는 게임 입력 차단
        if (this.freeze.active) return;
        if (this.game && this.game.onTouch) this.game.onTouch(x, y, phase);
        break;
      case STATE.PAUSED:
        if (phase === 'end') {
          for (const b of this._pauseButtons()) {
            if (hitBtn(b, x, y)) {
              if (b.action === 'resume') this.resumeGame();
              else this.quitToMenu();
              return;
            }
          }
        }
        break;
      case STATE.ORIENTATION_WARNING:
        break;
      default:
        if (this.scene && this.scene.onTouch) this.scene.onTouch(x, y, phase);
        break;
    }
  }

  dispatchKey(e) {
    if (this.state === STATE.PLAYING) {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        this.pause();
        return;
      }
      if (!this.freeze.active && this.game && this.game.onKey) this.game.onKey(e);
    } else if (this.state === STATE.PAUSED) {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') this.resumeGame();
    } else if (this.scene && this.scene.onKey) {
      this.scene.onKey(e);
    }
  }

  // ── 마우스 hover 라우팅 (마우스 전용) ─────────────────────
  // 클릭 가능한 요소 위에 커서가 있으면 canvas 커서를 'pointer', 아니면 'default'로 바꾼다.
  // 씬/게임의 onHover(x,y)는 "클릭 가능 요소 위인가"를 boolean으로 반환한다(선택적 메서드).
  // 터치 입력은 hover를 발생시키지 않는다(input.js가 마우스 이동에서만 호출).
  dispatchHover(x, y) {
    let over = false;
    switch (this.state) {
      case STATE.PLAYING:
        if (!this.freeze.active) {
          if (this.ui.hitPause(x, y)) over = true;
          else if (this.game && this.game.onHover) over = !!this.game.onHover(x, y);
        }
        break;
      case STATE.PAUSED:
        over = this._pauseButtons().some((b) => hitBtn(b, x, y));
        break;
      case STATE.ORIENTATION_WARNING:
        break;
      default:
        if (this.scene && this.scene.onHover) over = !!this.scene.onHover(x, y);
        break;
    }
    this.canvas.style.cursor = over ? 'pointer' : 'default';
  }

  // 커서/ hover 상태 초기화. 터치 시작 시(터치 기기 hover 잔상 방지)와 마우스 이탈 시 호출된다.
  clearHover() {
    this.canvas.style.cursor = 'default';
    if (this.game && this.game.clearHover) this.game.clearHover();
    if (this.scene && this.scene.clearHover) this.scene.clearHover();
  }

  // 교사 설정 저장 + 즉시 반영
  saveSettings(newSettings) {
    this.settings = Object.assign({}, this.settings, newSettings);
    storage.set('settings', this.settings);
    this.problemGenerator.setSettings(this.settings);
    this.sound.setEnabled(this.settings.sound);
    this.sound.setMusicEnabled(this.settings.music);
  }
}

function stateToSceneKey(state) {
  return {
    [STATE.MENU]: 'menu',
    [STATE.TUTORIAL]: 'tutorial',
    [STATE.RESULT]: 'result',
    [STATE.SETTINGS]: 'settings',
    [STATE.REPORT]: 'report',
  }[state];
}

function hitBtn(b, x, y) {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}
