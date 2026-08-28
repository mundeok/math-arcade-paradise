// g09_balloon.js — 🎈 벌룬 팝 (SPEC §4 9️⃣ / Phase 2)
// 개념확장형. "식의 값이 같다(등식)"를 배우는 게임이다.
//   문제 "6 × 4 = ?"(답 24)가 뜨면, 부양하는 풍선 중 값이 24인 것을 전부 터뜨려야 다음 문제로 넘어간다.
//   정답 풍선은 24 뿐 아니라 8×3·48÷2·4×6 처럼 값이 같은 '식'으로도 나타난다 → 2️⃣ 캐치와 차별화.
// 확정 인터페이스(SPEC §7)만 사용한다. core/scenes는 건드리지 않는다.
//
// ⚠️ 좌표·크기·폰트는 전부 core/layout.js 의 L 헬퍼로 계산한다(픽셀 리터럴 금지).
//    우선순위: L.zone.* > L.gu(n) > L.x/y/w/h(ratio). 부양물의 기준 영역은 zone.floor~zone.playTop.
//
// 축 분리(SPEC 2.1):
//   - 수학 난이도(level)는 problemGenerator만 관리. 이 파일은 level을 읽지 않는다.
//   - 게임 난이도(축 B)는 오직 scoreManager.combo로 계산한다: 풍선 수·상승 속도·근접 오답도.
// 점수·콤보·라이프·복습큐·연출은 engine.answerCorrect / answerWrong 이 전담한다.
//
// ⚠️ 콤보는 '라운드 완성' 단위로 오른다(SPEC §4 9️⃣). 값이 같은 풍선을 전부 터뜨려 라운드를
//    완성해야 콤보 +1 이다. 게임 간 콤보 의미(연속 성공)를 통일하기 위함.
//    - 개별 풍선을 터뜨릴 때마다 점수(70+콤보×8)는 그대로 계산해 라운드 점수에 누적한다.
//    - 라운드 완성 시점에 answerCorrect 를 '1회' 호출해 누적 점수를 반영하고 콤보를 +1 한다.
//      (scoreManager는 직접 만지지 않고 answerCorrect 호출 시점만 조정한 것 — 점수 가산 API가
//       answerCorrect 하나뿐이라 개별 팝마다 즉시 가산하면 콤보도 함께 올라 버리기 때문.)
//    - 오답 풍선/정답 풍선 탈출은 라운드 실패 → 콤보 리셋(기존과 동일).
//    - RAPID FIRE(2초 내 3연속) 판정은 개별 팝 기준을 그대로 유지한다.
//
// 오답 값(방해 숫자)은 반드시 problemGenerator.makeDistractors 로만 만든다.
//   풍선 라벨을 '식'으로 바꾸는 것은 값의 표기(표현)일 뿐이며, 오답 값 자체는 코어가 만든 것을 쓴다.

import { L } from '../core/layout.js';
import { THEME, font } from '../core/ui.js';

// 시간(초) 상수 — 좌표가 아니므로 L 대상이 아니다.
const BASE_RISE_SEC = 6.0; // 콤보 0에서 부양 영역을 지나는 데 걸리는 시간
const SPEED_CAP = 2.4; // 상승 속도 배율 상한(반드시 클램프) — 콤보 5마다 ×1.15
const RAPID_WINDOW = 2.0; // 이 시간(초) 안에 정답 3연속이면 RAPID FIRE

// 풍선 장식 색(정오답과 무관 — 색으로 정답을 드러내지 않기 위해 상관없이 배정, SPEC 2.5)
const FESTIVE = ['#e05a7a', '#4a9eff', '#ffb84a', '#8b7bff', '#3ec1a0', '#ff8a5c'];

export const g09Balloon = {
  id: 'g09_balloon',
  name: '벌룬 팝',
  emoji: '🎈',
  category: '개념확장',
  maxLevel: 3, // 출제 상한 Lv3 (SPEC 2.1 반사신경/개념확장형)
  blankRatio: 0, // 빈칸 미출제 → 문제는 항상 'a op b' 형태, 답이 하나의 값
  opMode: 'multiply', // 이 게임은 곱셈만 출제 (교사 설정이 특정 연산이면 교사 우선)
  // 게임 고유 콤보 문구(그 외 10/20/30은 core 기본). core가 일원 관리(SPEC §7.1).
  //   콤보는 '라운드 완성' 단위로 오르므로 여기 값들도 완성 라운드 수 기준이다.
  comboMilestones: { 5: 'BURST!', 15: 'EXPLOSION!', 25: 'FIREWORKS!' },
  fever: true, // 재미 표준 피버 opt-in → engine.fever (§7.6)

  // ── 풍선 크기/간격 (전부 L 기반 getter — 논리 캔버스가 커져도 함께 스케일) ──
  get rx() {
    return L.w(0.085);
  }, // 풍선 가로 반지름
  get ry() {
    return L.w(0.1);
  }, // 풍선 세로 반지름(살짝 길쭉)
  get pad() {
    return L.gu(0.4);
  }, // 터치 판정 여유
  get stagger() {
    return L.gu(4.5);
  }, // 풍선 간 세로 진입 간격(한 줄로 몰리지 않게)

  tutorial: {
    text: '답이 같은 풍선을 모두 찾아서 터뜨려!',
    draw(ctx) {
      // ctx는 논리 좌표, translate(0,260)된 카드 영역(x 24~776, y 0~440) 안에서 그린다.
      const cx = L.W / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 문제
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.05));
      ctx.fillText('6 × 4 = ?', cx, L.gu(1.6));

      // 값이 24로 같은 풍선들(정답: 24, 8×3, 4×6)과 오답(20). 색은 정오답과 무관.
      const balloons = [
        { x: cx - L.gu(6), y: L.gu(6.5), label: '24', ok: true, hue: FESTIVE[0] },
        { x: cx - L.gu(2), y: L.gu(5), label: '8×3', ok: true, hue: FESTIVE[1] },
        { x: cx + L.gu(2.2), y: L.gu(6.8), label: '20', ok: false, hue: FESTIVE[2] },
        { x: cx + L.gu(6), y: L.gu(5.2), label: '4×6', ok: true, hue: FESTIVE[3] },
      ];
      for (const b of balloons) {
        drawBalloon(ctx, b.x, b.y, L.gu(1.5), L.gu(1.8), b.hue, b.label, L.font(0.03));
        if (b.ok) {
          // 정답임을 색+아이콘(⭕)으로 병행 표시(튜토리얼 안내용)
          ctx.font = font(L.font(0.032));
          ctx.fillText('⭕', b.x + L.gu(1.2), b.y - L.gu(1.4));
        }
      }
      // 정답 풍선을 누르는 손가락
      ctx.font = font(L.font(0.05));
      ctx.fillText('👆', cx - L.gu(1.4), L.gu(6.4));
    },
  },

  init(engine) {
    this.engine = engine;
    this.problem = null;
    this.balloons = []; // [{value, correct, label, x, y, vy, wobble, hue}]
    this.popEffects = []; // 정답 팝 시 위로 튀어오르는 라벨 [{x,y,label,t,dur}]
    this.missEffect = null; // 정답 풍선 탈출 시 "앗!" 연출 {x,y,t,dur}
    this.recentPops = []; // RAPID FIRE 판정용 정답 팝 시각(게임 시간) 목록
    this.roundCorrectTotal = 0; // 이번 라운드 정답 풍선 총수(●●○ 점 표시용)
    this.chain = 0; // 연쇄 팝 카운트(빠르게 이을수록 파티클 누적)
    this.lastPopTime = -99; // 마지막 정답 팝 시각(연쇄 판정)
    this.nearMissUsed = false; // 한 라운드 니어미스 1회 제한
    this.wasFever = false; // 피버 진입/종료 전이 감지
    this.feverBanner = null; // 피버 종료 "FEVER +N"
    this.time = 0; // 게임 진행 시간(초) — freeze 중엔 멈춤(update 미호출)
    this._startRound();
  },

  // 현재 콤보 기준 상승 속도(px/s). 콤보 5마다 ×1.15, 상한 SPEED_CAP 로 클램프.
  // 교사 제한시간 배율을 시간에 곱해 느리게/빠르게 조절(배율↑ = 시간↑ = 느림).
  _riseSpeed() {
    const combo = this.engine.scoreManager.combo;
    let mult = Math.pow(1.15, Math.floor(combo / 5));
    if (mult > SPEED_CAP) mult = SPEED_CAP; // 상한 클램프(필수)
    let sec = BASE_RISE_SEC / mult;
    sec *= this.engine.settings.timeScale || 1;
    const dist = L.zone.floor - L.zone.playTop; // 부양 이동 거리
    let speed = dist / sec;
    // 피버 배속(램프 포함). 판정 완화(hitScale)는 onTouch에서 함께 적용해 성공 가능성 유지.
    if (this.engine.fever) speed *= this.engine.fever.speedMultiplier;
    return speed;
  },

  // 콤보별 정답 풍선 수 2~4 (SPEC: 한 라운드 2~4개). 콤보 오를수록 조금 더.
  _correctCount() {
    const combo = this.engine.scoreManager.combo;
    return Math.min(4, 2 + Math.floor(combo / 10));
  },
  // 콤보별 오답 풍선 수 3~6 (축 B — 콤보 오를수록 증가).
  _wrongCount() {
    const combo = this.engine.scoreManager.combo;
    return Math.min(6, 3 + Math.floor(combo / 8));
  },

  _startRound() {
    const e = this.engine;
    this.problem = e.problemGenerator.nextProblem({ maxLevel: this.maxLevel, blankRatio: this.blankRatio, opMode: this.opMode });
    const answer = this.problem.answer;
    const combo = e.scoreManager.combo;

    // 오답 값은 반드시 코어가 생성(근접도는 콤보 따라 상승 — 축 B)
    const closeness = Math.min(0.85, 0.15 + 0.03 * combo);
    const distractors = e.problemGenerator.makeDistractors(this.problem, this._wrongCount(), closeness);

    // 원문 식과 똑같은 표기(예: 6×4)는 정답 풍선에서 회피(문제를 그대로 베끼는 셈이라 자명)
    const avoid = this.problem.op === '×' ? [this.problem.a, this.problem.b] : null;

    const used = new Set();
    const items = [];

    // 정답 풍선: 최소 1개는 '식' 표기(등식 개념), 나머지는 숫자/식 혼합. 라벨 중복 회피.
    const correctCount = this._correctCount();
    for (let i = 0; i < correctCount; i++) {
      const wantExpr = i === 0 ? true : Math.random() < 0.6;
      const label = uniqueLabel(answer, wantExpr, avoid, used);
      items.push({ value: answer, correct: true, label });
    }
    // 오답 풍선: 코어가 준 값을 숫자 또는 식으로 표기(예: 26, 12×3, 20)
    for (const v of distractors) {
      const wantExpr = Math.random() < 0.4;
      const label = uniqueLabel(v, wantExpr, null, used);
      items.push({ value: v, correct: false, label });
    }

    // 배치: 가로 레인으로 겹침 방지 + 세로 스태거로 아래에서 순차 진입
    const arranged = shuffle(items);
    const total = arranged.length;
    const rx = this.rx;
    const minX = L.safe + rx;
    const maxX = L.W - L.safe - rx;
    const laneW = (maxX - minX) / total;
    const order = shuffle(arranged.map((_, i) => i)); // 진입 순서 무작위
    const speed = this._riseSpeed();
    const floorBase = L.zone.floor + this.ry; // 화면 아래에서 떠오르기 시작

    this.balloons = arranged.map((it, i) => {
      const gap = Math.max(0, laneW - 2 * rx);
      const jitter = (Math.random() - 0.5) * gap;
      const x = minX + laneW * (i + 0.5) + jitter;
      const rank = order.indexOf(i);
      const y = floorBase + rank * this.stagger + Math.random() * L.gu(1);
      return { value: it.value, correct: it.correct, label: it.label, x, y, vy: speed, wobble: Math.random() * Math.PI * 2, hue: FESTIVE[i % FESTIVE.length] };
    });

    this.roundCorrectTotal = correctCount; // ●●○ 점 표시 기준
    this.nearMissUsed = false;
  },

  update(dt) {
    this.time += dt;

    // 피버 진입/종료 전이(상태는 core가 관리, 연출만 게임이)
    const fev = this.engine.fever;
    const active = !!(fev && fev.active);
    if (active && !this.wasFever) {
      this.engine.ui.flash('rgba(255,210,120,0.5)', 0.09);
      this.engine.ui.showComboText('🔥 FEVER!', true);
    } else if (!active && this.wasFever) {
      this.feverBanner = { points: fev ? fev.pointsEarned : 0, t: 0, dur: 1.4 };
      this.engine.ui.flash('rgba(120,200,255,0.4)', 0.09);
    }
    this.wasFever = active;
    if (this.feverBanner) {
      this.feverBanner.t += dt;
      if (this.feverBanner.t >= this.feverBanner.dur) this.feverBanner = null;
    }
    // 연쇄 끊김(윈도우 경과) → chain 리셋
    if (this.time - this.lastPopTime > RAPID_WINDOW) this.chain = 0;

    const rise = this._riseSpeed(); // 콤보 변화(정답 팝)를 즉시 반영해 속도 갱신
    for (const b of this.balloons) {
      b.vy = rise;
      b.y -= b.vy * dt; // 위로 부양
      b.wobble += dt * 2.2;
    }

    // 정답 풍선이 위로 화면을 벗어나면 '탈출' = 놓침
    //   - 콤보 리셋, 라이프 유지, 흐름 정지 없음(freeze:false), 레벨·복습큐 영향 없음
    //   - 세션엔 놓침(missed:true)으로 기록. 즉시 새 라운드로 진행(게임 흐름 유지).
    const escaped = this.balloons.find((b) => b.correct && b.y + this.ry < L.zone.playTop);
    if (escaped) {
      this.engine.answerWrong(this.problem, null, { loseLife: false, freeze: false, affectLevel: false, missed: true });
      this.engine.particles.emit(escaped.x, L.zone.playTop, 'pop', THEME.wrong, 14);
      this.missEffect = { x: escaped.x, y: L.zone.playTop + L.gu(1), t: 0, dur: 0.5 };
      this.recentPops.length = 0; // 콤보가 리셋됐으니 RAPID 창도 초기화
      this.chain = 0;
      this._startRound();
      return;
    }

    // 오답 풍선이 위로 벗어나면 무해하게 제거(라이프/콤보 영향 없음)
    this.balloons = this.balloons.filter((b) => b.correct || b.y + this.ry >= L.zone.playTop);

    // 팝 연출 갱신
    for (let i = this.popEffects.length - 1; i >= 0; i--) {
      const p = this.popEffects[i];
      p.t += dt;
      if (p.t >= p.dur) this.popEffects.splice(i, 1);
    }
    if (this.missEffect) {
      this.missEffect.t += dt;
      if (this.missEffect.t >= this.missEffect.dur) this.missEffect = null;
    }
  },

  render(ctx) {
    const cx = L.W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    this._drawFeverBg(ctx);
    if (this.engine.fever) {
      this.engine.fever.renderGauge(ctx, { x: L.safe, y: L.zone.gauge, w: L.W - L.safe * 2, h: L.gu(0.5) });
    }

    // 상단 고정 문제(최소 80px 규정 — 화면 높이의 7.5%)
    ctx.fillStyle = THEME.text;
    ctx.font = font(L.font(0.075));
    ctx.fillText(`${this.problem.text} = ?`, cx, L.zone.problem);

    // 안내 + 남은 정답 풍선 '점' 표시(●●○) — 숫자로 세지 말고 화면을 훑게 만든다.
    const remain = this.balloons.filter((b) => b.correct).length;
    ctx.fillStyle = THEME.subtext;
    ctx.font = font(L.font(0.026), 'normal');
    ctx.fillText('값이 같은 풍선을 모두 터뜨려!', cx, L.zone.problem + L.gu(1.6));
    this._drawRemainDots(ctx, cx, L.zone.problem + L.gu(2.9), remain, this.roundCorrectTotal);
    if (this.problem.fromReview) {
      ctx.fillStyle = THEME.gold;
      ctx.font = font(L.font(0.028));
      ctx.fillText('🔁 다시 도전!', cx, L.zone.problem + L.gu(4.1));
    }

    // 풍선(정답/오답 색 동일군에서 장식색만 다름 — 색으로 정답 노출 금지)
    for (const b of this.balloons) {
      if (b.y + this.ry < L.zone.playTop) continue; // 화면 위로 벗어남
      const wob = Math.sin(b.wobble) * L.gu(0.12);
      const fs = labelFont(b.label);
      drawBalloon(ctx, b.x + wob, b.y, this.rx, this.ry, b.hue, b.label, L.font(fs));
    }

    // 정답 팝 연출: 초록 ⭕ + 라벨이 위로 튀어오르며 사라짐(색+아이콘+상승 3중)
    for (const p of this.popEffects) {
      const prog = p.t / p.dur;
      const y = p.y - prog * L.gu(4);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog);
      ctx.fillStyle = THEME.correct;
      ctx.font = font(L.font(0.045));
      ctx.fillText(p.label, p.x, y);
      ctx.font = font(L.font(0.032));
      ctx.fillText('⭕', p.x + L.gu(1.4), y - L.gu(1.1));
      ctx.restore();
    }

    // 탈출(놓침) 연출: 상단에서 "앗!"이 살짝 떠오르며 사라짐(흐름은 멈추지 않음)
    if (this.missEffect) {
      const m = this.missEffect;
      const prog = m.t / m.dur;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog);
      ctx.fillStyle = THEME.wrong;
      ctx.font = font(L.font(0.05));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('앗!', m.x, m.y - prog * L.gu(1.5));
      ctx.restore();
    }

    this._drawFeverBanner(ctx);
    // 위기 테두리는 ui가 자동으로 그린다(게임 코드 없음).
  },

  // 남은 정답 풍선을 점으로: 남은 수만큼 ● + 터뜨린 수만큼 ○. (숫자 미표시 — 훑어보게)
  _drawRemainDots(ctx, cx, y, remain, total) {
    if (total <= 0) return;
    const r = L.gu(0.35);
    const gap = L.gu(1.0);
    const startX = cx - ((total - 1) * gap) / 2;
    ctx.save();
    for (let i = 0; i < total; i++) {
      const filled = i < remain; // 앞쪽 remain개는 채움(●), 나머지는 빈 점(○)
      const x = startX + i * gap;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (filled) {
        ctx.fillStyle = THEME.gold;
        ctx.fill();
      } else {
        ctx.strokeStyle = THEME.subtext;
        ctx.lineWidth = L.gu(0.08);
        ctx.stroke();
      }
    }
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
    ctx.strokeText(`FEVER +${b.points}`, L.W / 2, L.H * 0.5);
    ctx.fillStyle = THEME.gold;
    ctx.fillText(`FEVER +${b.points}`, L.W / 2, L.H * 0.5);
    ctx.restore();
  },

  onTouch(x, y, phase) {
    if (phase !== 'start') return; // 누르는 즉시 반응
    if (!this.balloons.length) return;

    // 타원 판정: 정규화 거리 ≤ 1 중 가장 가까운 풍선 선택
    let target = null;
    let best = Infinity;
    const rx = this.rx + this.pad;
    const ry = this.ry + this.pad;
    for (const b of this.balloons) {
      const dx = (x - b.x) / rx;
      const dy = (y - b.y) / ry;
      const d = dx * dx + dy * dy;
      if (d <= 1 && d < best) {
        best = d;
        target = b;
      }
    }
    if (!target) return;

    const e = this.engine;
    if (target.correct) {
      const fmult = e.fever && e.fever.active ? e.fever.scoreMultiplier : 1;

      // 니어미스: 위로 화면을 벗어나기 0.3초 이내에 터뜨림 (한 라운드 1회)
      const toEscape = target.y + this.ry - L.zone.playTop; // 탈출선까지 남은 거리
      const nearMiss = !this.nearMissUsed && target.vy > 0 && toEscape / target.vy <= 0.3;

      // 연쇄 팝: 빠르게 이을수록 파티클 누적
      if (this.time - this.lastPopTime <= RAPID_WINDOW) this.chain += 1;
      else this.chain = 1;
      this.lastPopTime = this.time;

      // RAPID FIRE(개별 팝 기준): 2초 내 3연속
      this.recentPops.push(this.time);
      this.recentPops = this.recentPops.filter((t) => t >= this.time - RAPID_WINDOW);
      let rapid = false;
      if (this.recentPops.length >= 3) {
        rapid = true;
        this.recentPops.length = 0;
      }

      // 점수: 팝마다 즉시 반영(콤보 비증가 → addPoints). 콤보는 라운드 완성 시에만 오른다.
      const popPts = Math.round((70 + e.scoreManager.combo * 8) * fmult);
      e.scoreManager.addPoints(popPts);
      if (e.fever) e.fever.addPoints(popPts);
      this.popEffects.push({ x: target.x, y: target.y, label: target.label, t: 0, dur: 0.6 });

      // 파티클(연쇄 누적 — 상한 200은 core가 관리). 색은 풍선 색 기반.
      const chainBonus = Math.min(30, this.chain * 4);
      e.particles.emit(target.x, target.y, 'explode', THEME.correct, 18 + chainBonus);
      e.particles.emit(target.x, target.y, 'sparkle', target.hue, 8 + Math.floor(chainBonus / 2));
      e.sound.play('pop');

      if (nearMiss) {
        this.nearMissUsed = true;
        e.reportNearMiss(target.x, target.y); // +40(피버×2)·게이지+5·"아슬아슬!"·큰 파티클
      }

      // 고유 재미: 빠르게 여러 개 터뜨리는 해소감 → RAPID FIRE 크게 + 누적 파티클
      if (rapid) {
        const bonus = Math.round(200 * fmult);
        e.scoreManager.addPoints(bonus);
        if (e.fever) e.fever.addPoints(bonus);
        e.ui.showComboText(`RAPID FIRE! +${bonus}`, true);
        e.particles.emit(target.x, target.y, 'explode', THEME.gold, 40);
        e.particles.emit(target.x, target.y, 'sparkle', THEME.correct, 24);
        e.ui.shake(10, 0.1);
      }

      this.balloons = this.balloons.filter((b) => b !== target);

      // 라운드 완성 → 콤보 +1 (answerCorrect points=0: 점수는 이미 팝마다 반영, 콤보·게이지·정답음만)
      if (!this.balloons.some((b) => b.correct)) {
        e.particles.emit(L.W / 2, L.y(0.5), 'sparkle', THEME.gold, 18);
        e.answerCorrect(this.problem, this.problem.answer, 0);
        this._startRound();
      }
    } else {
      // 오답 풍선: 라이프 -1 + 정답표시(1.2초 정지). 라운드 실패 → 콤보 리셋(게이지 -20 자동), 다음 문제.
      this.recentPops.length = 0;
      this.chain = 0;
      this.balloons = this.balloons.filter((b) => b !== target);
      e.answerWrong(this.problem, target.value, { loseLife: true, onResume: () => this._startRound() });
    }
  },

  // 마우스 hover: 풍선 위면 true → 커서 pointer (PC 확인용)
  onHover(x, y) {
    const rx = this.rx + this.pad;
    const ry = this.ry + this.pad;
    for (const b of this.balloons) {
      if (b.y + this.ry < L.zone.playTop) continue;
      const dx = (x - b.x) / rx;
      const dy = (y - b.y) / ry;
      if (dx * dx + dy * dy <= 1) return true;
    }
    return false;
  },
  clearHover() {}, // hover 시각 상태 없음(인터페이스 충족용)

  onKey() {},

  destroy() {
    this.engine = null;
    this.problem = null;
    this.balloons = [];
    this.popEffects = [];
    this.missEffect = null;
    this.recentPops = [];
    this.feverBanner = null;
  },
};

// ── 표기(라벨) 생성 ────────────────────────────────────────
// 값 V를 '식' 또는 숫자로 표기한다. 오답 값 자체는 코어(makeDistractors)가 만든 것을 그대로 쓰고,
// 여기서는 그 값을 어떻게 '보여줄지'(24 ↔ 8×3 ↔ 48÷2)만 결정한다 = 등식 개념 학습의 핵심.
function uniqueLabel(value, wantExpr, avoid, used) {
  let label = '';
  for (let guard = 0; guard < 12; guard++) {
    label = makeLabel(value, wantExpr, avoid);
    if (!used.has(label)) break;
  }
  // 그래도 겹치면 숫자 표기로(항상 서로 다르진 않지만 최후 수단)
  if (used.has(label)) label = String(value);
  used.add(label);
  return label;
}

function makeLabel(V, wantExpr, avoid) {
  if (!wantExpr) return String(V);
  const forms = [];
  const pf = productForm(V, avoid);
  if (pf) forms.push(pf);
  const df = divisionForm(V);
  if (df) forms.push(df);
  if (!forms.length) return String(V); // 예쁜 식이 없으면 숫자로
  return forms[Math.floor(Math.random() * forms.length)];
}

// 값 V를 초3이 읽기 쉬운 곱셈식으로: 두 인수 모두 2~9. avoid=[a,b]와 같은 순서 표기는 회피.
function productForm(V, avoid) {
  const pairs = [];
  for (let p = 2; p <= 9; p++) {
    if (V % p !== 0) continue;
    const q = V / p;
    if (q >= 2 && q <= 9) pairs.push([p, q]);
  }
  if (!pairs.length) return null;
  const usable = pairs.filter(([p, q]) => !(avoid && p === avoid[0] && q === avoid[1]));
  const pool = usable.length ? usable : pairs;
  const [p, q] = pool[Math.floor(Math.random() * pool.length)];
  return `${p}×${q}`;
}

// 값 V를 나눗셈식으로: 나누는 수 2~9, 나누어지는 수는 두 자리(≤99) 이내.
function divisionForm(V) {
  const opts = [];
  for (let d = 2; d <= 9; d++) {
    const D = V * d;
    if (D <= 99) opts.push([D, d]);
  }
  if (!opts.length) return null;
  const [D, d] = opts[Math.floor(Math.random() * opts.length)];
  return `${D}÷${d}`;
}

// 라벨 길이에 맞춘 폰트 비율(풍선 안에 들어가도록)
function labelFont(label) {
  if (label.length <= 2) return 0.05;
  if (label.length <= 3) return 0.04;
  return 0.032;
}

// 풍선 하나 그리기(타원 몸통 + 매듭 + 실 + 라벨). 색은 장식용(정오답과 무관).
function drawBalloon(ctx, x, y, rx, ry, hue, label, fontPx) {
  ctx.save();
  // 실
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(2, rx * 0.04);
  ctx.beginPath();
  ctx.moveTo(x, y + ry);
  ctx.lineTo(x, y + ry + ry * 0.7);
  ctx.stroke();
  // 몸통(타원)
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = hue;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = Math.max(3, rx * 0.06);
  ctx.stroke();
  // 하이라이트
  ctx.beginPath();
  ctx.ellipse(x - rx * 0.32, y - ry * 0.36, rx * 0.18, ry * 0.24, -0.4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fill();
  // 매듭
  ctx.beginPath();
  ctx.moveTo(x, y + ry);
  ctx.lineTo(x - rx * 0.12, y + ry + ry * 0.12);
  ctx.lineTo(x + rx * 0.12, y + ry + ry * 0.12);
  ctx.closePath();
  ctx.fillStyle = hue;
  ctx.fill();
  // 라벨
  ctx.fillStyle = '#fff';
  ctx.font = font(fontPx);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y);
  ctx.restore();
}

// 배열 셔플(게임 내부 배치용 — 문제/오답 생성은 core가 담당)
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
