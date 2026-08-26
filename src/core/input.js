// input.js — touch / mouse / keyboard 통합 입력 (SPEC 1.2, Phase0 §2)
// ⚠️ 가장 중요: 화면 좌표 → 논리 좌표(800×1280) 변환을 반드시 여기서 공용화한다.
//    레터박스 오프셋과 스케일을 보정하지 않으면 터치 위치가 어긋난다.

export class Input {
  constructor(engine) {
    this.engine = engine;
    this.canvas = engine.canvas;
    this.activePointerId = null; // 멀티터치: 첫 포인터만 처리

    this._bind();
  }

  // 화면(clientX/Y) → 논리 좌표 변환. engine의 스케일/오프셋을 사용한다.
  toLogical(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    // 캔버스 요소 내부의 CSS 픽셀 위치
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    // ⚠️ rect.left/top에는 이미 레터박스 오프셋이 포함돼 있다
    //    (engine.resize가 canvas.style.left/top를 offsetX/offsetY로 배치함).
    //    따라서 여기서 offset을 다시 빼면 이중 차감이 되어 좌표가 밀린다 → rect 기준만 사용한다.
    const { scale } = this.engine.viewport;
    const lx = cssX / scale;
    const ly = cssY / scale;
    return { x: lx, y: ly };
  }

  _bind() {
    const c = this.canvas;
    const opts = { passive: false }; // preventDefault로 스크롤/확대 방지

    // ── 터치 ──
    c.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        this.engine.markUserGesture();
        if (this.activePointerId !== null) return;
        const t = e.changedTouches[0];
        this.activePointerId = t.identifier;
        const { x, y } = this.toLogical(t.clientX, t.clientY);
        this.engine.dispatchTouch(x, y, 'start');
      },
      opts
    );
    c.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        const t = this._findActiveTouch(e.changedTouches);
        if (!t) return;
        const { x, y } = this.toLogical(t.clientX, t.clientY);
        this.engine.dispatchTouch(x, y, 'move');
      },
      opts
    );
    const endHandler = (e) => {
      e.preventDefault();
      const t = this._findActiveTouch(e.changedTouches);
      if (!t) return;
      const { x, y } = this.toLogical(t.clientX, t.clientY);
      this.engine.dispatchTouch(x, y, 'end');
      this.activePointerId = null;
    };
    c.addEventListener('touchend', endHandler, opts);
    c.addEventListener('touchcancel', endHandler, opts);

    // ── 마우스 (개발/데스크톱 확인용) ──
    let mouseDown = false;
    c.addEventListener('mousedown', (e) => {
      this.engine.markUserGesture();
      mouseDown = true;
      const { x, y } = this.toLogical(e.clientX, e.clientY);
      this.engine.dispatchTouch(x, y, 'start');
    });
    c.addEventListener('mousemove', (e) => {
      if (!mouseDown) return;
      const { x, y } = this.toLogical(e.clientX, e.clientY);
      this.engine.dispatchTouch(x, y, 'move');
    });
    window.addEventListener('mouseup', (e) => {
      if (!mouseDown) return;
      mouseDown = false;
      const { x, y } = this.toLogical(e.clientX, e.clientY);
      this.engine.dispatchTouch(x, y, 'end');
    });

    // ── 키보드 ──
    window.addEventListener('keydown', (e) => {
      this.engine.dispatchKey(e);
    });
  }

  _findActiveTouch(list) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].identifier === this.activePointerId) return list[i];
    }
    return null;
  }
}
