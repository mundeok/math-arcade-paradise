// g06_stack.js — 🏗️ 스택 빌더 (SPEC §4 6️⃣ / Phase 2, 재구축)
// 축적형·판단형. 확정 인터페이스(SPEC §7)만 사용한다. core/scenes는 절대 건드리지 않는다.
//
// ⚠️ 재구축(개정): 원안은 "떨어지는 정답 블록을 탭"이었으나, 이는 g02_catch와 조작이 동일해
//   (탭으로 정답 선택) 차별화가 안 됐다. → "받아서 쌓기"로 변경한다:
//   화면 하단의 탑(카트)을 좌우로 움직여 떨어지는 정답 블록을 '받으면' 한 칸 쌓인다.
//   블록을 직접 탭하는 조작은 완전히 제거했다(이것이 개조의 목적).
//
// 조작: 터치는 손가락 x를 따라 카트가 부드럽게 이동(드래그·탭 위치 모두). 키보드 ← → / A D.
// 판정:
//   - 정답 놓침(받지 못하고 통과): 라이프 -1, 멈춤 없음, "앗!" (반응 문제라 정지/무음/레벨무영향)
//   - 오답 받음: 탑 기울기 한 단계(5°→12°→20°→붕괴). 라이프는 놓침으로만 잃는다.
//   - 정답 3연속 받으면 기울기 한 단계 회복(위태로운 탑을 다시 세우는 안도).
//
// 재미 표준(§2.6): 피버는 'multi' 유형(engine.fever). 진입 시 "N단!"로 바뀌고 떨어지는 블록의
//   80%가 배수·20%가 함정 → 받으면 다 쌓인다(무적: 함정 받아도 안 기울고, 놓쳐도 라이프 유지).
//   위기 테두리·정답음·점수배수·게이지·카운트업은 core 자동. 니어미스 보상은 reportNearMiss.
//   고유 재미(축적감): 받는 순간 "쿵"(스쿼시+흔들림+낮은 타격음, 탑 높을수록 저음), 웨이브 완료 시
//   탑이 아래→위로 빛나고 완료 높이가 배경 실루엣으로 남는다.
//
// 좌표·크기·폰트는 전부 core/layout.js 의 L 헬퍼로 계산한다(픽셀 리터럴 금지).

import { L } from '../core/layout.js';
import { THEME, font, roundRect } from '../core/ui.js';

const BASE_FALL_SEC = 2.6; // 콤보 0에서 낙하 거리(fallDist)를 통과하는 시간
const FALL_MIN_SEC = 1.0; // 화면 통과 최소 시간(하드 클램프) — 반응 시간 보장
const TARGETS = [5, 8, 12, 15, 20]; // 웨이브 목표(이후 +5씩)
const TILT_DEG = [0, 5, 12]; // 오답 0/1/2개 누적 시 기울기
const COLLAPSE_DEG = 20; // 오답 3개 → 붕괴 각도
const LANES = 4; // 낙하 레인 수(정답/오답 x축 격리용 고정 그리드)
const CATCH_BAND_R = 1.4; // 받기 판정 여유 밴드 = fallBlockH * 이 비율
const NEARMISS_LATE_R = 0.5; // 밴드의 후반부(늦게 받음)에 받으면 니어미스
const MULTI_COUNT = 4; // 피버(multi) 중 화면에 유지할 블록 수
const SPAWN_JITTER = 0.5; // 진입 y 미세 편차(gu)

export const g06Stack = {
  id: 'g06_stack',
  name: '스택 빌더',
  emoji: '🏗️',
  category: '축적형',
  maxLevel: 4,
  blankRatio: 0.25,
  opMode: 'divide',
  comboMilestones: { 10: 'STEADY!' },
  fever: { type: 'multi' }, // 재구축: easy→multi (좌우로 배수를 쓸어 담는 해방감이 이 게임에 더 맞음)

  // ── 크기(L 기반 getter) ──
  get fallBlockW() {
    return L.w(0.14);
  },
  get fallBlockH() {
    return L.gu(1.05);
  },
  get towerW() {
    return L.w(0.2);
  }, // 탑(카트) 폭 = 받기 판정 기준
  get catchHalfW() {
    return this.towerW / 2 + this.fallBlockW * 0.2; // 이 거리 이내면 받는다
  },
  get fallDist() {
    return L.gu(13); // 받는 선 위로 고정 스폰 거리 → 탑 높이와 무관하게 반응 시간 일정
  },
  get staggerY() {
    return L.gu(4.5);
  },
  get moveStep() {
    return L.w(0.12); // 키보드 한 번에 이동량
  },

  tutorial: {
    text: '좌우로 움직여 정답 블록을 받아 탑을 쌓아! 놓치면 안 돼!',
    draw(ctx) {
      const cx = L.W / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.045));
      ctx.fillText('56 ÷ 8 = ?', cx, L.gu(1.4));

      const bw = L.gu(2.6);
      const bh = L.gu(1.1);
      // 떨어지는 정답(7)·오답(9)
      const fall = [
        { x: cx, y: L.gu(4), label: '7', ok: true },
        { x: cx + L.gu(5), y: L.gu(3.2), label: '9', ok: false },
      ];
      for (const f of fall) {
        roundRect(ctx, f.x - bw / 2, f.y - bh / 2, bw, bh, L.gu(0.2));
        ctx.fillStyle = THEME.accent;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = font(L.font(0.03));
        ctx.fillText(f.label, f.x, f.y);
        if (f.ok) {
          ctx.font = font(L.font(0.03));
          ctx.fillText('⭕', f.x + L.gu(1.4), f.y - L.gu(1.1));
        }
      }
      // 카트(탑) + 이미 쌓인 칸
      const cartY = L.gu(8);
      for (let i = 0; i < 2; i++) {
        const y = cartY - i * bh;
        roundRect(ctx, cx - bw / 2, y - bh + L.gu(0.1), bw, bh - L.gu(0.14), L.gu(0.2));
        ctx.fillStyle = THEME.correct;
        ctx.fill();
      }
      // 좌우 화살표
      ctx.fillStyle = THEME.subtext;
      ctx.font = font(L.font(0.04));
      ctx.fillText('◀   받기   ▶', cx, cartY + L.gu(1.2));
    },
  },

  init(engine) {
    this.engine = engine;
    this.problem = null;
    this.blocks = []; // [{value, correct, isMultiple?, x, y, age, resolved}]
    this.stacked = []; // 쌓인 값(라벨용)
    this.waveIndex = 0;
    this.wrongInWave = 0;
    this.waveHadWrong = false;
    this.collapsing = false;
    this.collapseT = 0;
    this.correctStreak = 0; // 3연속 → 기울기 회복
    this.consecWrong = 0; // 연속 오답 → 속도 하향
    this.speedPenalty = 0;

    this.popEffects = [];
    this.missEffect = null;
    this.recoverEffect = null;
    this.waveGlow = null;
    this.silhouette = 0; // 이제까지 완료한 최고 높이(배경 실루엣)
    this.time = 0;
    this.curFall = 0;
    this.nearMissUsed = false;

    // 카트(탑) 좌우 위치
    this.towerX = L.W / 2;
    this.towerTargetX = L.W / 2;

    // 재미 요소 상태
    this.camY = 0;
    this.thud = 0;
    this.tiltCur = 0; // 현재 기울기(도) — 0.3초 보간
    this.multiMode = false;
    this.wasFever = false;
    this.feverBanner = null;

    this._startRound();
  },

  _targetFor(i) {
    if (i < TARGETS.length) return TARGETS[i];
    return TARGETS[TARGETS.length - 1] + 5 * (i - TARGETS.length + 1);
  },
  get target() {
    return this._targetFor(this.waveIndex);
  },

  // 탑 기하: 목표 높이가 화면(playTop~floor)에 맞도록 블록 높이를 축소(현행 유지).
  _towerGeom() {
    const floorY = L.zone.floor;
    const target = Math.max(this.target, 1);
    const availH = floorY - L.zone.playTop - L.gu(1);
    const bh = Math.min(L.gu(1.2), availH / target);
    return { bh, bw: this.towerW, gap: Math.min(L.gu(0.12), bh * 0.12) };
  },

  // 받는 선(탑 꼭대기) 논리 y. 탑이 쌓일수록 위로 올라간다.
  _catchY() {
    const { bh } = this._towerGeom();
    return L.zone.floor - this.stacked.length * bh;
  },

  // 낙하 속도(px/s): 콤보 표(축 B) + 안전장치 + 피버 배속. 반드시 최소 통과시간 클램프.
  _fallSpeed() {
    const e = this.engine;
    const combo = e.scoreManager.combo;
    let mult = combo >= 20 ? 1.4 : combo >= 15 ? 1.3 : combo >= 10 ? 1.2 : combo >= 5 ? 1.1 : 1.0;
    mult *= e.scoreManager.speedFactor; // 점수/콤보 세션 가산(공통). 안전장치는 아래에서 우선 적용.
    if (this.speedPenalty > 0) mult = Math.max(1.0, mult - 0.1 * this.speedPenalty); // 연속 오답 하향
    if (e.scoreManager.lives <= 1) mult = Math.min(mult, 1.0); // 라이프1 상승 중단
    let sec = BASE_FALL_SEC / mult;
    sec *= e.settings.timeScale || 1;
    if (sec < FALL_MIN_SEC) sec = FALL_MIN_SEC; // 통과 최소 1.0초 하드 클램프
    let speed = this.fallDist / sec;
    if (e.fever) speed *= e.fever.speedMultiplier; // 피버 배속(램프 포함, multi는 무해)
    return speed;
  },

  // 콤보 표: 오답 블록 수 (0~4:1 / 5~14:2 / 15+:3)
  _wrongCount() {
    const combo = this.engine.scoreManager.combo;
    return combo >= 15 ? 3 : combo >= 5 ? 2 : 1;
  },

  // 고정 4레인의 x중심(정답/오답 격리용). 레인 간격 > catchHalfW 라 한 레인에 정렬하면 옆 레인은 안 잡힌다.
  _laneCenters() {
    const minX = L.safe + this.fallBlockW / 2;
    const maxX = L.W - L.safe - this.fallBlockW / 2;
    const laneW = (maxX - minX) / LANES;
    const arr = [];
    for (let i = 0; i < LANES; i++) arr.push(minX + laneW * (i + 0.5));
    return arr;
  },

  _clampTowerX(x) {
    const half = this.towerW / 2;
    return Math.max(L.safe + half, Math.min(L.W - L.safe - half, x));
  },

  // ── 일반 라운드(정답 1 + 오답 N, 서로 다른 레인) ──
  _startRound() {
    const e = this.engine;
    this.problem = e.problemGenerator.nextProblem({ maxLevel: this.maxLevel, blankRatio: this.blankRatio, opMode: this.opMode });

    const nWrong = this._wrongCount();
    const closeness = Math.min(0.8, 0.2 + 0.025 * e.scoreManager.combo);
    const distractors = e.problemGenerator.makeDistractors(this.problem, nWrong, closeness);
    const items = [{ value: this.problem.answer, correct: true }, ...distractors.map((v) => ({ value: v, correct: false }))];

    const lanes = this._laneCenters();
    const laneIdx = shuffle(lanes.map((_, i) => i)).slice(0, items.length); // 서로 다른 레인 배정(x축 격리)
    const order = shuffle(items.map((_, i) => i)); // 진입(도착) 순서
    const spawnBase = this._catchY() - this.fallDist;

    this.blocks = items.map((it, i) => {
      const x = lanes[laneIdx[i]];
      const rank = order.indexOf(i);
      const y = spawnBase - rank * this.staggerY - Math.random() * L.gu(SPAWN_JITTER);
      return { value: it.value, correct: it.correct, x, y, age: 0, resolved: false };
    });
    this.nearMissUsed = false;
  },

  _nextWaveReset() {
    this.stacked = [];
    this.wrongInWave = 0;
    this.waveHadWrong = false;
    this.collapsing = false;
    this.collapseT = 0;
    this.correctStreak = 0;
  },

  _waveComplete() {
    const tgt = this.target;
    this.waveGlow = { count: this.stacked.length, t: 0, dur: 0.6 };
    this.silhouette = Math.max(this.silhouette, this.stacked.length); // 완료 높이 배경 실루엣
    this.engine.ui.showComboText(`웨이브 클리어! +${tgt * 50}`, true);
    this.engine.ui.flash('rgba(255,220,140,0.4)', 0.1);
    this.engine.particles.emit(this.towerX, this._catchY(), 'sparkle', THEME.gold, 24);
    this.waveIndex += 1;
    this._nextWaveReset();
    if (this.multiMode) this.blocks = []; // 피버 중이면 multi 스트림을 update가 다시 채운다
    else this._startRound();
  },

  _collapseWave() {
    const floorY = L.zone.floor;
    for (let i = 0; i < Math.min(this.stacked.length, 8); i++) {
      this.engine.particles.emit(this.towerX + (Math.random() - 0.5) * this.towerW, floorY - i * L.gu(1), 'explode', THEME.wrong, 8);
    }
    this._nextWaveReset();
    this._startRound(); // 같은 목표로 재시작(waveIndex 불변)
  },

  // ── 피버 multi 전환 ──
  _multiCount() {
    return MULTI_COUNT;
  },
  _enterMulti() {
    this.multiMode = true;
    this.nearMissUsed = true;
    this.wrongInWave = 0; // 무적이라 기울기 개념 없음
    this.collapsing = false;
    this.collapseT = 0;
    this.correctStreak = 0;
    this.blocks = [];
    for (let i = 0; i < this._multiCount(); i++) {
      const nb = this._spawnMultiBlock(true, i);
      if (nb) this.blocks.push(nb);
    }
  },
  _exitMulti() {
    this.multiMode = false;
    this.blocks = []; // 화면의 배수 블록 정리
    this._startRound(); // 일반 문제 모드 복귀(쌓인 탑은 유지 → 목표 달성에 반영)
  },
  // 보충용 배수/함정 블록 하나. 무적 구간이라 레인 격리는 불필요(함정 받아도 무해).
  _spawnMultiBlock(initial, idx) {
    const fv = this.engine.fever;
    if (!fv || !fv.active || fv.type !== 'multi') return null;
    const ratio = (fv.cfg && fv.cfg.multiMultipleRatio) || 0.8;
    const value = Math.random() < ratio ? fv.randomMultiple() : fv.randomTrap();
    const lanes = this._laneCenters();
    const x = lanes[Math.floor(Math.random() * lanes.length)];
    const y = this._catchY() - this.fallDist - (initial ? idx * this.staggerY : Math.random() * this.staggerY);
    return { value, correct: fv.isMultiple(value), isMultiple: fv.isMultiple(value), x, y, age: 0, resolved: false };
  },

  update(dt) {
    this.time += dt;
    const fev = this.engine.fever;
    const active = !!(fev && fev.active);

    // 피버 진입/종료 전이(상태는 core, 연출·모드전환은 게임)
    if (active && !this.wasFever) {
      this.engine.ui.flash('rgba(255,210,120,0.5)', 0.09);
      this.engine.ui.showComboText('🔥 FEVER!', true);
      if (fev.type === 'multi') this._enterMulti();
    } else if (!active && this.wasFever) {
      this.feverBanner = { points: fev ? fev.pointsEarned : 0, t: 0, dur: 1.4 };
      this.engine.ui.flash('rgba(120,200,255,0.4)', 0.09);
      if (this.multiMode) this._exitMulti();
    }
    this.wasFever = active;

    // 카메라: 탑이 높을수록 살짝 위로(플레이 영역만)
    const camTarget = Math.min(L.gu(2), Math.max(0, this.stacked.length - 5) * L.gu(0.15));
    this.camY += (camTarget - this.camY) * Math.min(1, dt * 6);

    // 카트 이동(부드러운 보간)
    this.towerTargetX = this._clampTowerX(this.towerTargetX);
    this.towerX += (this.towerTargetX - this.towerX) * Math.min(1, dt * 14);
    this.towerX = this._clampTowerX(this.towerX);

    // 기울기 0.3초 보간
    const tiltTargetDeg = this.collapsing ? COLLAPSE_DEG : TILT_DEG[Math.min(this.wrongInWave, TILT_DEG.length - 1)];
    this.tiltCur += (tiltTargetDeg - this.tiltCur) * Math.min(1, dt / 0.3);

    if (this.thud > 0) this.thud = Math.max(0, this.thud - dt);
    this._updateEffects(dt);

    // 붕괴 진행 중: 블록 로직 정지, 잠깐 뒤 리셋
    if (this.collapsing) {
      this.collapseT -= dt;
      if (this.collapseT <= 0) this._collapseWave();
      return;
    }

    // 낙하
    this.curFall = this._fallSpeed();
    for (const b of this.blocks) {
      b.y += this.curFall * dt;
      b.age += dt;
    }

    const catchY = this._catchY();
    const band = this.fallBlockH * CATCH_BAND_R;
    const half = this.fallBlockH / 2;

    if (this.multiMode) {
      for (const b of this.blocks) {
        if (b.resolved) continue;
        const aligned = Math.abs(b.x - this.towerX) <= this.catchHalfW;
        if (b.y + half >= catchY && aligned) {
          b.resolved = true;
          if (b.isMultiple) {
            if (this._catchMultiple(b)) break; // 웨이브 완료 → 블록 초기화됨
          } else {
            this._catchTrap(b);
          }
        } else if (b.y - half > catchY + band) {
          b.resolved = true; // 놓쳐도 무해(피버)
        }
      }
      this.blocks = this.blocks.filter((b) => !b.resolved && b.y - half <= L.H);
      let guard = 0;
      while (this.blocks.length < this._multiCount() && guard++ < this._multiCount() + 2) {
        const nb = this._spawnMultiBlock(false, 0);
        if (!nb) break;
        this.blocks.push(nb);
      }
      return;
    }

    // 일반 모드
    let ended = false;
    for (const b of this.blocks) {
      if (b.resolved) continue;
      const aligned = Math.abs(b.x - this.towerX) <= this.catchHalfW;
      if (b.y + half >= catchY && aligned) {
        b.resolved = true;
        if (b.correct) {
          this._catchCorrect(b);
          ended = true;
          break;
        } else {
          this._catchWrong(b);
          if (this.collapsing) {
            ended = true;
            break;
          }
        }
      } else if (b.y - half > catchY + band && b.age > 0.3) {
        // 받는 선을 지나쳐 통과 — 등장 직후(0.3초) 조기 통과 방지 후 판정
        b.resolved = true;
        if (b.correct) {
          this._miss(b);
          ended = true;
          break;
        }
        // 오답 통과는 무해
      }
    }
    if (ended) return; // 라운드가 새로 구성됨
    this.blocks = this.blocks.filter((b) => !b.resolved && b.y - half <= L.H);
  },

  _updateEffects(dt) {
    for (let i = this.popEffects.length - 1; i >= 0; i--) {
      this.popEffects[i].t += dt;
      if (this.popEffects[i].t >= this.popEffects[i].dur) this.popEffects.splice(i, 1);
    }
    if (this.missEffect) {
      this.missEffect.t += dt;
      if (this.missEffect.t >= this.missEffect.dur) this.missEffect = null;
    }
    if (this.recoverEffect) {
      this.recoverEffect.t += dt;
      if (this.recoverEffect.t >= this.recoverEffect.dur) this.recoverEffect = null;
    }
    if (this.waveGlow) {
      this.waveGlow.t += dt;
      if (this.waveGlow.t >= this.waveGlow.dur) this.waveGlow = null;
    }
    if (this.feverBanner) {
      this.feverBanner.t += dt;
      if (this.feverBanner.t >= this.feverBanner.dur) this.feverBanner = null;
    }
  },

  // ── 받기 판정 ──
  _catchCorrect(b) {
    const e = this.engine;
    this.correctStreak += 1;
    this.consecWrong = 0;
    this.speedPenalty = 0;
    // 3연속 → 기울기 한 단계 회복
    if (this.correctStreak >= 3 && this.wrongInWave > 0) {
      this.wrongInWave -= 1;
      this.correctStreak = 0;
      this._recover();
    }

    const catchY = this._catchY();
    const band = this.fallBlockH * CATCH_BAND_R;
    const nearMiss = !this.nearMissUsed && b.y >= catchY + band * NEARMISS_LATE_R; // 늦게(아슬아슬) 받음

    this.stacked.push(b.value);
    this.thud = 0.12;
    const tgt = this.target;
    const waveDone = this.stacked.length >= tgt;

    let pts = 10; // 블록 1개
    if (waveDone) pts += tgt * 50 + (this.waveHadWrong ? 0 : 200);
    e.answerCorrect(this.problem, b.value, pts);

    if (nearMiss) {
      this.nearMissUsed = true;
      e.reportNearMiss(this.towerX, catchY);
    }
    this._catchFx(b);
    if (waveDone) this._waveComplete();
    else this._startRound();
  },

  _catchWrong(b) {
    const e = this.engine;
    this.correctStreak = 0;
    this.consecWrong += 1;
    if (this.consecWrong >= 2) {
      this.speedPenalty = 1;
      this.consecWrong = 0;
    }
    this.wrongInWave += 1;
    this.waveHadWrong = true;
    // 오답을 받았다 = 이해 오류 → 콤보 리셋·복습·레벨하향(core). 단 흐름은 멈추지 않는다(freeze:false).
    e.answerWrong(this.problem, b.value, { loseLife: false, freeze: false });
    e.ui.shake(12, 0.25);
    e.particles.emit(b.x, this._catchY(), 'explode', THEME.wrong, 10);
    if (this.wrongInWave >= 3) {
      this.collapsing = true;
      this.collapseT = 0.5; // 붕괴 연출 후 리셋
    }
  },

  _miss(b) {
    const e = this.engine;
    this.correctStreak = 0;
    // 놓침: 라이프 -1, 정지/무음/레벨무영향(반응 문제). 세션엔 놓침 기록.
    e.answerWrong(this.problem, null, { loseLife: true, freeze: false, affectLevel: false, missed: true });
    e.particles.emit(b.x, this._catchY(), 'pop', THEME.wrong, 14);
    this.missEffect = { x: b.x, y: this._catchY(), t: 0, dur: 0.4 };
    this._startRound();
  },

  // 피버: 배수 받음 → 정답(연타 무한), 웨이브 완료 시 true
  _catchMultiple(b) {
    const e = this.engine;
    const dan = e.fever.dan;
    const q = Math.round(b.value / dan);
    const prob = { a: dan, b: q, op: '×', answer: b.value, remainder: null, text: `${dan} × ${q}`, blank: null, level: 1 };
    this.stacked.push(b.value);
    this.thud = 0.12;
    const tgt = this.target;
    const waveDone = this.stacked.length >= tgt;
    let pts = 10;
    if (waveDone) pts += tgt * 50; // 피버 완료 보너스(무오답 +200은 피버엔 미적용)
    e.answerCorrect(prob, b.value, pts); // 점수배수·게이지·정답음·연출 자동(무적)
    this._catchFx(b);
    if (waveDone) {
      this._waveComplete();
      return true;
    }
    return false;
  },
  // 피버: 함정 받음 → 무해(안 기울고 안 쌓임). 세션만 기록, 복습 큐 미등록.
  _catchTrap(b) {
    const e = this.engine;
    const dan = e.fever.dan;
    const prob = { a: b.value, b: dan, op: '÷', answer: Math.floor(b.value / dan), remainder: b.value % dan, text: `${b.value} ÷ ${dan}`, blank: null, level: 1 };
    e.answerWrong(prob, b.value, { affectLevel: false, freeze: false });
    e.particles.emit(b.x, this._catchY(), 'pop', THEME.wrong, 8);
  },

  // 받는 순간 손맛(축적감): 스쿼시(thud)·짧은 흔들림·낮은 타격음(탑 높을수록 저음)·파티클·부양
  _catchFx(b) {
    const e = this.engine;
    const catchY = this._catchY();
    e.particles.emit(b.x, catchY, 'sparkle', THEME.correct, 12);
    e.sound.play('pop');
    e.ui.shake(6, 0.09);
    const freq = Math.max(60, 150 - this.stacked.length * 4); // 탑 높을수록 낮은 "쿵"
    if (e.sound.tone) e.sound.tone(freq, 0, 0.12, { type: 'sine', vol: 0.14 });
    this.popEffects.push({ x: b.x, y: b.y, tx: this.towerX, ty: catchY, value: b.value, t: 0, dur: 0.28 });
  },

  _recover() {
    this.engine.ui.flash('rgba(120,230,150,0.28)', 0.12);
    this.recoverEffect = { t: 0, dur: 0.6 };
  },

  // ── 입력: 카트 좌우 이동만(블록 직접 탭 제거) ──
  onTouch(x, y, phase) {
    if (phase === 'start' || phase === 'move') this.towerTargetX = this._clampTowerX(x);
  },
  onKey(e) {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.towerTargetX = this._clampTowerX(this.towerTargetX - this.moveStep);
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.towerTargetX = this._clampTowerX(this.towerTargetX + this.moveStep);
  },
  onHover() {
    return false; // 클릭 대상 없음(드래그 이동) — 커서 기본
  },
  clearHover() {},

  // ── 렌더 ──
  render(ctx) {
    const cx = L.W / 2;
    const floorY = L.zone.floor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 상단 UI(고정)
    this._drawFeverBg(ctx);
    if (this.engine.fever) {
      this.engine.fever.renderGauge(ctx, { x: L.safe, y: L.zone.gauge, w: L.W - L.safe * 2, h: L.gu(0.5) });
    }

    if (this.multiMode && this.engine.fever && this.engine.fever.dan) {
      ctx.fillStyle = THEME.gold;
      ctx.font = font(L.font(0.085));
      ctx.fillText(`${this.engine.fever.dan}단!`, cx, L.zone.problem);
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.03), 'normal');
      ctx.fillText('배수를 받아서 쌓아!', cx, L.zone.problem + L.gu(1.6));
    } else {
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.07));
      const qText = this.problem.blank ? this.problem.text : `${this.problem.text} = ?`;
      ctx.fillText(qText, cx, L.zone.problem);
      ctx.fillStyle = THEME.subtext;
      ctx.font = font(L.font(0.028), 'normal');
      ctx.fillText(`웨이브 ${this.waveIndex + 1} · 목표 ${this.target}칸 · 현재 ${this.stacked.length}칸`, cx, L.zone.problem + L.gu(1.6));
      if (this.problem.fromReview) {
        ctx.fillStyle = THEME.gold;
        ctx.font = font(L.font(0.026));
        ctx.fillText('🔁 다시 도전!', cx, L.zone.problem + L.gu(2.9));
      }
      if (this.wrongInWave > 0 || this.collapsing) {
        ctx.fillStyle = THEME.wrong;
        ctx.font = font(L.font(0.028));
        const n = this.collapsing ? 3 : this.wrongInWave;
        ctx.fillText(`⚠️ 기우뚱! (오답 ${n}/3)`, cx, L.zone.problem + L.gu(4.0));
      }
    }

    // 플레이 영역(카메라 상향 적용)
    ctx.save();
    ctx.translate(0, -this.camY);

    // 바닥/받는선 안내
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = Math.max(2, L.gu(0.08));
    ctx.setLineDash([L.gu(0.5), L.gu(0.4)]);
    ctx.beginPath();
    ctx.moveTo(L.safe, floorY);
    ctx.lineTo(L.W - L.safe, floorY);
    ctx.stroke();
    ctx.setLineDash([]);

    this._renderSilhouette(ctx, floorY);
    this._renderTower(ctx, floorY);
    this._renderWaveGlow(ctx, floorY);

    // 떨어지는 블록
    for (const b of this.blocks) {
      if (b.resolved) continue;
      this._drawBlock(ctx, b.x, b.y, this.fallBlockW, this.fallBlockH, THEME.accent, String(b.value), L.font(0.038));
    }

    // 받은 블록 부양(받은 자리 → 탑 꼭대기)
    for (const p of this.popEffects) {
      const prog = p.t / p.dur;
      const x = p.x + (p.tx - p.x) * prog;
      const y = p.y + (p.ty - p.y) * prog;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog * 0.5);
      this._drawBlock(ctx, x, y, this.fallBlockW * (1 - 0.3 * prog), this.fallBlockH * (1 - 0.3 * prog), THEME.correct, String(p.value), L.font(0.034));
      ctx.restore();
    }

    if (this.missEffect) {
      const m = this.missEffect;
      const prog = m.t / m.dur;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog);
      ctx.fillStyle = THEME.wrong;
      ctx.font = font(L.font(0.045));
      ctx.fillText('앗! -1', m.x, m.y - prog * L.gu(1.2));
      ctx.restore();
    }
    if (this.recoverEffect) {
      const prog = this.recoverEffect.t / this.recoverEffect.dur;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog);
      ctx.fillStyle = THEME.correct;
      ctx.font = font(L.font(0.04));
      ctx.fillText('휴—', this.towerX, this._catchY() - L.gu(1.5) - prog * L.gu(1));
      ctx.restore();
    }
    ctx.restore();

    this._drawFeverBanner(ctx);
    // 위기 테두리는 ui가 자동으로 그린다.
  },

  // 완료했던 최고 높이를 배경 실루엣으로(오늘 얼마나 높이 쌓았는지)
  _renderSilhouette(ctx, floorY) {
    if (this.silhouette <= 0) return;
    const { bh, bw, gap } = this._towerGeom();
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = THEME.text;
    for (let i = 0; i < this.silhouette; i++) {
      const y = floorY - (i + 1) * bh + gap / 2;
      roundRect(ctx, cxSilhouetteX() - bw / 2, y, bw, bh - gap, Math.min(L.gu(0.3), (bh - gap) * 0.2));
      ctx.fill();
    }
    ctx.restore();
    function cxSilhouetteX() {
      return L.W - L.safe - bw / 2; // 오른쪽 구석에 실루엣
    }
  },

  _renderTower(ctx, floorY) {
    const count = this.stacked.length;
    const { bh, bw, gap } = this._towerGeom();
    // 미세 흔들림(위태로울 때)
    let wobble = 0;
    if (!this.collapsing && this.wrongInWave >= 2) wobble = Math.sin(this.time * 22) * ((0.6 * Math.PI) / 180);
    const tilt = (this.tiltCur * Math.PI) / 180 + wobble;
    const squash = this.thud > 0 ? 1 - 0.14 * (this.thud / 0.12) : 1;

    ctx.save();
    ctx.translate(this.towerX, floorY);
    ctx.rotate(-tilt);
    for (let i = 0; i < count; i++) {
      const isTop = i === count - 1;
      const h = (bh - gap) * (isTop ? squash : 1);
      const y = -(i + 1) * bh + (bh - gap) / 2;
      this._drawBlock(ctx, 0, y, bw, h, THEME.correct, String(this.stacked[i]), L.font(0.026));
    }
    // 카트(받는 판) — 탑 꼭대기(빈 탑이면 바닥)에 살짝 넓은 판
    const topY = -count * bh;
    roundRect(ctx, -bw / 2 - L.gu(0.2), topY - L.gu(0.18), bw + L.gu(0.4), L.gu(0.3), L.gu(0.15));
    ctx.fillStyle = THEME.gold;
    ctx.fill();
    ctx.restore();
  },

  _renderWaveGlow(ctx, floorY) {
    const g = this.waveGlow;
    if (!g) return;
    const prog = g.t / g.dur;
    const { bh, bw, gap } = this._towerGeom();
    ctx.save();
    ctx.shadowColor = THEME.gold;
    ctx.shadowBlur = L.gu(0.8) + L.gu(1.2) * (1 - prog);
    for (let i = 0; i < g.count; i++) {
      // 아래에서 위로 순차적으로 빛남
      const lit = prog * g.count;
      const a = Math.max(0, 1 - Math.abs(i - lit) / 2) * (1 - prog);
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      const y = floorY - (i + 1) * bh + gap / 2;
      roundRect(ctx, this.towerX - bw / 2, y, bw, bh - gap, Math.min(L.gu(0.4), (bh - gap) * 0.22));
      ctx.fillStyle = THEME.gold;
      ctx.fill();
    }
    // 꼭대기 별
    ctx.globalAlpha = Math.max(0, 1 - prog);
    ctx.font = font(L.font(0.05));
    ctx.fillStyle = THEME.gold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⭐', this.towerX, floorY - g.count * bh - L.gu(1));
    ctx.restore();
  },

  _drawBlock(ctx, x, y, w, h, color, label, fontPx) {
    ctx.save();
    roundRect(ctx, x - w / 2, y - h / 2, w, h, Math.min(L.gu(0.4), h * 0.22));
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = Math.max(2, w * 0.02);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = font(fontPx || L.font(0.04));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
    ctx.restore();
  },

  _feverIntensity() {
    const f = this.engine.fever;
    if (!f) return 0;
    if (f.active) return 1;
    const peak = (f.cfg && f.cfg.speedMult ? f.cfg.speedMult : 1.35) - 1;
    return peak > 0 ? Math.max(0, (f.speedMultiplier - 1) / peak) : 0;
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
    ctx.strokeText(`FEVER +${b.points}`, L.W / 2, L.H * 0.4);
    ctx.fillStyle = THEME.gold;
    ctx.fillText(`FEVER +${b.points}`, L.W / 2, L.H * 0.4);
    ctx.restore();
  },

  destroy() {
    this.engine = null;
    this.problem = null;
    this.blocks = [];
    this.stacked = [];
    this.popEffects = [];
    this.missEffect = null;
    this.recoverEffect = null;
    this.waveGlow = null;
    this.feverBanner = null;
  },
};

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
