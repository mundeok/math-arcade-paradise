// 실제 Canvas 레이어와 스택 물리 회귀 검사. 먼저 로컬 개발 서버를 실행한다.
// BASE_URL 기본 http://127.0.0.1:8124. Playwright는 개발 검증에만 사용한다.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 1280 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0; // 벽시계 대신 일정 dt로 진행
    let seed = 90731;
    Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  });
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8124/');
  await page.waitForFunction(() => window.__engine);
  const result = await page.evaluate(async () => {
    const { getGameById } = await import('/src/games/registry.js');
    const { L } = await import('/src/core/layout.js');
    const e = window.__engine;
    const headers = [];
    for (const id of ['g02_catch', 'g06_stack', 'g07_shoot']) {
      e.startGame(getGameById(id));
      const g = e.game;
      const c = document.createElement('canvas');
      c.width = L.W; c.height = L.H;
      // 읽기 중 GPU→CPU 전환으로 글자 AA가 바뀌는 오탐을 막는다.
      const ctx = c.getContext('2d', { willReadFrequently: true });
      const bottom = L.zone.problem + L.gu(id === 'g06_stack' ? 4.6 : 2.8);
      const snapshot = () => {
        ctx.save(); ctx.clearRect(0, 0, L.W, L.H); g.render(ctx); ctx.restore();
        return ctx.getImageData(0, 0, L.W, bottom).data;
      };
      snapshot();
      const before = snapshot();
      const object = { x: L.W / 2, y: bottom - L.gu(0.25), value: 99 };
      if (id === 'g02_catch') g.fallers.push(object);
      if (id === 'g06_stack') g.blocks.push(object);
      if (id === 'g07_shoot') {
        g.enemies.push(object);
        g.bullets.push({ x: object.x, y: object.y, r: L.gu(0.25) });
      }
      const after = snapshot();
      headers.push({ id, protected: before.every((v, i) => v === after[i]) });
    }

    e.startGame(getGameById('g06_stack'));
    const g = e.game;
    // 정답 위치를 아는 자동 조작: 물리/전환 안정성 검사이며 학생 난이도 평가는 아님.
    for (let i = 0; i < 4500 && e.state === 'PLAYING'; i++) {
      const target = g.blocks.filter(b => !b.resolved && (g.multiMode ? b.isMultiple : b.correct)).sort((a,b) => b.y-a.y)[0];
      if (target) e.dispatchTouch(target.x, L.zone.controls, 'move');
      e._update(0.02);
    }
    e._render();
    return { headers, simulatedSeconds: 90, waves: g.waveIndex, lives: e.scoreManager.lives, state: e.state };
  });
  assert.ok(result.headers.every(h => h.protected), JSON.stringify(result.headers));
  assert.ok(result.waves >= 3);
  assert.equal(result.state, 'PLAYING');
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(80);
  await page.evaluate(() => window.__engine._render());
  if (process.env.SCREENSHOT_DIR) {
    await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, 'phone-stack.png') });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ...result, pageErrors: errors }, null, 2));
} finally {
  await browser.close();
}
