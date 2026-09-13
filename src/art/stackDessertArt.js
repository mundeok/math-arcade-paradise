// Canvas 전용 디저트 소품. 정답 여부나 숫자로 외형을 바꾸지 않는다.
// 렌더는 게임 상태·난수·판정에 관여하지 않는다.
import { L } from '../core/layout.js';
import { font, roundRect } from '../core/ui.js';

export const DESSERT_KINDS = Object.freeze([
  Object.freeze({ id: 'pancake', name: '팬케이크', squash: 0.14, pitch: 1, wall: '#fff1e8', stripe: '#ffe9e4' }),
  Object.freeze({ id: 'pudding', name: '푸딩 타워', squash: 0.22, pitch: 1.2, wall: '#fff8dc', stripe: '#fff1c8' }),
  Object.freeze({ id: 'macaron', name: '마카롱 타워', squash: 0.09, pitch: 1.6, wall: '#fff0f7', stripe: '#f4e3f2' }),
  Object.freeze({ id: 'donut', name: '도넛 타워', squash: 0.18, pitch: 1.1, wall: '#edf7ff', stripe: '#e3eff9' }),
  Object.freeze({ id: 'cake', name: '축하 케이크', squash: 0.1, pitch: 0.8, wall: '#eff9ee', stripe: '#e0f0e7' }),
]);

function box(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color; roundRect(ctx, x, y, w, h, r); ctx.fill();
}
function oval(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}

export function drawDessert(ctx, x, y, w, h, label = '', fontPx = h * 0.65, kind = 'pancake') {
  ctx.save();
  ctx.translate(x, y);
  if (kind === 'pudding') {
    ctx.beginPath(); ctx.moveTo(-w * 0.34, -h * 0.46); ctx.lineTo(w * 0.34, -h * 0.46);
    ctx.quadraticCurveTo(w * 0.4, -h * 0.4, w * 0.49, h * 0.3);
    ctx.quadraticCurveTo(w * 0.5, h * 0.5, w * 0.36, h * 0.5);
    ctx.lineTo(-w * 0.36, h * 0.5); ctx.quadraticCurveTo(-w * 0.5, h * 0.5, -w * 0.49, h * 0.3);
    ctx.closePath(); ctx.fillStyle = '#f3ca69'; ctx.fill();
    box(ctx, -w * 0.36, -h * 0.5, w * 0.72, h * 0.24, h * 0.12, '#a96240');
    box(ctx, -w * 0.32, -h * 0.08, w * 0.07, h * 0.33, h * 0.06, '#fff4b7');
  } else if (kind === 'macaron') {
    box(ctx, -w * 0.49, -h * 0.12, w * 0.98, h * 0.3, h * 0.1, '#925279');
    box(ctx, -w * 0.47, -h * 0.03, w * 0.94, h * 0.15, h * 0.06, '#fff6e8');
    box(ctx, -w * 0.48, -h * 0.5, w * 0.96, h * 0.44, h * 0.22, '#e69fc2');
    box(ctx, -w * 0.48, h * 0.14, w * 0.96, h * 0.36, h * 0.18, '#cb82b0');
    box(ctx, -w * 0.32, -h * 0.4, w * 0.3, h * 0.08, h * 0.04, '#ffe1ee');
  } else if (kind === 'donut') {
    oval(ctx, 0, h * 0.03, w * 0.5, h * 0.47, '#b87340');
    oval(ctx, 0, -h * 0.05, w * 0.48, h * 0.43, '#eea274');
    oval(ctx, 0, -h * 0.1, w * 0.43, h * 0.32, '#9d6966');
    oval(ctx, 0, -h * 0.1, w * 0.11, h * 0.12, '#ffe7cd');
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++)
      box(ctx, side * w * (0.28 + (i % 2) * 0.06), h * (-0.29 + i * 0.16), w * 0.05, h * 0.07, h * 0.03, i % 2 ? '#a2e4d7' : '#fff0a8');
  } else if (kind === 'cake') {
    box(ctx, -w * 0.5, -h * 0.5, w, h, h * 0.15, '#d89065');
    box(ctx, -w * 0.48, -h * 0.44, w * 0.96, h * 0.83, h * 0.12, '#ffe2ad');
    box(ctx, -w * 0.48, -h * 0.06, w * 0.96, h * 0.17, h * 0.05, '#e48693');
    box(ctx, -w * 0.5, -h * 0.5, w, h * 0.25, h * 0.12, '#fffdf0');
    for (const side of [-1,1]) box(ctx, side * w * 0.37 - w * 0.035, -h * 0.4, w * 0.07, h * 0.38, h * 0.06, '#fffdf0');
  } else {
  ctx.fillStyle = '#8b4c39';
  roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.36); ctx.fill();
  ctx.fillStyle = '#efb164';
  roundRect(ctx, -w * 0.48, -h * 0.46, w * 0.96, h * 0.82, h * 0.3); ctx.fill();
  ctx.fillStyle = '#fff1cd';
  roundRect(ctx, -w * 0.46, -h * 0.4, w * 0.92, h * 0.52, h * 0.25); ctx.fill();
  // 양쪽 딸기 시럽. 숫자 중앙에는 소품을 넣지 않는다.
  ctx.fillStyle = '#e96c87';
  for (const side of [-1, 1]) {
    roundRect(ctx, side * w * 0.37 - w * 0.055, -h * 0.3, w * 0.11, h * 0.54, w * 0.055); ctx.fill();
    ctx.fillStyle = '#fff8e8';
    ctx.beginPath(); ctx.arc(side * w * 0.36, -h * 0.22, Math.min(w * 0.025, h * 0.06), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e96c87';
  }
  }
  if (label !== '') {
    // 모든 종류에서 같은 중앙 명찰. 구멍/크림/장식 위에서도 숫자가 읽힌다.
    box(ctx, -w * 0.3, -h * 0.4, w * 0.6, h * 0.81, h * 0.2, '#fff7df');
    ctx.font = font(Math.min(fontPx, h * 0.82));
    const maxW = w * 0.59;
    if (ctx.measureText(String(label)).width > maxW) {
      ctx.font = font(Math.min(fontPx, h * 0.82) * maxW / ctx.measureText(String(label)).width);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#633b32';
    ctx.fillText(String(label), 0, h * 0.025);
  }
  ctx.restore();
}

// 완료 순간 숫자를 없애고 토핑을 얹는다. 입력/판정 객체가 아닌 시각 전용 완성품.
export function drawFinishedDessert(ctx, x, bottom, w, layerH, count, kind = 'pancake') {
  ctx.save();
  for (let i = 0; i < count; i++)
    drawDessert(ctx, x, bottom - (i + 0.5) * layerH, w, layerH * 0.94, '', undefined, kind);
  const top = bottom - count * layerH;
  const capH = Math.min(w * 0.24, layerH * 0.85);
  // 세 덩이 크림과 딸기. 완성품만 사용하는 장식이며 다음 낙하 숫자를 가리지 않는다.
  for (const [dx,dy,r] of [[-0.22,0,0.2],[0,-0.19,0.25],[0.22,0,0.2]])
    oval(ctx, x + w * dx, top + capH * dy, w * r, capH * 0.55, '#fffdf2');
  if (kind === 'cake') {
    box(ctx, x - w * 0.035, top - capH * 1.6, w * 0.07, capH * 1.1, w * 0.02, '#7bbccd');
    oval(ctx, x, top - capH * 1.92, w * 0.045, capH * 0.3, '#ffbf4c');
  } else {
    oval(ctx, x, top - capH * 0.8, w * 0.105, capH * 0.55, kind === 'donut' ? '#f29366' : '#ec6385');
    oval(ctx, x + w * 0.05, top - capH * 1.28, w * 0.075, capH * 0.15, '#79b997');
  }
  // 완성한 케이크의 작은 얼굴. 숫자가 사라진 뒤에만 등장한다.
  const faceY = bottom - layerH * 0.5;
  for (const side of [-1,1]) oval(ctx, x + side * w * 0.1, faceY, w * 0.018, Math.min(w * 0.02, layerH * 0.08), '#6e493f');
  ctx.strokeStyle = '#6e493f'; ctx.lineWidth = Math.min(w * 0.018, layerH * 0.08);
  ctx.beginPath(); ctx.arc(x, faceY + layerH * 0.02, Math.min(w * 0.055, layerH * 0.18), 0.15, Math.PI - 0.15); ctx.stroke();
  drawDessertPlate(ctx, x, bottom, w * 1.15);
  ctx.restore();
}

export function drawDessertPlate(ctx, x, y, w, perfectHalf = 0) {
  ctx.save();
  ctx.fillStyle = '#729cac';
  roundRect(ctx, x - w / 2, y, w, L.gu(0.3), L.gu(0.15)); ctx.fill();
  ctx.fillStyle = '#f9fffb';
  roundRect(ctx, x - w / 2, y - L.gu(0.08), w, L.gu(0.17), L.gu(0.08)); ctx.fill();
  if (perfectHalf) {
    ctx.fillStyle = '#60ceb5';
    roundRect(ctx, x - perfectHalf, y - L.gu(0.08), perfectHalf * 2, L.gu(0.17), L.gu(0.08)); ctx.fill();
  }
  ctx.restore();
}

export function drawDessertShop(ctx, time, kind = DESSERT_KINDS[0]) {
  const top = L.zone.problem + L.gu(4.6), bottom = L.zone.floor;
  ctx.save();
  ctx.fillStyle = kind.wall; ctx.fillRect(0, top, L.W, L.H - top);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? kind.stripe : kind.wall;
    ctx.fillRect(i * L.W / 8, top, L.W / 8, bottom - top);
  }
  // 장식은 가장자리로, 떨어지는 숫자와 구별되는 작은 크기로 배치한다.
  for (const side of [-1, 1]) {
    const x = side < 0 ? L.gu(0.7) : L.W - L.gu(0.7);
    for (let i = 0; i < 4; i++) {
      const y = top + L.gu(2.5 + i * 3.8) + Math.sin(time * 0.7 + i) * L.gu(0.08);
      ctx.fillStyle = '#ecc7bf';
      ctx.beginPath(); ctx.ellipse(x, y, L.gu(0.12), L.gu(0.18), side * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = '#d6ece5'; ctx.fillRect(0, bottom + L.gu(0.5), L.W, L.H - bottom);
  ctx.fillStyle = '#77a99e'; ctx.fillRect(0, L.H - L.gu(0.17), L.W, L.gu(0.17));
  ctx.restore();
}
