// 벌룬 팝 — 정답이 서로 다른 풍선 6개를 차례로 터뜨려 화면 비우기.
// core/scenes 수정 없음. 피버에서는 일반 판을 보관하고 연타 모드로 전환한다.
import { createBalloonBoard } from './balloonBoard.js';
import { L } from '../core/layout.js';
import { THEME, font } from '../core/ui.js';
import { drawPlayBackdrop, drawRewardText } from '../art/toyArt.js';

const BOARD_COUNT = 6;
const BOARD_BONUS = 300;
const MULTI_COUNT = 7;

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
  //   콤보는 이제 계산 문제별 정답 횟수다. 화면 비우기는 6문제마다 별도로 완성한다.
  comboMilestones: { 5: 'BURST!', 15: 'EXPLOSION!', 25: 'FIREWORKS!' },
  fever: { type: 'multi' }, // 재미 표준 피버 opt-in → engine.fever (§7.6). multi=다중 정답형("N단!" 배수 쓸기)

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

  tutorial: {
    text: '정답을 톡! 풍선 6개를 모두 터뜨려!',
    draw(ctx) {
      // ctx는 논리 좌표, translate(0,260)된 카드 영역(x 24~776, y 0~440) 안에서 그린다.
      const cx = L.W / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 문제
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.05));
      ctx.fillText('6 × 4 = ?', cx, L.gu(1.6));

      // 6개의 서로 다른 숫자. 튜토리얼에서만 정답을 손가락으로 안내한다.
      const labels = ['24', '18', '20', '30', '12', '16'];
      labels.forEach((label, i) => {
        const x = cx + (i % 3 - 1) * L.gu(5.5);
        const y = L.gu(4.3) + Math.floor(i / 3) * L.gu(4.1);
        drawBalloon(ctx, x, y, L.gu(1.05), L.gu(1.25), FESTIVE[i], label, L.font(.025));
      });
      ctx.font = font(L.font(.04));
      ctx.fillText('👆', cx - L.gu(4.4), L.gu(5.5));
    },
  },

  init(engine) {
    this.engine = engine;
    this.problem = null;
    this.nextProblem = null;
    this.collected = [];
    this.boardProblems = [];
    this.bouquets = 0; // 기존 검사/화면 호환: 이제 완성한 판 수
    this.burst = null;
    this.savedRound = null;
    this.scoreNote = null;
    this.balloons = []; // 고정 기준점(baseX/baseY) 주변에서 작게 부유
    this.popEffects = []; // 풍선이 터진 위치의 짧은 파동 [{x,y,t,dur}]
    this.missEffect = null; // 오답 탭 시 "앗!" 연출 {x,y,t,dur}
    this.wasFever = false; // 피버 진입/종료 전이 감지
    this.multiMode = false; // 피버(multi) 중 'N단 배수 터뜨리기' 모드(라운드 개념 없음)
    this.feverBanner = null; // 피버 종료 "FEVER +N"
    this.time = 0; // 게임 진행 시간(초) — freeze 중엔 멈춤(update 미호출)
    this._startRound();
  },

  get playTop() { return L.zone.problem + L.gu(5); },
  get playBottom() { return L.zone.floor - L.gu(2); },
  _layout(items) {
    const minX = L.safe + this.rx + this.pad + L.gu(.3);
    const spacing = items.length > BOARD_COUNT ? L.gu(5.7) : L.gu(7.5);
    const top = items.length > BOARD_COUNT ? this.playTop + this.ry + this.pad + L.gu(.45) : this.playTop + L.gu(4);
    return items.map((it, i) => {
      const baseX = minX + (i % 3) * (L.W - 2 * minX) / 2;
      const baseY = top + Math.floor(i / 3) * spacing;
      return {...it, slot:i, baseX, baseY, x:baseX, y:baseY,
        wobble:i * 1.7, hue:FESTIVE[i % FESTIVE.length]};
    });
  },

  _startRound() {
    const e = this.engine;
    this.boardProblems = createBalloonBoard(e.problemGenerator,
      {maxLevel:this.maxLevel, blankRatio:this.blankRatio, opMode:this.opMode});
    this.collected = [];
    this.balloons = this._layout(shuffle(this.boardProblems.map(p => ({
      value:p.answer, label:String(p.answer), correct:false,
    }))));
    this._selectProblem();
  },
  _selectProblem() {
    this.problem = this.boardProblems[0];
    this.nextProblem = this.boardProblems[1] || null;
    for (const b of this.balloons) b.correct = b.value === this.problem.answer;
    this.engine.markQuestionStart();
  },

  // ── 피버 multi 유형: "N단!" 배수 터뜨리기 (라운드 개념 없음, 계속 터뜨리기) ──
  _enterMulti() {
    this.savedRound = { boardProblems:this.boardProblems.slice(), problem: this.problem, nextProblem: this.nextProblem, balloons: this.balloons.map(b => ({...b})),
      collected: this.collected.slice() };
    this.multiMode = true;
    this.popEffects = [];
    this._spawnBalloonsMulti(MULTI_COUNT);
  },
  _exitMulti() {
    this.multiMode = false;
    this.balloons = [];
    this.popEffects = [];
    if (this.savedRound) {
      this.boardProblems = this.savedRound.boardProblems;
      this.problem = this.savedRound.problem;
      this.nextProblem = this.savedRound.nextProblem;
      this.balloons = this.savedRound.balloons;
      this.collected = this.savedRound.collected;
      this.savedRound = null;
      this.engine.markQuestionStart();
    } else this._startRound();
    this.missEffect = null;
  },
  _spawnBalloonsMulti(count) {
    this.balloons = this._layout(this.engine.fever.fillValues(count).map(it => ({
      value: it.value, correct: it.isMultiple, isMultiple: it.isMultiple, label: String(it.value),
    })));
  },
  _spawnOneBalloonMulti() {
    const fv = this.engine.fever;
    if (!fv?.active || fv.type !== 'multi') return null;
    const ratio = 1 - fv.trapRatio; // Claude의 FEVER/SUPER/ULTRA 단계별 정책 보존
    const value = Math.random() < ratio ? fv.randomMultiple() : fv.randomTrap();
    const slot = Array.from({length: MULTI_COUNT}, (_, i) => i).find(i => !this.balloons.some(b => b.slot === i));
    if (slot === undefined) return null;
    const b = this._layout(Array.from({length: MULTI_COUNT}, () => ({})))[slot];
    return {...b, value, correct: fv.isMultiple(value), isMultiple: fv.isMultiple(value), label: String(value)};
  },
  _judgeMultiPop(target) {
    const e = this.engine;
    const fv = e.fever;
    const dan = fv.dan;
    this.balloons = this.balloons.filter((b) => b !== target);
    if (fv.isMultiple(target.value)) {
      // 배수 = 정답. dan×몫 = value 곱셈 사실로 기록(콤보 +1·단별 정답률 반영). 터뜨릴 때마다 점수.
      const q = Math.round(target.value / dan);
      const prob = { a: dan, b: q, op: '×', answer: target.value, remainder: null, level: 1, text: `${dan} × ${q}`, blank: null };
      const base = 70 + e.scoreManager.combo * 8;
      const floatCount = e.ui.floatScores.length;
      const before = e.scoreManager.score;
      e.answerCorrect(prob, target.value, base);
      e.ui.floatScores.splice(floatCount);
      this.scoreNote = {text: '+' + (e.scoreManager.score - before), t: 0}; // 점수배수·게이지·정답음·연출 자동(피버 무적)
      this.popEffects.push({ x: target.x, y: target.y, label: '', t: 0, dur: 0.3 });
      e.particles.emit(target.x, target.y, 'explode', THEME.correct, 20);
      e.particles.emit(target.x, target.y, 'sparkle', target.hue, 10);
      e.sound.play('pop');
    } else {
      // 함정 = 무해(피버 무적). 세션만 기록, 복습 큐엔 넣지 않는다(정식 출제 문제가 아니므로).
      const prob = { a: target.value, b: dan, op: '÷', answer: Math.floor(target.value / dan), remainder: target.value % dan, level: 1, text: `${target.value} ÷ ${dan}`, blank: null };
      e.answerWrong(prob, target.value, { affectLevel: false, freeze: false });
      this.missEffect = { x: target.x, y: target.y, t: 0, dur: 0.5 };
      e.particles.emit(target.x, target.y, 'pop', THEME.wrong, 12);
    }
    const next = this._spawnOneBalloonMulti();
    if (next) this.balloons.push(next);
  },

  update(dt) {
    this.time += dt;
    if (this.burst) { this.burst.t += dt; if (this.burst.t >= .65) this.burst = null; }
    if (this.scoreNote) { this.scoreNote.t += dt; if (this.scoreNote.t > .8) this.scoreNote = null; }

    // 피버 진입/종료 전이(상태는 core가 관리, 연출만 게임이)
    const fev = this.engine.fever;
    const active = !!(fev && fev.active);
    if (active && !this.wasFever) {
      this.engine.ui.flash('rgba(255,210,120,0.5)', 0.09);
      this.engine.ui.showComboText('🔥 FEVER!', true);
      if (fev.type === 'multi') this._enterMulti(); // N단 배수 터뜨리기 모드로 전환
    } else if (!active && this.wasFever) {
      this.feverBanner = { points: fev ? fev.pointsEarned : 0, t: 0, dur: 1.4 };
      this.engine.ui.flash('rgba(120,200,255,0.4)', 0.09);
      if (this.multiMode) this._exitMulti(); // 보관한 일반 6문제 판으로 복귀
    }
    this.wasFever = active;
    if (this.feverBanner) {
      this.feverBanner.t += dt;
      if (this.feverBanner.t >= this.feverBanner.dur) this.feverBanner = null;
    }
    // 시간/피버/콤보와 무관한 작은 흔들림. 위치는 렌더와 터치 판정이 공유한다.
    for (const b of this.balloons) {
      b.wobble += dt * .85;
      b.x = b.baseX + Math.sin(b.wobble) * L.gu(.28);
      b.y = b.baseY + Math.sin(b.wobble * .83) * L.gu(.3);
    }

    if (this.multiMode) {
      // 빈 슬롯만 보충한다. 기준점을 벗어나 이동하거나 탈출하지 않는다.
      let guard = 0;
      while (this.balloons.length < MULTI_COUNT && guard++ < MULTI_COUNT + 2) {
        const nb = this._spawnOneBalloonMulti();
        if (!nb) break;
        this.balloons.push(nb);
      }
      // 제자리 피버에서 함정만 남아 입력할 정답이 사라지는 교착 방지.
      if (!this.balloons.some(b => fev.isMultiple(b.value))) this._spawnBalloonsMulti(MULTI_COUNT);
      // ULTRA가 되면 이전 단계 함정도 정리한다(이미 정답인 풍선은 유지).
      if (fev.trapRatio === 0) {
        for (const b of this.balloons) if (!fev.isMultiple(b.value)) {
          b.value = fev.randomMultiple(); b.label = String(b.value); b.correct = b.isMultiple = true;
        }
      }
    }
    // 화면 안에서만 떠 있으므로 탈출/놓침 판정은 없다.

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
    drawPlayBackdrop(ctx, this.id, this.time || 0);
    const cx = L.W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    this._drawFeverBg(ctx);
    if (this.engine.fever) {
      this.engine.fever.renderGauge(ctx, { x: L.safe, y: L.zone.gauge, w: L.W - L.safe * 2, h: L.gu(0.5) });
    }

    // 피버 multi: "N단!" + 안내. 일반 문제/점 표시 대신 표시한다.
    if (this.multiMode && this.engine.fever && this.engine.fever.dan) {
      ctx.fillStyle = THEME.gold;
      ctx.font = font(L.font(0.075));
      ctx.fillText(`${this.engine.fever.dan}단!`, cx, L.zone.problem);
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.03), 'normal');
      ctx.fillText('배수를 모두 터뜨려!', cx, L.zone.problem + L.gu(1.7));
    } else {
      // 상단 고정 문제(최소 80px 규정 — 화면 높이의 7.5%)
      ctx.fillStyle = THEME.text;
      ctx.font = font(L.font(0.075));
      ctx.fillText(`${this.problem.text} = ?`, cx, L.zone.problem);

      // 현재 문제와 구별되는 작은 다음 문제 예고(답은 표시하지 않는다).
      ctx.fillStyle = THEME.subtext;
      ctx.font = font(L.font(0.026), 'normal');
      ctx.fillText('풍선 6개를 모두 터뜨려!', cx, L.zone.problem + L.gu(1.6));
      ctx.font = font(L.font(.024), 'normal');
      ctx.fillStyle = '#d2deec';
      ctx.fillText(this.nextProblem ? '다음: ' + this.nextProblem.text + ' = ?' : '마지막 풍선! 톡!', cx, L.zone.problem + L.gu(3));
      if (this.problem.fromReview) {
        ctx.fillStyle = THEME.gold;
        ctx.font = font(L.font(0.028));
        drawRewardText(ctx, '🔁 다시 도전!', cx, L.zone.problem + L.gu(4.1));
      }
    }

    ctx.save();
    ctx.beginPath(); ctx.rect(0, this.playTop, L.W, this.playBottom - this.playTop); ctx.clip();
    // 풍선(정답/오답 색 동일군에서 장식색만 다름 — 색으로 정답 노출 금지)
    for (const b of this.balloons) {
      if (b.y + this.ry < this.playTop) continue; // 화면 위로 벗어남
      const fs = labelFont(b.label);
      drawBalloon(ctx, b.x, b.y, this.rx, this.ry, b.hue, b.label, L.font(fs));
    }

    // 정답 팝 연출: 풍선 껍질 파동만 표시해 남은 숫자를 가리지 않는다
    for (const p of this.popEffects) {
      const prog = p.t / p.dur;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog);
      // 풍선 껍질이 사방으로 벌어지는 곡선. 공을 받는 연출과 다른 '팡'의 모양.
      ctx.strokeStyle = THEME.gold;
      ctx.lineWidth = L.gu(0.1) * (1 - prog);
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        const radius = this.rx * (0.6 + prog * 0.9);
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, angle, angle + 0.35 * (1 - prog));
        ctx.stroke();
      }
      ctx.fillStyle = THEME.correct;
      ctx.font = font(L.font(0.045));
      // 보충된 숫자를 가리지 않도록 문구 없이 껍질 파동만 표시한다.
      ctx.restore();
    }

    // 오답 탭 연출: 해당 풍선에서 "앗!"이 살짝 떠오르며 사라짐
    if (this.missEffect) {
      const m = this.missEffect;
      const prog = m.t / m.dur;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog);
      ctx.fillStyle = THEME.wrong;
      ctx.font = font(L.font(0.05));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawRewardText(ctx, '앗!', m.x, m.y - prog * L.gu(1.5));
      ctx.restore();
    }

    ctx.restore();
    this._drawBouquet(ctx);
    this._drawFeverBanner(ctx);
    // 위기 테두리는 ui가 자동으로 그린다(게임 코드 없음).
  },

  _drawBouquet(ctx) {
    const cx=L.W/2, y=this.playBottom;
    const remaining=this.multiMode ? this.savedRound?.balloons.length ?? BOARD_COUNT : this.balloons.length;
    ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#fff5dd'; ctx.strokeStyle='#b57582'; ctx.lineWidth=L.gu(.07);
    ctx.beginPath(); ctx.roundRect(L.safe,y+L.gu(.25),L.W-L.safe*2,L.gu(3.55),L.gu(.5));ctx.fill();ctx.stroke();
    ctx.font=font(L.font(.024));ctx.fillStyle='#754859';
    ctx.fillText(this.multiMode?'풍선 축제! 계속 팡팡!':this.burst?'모두 팡! 한 판 완성!':remaining===1?'마지막 풍선 하나!':remaining+'개만 더 터뜨리면 완성!',cx,y+L.gu(.85));
    for(let i=0;i<BOARD_COUNT;i++){
      ctx.beginPath();ctx.arc(cx+(i-2.5)*L.gu(1.1),y+L.gu(1.9),L.gu(.3),0,Math.PI*2);
      ctx.fillStyle=i<BOARD_COUNT-remaining?FESTIVE[i]:'#ddd8da';ctx.fill();
    }
    ctx.font=font(L.font(.021));ctx.fillStyle='#795069';
    if(!this.feverBanner)ctx.fillText(this.burst?'한 판 완성! +'+BOARD_BONUS:this.scoreNote?.text||'완성한 판 '+this.bouquets+'개',cx,y+L.gu(3.1));
    if(this.burst){
      const q=this.burst.t/.65;ctx.globalAlpha=1-q;
      for(let i=0;i<24;i++){
        const a=i*Math.PI/12;ctx.fillStyle=FESTIVE[i%6];ctx.beginPath();
        ctx.arc(cx+Math.cos(a)*L.gu(6)*q,y+L.gu(1.9)+Math.sin(a)*L.gu(1.5)*q,L.gu(.15),0,Math.PI*2);ctx.fill();
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
    ctx.font = font(L.font(0.026));
    ctx.lineWidth = L.gu(0.25);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(`FEVER +${b.points}`, L.W / 2, this.playBottom + L.gu(3.3));
    ctx.fillStyle = THEME.gold;
    ctx.fillText(`FEVER +${b.points}`, L.W / 2, this.playBottom + L.gu(3.3));
    ctx.restore();
  },

  onTouch(x, y, phase) {
    if (phase !== 'start') return; // 누르는 즉시 반응
    if (!this.balloons.length || this.engine.freeze?.active) return;
    if (y < this.playTop || y > this.playBottom) return;
    if (!!this.engine.fever?.active !== this.multiMode) return; // 전환 프레임의 일반/피버 오판정 방지

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

    // 피버 multi: 배수=정답(연타), 함정=무해. 라운드 개념 없이 계속 터뜨린다.
    if (this.multiMode) {
      this._judgeMultiPop(target);
      return;
    }

    if (target.correct) {
      const base=70+e.scoreManager.combo*8;
      const complete=this.balloons.length===1;
      this.collected.push(target.hue);
      this.balloons=this.balloons.filter(b=>b!==target);
      this.boardProblems.shift();
      this.popEffects.push({x:target.x,y:target.y,t:0,dur:.22});
      e.sound.play('pop');
      e.sound.tone(550+this.collected.length*75,0,.1,{type:'sine',vol:.12});
      const bonus=complete?BOARD_BONUS:0;
      // 마지막 한 개는 선택지가 없는 마무리 보상. 학습 효과를 단독 정답으로 과대해석하지 않는다.
      e.answerCorrect(this.problem,target.value,base+bonus);
      this.scoreNote={text:'+'+(base+bonus),t:0};
      if(complete){
        this.bouquets++;
        this.burst={t:0,bonus:BOARD_BONUS};
        e.particles.emit(L.safe+L.gu(1),this.playBottom,'sparkle',THEME.gold,24);
        e.particles.emit(L.W-L.safe-L.gu(1),this.playBottom,'sparkle',THEME.gold,24);
        e.ui.shake(L.gu(.16),.09);e.sound.play('fanfare');
        this._startRound();
      }else this._selectProblem();
    } else {
      // 다른 문제의 정답이므로 오답 풍선도 없애지 않는다. 같은 자리에서 다시 도전.
      this.missEffect={x:target.x,y:target.y,t:0,dur:.4};
      e.answerWrong(this.problem,target.value,{loseLife:true,onResume:()=>e.markQuestionStart()});
    }
  },

  // 마우스 hover: 풍선 위면 true → 커서 pointer (PC 확인용)
  onHover(x, y) {
    if (y < this.playTop || y > this.playBottom) return false;
    const rx = this.rx + this.pad;
    const ry = this.ry + this.pad;
    for (const b of this.balloons) {
      if (b.y + this.ry < this.playTop) continue;
      const dx = (x - b.x) / rx;
      const dy = (y - b.y) / ry;
      if (dx * dx + dy * dy <= 1) return true;
    }
    return false;
  },
  clearHover() {}, // hover 시각 상태 없음(인터페이스 충족용)

  onKey() {},

  destroy() {
    this.savedRound = null; this.collected = []; this.burst = null; this.scoreNote = null;
    this.engine = null;
    this.problem = null;
    this.nextProblem = null;
    this.boardProblems = [];
    this.balloons = [];
    this.popEffects = [];
    this.missEffect = null;
    this.feverBanner = null;
  },
};

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
  ctx.lineWidth = Math.max(L.gu(.05), rx * 0.04);
  ctx.beginPath();
  ctx.moveTo(x, y + ry);
  ctx.bezierCurveTo(x - rx * 0.2, y + ry * 1.25, x + rx * 0.2, y + ry * 1.45, x, y + ry * 1.7);
  ctx.stroke();
  // 몸통(타원)
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = hue;
  ctx.fill();
  // 반투명 라텍스의 둥근 음영. 원래 장식 색상·정오답 규칙은 그대로다.
  const sheen = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.45, rx * 0.08, x, y, ry * 1.1);
  sheen.addColorStop(0, 'rgba(255,255,255,0.38)');
  sheen.addColorStop(0.38, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(31,24,57,0.48)');
  ctx.fillStyle = sheen;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = Math.max(L.gu(.075), rx * 0.06);
  ctx.stroke();
  // 하이라이트
  ctx.beginPath();
  ctx.ellipse(x - rx * 0.39, y - ry * 0.57, rx * 0.14, ry * 0.16, -0.4, 0, Math.PI * 2);
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
  // 작은 표정은 숫자 아래쪽에만. 모든 풍선에 동일하게 적용한다.
  ctx.fillStyle = '#384963';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + side * rx * 0.16, y + ry * 0.64, rx * 0.028, ry * 0.036, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();ctx.arc(x, y + ry * 0.68, rx * 0.065, 0, Math.PI);
  ctx.strokeStyle = '#384963';ctx.lineWidth = rx * 0.022;ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = font(fontPx);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(31,24,57,0.5)';
  ctx.lineWidth = rx * 0.045;
  ctx.lineJoin = 'round';
  ctx.strokeText(label, x, y);
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
