// g05_match.js — 🍪 동물 간식 배달 (SPEC §4 5️⃣ / 재구축)
// 전략형. 좌측 간식 카드(계산식)를 정답 숫자를 든 동물에게 배달한다.
// 확정 인터페이스(SPEC §7)만 사용한다. core/scenes는 절대 수정하지 않는다.
//
// 재구축 이유: 기존 "숫자 매칭"은 웨이브가 흐름을 끊고(다 치우면 다시 시작), 어느 짝을 먼저
//   맞혀도 결과가 같아 판단이 없었다. → 웨이브를 없앤 '연속 대기열' + 동물 '인내심 게이지'로
//   "누구를 먼저 먹일까"라는 판단을 만든다(Diner Dash 계열의 리듬·끊김 없는 흐름).
//
// ⚠️ 조작은 드래그가 아니라 탭-탭(SPEC §6 조작 분산 — 태블릿 스크롤 충돌·트랙패드 회피):
//   - 간식 카드 탭 → 선택(살짝 떠오름·골드 테두리). 같은 카드 재탭 = 선택 해제.
//   - 동물 탭 → 간식이 포물선으로 날아가 입에 쏙("냠!"). 이 손맛이 게임의 핵심(0.3초, 멈춤 없음).
//
// 인내심(핵심 신규): 각 동물 머리 위 게이지가 천천히 줄고, 다 떨어지면 시무룩하게 돌아간다.
//   ⚠️ 동물이 떠나도 라이프는 깎지 않는다 — 계산을 틀린 게 아니라 손이 늦은 것(SPEC "놓침≠오답").
//   콤보만 리셋, 세션 기록엔 남기되 복습 큐엔 넣지 않는다. 함정 동물(짝 없는 답)은 그냥 돌아간다.
//
// 점수(⚠️ 최근 점수 인플레 수정 반영 — 곱셈 보너스 신설 금지, 피버 배수와 곱해지는 건 core 연타뿐):
//   배달 성공 50+콤보×5 / 오배달 라이프-1+정답표시(간식 복귀) / 급한 동물(≤30%) 배달 +40 정액
//   (reportNearMiss, 동물당 1회) / 연속 배달 3·5·10 → +50·+100·+200 정액(가산, 피버배수 미적용).

import { L } from '../core/layout.js';
import { THEME, font, roundRect } from '../core/ui.js';
import { drawPlayBackdrop, drawRewardText } from '../art/toyArt.js';
import { drawMatchAnimal, matchImage, preloadMatchAssets } from '../art/matchAssets.js';

const MAX_SLOTS = 6; // 세로 슬롯 수(높이 계산 기준 — 실제 표시 수는 콤보 티어를 따른다)
const ENTER_SEC = 0.3; // 등장(걸어 들어옴) 시간
const LEAVE_SEC = 0.38; // 퇴장(먹고 만족 / 시무룩) 시간
const FLY_SEC = 0.3; // 간식이 날아가는 시간(손맛)
const EAT_SEC = 0.22; // 도착 후 "냠!" 유지
const FLOAT_DUR = 0.6;
const PATIENCE_LOW = 0.3; // 이 비율 이하 = 급함(색 변화·발 구름·니어미스 대상)
const KIND_COLORS = ['#f3a6b0', '#a7d3c8', '#c3b1e6', '#f0c48a', '#9ec9ee']; // 동물 종류 색(전부 같은 인내심)

export const g05Match = {
  id: 'g05_match',
  name: '동물 간식 배달',
  emoji: '🍪',
  category: '전략형',
  maxLevel: 5, // 제한시간 웨이브가 사라져 Lv4 상한 제약을 해제(인내심 하한 9초로 계산 시간 확보)
  blankRatio: 0.4, // 사고형(□ 혼합)
  opMode: 'mixed', // 곱셈·나눗셈·빈칸 혼합(교사 설정이 특정 연산이면 교사 우선)
  comboMilestones: { 5: '단골 손님!', 10: '배달 달인!', 20: '인기 폭발!', 30: '전설의 셰프!' },
  fever: { type: 'easy' }, // easy=피버 중 쉬운 문제형(§2.6/§7.6). 피버 중 인내심 정지.

  tutorial: {
    text: '간식을 눌러 고르고, 정답 숫자를 든 동물에게 배달해!',
    draw(ctx) {
      preloadMatchAssets();
      const midY = L.gu(5);
      const cardW = L.gu(4.4);
      const cardH = L.gu(1.7);
      const lx = L.W / 2 - L.gu(6);
      const rx = L.W / 2 + L.gu(2.6);
      // 날아가는 간식 궤적(점선 호)
      ctx.strokeStyle = 'rgba(255,220,150,0.8)';
      ctx.lineWidth = L.gu(0.14);
      ctx.setLineDash([L.gu(0.3), L.gu(0.3)]);
      ctx.beginPath();
      ctx.moveTo(lx + cardW, midY + cardH / 2);
      ctx.quadraticCurveTo(L.W / 2, midY - L.gu(1.4), rx, midY + cardH / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // 간식 카드
      roundRect(ctx, lx, midY, cardW, cardH, L.gu(0.4));
      ctx.fillStyle = '#3a2f4d';
      ctx.fill();
      drawCookie(ctx, lx + L.gu(0.85), midY + cardH / 2, L.gu(0.5));
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = font(L.font(0.036));
      ctx.fillText('4 × 6', lx + cardW / 2 + L.gu(0.5), midY + cardH / 2);
      // 동물(24를 듦)
      drawCreature(ctx, rx + L.gu(0.9), midY + cardH / 2, L.gu(0.95), 0, 'happy', 0);
      ctx.fillStyle = THEME.gold;
      ctx.font = font(L.font(0.04));
      ctx.fillText('24', rx + L.gu(2.6), midY + cardH / 2);
      ctx.fillStyle = THEME.subtext;
      ctx.font = font(L.font(0.03), 'normal');
      ctx.fillText('간식 탭 → 동물 탭 → 냠!', L.W / 2, midY + cardH + L.gu(1.6));
      ctx.font = font(L.font(0.05));
      ctx.fillText('👆', L.W / 2, midY + cardH + L.gu(3));
    },
  },

  init(engine) {
    preloadMatchAssets();
    this.engine = engine;
    this.snacks = []; // [{problem, value, slot, y, appearT, leaving, gone}]
    this.animals = []; // [{value, isTrap, problem, kind, patience, maxPatience, slot, y, appearT, leaving, leaveKind, leaveT, eatT, nearMissUsed, stompT}]
    this.selected = null; // 선택된 간식
    this.flying = []; // 날아가는 간식 [{x0,y0,x1,y1,t,dur,onLand}]
    this.floatTexts = [];
    this.hearts = []; // 5연속 하트 [{x,y,t}]
    this.claps = 0; // 10연속 박수 잔여(초)
    this.bobT = 0; // 2연속 들썩
    this.feverBanner = null;
    this.wasFever = false;
    this.feverDan = 0;
    this.time = 0;
    this._seq = 0; // 간식 세로 정렬 키(등장 순서)
    this.engine.markQuestionStart();
    this._refill(); // 초기 대기열 구성
  },

  // ── 콤보 기반 난이도(축 B) ─────────────────────────────────
  _tier() {
    const e = this.engine;
    const c = e.scoreManager.combo;
    let animals, patience, traps;
    if (c < 5) { animals = 4; patience = 12; traps = 0; }
    else if (c < 10) { animals = 5; patience = 11; traps = 1; }
    else if (c < 20) { animals = 5; patience = 10; traps = 1; }
    else { animals = 6; patience = 9; traps = 2; }
    // 라이프 1개면 인내심 한 단계(+1초) 여유. 하한 9초는 티어 자체가 보장.
    if (e.scoreManager.lives <= 1) patience = Math.min(12, patience + 1);
    // 교사 제한시간 배율을 인내심에 곱한다(1.5배 → 12초가 18초).
    patience *= (e.settings.timeScale || 1);
    return { animals, patience, traps };
  },

  _activeAnimals() { return this.animals.filter((a) => !a.leaving); },
  _activeSnacks() { return this.snacks.filter((s) => !s.leaving && !s.gone); },
  _feverActive() { return !!(this.engine.fever && this.engine.fever.active); },

  // 현재 화면에서 쓰이는 값들(간식 답 + 동물 값) — 중복 배정 방지용.
  _usedValues() {
    const set = new Set();
    for (const s of this.snacks) if (!s.gone) set.add(s.value);
    for (const a of this.animals) set.add(a.value);
    return set;
  },

  // 목표 인원까지 주문(간식+정답 동물) 또는 함정 동물을 채운다. 정답 짝은 항상 ≥2 유지.
  _refill() {
    const t = this._tier();
    let guard = 0;
    while (this._activeAnimals().length < t.animals && guard++ < 30) {
      const cur = this._activeAnimals();
      const curTraps = cur.filter((a) => a.isTrap).length;
      const curNon = cur.length - curTraps;
      if (curTraps < t.traps && curNon >= 2) this._spawnTrap(t);
      else this._spawnOrder(t);
    }
  },

  // 새 주문: 답이 고유한 문제 1개 → 간식 카드 + 그 답을 든 정답 동물.
  _spawnOrder(t) {
    const e = this.engine;
    const used = this._usedValues();
    let p = null;
    for (let i = 0; i < 60; i++) {
      const cand = e.problemGenerator.nextProblem({ maxLevel: this.maxLevel, blankRatio: this.blankRatio, opMode: this.opMode });
      if (!used.has(cand.answer)) { p = cand; break; }
    }
    if (!p) return; // 극단적으로 후보가 없으면 이번 프레임은 건너뜀(다음 프레임 재시도)
    this.snacks.push(this._newSnack(p));
    this.animals.push(this._newAnimal(p.answer, false, p, t));
  },

  // 함정 동물: 어떤 간식과도 짝이 안 되는 값(배달 불가) — 인내심이 다 되면 그냥 돌아간다(정상).
  _spawnTrap(t) {
    const e = this.engine;
    const used = this._usedValues();
    const snackVals = this._activeSnacks().map((s) => s.value);
    let v = null;
    for (let i = 0; i < 80; i++) {
      const base = snackVals.length ? snackVals[Math.floor(Math.random() * snackVals.length)] : 20;
      const cand = base + (Math.floor(Math.random() * 6) + 1) * (Math.random() < 0.5 ? -1 : 1);
      if (cand > 0 && !used.has(cand)) { v = cand; break; }
    }
    if (v == null) return;
    this.animals.push(this._newAnimal(v, true, null, t));
  },

  // key: 세로 정렬용 안정 키. 간식은 등장 순서(위→아래), 동물은 '무작위'라 정답 동물이 간식과 다른
  //   행에 놓인다(핵심 판단: 답을 계산하고 그 답을 든 동물을 찾아야 한다 — 행 정렬이면 판단이 사라짐).
  _newSnack(problem) {
    return { problem, value: problem.answer, key: this._seq++, slot: 0, y: null, appearT: 0, leaving: false, gone: false };
  },
  _newAnimal(value, isTrap, problem, t) {
    return {
      value, isTrap, problem, kind: Math.floor(Math.random() * KIND_COLORS.length),
      patience: t.patience, maxPatience: t.patience,
      key: Math.random(), slot: 0, y: null, appearT: 0,
      leaving: false, leaveKind: null, leaveT: 0, eatT: 0, nearMissUsed: false, stompT: 0,
    };
  },

  // ── 레이아웃(슬롯 → 좌표). 슬롯 순으로 위에서부터 채운다. ──
  //   ⚠️ 그리드 시작 Y는 arcadeWorld의 문제 헤더 패널(하단 = problem + gu(2.75)) '아래'여야 한다.
  //      playTop(244)에서 시작하면 첫 행이 헤더 패널에 파고든다(칸 침범). 패널 하단 + 여백에서 시작.
  _gridTop() { return L.zone.problem + L.gu(3.2); },
  _slotH() {
    const gap = L.gu(0.5);
    const avail = L.zone.playBottom - this._gridTop();
    return Math.min(L.gu(3.1), (avail - (MAX_SLOTS - 1) * gap) / MAX_SLOTS);
  },
  _slotCY(slot) {
    const gap = L.gu(0.5);
    const h = this._slotH();
    return this._gridTop() + slot * (h + gap) + h / 2;
  },
  _colW() { return L.w(0.4); },
  _leftX() { return L.safe; },
  _rightX() { return L.W - L.safe - this._colW(); },
  _snackRect(s) {
    const w = this._colW(), h = this._slotH();
    return { x: this._leftX(), y: (s.y ?? this._slotCY(s.slot)) - h / 2, w, h };
  },
  _animalRect(a) {
    const w = this._colW(), h = this._slotH();
    return { x: this._rightX(), y: (a.y ?? this._slotCY(a.slot)) - h / 2, w, h };
  },

  // ── 피버(easy): 인내심 정지 + dan×k 순서 대기열(위에서부터 착착 잇는 리듬) ──
  _enterFever() {
    this.selected = null;
    this.snacks = [];
    this.animals = [];
    this.flying = [];
    this._buildFeverQueue();
  },
  _exitFever() {
    this.selected = null;
    this.snacks = [];
    this.animals = [];
    this.flying = [];
    this.feverDan = 0;
    this._refill(); // 일반 대기열 재구성
    this.engine.markQuestionStart();
  },
  _buildFeverQueue() {
    const dan = this.engine.fever.dan || (2 + Math.floor(Math.random() * 4));
    this.feverDan = dan;
    const K = 5;
    for (let k = 1; k <= K; k++) {
      const answer = dan * k;
      const p = { a: dan, b: k, op: '×', answer, remainder: null, text: `${dan} × ${k}`, blank: null, level: 1, fromReview: false };
      const s = this._newSnack(p); s.key = k; s.slot = k - 1;
      const a = this._newAnimal(answer, false, p, { patience: 999 }); a.key = k; a.slot = k - 1; // 정렬(리듬)·인내심 정지
      this.snacks.push(s);
      this.animals.push(a);
    }
  },

  update(dt) {
    this.time += dt;
    const e = this.engine;

    // 피버 진입/종료 전이
    const fev = e.fever;
    const active = !!(fev && fev.active);
    if (active && !this.wasFever) {
      e.ui.flash('rgba(255,210,120,0.5)', 0.08);
      e.ui.showComboText('🔥 FEVER!', true);
      this._enterFever();
    } else if (!active && this.wasFever) {
      this.feverBanner = { points: fev ? fev.pointsEarned : 0, t: 0, dur: 1.4 };
      e.ui.flash('rgba(120,200,255,0.4)', 0.08);
      this._exitFever();
    }
    this.wasFever = active;

    // 인내심(피버 중엔 정지 — 해방감 구간이라 시간 압박 없음)
    if (!active) {
      for (const a of this._activeAnimals()) {
        if (a.fed) continue; // 배달 확정(간식 비행 중)인 동물은 인내심이 흐르지 않는다
        a.patience -= dt;
        if (a.patience <= a.maxPatience * PATIENCE_LOW) a.stompT += dt;
        if (a.patience <= 0) this._timeout(a);
      }
    }

    // 등장/퇴장/슬롯 이동 애니메이션
    this._animate(dt);

    // 날아가는 간식
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt;
      if (f.t >= f.dur) {
        if (f.onLand) f.onLand();
        this.flying.splice(i, 1);
      }
    }

    // 이펙트 타이머
    for (let i = this.floatTexts.length - 1; i >= 0; i--) {
      this.floatTexts[i].t += dt;
      if (this.floatTexts[i].t >= this.floatTexts[i].dur) this.floatTexts.splice(i, 1);
    }
    for (let i = this.hearts.length - 1; i >= 0; i--) {
      this.hearts[i].t += dt;
      if (this.hearts[i].t >= 1.1) this.hearts.splice(i, 1);
    }
    if (this.bobT > 0) this.bobT = Math.max(0, this.bobT - dt);
    if (this.claps > 0) this.claps = Math.max(0, this.claps - dt);
    if (this.feverBanner) {
      this.feverBanner.t += dt;
      if (this.feverBanner.t >= this.feverBanner.dur) this.feverBanner = null;
    }

    // 보충: 피버 중엔 dan 시퀀스를 다 먹으면 새 시퀀스, 일반은 목표 인원 유지
    if (active) {
      if (this._activeAnimals().length === 0 && this.flying.length === 0) this._buildFeverQueue();
    } else {
      this._refill();
    }
  },

  // 슬롯을 위에서부터 압축(누가 나가면 뒤가 당겨진다) + y 부드럽게 이동, 등장/퇴장 진행.
  _animate(dt) {
    const relayout = (list) => {
      const active = list.filter((c) => !c.gone && !c.leaving).sort((a, b) => a.key - b.key);
      active.forEach((c, i) => { c.slot = i; });
    };
    relayout(this.snacks);
    relayout(this.animals);
    const step = Math.min(1, dt * 12);
    for (const c of [...this.snacks, ...this.animals]) {
      if (c.gone) continue;
      const targetY = this._slotCY(c.slot);
      c.y = c.y == null ? targetY : c.y + (targetY - c.y) * step;
      if (c.appearT < ENTER_SEC) c.appearT += dt;
      if (c.leaving) {
        c.leaveT += dt;
        if (c.leaveT >= LEAVE_SEC) c.gone = true;
      }
    }
    this.snacks = this.snacks.filter((s) => !s.gone);
    this.animals = this.animals.filter((a) => !a.gone);
  },

  // 인내심 소진 → 시무룩 퇴장. 함정은 정상(무해), 정답 동물은 놓침(콤보 리셋·기록, 라이프/복습 무영향).
  _timeout(a) {
    if (a.leaving) return;
    if (!a.isTrap) {
      // '놓침': loseLife/freeze/affectLevel=false, missed=true → 라이프·복습큐 무영향, 콤보만 리셋, 세션 기록.
      this.engine.answerWrong(a.problem, null, { loseLife: false, freeze: false, affectLevel: false, missed: true });
      this._removeSnackByValue(a.value); // 손님이 떠났으니 그 간식도 회수(→ 새 주문으로 대체)
      if (this.selected && this.selected.value === a.value) this.selected = null;
    }
    a.leaving = true; a.leaveKind = 'sad'; a.leaveT = 0;
  },

  _removeSnackByValue(v) {
    const s = this._activeSnacks().find((s) => s.value === v);
    if (s) { s.leaving = true; s.leaveT = 0; s.leaveKind = 'sad'; }
  },

  onTouch(x, y, phase) {
    if (phase !== 'start') return;
    if (this.engine.freeze && this.engine.freeze.active) return; // 오답 정답표시 중엔 입력 잠금

    const snack = this._snackAt(x, y);
    if (snack) {
      if (this.selected === snack) { this.selected = null; return; } // 재탭 해제
      this.selected = snack;
      this.engine.sound.play('tick');
      return;
    }
    const animal = this._animalAt(x, y);
    if (animal && this.selected) {
      this._deliver(this.selected, animal);
      return;
    }
  },

  _snackAt(x, y) {
    for (const s of this._activeSnacks()) if (hitRect(this._snackRect(s), x, y)) return s;
    return null;
  },
  _animalAt(x, y) {
    for (const a of this._activeAnimals()) if (!a.fed && hitRect(this._animalRect(a), x, y)) return a;
    return null;
  },

  _deliver(snack, animal) {
    const e = this.engine;
    if (animal.value === snack.value && !animal.leaving) {
      // ── 정답 배달 ──
      const preCombo = e.scoreManager.combo;
      const pts = 50 + preCombo * 5; // 기본 유지, 곱셈 보너스 신설하지 않음
      e.answerCorrect(snack.problem, animal.value, pts); // 점수·콤보·게이지·정답음 자동(피버 배수 포함)
      const combo = e.scoreManager.combo; // = preCombo + 1
      const sr = this._animalRect(animal);
      const mouthX = sr.x + L.gu(1.1), mouthY = sr.y + sr.h / 2;

      // 급한 동물 보너스: 인내심 ≤30%에게 배달 → +40 정액(reportNearMiss, 동물당 1회). 피버 중엔 정지라 미발동.
      if (!animal.nearMissUsed && !this._feverActive() && animal.patience <= animal.maxPatience * PATIENCE_LOW) {
        animal.nearMissUsed = true;
        e.reportNearMiss(mouthX, mouthY); // +40(·게이지+5)·"아슬아슬!"
      }
      // 연속 배달 보너스: 3·5·10 → +50·+100·+200 정액(가산, 피버 배수 미적용).
      let sb = 0;
      if (combo === 3) sb = 50; else if (combo === 5) sb = 100; else if (combo === 10) sb = 200;
      else if (combo > 10 && combo % 10 === 0) sb = 200; // 이후 10마다 유지(판단 사항)
      if (sb > 0) {
        e.scoreManager.addPoints(sb);
        if (e.fever) e.fever.addPoints(sb);
        this.floatTexts.push({ x: mouthX, y: mouthY - L.gu(1.4), text: `연속 +${sb}`, color: THEME.gold, size: L.font(0.03), t: 0, dur: FLOAT_DUR });
      }
      this._streakFx(combo, sr);

      // 간식이 날아가 입에 쏙(손맛). 간식 카드는 즉시 회수하고 토큰으로 대체(멈춤 없음).
      animal.fed = true; // 비행 동안 시간초과·재타깃 방지
      const rc = this._snackRect(snack);
      snack.gone = true;
      if (this.selected === snack) this.selected = null;
      this.flying.push({
        x0: rc.x + rc.w / 2, y0: rc.y + rc.h / 2, x1: mouthX, y1: mouthY, t: 0, dur: FLY_SEC,
        onLand: () => {
          animal.eatT = EAT_SEC;
          animal.leaving = true; animal.leaveKind = 'happy'; animal.leaveT = -EAT_SEC; // 먼저 "냠!" 후 퇴장
          e.particles.emit(mouthX, mouthY, 'pop', THEME.gold, 8);
          e.particles.emit(mouthX, mouthY, 'sparkle', KIND_COLORS[animal.kind], 10);
        },
      });
      const shown = pts * (e.fever && e.fever.active ? e.fever.scoreMultiplier : 1);
      this.floatTexts.push({ x: mouthX, y: mouthY, text: `냠! +${shown}`, color: e.fever && e.fever.active ? THEME.gold : THEME.correct, size: L.font(0.036), t: 0, dur: FLOAT_DUR });
      e.ui.shake(5, 0.09);
      this._haptic(15);
    } else {
      // ── 오배달 → 라이프 -1 + 정답표시 1.2초, 간식은 제자리로(선택만 해제) ──
      e.ui.shake(14, 0.1);
      this.selected = null;
      e.answerWrong(snack.problem, animal.value, { loseLife: true, onResume: () => {} });
    }
  },

  // 연속 배달 연출(점수보다 이쪽이 중요): 2 들썩 / 3 냠냠! / 5 하트 / 10 전원 박수.
  _streakFx(combo, rect) {
    const e = this.engine;
    if (combo >= 2) this.bobT = 0.25;
    if (combo === 3) {
      this.floatTexts.push({ x: rect.x + rect.w / 2, y: rect.y - L.gu(0.6), text: '냠냠!', color: THEME.gold, size: L.font(0.04), t: 0, dur: FLOAT_DUR });
      e.particles.emit(rect.x + rect.w / 2, rect.y + rect.h / 2, 'sparkle', THEME.gold, 16);
    }
    if (combo === 5) {
      for (let i = 0; i < 6; i++) this.hearts.push({ x: L.safe + Math.random() * (L.W - L.safe * 2), y: L.zone.playBottom - Math.random() * L.gu(2), t: -i * 0.05 });
    }
    if (combo === 10) { this.claps = 1.0; e.ui.showComboText('👏 배달 달인!', true); }
  },

  _haptic(ms) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(ms); } catch (e) { /* 무시 */ }
    }
  },

  _feverIntensity() {
    const f = this.engine.fever;
    if (!f) return 0;
    if (f.active) return 1;
    const peak = (f.cfg && f.cfg.speedMult ? f.cfg.speedMult : 1.35) - 1;
    return peak > 0 ? Math.max(0, (f.speedMultiplier - 1) / peak) : 0;
  },

  // ── 렌더 ──────────────────────────────────────────────────
  render(ctx) {
    drawPlayBackdrop(ctx, this.id, this.time || 0);
    this._drawFeverBg(ctx);
    if (this.engine.fever) {
      this.engine.fever.renderGauge(ctx, { x: L.safe, y: L.zone.gauge, w: L.W - L.safe * 2, h: L.gu(0.5) });
    }

    const cx = L.W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 하트(배경 위)
    for (const h of this.hearts) {
      if (h.t < 0) continue;
      const p = h.t / 1.1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.font = font(L.font(0.05));
      ctx.fillText('💗', h.x, h.y - p * L.gu(3));
      ctx.restore();
    }

    // 지시문
    if (this._feverActive() && this.feverDan) {
      ctx.fillStyle = THEME.gold;
      ctx.font = font(L.font(0.045));
      ctx.fillText(`${this.feverDan}단 배달!`, cx, L.zone.problem - L.gu(0.4));
      ctx.font = font(L.font(0.026), 'normal');
      ctx.fillStyle = THEME.text;
      ctx.fillText('위에서부터 착착 배달해!', cx, L.zone.problem + L.gu(1));
    } else {
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.038));
      ctx.fillText('간식을 정답 동물에게 배달!', cx, L.zone.problem - L.gu(0.4));
      ctx.font = font(L.font(0.026), 'normal');
      ctx.fillStyle = THEME.subtext;
      ctx.fillText('간식 탭 → 동물 탭', cx, L.zone.problem + L.gu(1));
    }

    // 간식(좌) / 동물(우)
    for (const s of this.snacks) this._drawSnack(ctx, s);
    for (const a of this.animals) this._drawAnimal(ctx, a);

    // 날아가는 간식
    for (const f of this.flying) {
      const p = f.t / f.dur;
      const x = f.x0 + (f.x1 - f.x0) * p;
      const y = f.y0 + (f.y1 - f.y0) * p - Math.sin(p * Math.PI) * L.gu(2.2); // 포물선
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p * Math.PI * 1.5);
      drawCookie(ctx, 0, 0, L.gu(0.55));
      ctx.restore();
    }

    // 부양 점수/문구
    for (const t of this.floatTexts) {
      const prog = t.t / t.dur;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog);
      ctx.fillStyle = t.color;
      ctx.font = font(t.size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawRewardText(ctx, t.text, t.x, t.y - prog * L.gu(2));
      ctx.restore();
    }

    this._drawFeverBanner(ctx);
  },

  _drawSnack(ctx, s) {
    const r = this._snackRect(s);
    const app = Math.min(1, s.appearT / ENTER_SEC);
    let dx = (1 - app) * -this._colW() * 1.2; // 왼쪽에서 걸어 들어옴
    let alpha = app;
    if (s.leaving) { const lp = Math.min(1, Math.max(0, s.leaveT) / LEAVE_SEC); dx = -lp * this._colW() * 1.3; alpha = 1 - lp; }
    const isSel = this.selected === s;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    const lift = isSel ? -L.gu(0.35) : 0; // 선택 시 살짝 떠오름
    roundRect(ctx, r.x + dx, r.y + lift, r.w, r.h, L.gu(0.4));
    const tray = ctx.createLinearGradient(0, r.y + lift, 0, r.y + lift + r.h);
    tray.addColorStop(0, '#fff5d9'); tray.addColorStop(1, '#e9cf9d');
    ctx.fillStyle = tray;
    ctx.fill();
    ctx.strokeStyle = isSel ? '#ed991d' : '#bd8b51';
    ctx.lineWidth = isSel ? L.gu(0.26) : L.gu(0.08);
    ctx.stroke();
    // 쿠키 아이콘 + 식(카드 폭에 맞춰 축소)
    drawCookie(ctx, r.x + dx + L.gu(0.9), r.y + lift + r.h / 2, L.gu(0.7));
    ctx.fillStyle = '#503724';
    fitText(ctx, s.problem.text, r.x + dx + L.gu(1.7) + (r.w - L.gu(2.2)) / 2, r.y + lift + r.h / 2, r.w - L.gu(2.3), L.font(0.04), L.font(0.024));
    if (s.problem.fromReview) {
      ctx.fillStyle = THEME.gold;
      ctx.font = font(L.font(0.02), 'normal');
      ctx.fillText('🔁', r.x + dx + r.w - L.gu(0.55), r.y + lift + L.gu(0.5));
    }
    ctx.restore();
  },

  _drawAnimal(ctx, a) {
    const r = this._animalRect(a);
    const app = Math.min(1, a.appearT / ENTER_SEC);
    let dx = (1 - app) * this._colW() * 1.2; // 오른쪽에서 걸어 들어와 줄을 섬
    let dy = 0, alpha = app;
    let mood = 'wait';
    const ratio = a.maxPatience > 0 ? Math.max(0, a.patience / a.maxPatience) : 1;
    const low = !this._feverActive() && ratio <= PATIENCE_LOW;
    if (low) { dx += Math.sin(a.stompT * 22) * L.gu(0.12); mood = 'worry'; } // 발 구름
    if (this.bobT > 0 && !a.leaving) dy += Math.sin(this.time * 20) * L.gu(0.1); // 들썩
    if (this.claps > 0) dy += Math.sin(this.time * 26 + a.slot) * L.gu(0.14); // 박수
    if (a.leaving) {
      const lp = Math.min(1, Math.max(0, a.leaveT) / LEAVE_SEC);
      if (a.leaveKind === 'happy') { dx += lp * this._colW() * 1.3; dy -= Math.sin(lp * Math.PI) * L.gu(0.7); mood = 'happy'; }
      else { dx += lp * this._colW() * 1.1; dy += lp * L.gu(0.5); mood = 'sad'; }
      alpha = Math.max(0, 1 - lp);
      if (a.leaveT < 0) mood = 'happy'; // "냠!" 순간
    }
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    const bx = r.x + dx, by = r.y + dy;
    // 행 배경
    roundRect(ctx, bx, by, r.w, r.h, L.gu(0.4));
    ctx.fillStyle = a.isTrap ? '#3a3550' : '#2f4a52';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = L.gu(0.07);
    ctx.stroke();
    // 인내심 바(행 상단). 피버 중엔 표시하지 않음(정지).
    if (!this._feverActive()) this._drawPatience(ctx, bx, by, r.w, ratio, low);
    // 동물 얼굴(좌) + 든 숫자(우)
    drawCreature(ctx, bx + L.gu(1.05), by + r.h / 2 + L.gu(0.15), Math.min(L.gu(0.95), r.h * 0.4), a.kind, mood, this.time + a.slot);
    ctx.fillStyle = '#fff';
    fitText(ctx, String(a.value), bx + L.gu(2.4) + (r.w - L.gu(2.8)) / 2, by + r.h / 2, r.w - L.gu(2.9), L.font(0.05), L.font(0.03));
    ctx.restore();
  },

  _drawPatience(ctx, x, y, w, ratio, low) {
    const bw = w - L.gu(1.0);
    const bx = x + L.gu(0.5);
    const by = y + L.gu(0.18);
    const h = L.gu(0.24);
    roundRect(ctx, bx, by, bw, h, h / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();
    if (ratio > 0) {
      roundRect(ctx, bx, by, bw * ratio, h, h / 2);
      ctx.fillStyle = low ? THEME.wrong : (ratio > 0.6 ? THEME.correct : THEME.gold);
      ctx.fill();
    }
    if (low) { // 색만 의존 금지 → ⏳ 아이콘 병기
      ctx.fillStyle = THEME.wrong;
      ctx.font = font(L.font(0.022));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('⏳', bx + bw + L.gu(0.15), by + h / 2);
    }
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
    ctx.strokeText(`FEVER +${b.points}`, L.W / 2, L.H * 0.9);
    ctx.fillStyle = THEME.gold;
    ctx.fillText(`FEVER +${b.points}`, L.W / 2, L.H * 0.9);
    ctx.restore();
  },

  onHover(x, y) { return !!(this._snackAt(x, y) || this._animalAt(x, y)); },
  clearHover() {},
  onKey() {},

  destroy() {
    this.engine = null;
    this.snacks = [];
    this.animals = [];
    this.flying = [];
    this.selected = null;
    this.floatTexts = [];
    this.hearts = [];
    this.feverBanner = null;
  },
};

// ── 모듈 로컬 그림 헬퍼(core 미수정, 좌표는 호출부가 L로 계산) ──────────────
// 간식 아이콘: 초콜릿칩 쿠키.
function drawCookie(ctx, x, y, r) {
  const image = matchImage('cookie');
  if (image) { ctx.drawImage(image, x - r, y - r, r * 2, r * 2); return; }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#d7a55e';
  ctx.fill();
  ctx.fillStyle = '#5b3b1e';
  for (const [dx, dy] of [[-0.35, -0.2], [0.3, -0.3], [0.1, 0.35], [-0.25, 0.28], [0.4, 0.15]]) {
    ctx.beginPath();
    ctx.arc(x + dx * r, y + dy * r, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 동물 얼굴: 종류(kind)로 색·귀 모양, 기분(mood)으로 눈·입. 정답/함정은 색으로 미리 구별하지 않는다.
function drawCreature(ctx, x, y, r, kind, mood, t) {
  if (drawMatchAnimal(ctx, x, y, r, kind, mood, t)) return;
  const col = KIND_COLORS[kind % KIND_COLORS.length];
  const bob = Math.sin((t || 0) * 3) * r * 0.05;
  ctx.save();
  ctx.translate(x, y + bob);
  // 귀(종류별)
  ctx.fillStyle = col;
  if (kind % 3 === 0) { // 토끼(긴 귀)
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * r * 0.4, -r * 0.95, r * 0.22, r * 0.6, s * 0.2, 0, Math.PI * 2); ctx.fill(); }
  } else if (kind % 3 === 1) { // 곰(둥근 귀)
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * r * 0.62, -r * 0.62, r * 0.34, 0, Math.PI * 2); ctx.fill(); }
  } else { // 고양이(뾰족 귀)
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * r * 0.3, -r * 0.7); ctx.lineTo(s * r * 0.75, -r * 1.15); ctx.lineTo(s * r * 0.78, -r * 0.5); ctx.closePath(); ctx.fill(); }
  }
  // 머리
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = col;
  ctx.fill();
  // 눈
  ctx.fillStyle = '#2f2436';
  const eyeY = -r * 0.05;
  if (mood === 'sad') {
    for (const s of [-1, 1]) { ctx.save(); ctx.translate(s * r * 0.38, eyeY); ctx.rotate(s * 0.5); ctx.fillRect(-r * 0.18, -r * 0.03, r * 0.36, r * 0.08); ctx.restore(); }
  } else {
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * r * 0.36, eyeY, r * 0.12, 0, Math.PI * 2); ctx.fill(); }
  }
  // 볼
  ctx.fillStyle = 'rgba(255,120,140,0.5)';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * r * 0.55, r * 0.28, r * 0.13, 0, Math.PI * 2); ctx.fill(); }
  // 입
  ctx.strokeStyle = '#2f2436';
  ctx.lineWidth = r * 0.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (mood === 'happy') { ctx.arc(0, r * 0.18, r * 0.28, 0.15 * Math.PI, 0.85 * Math.PI); }
  else if (mood === 'sad') { ctx.arc(0, r * 0.55, r * 0.26, 1.15 * Math.PI, 1.85 * Math.PI); }
  else if (mood === 'worry') { ctx.moveTo(-r * 0.18, r * 0.38); ctx.lineTo(r * 0.18, r * 0.38); }
  else { ctx.arc(0, r * 0.22, r * 0.2, 0.1 * Math.PI, 0.9 * Math.PI); }
  ctx.stroke();
  ctx.restore();
}

// 텍스트를 최대 폭에 맞춰 자동 축소해 중앙 정렬로 그린다.
function fitText(ctx, text, cx, cy, maxW, baseSize, minSize) {
  let size = baseSize;
  ctx.font = font(size);
  const w = ctx.measureText(text).width;
  if (w > maxW) size = Math.max(minSize, (size * maxW) / w);
  ctx.font = font(size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
}

function hitRect(r, x, y) {
  return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
