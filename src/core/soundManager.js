// soundManager.js — Web Audio API 신디사이저 (SPEC 1.1, 3.9)
// 오디오 파일 0개. 모든 소리는 코드로 생성한다.
// ⚠️ 기본값 무음(OFF). 교사 설정에서만 켠다. (SPEC 3.9 — 교실 30대 동시 사용)
// ⚠️ 비명·비웃음·공포음 금지. 실패음은 짧은 중립 저음(220Hz 이하, 0.2초 이내).

export class SoundManager {
  constructor() {
    this.enabled = false; // 기본 OFF (필수)
    this.musicEnabled = false;
    this.ctx = null;
    this.master = null;
    this.resumed = false;
  }

  // AudioContext 준비. 첫 사용자 제스처에서 호출된다.
  ensureContext() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return; // 미지원 환경 — 조용히 무시(에러 던지지 않음)
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      // 생성 실패 시 무음으로 동작 (에러 아님)
      this.ctx = null;
    }
  }

  // 첫 터치 후 호출. resume 실패는 정상(무음)으로 처리한다.
  resume() {
    this.ensureContext();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => (this.resumed = true)).catch(() => {});
    } else {
      this.resumed = true;
    }
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (on) this.resume();
  }
  setMusicEnabled(on) {
    this.musicEnabled = !!on;
  }

  // 단일 톤 재생 헬퍼 (엔벨로프 포함)
  tone(freq, start, dur, { type = 'sine', vol = 0.3, sweepTo = null } = {}) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t0 + dur);
    }
    // 부드러운 어택/릴리즈로 클릭음 방지
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // 정답 효과음 — 콤보에 따라 반음씩 상승(12음마다 옥타브↑, 상한 +2옥타브). (SPEC §7 재미 표준)
  //   모든 게임이 같은 규칙을 따르도록 core에 둔다. OFF면 무음(tone이 처리).
  //   opts.boost: true면 한 옥타브 더 위로(피버 등 고조 구간).
  //   opts.wide:  true면 콤보당 상승 폭을 2배(반음→온음)로 — 피버 재설계의 '음정 상승 폭 2배'.
  playCorrect(combo = 0, opts = {}) {
    if (!this.enabled || !this.ctx) return;
    const step = opts.wide ? 2 : 1; // 피버: 콤보당 상승 폭 2배
    const octave = Math.min(Math.floor(combo / 12), 2) + (opts.boost ? 1 : 0);
    const semi = (combo % 12) * step;
    const f = 523.25 * Math.pow(2, octave + semi / 12); // C5 기준
    this.tone(f, 0, 0.09, { type: 'triangle', vol: 0.25 });
    this.tone(f * 1.5, 0.05, 0.09, { type: 'triangle', vol: 0.15 }); // 5도 위 살짝
  }

  // ── 프리셋 사운드 ────────────────────────────────────────
  play(name) {
    if (!this.enabled || !this.ctx) return;
    switch (name) {
      case 'correct': // 밝은 2음 상승
        this.tone(660, 0, 0.1, { type: 'triangle', vol: 0.3 });
        this.tone(880, 0.09, 0.14, { type: 'triangle', vol: 0.3 });
        break;
      case 'wrong': // 중립적 짧은 저음 (220Hz 이하, 0.2초 이내)
        this.tone(180, 0, 0.18, { type: 'sine', vol: 0.28, sweepTo: 140 });
        break;
      case 'combo': // 신스 상승
        this.tone(523, 0, 0.08, { type: 'square', vol: 0.2 });
        this.tone(784, 0.07, 0.12, { type: 'square', vol: 0.2 });
        break;
      case 'fanfare': // 결과 화면 팡파레 (밝은 아르페지오)
        this.tone(523, 0.0, 0.15, { type: 'triangle', vol: 0.3 });
        this.tone(659, 0.15, 0.15, { type: 'triangle', vol: 0.3 });
        this.tone(784, 0.3, 0.15, { type: 'triangle', vol: 0.3 });
        this.tone(1046, 0.45, 0.3, { type: 'triangle', vol: 0.3 });
        break;
      case 'tick': // 타이머 경고 (짧은 클릭)
        this.tone(440, 0, 0.05, { type: 'square', vol: 0.15 });
        break;
      case 'pop': // 파티클/풍선 팝
        this.tone(700, 0, 0.06, { type: 'sine', vol: 0.2, sweepTo: 1200 });
        break;
      default:
        break;
    }
  }
}
