// g06_stack.js — 🥞 디저트 타워 (스택 빌더 재개정 / SPEC §4 6️⃣)
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
//   탑이 아래→위로 빛나고 완성품이 하단 진열장에 남는다.
//
// 좌표·크기·폰트는 전부 core/layout.js 의 L 헬퍼로 계산한다(픽셀 리터럴 금지).

import { L } from '../core/layout.js';
import { THEME, font, roundRect } from '../core/ui.js';
import { drawPlayBackdrop, drawRewardText } from '../art/toyArt.js';
import { DESSERT_KINDS, drawDessert, drawFinishedDessert, drawDessertPlate, drawDessertShop } from '../art/stackDessertArt.js';
import { preloadStackAssets } from '../art/stackAssets.js';

const BASE_FALL_SEC = 2.6; // 콤보 0에서 낙하 거리(fallDist)를 통과하는 시간
const FALL_MIN_SEC = 2.2; // 교사 배율까지 적용한 최종 하한. 피버는 양으로 보상한다.
const TARGETS = [4, 5, 6, 7, 8]; // 웨이브 목표(재조정: 낮고 짧게 → 완료 연출이 자주·블록 두껍게·축적감↑)
const TILT_DEG = [0, 5, 12]; // 오답 0/1/2개 누적 시 기울기
const COLLAPSE_DEG = 20; // 오답 3개 → 붕괴 각도
const LANES = 4; // 낙하 레인 수(정답/오답 x축 격리용 고정 그리드)
const CATCH_BAND_R = 1.4; // 받기 판정 여유 밴드 = fallBlockH * 이 비율
const NEARMISS_LATE_R = 0.5; // 밴드의 후반부(늦게 받음)에 받으면 니어미스
const MULTI_COUNT = 4; // 피버(multi) 중 화면에 유지할 블록 수
const SPAWN_JITTER = 0.5; // 진입 y 미세 편차(gu)

export const g06Stack = {
  id: 'g06_stack',
  name: '디저트 타워',
  emoji: '🥞',
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
    return L.gu(1.4);
  },
  get towerW() {
    return L.w(0.2);
  }, // 탑(카트) 폭 = 받기 판정 기준
  get catchHalfW() {
    return this.towerW / 2 + this.fallBlockW * 0.2; // 이 거리 이내면 받는다
  },
  get perfectHalfW() {
    return this.towerW * 0.18; // 중앙 리본과 동일한 폭. 가장자리 정답도 정상 +10점.
  },
  get fallDist() {
    // 높은 탑에서도 문제 뒤에 숨는 시간을 줄인다. 거리/기존 sec로 속도를
    // 계산하므로 상단 보호 영역 때문에 가시 낙하 시간이 짧아지지 않는다.
    return Math.min(L.gu(13), this._catchY() - L.zone.problem - L.gu(4.6) - this.fallBlockH / 2 - (this.camY || 0));
  },
  get staggerY() {
    return L.gu(4.5);
  },
  get moveStep() {
    return L.w(0.12); // 키보드 한 번에 이동량
  },

  tutorial: {
    text: '좌우로 움직여 정답을 받아! 가운데로 받으면 PERFECT! 디저트를 완성해 봐!',
    draw(ctx) {
      preloadStackAssets();
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
        drawDessert(ctx, f.x, f.y, bw, bh, f.label, L.font(0.03));
        ctx.fillStyle = '#fff';
        if (f.ok) {
          ctx.font = font(L.font(0.03));
          ctx.fillText('⭕', f.x + L.gu(1.4), f.y - L.gu(1.1));
        }
      }
      // 카트(탑) + 이미 쌓인 칸
      const cartY = L.gu(8);
      for (let i = 0; i < 2; i++) {
        const y = cartY - i * bh;
        drawDessert(ctx, cx, y - bh / 2, bw, bh - L.gu(0.14));
      }
      drawDessertPlate(ctx, cx, cartY - bh * 2, bw + L.gu(0.3), bw * 0.18);
      // 좌우 화살표
      ctx.fillStyle = THEME.subtext;
      ctx.font = font(L.font(0.04));
      ctx.fillText('◀   받기   ▶', cx, cartY + L.gu(1.2));
    },
  },

  init(engine) {
    preloadStackAssets();
    this.engine = engine;
    this.problem = null;
    this.blocks = []; // [{value, correct, isMultiple?, x, y, age, resolved}]
    this.stacked = []; // 쌓인 값(라벨용)
    this.deliveredCount = 0; // 압축과 별개인 웨이브 정답 수
    this.waveIndex = 0;
    this.wrongInWave = 0;
    this.waveHadWrong = false;
    this.collapsing = false;
    this.collapseT = 0;
    this.correctStreak = 0; // 3연속 → 기울기 회복
    this.recoveryCharge = 0;
    this.catchFeedback = null;
    this.completedDesserts = [];
    this.consecWrong = 0; // 연속 오답 → 속도 하향
    this.speedPenalty = 0;

    this.popEffects = [];
    this.missEffect = null;
    this.recoverEffect = null;
    this.waveGlow = null;
    this.compressEffect = null; // 같은 값 3개 압축(동수누가) 연출
    this.completedHeights = []; // 지금까지 완료한 웨이브 높이들(배경 실루엣 누적)
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
    // 받은 정답 수 4→5→6→7→8 순환. 압축해도 배송 진행도는 줄지 않는다.
    return TARGETS[i % TARGETS.length];
  },
  get target() {
    return this._targetFor(this.waveIndex);
  },
  get dessertKind() {
    return DESSERT_KINDS[this.waveIndex % DESSERT_KINDS.length];
  },

  // 탑 기하: 목표 높이가 화면(playTop~floor)에 맞도록 블록 높이를 축소(현행 유지).
  _towerGeom() {
    const floorY = L.zone.floor;
    const target = Math.max(this.target, 1);
    const availH = floorY - L.zone.playTop - L.gu(1);
    // 목표가 낮아져(최대 8칸) 블록을 두껍게 유지한다(축적감). 축소는 화면을 넘칠 때만 최소한 적용.
    const bh = Math.min(L.gu(1.6), availH / target);
    return { bh, bw: this.towerW, gap: Math.min(L.gu(0.14), bh * 0.12) };
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
    // 공통 가산은 단계로 흡수한다. 콤보×가산×피버 중첩 가속은 하지 않는다.
    const sessionTier = Math.floor(((e.scoreManager.speedFactor || 1) - 1 + 1e-8) / 0.3);
    let tier = Math.min(2, Math.max(combo >= 15 ? 2 : combo >= 5 ? 1 : 0, sessionTier));
    tier = Math.max(0, tier - this.speedPenalty);
    if (e.scoreManager.lives <= 1) tier = 0;
    const sec = Math.max(FALL_MIN_SEC, (BASE_FALL_SEC - tier * 0.2) * (e.settings.timeScale || 1));
    // 낙하물 아래 끝이 받침판에 닿기까지의 가시 시간을 보장한다.
    return Math.max(L.gu(0.1), this.fallDist - this.fallBlockH / 2) / sec;
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
    this.deliveredCount = 0;
    this.wrongInWave = 0;
    this.waveHadWrong = false;
    this.collapsing = false;
    this.collapseT = 0;
    this.correctStreak = 0;
    this.recoveryCharge = 0;
  },

  _waveComplete() {
    const tgt = this.target;
    const kind = this.dessertKind;
    this.waveGlow = { count: this.stacked.length, values: this.stacked.slice(), kind: kind.id, x: this.towerX, floorY: L.zone.floor - this.camY, bh: this._towerGeom().bh, t: 0, dur: 0.6 };
    this.completedDesserts.push({ values: this.stacked.slice(), kind: kind.id, number: this.waveIndex + 1 });
    if (this.completedDesserts.length > 6) this.completedDesserts.shift();
    this.completedHeights.push(this.stacked.length); // 완료 웨이브 누적(배경 실루엣)
    if (this.completedHeights.length > 12) this.completedHeights.shift();
    this._compactMessage(`${kind.name} 완성!`);
    this.engine.ui.flash('rgba(255,220,140,0.4)', 0.1);
    this.engine.particles.emit(this.towerX, this._catchY(), 'sparkle', THEME.gold, 24);
    this.waveIndex += 1;
    this.popEffects = []; // 이전 화물이 새 카트로 날아오는 잔상 방지
    this.compressEffect = null;
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
    this.recoveryCharge = 0;
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
    const ratio = 1 - fv.trapRatio; // 단계별 함정 비율 반영(FEVER 0.8·SUPER 0.9·ULTRA 1.0=전부 배수)
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
      this._compactMessage('🔥 디저트 파티!');
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
    if (this.catchFeedback) {
      this.catchFeedback.t += dt;
      if (this.catchFeedback.t >= this.catchFeedback.dur) this.catchFeedback = null;
    }
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
    if (this.compressEffect) {
      this.compressEffect.t += dt;
      if (this.compressEffect.t >= this.compressEffect.dur) this.compressEffect = null;
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
    const perfect = this._isPerfect(b);
    this.correctStreak += 1;
    this.consecWrong = 0;
    this.speedPenalty = 0;
    // 일반 1 / PERFECT 2. 오답·놓침으로 끊기며 정상 상태에서 비축하지 않는다.
    this.recoveryCharge = this.wrongInWave > 0 ? this.recoveryCharge + (perfect ? 2 : 1) : 0;
    if (this.recoveryCharge >= 3 && this.wrongInWave > 0) {
      this.wrongInWave -= 1;
      this.correctStreak = 0;
      this.recoveryCharge = 0;
      this._recover();
    }

    const catchY = this._catchY();
    const band = this.fallBlockH * CATCH_BAND_R;
    const nearMiss = !this.nearMissUsed && b.y >= catchY + band * NEARMISS_LATE_R; // 늦게(아슬아슬) 받음

    this.stacked.push(b.value);
    this.deliveredCount += 1;
    this.thud = 0.12;
    this._checkCompress(); // 높이는 압축하고, 완료 판정은 받은 정답 수로 한다.
    const tgt = this.target;
    const waveDone = this.deliveredCount >= tgt;

    let pts = 10 + (perfect ? 10 : 0);
    if (waveDone) pts += tgt * 50 + (this.waveHadWrong ? 0 : 200);
    this._awardCatch(this.problem, b, pts, perfect);

    if (nearMiss) {
      this.nearMissUsed = true;
      e.reportNearMiss(this.towerX, catchY);
    }
    this._catchFx(b, perfect);
    if (waveDone) this._waveComplete();
    else this._startRound();
  },

  _catchWrong(b) {
    const e = this.engine;
    this.correctStreak = 0;
    this.recoveryCharge = 0;
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
    this.recoveryCharge = 0;
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
    const perfect = this._isPerfect(b);
    const q = Math.round(b.value / dan);
    const prob = { a: dan, b: q, op: '×', answer: b.value, remainder: null, text: `${dan} × ${q}`, blank: null, level: 1 };
    this.stacked.push(b.value);
    this.deliveredCount += 1;
    this.thud = 0.12;
    this._checkCompress(); // 피버에서도 압축은 배송 진행도를 줄이지 않는다.
    const tgt = this.target;
    const waveDone = this.deliveredCount >= tgt;
    let pts = 10 + (perfect ? 10 : 0);
    if (waveDone) pts += tgt * 50; // 피버 완료 보너스(무오답 +200은 피버엔 미적용)
    this._awardCatch(prob, b, pts, perfect);
    this._catchFx(b, perfect);
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
  _isPerfect(b) {
    return Math.abs(b.x - this.towerX) <= this.perfectHalfW + L.gu(1e-8);
  },

  _compactMessage(text) {
    const ui = this.engine.ui;
    ui.showComboText(text, false);
    if (ui.comboOverlays) for (const o of ui.comboOverlays) { o.compact = true; o.big = false; }
  },

  _awardCatch(problem, b, pts, perfect) {
    const e = this.engine, before = e.scoreManager.score;
    const floatStart = e.ui.floatScores?.length || 0;
    e.answerCorrect(problem, b.value, pts);
    // 이 게임은 문제 아래 전용 피드백 줄에 실제 획득 점수를 합쳐 보여 준다.
    if (e.ui.floatScores) e.ui.floatScores.splice(floatStart);
    if (e.ui.comboOverlays) for (const o of e.ui.comboOverlays) { o.compact = true; o.big = false; }
    this.catchFeedback = { perfect, points: e.scoreManager.score - before, t: 0, dur: 0.5 };
  },

  _catchFx(b, perfect = false) {
    const e = this.engine;
    const catchY = this._catchY();
    e.particles.emit(b.x, catchY, 'sparkle', perfect ? THEME.gold : THEME.correct, perfect ? 24 : 12);
    e.sound.play('pop');
    e.ui.shake(6, 0.09);
    const freq = Math.max(60, 150 - this.stacked.length * 4) * this.dessertKind.pitch;
    if (e.sound.tone) e.sound.tone(freq, 0, 0.12, { type: 'sine', vol: 0.14 });
    if (perfect && e.sound.tone) e.sound.tone(660, 0, 0.09, { type: 'sine', vol: 0.07, sweepTo: 880 });
    this.popEffects.push({ x: b.x, y: b.y, tx: this.towerX, ty: catchY, value: b.value, kind: this.dessertKind.id, t: 0, dur: 0.12 });
  },

  _recover() {
    this.engine.ui.flash('rgba(120,230,150,0.28)', 0.12);
    this.recoverEffect = { t: 0, dur: 0.6 };
  },

  // 같은 값이 연속 3개 쌓이면 하나로 압축한다: 7+7+7 = 7×3 = 21 (동수누가 = 곱셈의 출발점).
  //   압축된 블록은 1칸으로 계산되어 탑이 짧아진다. 연쇄 가능(21이 또 3개면 63으로 재압축).
  //   ⚠️ 문제 생성에는 개입하지 않는다 — 우연히 같은 몫이 3개 쌓였을 때만 압축한다.
  _checkCompress() {
    const e = this.engine;
    const s = this.stacked;
    while (s.length >= 3 && s[s.length - 1] === s[s.length - 2] && s[s.length - 2] === s[s.length - 3]) {
      const v = s[s.length - 1];
      const merged = v * 3;
      s.splice(s.length - 3, 3, merged); // 3개 → 1개(v×3)
      if (this.wrongInWave > 0) {
        this.wrongInWave -= 1;
        this._recover(); // 우연한 압축은 위태로운 탑도 살리는 순수 보상
      }
      e.scoreManager.addPoints(100); // 압축 보너스(콤보·세션 불변)
      if (e.fever) e.fever.addPoints(100);
      this._compactMessage(`${v} × 3 = ${merged}!`); // 동수누가 → 곱셈 시각화
      e.particles.emit(this.towerX, this._catchY(), 'explode', THEME.gold, 20);
      e.particles.emit(this.towerX, this._catchY(), 'sparkle', THEME.correct, 12);
      e.ui.shake(8, 0.12);
      e.sound.play('combo');
      this.compressEffect = { v, merged, t: 0, dur: 0.4 };
    }
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
    drawPlayBackdrop(ctx, this.id, this.time || 0);
    drawDessertShop(ctx, this.time || 0, this.dessertKind);
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
      ctx.fillText(this.target - this.deliveredCount === 1 ? '하나만 더! · 배수로 완성해!' : `배수 디저트 파티! · ${this.deliveredCount}/${this.target}`, cx, L.zone.problem + L.gu(1.6));
    } else {
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.07));
      const qText = this.problem.blank ? this.problem.text : `${this.problem.text} = ?`;
      ctx.fillText(qText, cx, L.zone.problem);
      ctx.fillStyle = THEME.subtext;
      ctx.font = font(L.font(0.028), 'normal');
      ctx.fillText(this.target - this.deliveredCount === 1 ? `${this.dessertKind.name} · 하나만 더!` : `${this.waveIndex + 1}번째 ${this.dessertKind.name} · ${this.deliveredCount}/${this.target}`, cx, L.zone.problem + L.gu(1.6));
      if (this.problem.fromReview && !this.catchFeedback && !this.feverBanner) {
        ctx.fillStyle = THEME.gold;
        ctx.font = font(L.font(0.026));
        ctx.fillText('🔁 다시 도전!', cx, L.zone.problem + L.gu(2.9));
      }
      if (this.wrongInWave > 0 || this.collapsing) {
        ctx.fillStyle = THEME.wrong;
        ctx.font = font(L.font(0.028));
        const n = this.collapsing ? 3 : this.wrongInWave;
        ctx.fillText(`기우뚱 ${n}/3 · 균형 회복 ${this.recoveryCharge}/3`, cx, L.zone.problem + L.gu(4.0));
      } else {
        ctx.fillStyle = '#bcebdc'; ctx.font = font(L.font(0.023));
        ctx.fillText('민트색 가운데로 받으면 PERFECT +10', cx, L.zone.problem + L.gu(4));
      }
    }
    if (this.catchFeedback && !this.feverBanner) {
      const f = this.catchFeedback;
      ctx.save(); ctx.globalAlpha = Math.min(1, (f.dur - f.t) / 0.15);
      ctx.fillStyle = f.perfect ? THEME.gold : '#bcebdc'; ctx.font = font(L.font(0.029));
      ctx.fillText(`${f.perfect ? 'PERFECT!' : '폭신!'} +${f.points}`, cx, L.zone.problem + L.gu(2.9));
      ctx.restore();
    }

    // 플레이 영역(카메라 상향 적용)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, L.zone.problem + L.gu(4.6), L.W, L.H);
    ctx.clip(); // 고정 문제/진행/기울기 안내 영역 보호
    ctx.translate(0, -this.camY);

    // 바닥/받는선 안내
    ctx.strokeStyle = '#739998';
    ctx.lineWidth = L.gu(0.08);
    ctx.setLineDash([L.gu(0.5), L.gu(0.4)]);
    ctx.beginPath();
    ctx.moveTo(L.safe, floorY);
    ctx.lineTo(L.W - L.safe, floorY);
    ctx.stroke();
    ctx.setLineDash([]);

    this._renderTower(ctx, floorY);

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
      this._drawBlock(ctx, x, y, this.fallBlockW * (1 - 0.3 * prog), this.fallBlockH * (1 - 0.3 * prog), THEME.correct, String(p.value), L.font(0.034), p.kind);
      ctx.restore();
    }

    if (this.missEffect) {
      const m = this.missEffect;
      const prog = m.t / m.dur;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog);
      ctx.fillStyle = THEME.wrong;
      ctx.font = font(L.font(0.045));
      drawRewardText(ctx, '앗! -1', m.x, m.y - prog * L.gu(1.2));
      ctx.restore();
    }
    if (this.recoverEffect) {
      const prog = this.recoverEffect.t / this.recoverEffect.dur;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog);
      ctx.fillStyle = THEME.correct;
      ctx.font = font(L.font(0.04));
      drawRewardText(ctx, '휴—', this.towerX, this._catchY() - L.gu(1.5) - prog * L.gu(1));
      ctx.restore();
    }
    if (this.compressEffect) {
      const c = this.compressEffect;
      const prog = c.t / c.dur;
      const y = this._catchY();
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog);
      ctx.strokeStyle = THEME.gold; // 확장 링
      ctx.lineWidth = L.gu(0.15);
      ctx.beginPath();
      ctx.arc(this.towerX, y, this.towerW * (0.4 + prog * 0.9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = THEME.gold; // 합쳐진 값
      ctx.font = font(L.font(0.055));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawRewardText(ctx, String(c.merged), this.towerX, y - L.gu(1) - prog * L.gu(1));
      ctx.restore();
    }
    ctx.restore();
    this._renderSilhouette(ctx);
    this._renderWaveGlow(ctx, floorY - this.camY);
    this._drawFeverBanner(ctx);
    // 위기 테두리는 ui가 자동으로 그린다.
  },

  // 완성품 진열장은 카메라와 독립된 하단 선반. 최근 6개 + 상단 총 완성 수.
  _renderSilhouette(ctx) {
    for (let i = 0; i < this.completedDesserts.length; i++) {
      if (this.waveGlow && i === this.completedDesserts.length - 1) continue;
      const d = this.completedDesserts[i], x = L.W / 6 * (i + 0.5);
      this._drawMiniDessert(ctx, x, L.H - L.gu(0.55), d.values, d.kind);
    }
  },

  _drawMiniDessert(ctx, x, y, values, kind = 'pancake') {
    const bh = L.gu(0.11), w = L.gu(1.4);
    drawFinishedDessert(ctx, x, y, w, bh, values.length, kind);
  },

  // 변형은 중간 층에만 적용한다. 맨 위 받침판의 x/y는 실제 판정과 항상 같다.
  _layerPose(i) {
    const count = this.stacked.length, t = (i + 1) / Math.max(1, count);
    const envelope = Math.sin(Math.PI * t);
    const danger = this.wrongInWave >= 2 ? Math.sin(this.time * 22) * L.gu(0.08) : 0;
    const impact = Math.sin(this.time * 32) * L.gu(0.1) * (this.thud / 0.12);
    return {
      x: this.towerX + envelope * (this.tiltCur / COLLAPSE_DEG * L.gu(0.85) + danger + impact),
      angle: envelope * this.tiltCur / COLLAPSE_DEG * 0.09,
    };
  },

  _renderTower(ctx, floorY) {
    const count = this.stacked.length, { bh, bw, gap } = this._towerGeom();
    this._drawCart(ctx, this.towerX, floorY, this.thud / 0.12);
    for (let i = 0; i < count; i++) {
      const pose = this._layerPose(i), isTop = i === count - 1;
      const squash = isTop ? 1 - this.dessertKind.squash * this.thud / 0.12 : 1;
      ctx.save();
      ctx.translate(pose.x, floorY - (i + 0.5) * bh);
      ctx.rotate(pose.angle);
      this._drawBlock(ctx, 0, 0, bw, (bh - gap) * squash, THEME.correct, String(this.stacked[i]), L.font(0.029));
      ctx.restore();
    }
    drawDessertPlate(ctx, this.towerX, this._catchY(), this.catchHalfW * 2, this.perfectHalfW);
  },

  _drawCart(ctx, x, floorY, impact = 0) {
    const w = this.towerW + L.gu(0.6), y = floorY + L.gu(0.15) * impact;
    drawDessertPlate(ctx, x, y, w);
    ctx.save();
    // 작은 표정은 숫자/판정 영역 밖인 받침판 아래에만.
    ctx.fillStyle = '#577979';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.arc(x + side * L.gu(0.24), y + L.gu(0.22), L.gu(0.035), 0, Math.PI * 2); ctx.fill();
    }
    if (impact > 0) {
      ctx.strokeStyle = '#dc9565'; ctx.lineWidth = L.gu(0.07);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + side * (w / 2 + L.gu(0.1)), y);
        ctx.lineTo(x + side * (w / 2 + L.gu(0.6) * impact), y - L.gu(0.3)); ctx.stroke();
      }
    }
    ctx.restore();
  },

  _renderWaveGlow(ctx, floorY) {
    const g = this.waveGlow;
    if (!g) return;
    // 0.2초는 큰 완성품으로 보여 준 뒤 0.4초 동안 진열장으로 보낸다.
    const prog = g.t / g.dur, travel = Math.max(0, (g.t - 0.2) / 0.4);
    const ease = 1 - (1 - travel) ** 3;
    const destX = L.W / 6 * (this.completedDesserts.length - 0.5);
    const x = g.x + (destX - g.x) * ease;
    const fromY = g.floorY ?? floorY;
    const y = fromY + (L.H - L.gu(0.55) - fromY) * ease;
    const scaleX = 1 + (L.gu(1.4) / this.towerW - 1) * ease;
    const bh = g.bh + (L.gu(0.11) - g.bh) * ease;
    ctx.save();
    // 완료 직후부터 숫자 대신 크림/과일/초. 이전 종류를 보존해 새 웨이브와 섞이지 않는다.
    drawFinishedDessert(ctx, x, y, this.towerW * scaleX, bh, g.count, g.kind);
    for (let i = 0; i < g.count; i++) {
      const cy = y - (i + 0.5) * bh;
      if (Math.abs(i / Math.max(1, g.count) - prog * 2) < 0.3) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#fffbdc'; roundRect(ctx, x - this.towerW * scaleX / 2, cy - bh / 2, this.towerW * scaleX, bh, bh * 0.2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  },

  _drawBlock(ctx, x, y, w, h, color, label, fontPx, kind = this.dessertKind.id) {
    drawDessert(ctx, x, y, w, h, label, fontPx, kind);
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
    ctx.font = font(L.font(0.035));
    ctx.lineWidth = L.gu(0.25);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(`FEVER +${b.points}`, L.W / 2, L.zone.problem + L.gu(2.9));
    ctx.fillStyle = THEME.gold;
    ctx.fillText(`FEVER +${b.points}`, L.W / 2, L.zone.problem + L.gu(2.9));
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
    this.compressEffect = null;
    this.waveGlow = null;
    this.feverBanner = null;
    this.catchFeedback = null;
    this.completedDesserts = [];
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
