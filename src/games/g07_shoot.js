// g07_shoot.js — 💣 슈팅 계산 (SPEC §4 7️⃣ / Phase 4)
// 반사신경형(액션). 상단 문제 고정. 위에서 '숫자 로봇'이 내려오고, 정답 로봇만 멈춘다.
// 확정 인터페이스(SPEC §7)만 사용한다. core/scenes는 절대 건드리지 않는다.
//
// ⚠️ 조작(사용자 지시로 SPEC §4 7️⃣에서 변경 — SPEC.md는 아직 자동 발사로 되어 있어 갱신 필요):
//   자동 발사를 없애고 플레이어가 발사 시점을 정한다. 자동 발사는 정답 레인 도착 전에 총알이 나가
//   이동 중 오답 로봇을 맞혀 의도치 않게 실패하는 문제가 있었다. 그래서 '수동 발사'로 바꾼다.
//   - 이동: 손가락 x를 따라 발사기가 이동(터치 start·move). ⚠️ 이동만으로는 절대 발사하지 않는다.
//   - 발사: 손가락을 뗄 때(탭/드래그 후 릴리즈, 그 자리에서 발사) 또는 스페이스바. 키보드 이동은 ← →.
//   - 연사 방지: 발사 후 0.3초 쿨다운.
//   - 로봇은 각자 '레인'(고정 x)에서 수직으로만 내려오고, 탄환은 발사 순간 발사기 레인으로만 직진한다
//     → 탭한 레인의 로봇만 맞는다(다른 레인엔 안 맞음). "정답 레인에 가서 쏜다"가 명확한 의도가 된다.
//
// 라이프(SPEC §4 7️⃣):
//   - 오답 로봇을 멈춤        → answerWrong(loseLife:true) : 라이프 -1 + 정답표시 1.2초
//   - 정답 로봇이 바닥 도달   → answerWrong(null, loseLife:true) : 라이프 -1 + 정답표시(놓쳤으니 짚어줌)
//   - 오답 로봇이 바닥 도달   → 무해(그냥 사라짐). 페널티 없음.
//
// 정서 안전(SPEC §2.5, 지시사항): '파괴'보다 중립적으로 — "숫자 로봇 정지". 폭발은 별·연기 구름 등
//   비현실적 표현으로. ❌ 색 반전·화면 어둡게 금지. 난이도는 속도·혼동값(오답 근접도)으로만.
//
// 재미 표준(§2.6): fever:true, 니어미스(정답 로봇 바닥 직전 정지), 정답 즉시 진행, 손맛, L 헬퍼 좌표.
//   고유 재미(이동과 조준): 정지 시 별·연기로 흩어짐, 연속 격추 시 탄환이 커진다.

import { L } from '../core/layout.js';
import { THEME, font } from '../core/ui.js';

// ── 시간 상수(초). 정답 연출은 흐름을 멈추지 않는다(§2.6 상한 준수). ──
const HITSTOP = 0.05; // 순간 정지(0.03~0.06)
const FLASH_DUR = 0.08; // 플래시(0.05~0.10)
const SHAKE_TIME = 0.1; // 흔들림(0.08~0.12)
const ZOOM_DUR = 0.06; // 미세 확대
const ZOOM_MAX = 0.01; // 1.01배
const FLOAT_DUR = 0.6; // 획득 점수 부양(≤0.70)
const PUFF_DUR = 0.4; // 연기 구름(파티클 상한 내)

const FIRE_COOLDOWN = 0.3; // 수동 발사 후 연사 방지 쿨다운
const BASE_SEC = 3.4; // 콤보0에서 로봇이 화면을 내려오는 시간(느긋 — 조준 여유)
const MIN_SEC = 1.7; // 하강 최소 시간(하드 클램프)

const NEARMISS_TTF = 0.35; // 바닥 닿기 0.35초 이내에 정지 → 니어미스
const NEARMISS_DIST_RATIO = 0.1; // 또는 남은 거리 화면 높이 10% 이하

export const g07Shoot = {
  id: 'g07_shoot',
  name: '슈팅 계산',
  emoji: '💣',
  category: '액션형',
  maxLevel: 3, // 출제 상한 Lv3 (SPEC 2.1 반사신경형)
  blankRatio: 0, // 반사신경형은 빈칸 미출제
  opMode: 'multiply', // 곱셈만 출제(교사 설정이 특정 연산이면 교사 우선)
  comboMilestones: { 10: '명중왕!', 20: '무적포격!' }, // 게임 고유 문구(core 기본 대체)
  fever: { type: 'easy' }, // 재미 표준 피버 opt-in → engine.fever (§7.6). easy=피버 중 쉬운 문제형

  // ── 크기(L 기반 getter) ──
  get enemyR() {
    return L.w(0.066); // 로봇 반지름(≈53). 레인 폭 절반보다 작아 오폭 없음
  },
  get charW() {
    return L.w(0.16);
  },
  get charH() {
    return L.gu(2.3);
  },
  get charY() {
    return L.y(0.86); // 발사기 중심 y(하단 조작 영역)
  },
  get floorY() {
    return L.y(0.8); // 로봇이 '바닥 도달'로 판정되는 선(발사기 위)
  },
  get topY() {
    return L.zone.playTop + L.gu(1); // 로봇 하강 시작 영역 상단
  },

  tutorial: {
    text: '좌우로 움직여서 정답 로봇 아래에 서고, 화면을 눌러 발사!',
    draw(ctx) {
      const cx = L.W / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.045));
      ctx.fillText('6 × 4 = ?', cx, L.gu(1.4));

      // 내려오는 숫자 로봇 3개(정답 24 강조 안 함 — 스스로 계산)
      const robots = [
        { x: cx - L.gu(4.6), y: L.gu(4.2), label: '18' },
        { x: cx, y: L.gu(3.4), label: '24' },
        { x: cx + L.gu(4.6), y: L.gu(4.6), label: '20' },
      ];
      for (const r of robots) drawRobot(ctx, r.x, r.y, L.gu(1.3), r.label, 1);

      // 발사기 + 자동 발사 빛
      const gx = cx;
      const gy = L.gu(7.6);
      ctx.strokeStyle = THEME.gold;
      ctx.lineWidth = L.gu(0.22);
      ctx.beginPath();
      ctx.moveTo(gx, gy - L.gu(0.6));
      ctx.lineTo(gx, L.gu(4.2));
      ctx.stroke();
      drawLauncher(ctx, gx, gy, L.gu(2.6), L.gu(1.2));

      ctx.fillStyle = THEME.subtext;
      ctx.font = font(L.font(0.03));
      ctx.fillText('◀ 이동 ▶   ·   화면 탭 = 발사', cx, L.gu(9));
    },
  },

  init(engine) {
    this.engine = engine;
    this.problem = null;
    this.enemies = []; // [{value, correct, x, y, judged, stopT}]
    this.bullets = []; // [{x, y, r}]
    this.puffs = []; // 연기 구름 [{x,y,t,dur,r}]
    this.floatTexts = [];
    this.feverBanner = null;

    this.charX = L.W / 2;
    this.targetX = L.W / 2;
    this.fireCooldown = 0; // 발사 쿨다운 남은 시간(0이면 발사 가능)
    this.hitStreak = 0; // 연속 정답 격추(탄환 크기)

    this.time = 0;
    this.hitStop = 0;
    this.zoomT = 0;
    this.curSpeed = 0;
    this.nearMissUsed = false;
    this.wasFever = false;

    this._startRound();
  },

  _minX() {
    return L.safe + this.enemyR;
  },
  _maxX() {
    return L.W - L.safe - this.enemyR;
  },

  // 이번 라운드 로봇 수: 3 → 6 (콤보로 상승 = 축 B). 라이프1·피버 grace에서는 늘리지 않는다.
  _enemyCount() {
    const e = this.engine;
    let n = 3 + Math.floor(e.scoreManager.combo / 6);
    if (e.scoreManager.lives <= 1) n = Math.min(n, 3);
    if (e.fever && e.fever.graceActive) n = Math.min(n, 4);
    return Math.max(3, Math.min(6, n));
  },

  // 하강 속도(px/s). 콤보 단계 + 피버 배속(램프/grace 반영). 난이도는 속도·혼동값으로만(§2.5).
  _currentSpeed() {
    const e = this.engine;
    const combo = e.scoreManager.combo;
    let step = combo >= 24 ? 1.5 : combo >= 16 ? 1.35 : combo >= 10 ? 1.2 : combo >= 5 ? 1.1 : 1.0;
    if (e.scoreManager.lives <= 1) step = Math.min(step, 1.0); // 라이프1 상승 중단
    if (e.fever && e.fever.graceActive) step = Math.min(step, 1.0); // 피버 종료 직후 grace
    step *= e.fever ? e.fever.speedMultiplier : 1;

    let sec = BASE_SEC / step;
    sec *= e.settings.timeScale || 1; // 제한시간 배율(높을수록 느리게 = 쉽게)
    if (sec < MIN_SEC) sec = MIN_SEC;
    return L.H / sec;
  },

  // 피버 중 정답 로봇은 크기·판정을 core 계수로 넉넉하게(성공 가능성 유지). 오답 로봇은 그대로.
  _visR(enemy) {
    const fev = this.engine.fever;
    return enemy.correct && fev && fev.active ? this.enemyR * fev.sizeScale : this.enemyR;
  },

  _startRound() {
    const e = this.engine;
    this.problem = e.problemGenerator.nextProblem({ maxLevel: this.maxLevel, blankRatio: this.blankRatio, opMode: this.opMode });

    const n = this._enemyCount();
    const closeness = Math.min(0.5, 0.15 + 0.015 * e.scoreManager.combo); // 콤보↑ → 근접 오답(축 B)
    const distractors = e.problemGenerator.makeDistractors(this.problem, n - 1, closeness);

    const items = shuffle([
      { value: this.problem.answer, correct: true },
      ...distractors.map((v) => ({ value: v, correct: false })),
    ]);

    // 레인 배치: 각 로봇을 겹치지 않는 고정 x 레인에 둔다(수직 하강 → 오폭 없음).
    const minX = this._minX();
    const maxX = this._maxX();
    const laneW = (maxX - minX) / items.length;
    const stag = L.gu(3.2);
    this.enemies = items.map((it, i) => {
      const x = minX + laneW * (i + 0.5);
      const y = this.topY - this.enemyR - i * stag - Math.random() * L.gu(1.2);
      return { value: it.value, correct: it.correct, x, y, judged: false, stopT: 0 };
    });

    this.nearMissUsed = false;
    this.fireCooldown = 0; // 새 라운드에서는 즉시 발사 가능
  },

  update(dt) {
    this.time += dt;

    // 피버 진입/종료 전이(상태는 core가 관리, 연출만 게임이)
    const fev = this.engine.fever;
    const active = !!(fev && fev.active);
    if (active && !this.wasFever) {
      this.engine.ui.flash('rgba(255,210,120,0.5)', FLASH_DUR);
      this.engine.ui.showComboText('🔥 FEVER!', true);
    } else if (!active && this.wasFever) {
      this.feverBanner = { points: fev ? fev.pointsEarned : 0, t: 0, dur: 1.4 };
      this.engine.ui.flash('rgba(120,200,255,0.4)', FLASH_DUR);
    }
    this.wasFever = active;

    if (this.hitStop > 0) this.hitStop = Math.max(0, this.hitStop - dt);
    if (this.zoomT > 0) this.zoomT = Math.max(0, this.zoomT - dt);

    // 발사기 이동(손가락/키 목표로 부드럽게 수렴)
    const k = Math.min(1, dt * 14);
    this.charX += (this.targetX - this.charX) * k;

    // 발사 쿨다운만 진행. 발사는 플레이어가 탭(뗄 때)/스페이스로 직접 한다 — 자동 발사 없음.
    if (this.fireCooldown > 0) this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    // 하강(hitStop 동안 정지). 속도는 매 프레임 재계산(피버/램프 즉시 반영).
    this.curSpeed = this._currentSpeed();
    if (this.hitStop <= 0) {
      for (const en of this.enemies) if (!en.judged) en.y += this.curSpeed * dt;
    }

    // 탄환 상승 + 충돌
    const bulletSpeed = L.H / 0.5;
    for (const b of this.bullets) b.y -= bulletSpeed * dt;
    this._resolveHits();
    this.bullets = this.bullets.filter((b) => b.y > this.topY - L.gu(3));

    // 정답 로봇이 바닥 도달 → 라이프 -1 + 정답표시(놓쳤으니 짚어줌)
    const correct = this.enemies.find((en) => en.correct && !en.judged);
    if (correct && correct.y + this.enemyR >= this.floorY) {
      correct.judged = true;
      this.engine.answerWrong(this.problem, null, { loseLife: true, onResume: () => this._startRound() });
      return;
    }
    // 오답 로봇이 바닥 도달 → 무해(제거만)
    this.enemies = this.enemies.filter((en) => !(!en.correct && en.y - this.enemyR > this.floorY));

    // 이펙트 타이머
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      this.puffs[i].t += dt;
      if (this.puffs[i].t >= this.puffs[i].dur) this.puffs.splice(i, 1);
    }
    for (let i = this.floatTexts.length - 1; i >= 0; i--) {
      this.floatTexts[i].t += dt;
      if (this.floatTexts[i].t >= this.floatTexts[i].dur) this.floatTexts.splice(i, 1);
    }
    if (this.feverBanner) {
      this.feverBanner.t += dt;
      if (this.feverBanner.t >= this.feverBanner.dur) this.feverBanner = null;
    }
  },

  _fire() {
    if (this.fireCooldown > 0) return; // 연사 방지(0.3초)
    this.fireCooldown = FIRE_COOLDOWN;
    // 탄환은 발사 순간 발사기 레인(x 고정)으로만 직진 → 다른 레인 로봇엔 맞지 않는다.
    // 연속 격추 시 탄환이 커진다(고유 재미). 상한 둠.
    const grow = 1 + Math.min(1.2, this.hitStreak * 0.12);
    this.bullets.push({ x: this.charX, y: this.charY - this.charH / 2, r: L.w(0.016) * grow });
  },

  // 탄환-로봇 충돌 해소. 레인이 분리돼 있어 한 탄환은 최대 한 로봇만 맞는다.
  _resolveHits() {
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      let hit = null;
      let bestY = -Infinity; // 가장 아래(먼저 만나는) 로봇
      for (const en of this.enemies) {
        if (en.judged) continue;
        // x는 로봇 몸통 안(레인 일치)일 때만 맞는다 → 다른 레인 로봇엔 안 맞음.
        // y는 탄환이 로봇 높이에 닿았는지.
        const er = this._visR(en);
        if (Math.abs(en.x - b.x) <= er && Math.abs(en.y - b.y) <= er + b.r) {
          if (en.y > bestY) {
            bestY = en.y;
            hit = en;
          }
        }
      }
      if (!hit) continue;
      this.bullets.splice(bi, 1);
      hit.judged = true;
      if (hit.correct) this._judgeCorrect(hit);
      else this._judgeWrong(hit);
      break; // 한 프레임에 한 판정(정답이면 라운드 리셋됨)
    }
  },

  _judgeCorrect(target) {
    const e = this.engine;
    const combo = e.scoreManager.combo;

    // 니어미스: 바닥 0.35초 이내 or 남은 거리 화면 10% 이하 (한 라운드 1회)
    const remaining = this.floorY - target.y;
    const ttf = this.curSpeed > 0 ? remaining / this.curSpeed : 999;
    const nearMiss = !this.nearMissUsed && (ttf <= NEARMISS_TTF || remaining <= L.H * NEARMISS_DIST_RATIO);

    const base = 50 + combo * 10;
    e.answerCorrect(this.problem, target.value, base); // 점수2배·게이지·정답음·콤보문구·위기밝힘 자동
    const shown = base * (e.fever && e.fever.active ? e.fever.scoreMultiplier : 1);

    if (nearMiss) {
      this.nearMissUsed = true;
      e.reportNearMiss(target.x, target.y);
    }

    // ── 손맛(동시): 별·연기로 흩어짐(비현실 표현) ──
    this.hitStreak += 1;
    const mult = e.fever && e.fever.active ? 1.5 : 1;
    e.particles.emit(target.x, target.y, 'sparkle', THEME.gold, Math.round((nearMiss ? 22 : 16) * mult));
    e.particles.emit(target.x, target.y, 'explode', THEME.accent, Math.round(18 * mult));
    e.particles.emit(target.x, target.y, 'pop', '#ffffff', Math.round(10 * mult));
    this.puffs.push({ x: target.x, y: target.y, t: 0, dur: PUFF_DUR, r: this.enemyR });
    this.floatTexts.push({ x: target.x, y: target.y, text: `+${shown}`, color: e.fever && e.fever.active ? THEME.gold : THEME.correct, size: L.font(0.04), t: 0, dur: FLOAT_DUR });
    this.hitStop = HITSTOP;
    this.zoomT = ZOOM_DUR;
    e.ui.flash(e.fever && e.fever.active ? 'rgba(255,220,140,0.35)' : 'rgba(255,255,255,0.28)', FLASH_DUR);
    e.ui.shake(nearMiss ? 10 : 7, SHAKE_TIME);
    this._haptic(15);

    this._startRound();
  },

  _judgeWrong(target) {
    const e = this.engine;
    this.hitStreak = 0; // 연속 격추 끊김(탄환 크기 리셋)
    // 연기(정지) 표시 후 core가 1.2초 정답표시. onResume에서 다음 라운드.
    this.puffs.push({ x: target.x, y: target.y, t: 0, dur: PUFF_DUR, r: this.enemyR });
    e.answerWrong(this.problem, target.value, { loseLife: true, onResume: () => this._startRound() });
  },

  _haptic(ms) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch (e) {
        /* 무시 */
      }
    }
  },

  _feverIntensity() {
    const f = this.engine.fever;
    if (!f) return 0;
    if (f.active) return 1;
    const peak = (f.cfg && f.cfg.speedMult ? f.cfg.speedMult : 1.35) - 1;
    return peak > 0 ? Math.max(0, (f.speedMultiplier - 1) / peak) : 0;
  },

  render(ctx) {
    this._drawFeverBg(ctx);
    if (this.engine.fever) {
      this.engine.fever.renderGauge(ctx, { x: L.safe, y: L.zone.gauge, w: L.W - L.safe * 2, h: L.gu(0.5) });
    }

    // 문제(상단 고정)
    const cx = L.W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.text;
    ctx.font = font(L.font(0.07));
    ctx.fillText(`${this.problem.text} = ?`, cx, L.zone.problem);
    if (this.problem.fromReview) {
      ctx.font = font(L.font(0.026));
      ctx.fillStyle = THEME.gold;
      ctx.fillText('🔁 다시 도전!', cx, L.zone.problem + L.gu(1.7));
    }

    // 바닥 안내선(로봇이 지나가면 놓침). 중립적 점선.
    ctx.save();
    ctx.strokeStyle = 'rgba(159,178,212,0.35)';
    ctx.lineWidth = L.gu(0.08);
    ctx.setLineDash([L.gu(0.5), L.gu(0.5)]);
    ctx.beginPath();
    ctx.moveTo(L.safe, this.floorY);
    ctx.lineTo(L.W - L.safe, this.floorY);
    ctx.stroke();
    ctx.restore();

    const z = this.zoomT > 0 ? 1 + ZOOM_MAX * (this.zoomT / ZOOM_DUR) : 1;
    ctx.save();
    if (z !== 1) {
      const zx = L.W / 2;
      const zy = L.H * 0.6;
      ctx.translate(zx, zy);
      ctx.scale(z, z);
      ctx.translate(-zx, -zy);
    }

    // 탄환(위로 향하는 빛)
    for (const b of this.bullets) {
      ctx.save();
      ctx.fillStyle = THEME.gold;
      ctx.shadowColor = THEME.gold;
      ctx.shadowBlur = L.gu(0.6);
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, b.r, b.r * 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 숫자 로봇(정답/오답 색 동일 — 스스로 계산)
    for (const en of this.enemies) {
      if (en.judged) continue;
      if (en.y < this.topY - this.enemyR * 2) continue;
      drawRobot(ctx, en.x, en.y, this._visR(en), String(en.value), 1);
    }

    // 발사기
    drawLauncher(ctx, this.charX, this.charY, this.charW, this.charH);

    // 연기 구름(정지 연출 — 비현실 표현)
    for (const p of this.puffs) this._drawPuff(ctx, p);
    ctx.restore();

    // 부양 점수
    for (const t of this.floatTexts) {
      const prog = t.t / t.dur;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog);
      ctx.fillStyle = t.color;
      ctx.font = font(t.size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.text, t.x, t.y - prog * L.gu(2.2));
      ctx.restore();
    }

    this._drawFeverBanner(ctx);
    // 위기 테두리는 ui가 자동으로 그린다.
  },

  _drawPuff(ctx, p) {
    const prog = p.t / p.dur;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 0.5 * (1 - prog));
    ctx.fillStyle = '#d7deeb';
    // 부풀어 오르는 연기 구름(원 여러 개)
    const r = p.r * (0.7 + prog * 1.1);
    const puffs = [
      [0, 0, 1],
      [-0.6, -0.2, 0.7],
      [0.6, -0.1, 0.7],
      [-0.2, -0.6, 0.6],
      [0.3, -0.5, 0.6],
    ];
    for (const [dx, dy, s] of puffs) {
      ctx.beginPath();
      ctx.arc(p.x + dx * r, p.y + dy * r - prog * L.gu(1), r * s * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  _drawFeverBg(ctx) {
    const mult = this._feverIntensity();
    if (mult <= 0) return;
    const a = 0.14 * mult;
    const g = ctx.createLinearGradient(0, 0, 0, L.H);
    g.addColorStop(0, `rgba(255,180,90,${a})`);
    g.addColorStop(0.5, `rgba(255,120,170,${a * 0.85})`);
    g.addColorStop(1, `rgba(120,180,255,${a})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L.W, L.H);
    ctx.restore();
  },

  _drawFeverBanner(ctx) {
    if (!this.feverBanner) return;
    const b = this.feverBanner;
    const prog = b.t / b.dur;
    ctx.save();
    ctx.globalAlpha = prog < 0.7 ? 1 : Math.max(0, 1 - (prog - 0.7) / 0.3);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(L.font(0.07));
    ctx.lineWidth = L.gu(0.25);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(`FEVER +${b.points}`, L.W / 2, L.H * 0.44);
    ctx.fillStyle = THEME.gold;
    ctx.fillText(`FEVER +${b.points}`, L.W / 2, L.H * 0.44);
    ctx.restore();
  },

  // ── 입력: 좌우 이동 + 직접 발사 ──
  //   이동: 손가락 x를 따라(터치 start·move). 발사: 손가락을 뗄 때(탭/드래그 릴리즈) 또는 스페이스바.
  //   ⚠️ 이동 중(start·move)에는 절대 발사하지 않는다 → 의도치 않은 오폭 방지.
  onTouch(x, y, phase) {
    if (phase === 'start' || phase === 'move') {
      this.targetX = clamp(x, this._minX(), this._maxX());
    } else if (phase === 'end') {
      // 뗀 자리로 발사기를 확정하고 그 레인으로 발사(드래그로 이동 후 떼면 그 자리에서 발사).
      this.charX = this.targetX = clamp(x, this._minX(), this._maxX());
      this._fire();
    }
  },
  onKey(e) {
    const step = L.w(0.14);
    if (e.key === 'ArrowLeft') this.targetX = clamp(this.targetX - step, this._minX(), this._maxX());
    else if (e.key === 'ArrowRight') this.targetX = clamp(this.targetX + step, this._minX(), this._maxX());
    else if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') this._fire();
  },
  // 이 게임은 이동/발사만 하므로 hover 클릭요소 없음(커서 기본).
  onHover() {
    return false;
  },
  clearHover() {},

  destroy() {
    this.engine = null;
    this.problem = null;
    this.enemies = [];
    this.bullets = [];
    this.puffs = [];
    this.floatTexts = [];
    this.feverBanner = null;
  },
};

// ── 드로잉 헬퍼(모듈 로컬 — core 미수정) ──────────────────────
// 숫자 로봇: 둥근 사각 몸통 + 안테나 + 숫자. 정답/오답 색 동일(정답 노출 금지).
function drawRobot(ctx, x, y, r, label, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  // 안테나
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = Math.max(2, r * 0.06);
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.9);
  ctx.lineTo(x, y - r * 1.35);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y - r * 1.45, r * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = THEME.gold;
  ctx.fill();
  // 몸통(둥근 사각)
  const w = r * 1.7;
  const h = r * 1.5;
  roundRectPath(ctx, x - w / 2, y - h / 2, w, h, r * 0.4);
  ctx.fillStyle = THEME.accent;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(2, r * 0.06);
  ctx.stroke();
  // 숫자
  ctx.fillStyle = '#fff';
  ctx.font = font(r * 0.9);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + r * 0.02);
  ctx.restore();
}

// 발사기(하단). 받침 + 포신.
function drawLauncher(ctx, x, y, w, h) {
  ctx.save();
  // 포신
  ctx.fillStyle = THEME.subtext;
  const bw = w * 0.22;
  roundRectPath(ctx, x - bw / 2, y - h * 0.9, bw, h * 0.9, bw * 0.4);
  ctx.fill();
  // 받침(둥근 사다리꼴 느낌 — 둥근 사각)
  roundRectPath(ctx, x - w / 2, y - h * 0.2, w, h * 0.7, h * 0.25);
  ctx.fillStyle = THEME.gold;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 3;
  ctx.stroke();
  // 눈(친근하게)
  ctx.fillStyle = '#2b3550';
  ctx.beginPath();
  ctx.arc(x - w * 0.12, y + h * 0.1, w * 0.05, 0, Math.PI * 2);
  ctx.arc(x + w * 0.12, y + h * 0.1, w * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
