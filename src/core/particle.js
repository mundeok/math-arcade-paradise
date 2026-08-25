// particle.js — 파티클 시스템 (SPEC 3.10)
// 동시 200개 상한. 초과 시 오래된 것부터 제거. 오브젝트 풀링으로 GC 부담 최소화.

const MAX_PARTICLES = 200;

export class ParticleSystem {
  constructor() {
    this.pool = []; // 재사용 풀
    this.active = []; // 현재 활성 파티클
  }

  _obtain() {
    return this.pool.pop() || {};
  }
  _release(p) {
    this.pool.push(p);
  }

  clear() {
    while (this.active.length) this._release(this.active.pop());
  }

  // 프리셋 방출
  // preset: 'explode' | 'pop' | 'sparkle' | 'gem'
  emit(x, y, preset, color = '#ffd54a', count = 16) {
    for (let i = 0; i < count; i++) {
      this._spawn(x, y, preset, color);
    }
  }

  _spawn(x, y, preset, color) {
    // 상한 초과 시 가장 오래된 것부터 제거 (태블릿 프레임 드랍 방지)
    if (this.active.length >= MAX_PARTICLES) {
      this._release(this.active.shift());
    }
    const p = this._obtain();
    const ang = Math.random() * Math.PI * 2;
    let speed, life, size, gravity, shape;
    switch (preset) {
      case 'pop':
        speed = 120 + Math.random() * 180;
        life = 0.4 + Math.random() * 0.3;
        size = 6 + Math.random() * 6;
        gravity = 300;
        shape = 'circle';
        break;
      case 'sparkle':
        speed = 40 + Math.random() * 120;
        life = 0.5 + Math.random() * 0.5;
        size = 4 + Math.random() * 5;
        gravity = -20; // 살짝 위로 떠오름
        shape = 'star';
        break;
      case 'gem':
        speed = 80 + Math.random() * 220;
        life = 0.6 + Math.random() * 0.5;
        size = 8 + Math.random() * 8;
        gravity = 400;
        shape = 'diamond';
        break;
      case 'explode':
      default:
        speed = 150 + Math.random() * 250;
        life = 0.5 + Math.random() * 0.4;
        size = 5 + Math.random() * 8;
        gravity = 500;
        shape = 'circle';
        break;
    }
    p.x = x;
    p.y = y;
    p.vx = Math.cos(ang) * speed;
    p.vy = Math.sin(ang) * speed - (preset === 'explode' ? 120 : 0);
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.gravity = gravity;
    p.color = color;
    p.shape = shape;
    p.rot = Math.random() * Math.PI * 2;
    p.vr = (Math.random() - 0.5) * 8;
    this.active.push(p);
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.active.splice(i, 1);
        this._release(p);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  render(ctx) {
    for (const p of this.active) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      const s = p.size;
      switch (p.shape) {
        case 'star':
          drawStar(ctx, 0, 0, s, s * 0.45, 5);
          break;
        case 'diamond':
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.lineTo(s * 0.7, 0);
          ctx.lineTo(0, s);
          ctx.lineTo(-s * 0.7, 0);
          ctx.closePath();
          ctx.fill();
          break;
        case 'circle':
        default:
          ctx.beginPath();
          ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
          ctx.fill();
          break;
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  get count() {
    return this.active.length;
  }
}

function drawStar(ctx, cx, cy, outer, inner, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}
