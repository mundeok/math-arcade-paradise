// 개발 검증 전용. 게임 런타임에는 외부 라이브러리를 추가하지 않는다.
// PLAYWRIGHT_MODULE에 설치된 playwright의 index.mjs 절대 경로를 지정할 수 있다.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, relative, extname, isAbsolute } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const server = http.createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    const rel = relative(root, path);
    if (rel.startsWith('..') || isAbsolute(rel)) { res.writeHead(403).end(); return; }
    const file = path === root || path === root.slice(0, -1) ? resolve(root, 'index.html') : path;
    res.setHeader('Content-Type', extname(file) === '.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 800, height: 1280 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => window.__engine);
  const result = await page.evaluate(async () => {
    const { CATALOG, getGameById } = await import('/src/games/registry.js');
    const e = window.__engine;
    e.settings.sound = false;
    e.settings.music = false;
    e.settings.operation = 'multiply'; // 레이싱 모드 선택은 별도 사용자 단계, 초기화 검증에서는 생략
    const out = [];
    for (const item of CATALOG) {
      const g = getGameById(item.id);
      e.startGame(g);
      g.update(0.016);
      g.render(e.ctx);
      if (e.fever) {
        e.fever.gauge = 100;
        e.fever.gainCorrect();
        e._syncFeverEasy();
        g.update(0.016);
        g.render(e.ctx);
        e.fever.active = false;
        e._syncFeverEasy();
        g.update(0.016);
        g.render(e.ctx);
      }
      out.push({ id: g.id, normal: true, feverTransition: true });
      g.destroy();
    }
    e.startGame(getGameById('g11_farm'));
    return out;
  });
  assert.equal(result.length, 11);
  const positions = await page.evaluate(() => {
    const g = window.__engine.game;
    const { board, cell, button } = g._layout();
    const canvas = document.getElementById('game').getBoundingClientRect();
    const point = (x, y) => ({ x: canvas.x + x * canvas.width / 800, y: canvas.y + y * canvas.height / 1280 });
    return {
      start: point(board.x + cell / 2, board.y + cell / 2),
      end: point(board.x + (g.problem.b - 0.5) * cell, board.y + (g.problem.a - 0.5) * cell),
      button: point(button.x + button.w / 2, button.y + button.h / 2),
    };
  });
  await page.mouse.move(positions.start.x, positions.start.y);
  await page.mouse.down();
  await page.mouse.move(positions.end.x, positions.end.y, { steps: 6 });
  await page.mouse.up();
  assert.equal(await page.evaluate(() => window.__engine.game.hasSelection), true);
  if (process.env.SCREENSHOT_DIR) {
    await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, 'farm-desktop.png') });
  }
  await page.mouse.click(positions.button.x, positions.button.y);
  const success = await page.evaluate(() => ({ count: window.__engine.game.completed, record: window.__engine.session.current.at(-1) }));
  assert.equal(success.count, 1);
  assert.equal(success.record.correct, true);
  const lifecycle = await page.evaluate(async () => {
    const e = window.__engine;
    const g = e.game;
    g.rows = g.cols = 1;
    g.hasSelection = true;
    const lives = e.scoreManager.lives;
    g._submit();
    const wrong = e.freeze.active && e.scoreManager.lives === lives - 1 && e.problemGenerator.reviewQueue.length === 1;
    e.freeze.active = false;
    e.freeze.onResume();
    e.fever.gauge = 100;
    e.fever.gainCorrect();
    e._syncFeverEasy();
    g.update(0.016);
    const feverLives = e.scoreManager.lives;
    const combo = e.scoreManager.combo;
    g.rows = g.cols = 1;
    g.hasSelection = true;
    g._submit();
    const invincible = !e.freeze.active && e.scoreManager.lives === feverLives && e.scoreManager.combo === combo;
    if (e._pendingResume) { const cb = e._pendingResume; e._pendingResume = null; cb(); }
    e.fever.active = false;
    e._syncFeverEasy();
    g.update(0.016);
    for (let i = g.completed; i < 16; i++) {
      g.rows = g.division ? g.problem.b : g.problem.a;
      g.cols = g.division ? g.problem.answer : g.problem.b;
      g.hasSelection = true;
      g._submit();
    }
    return { wrong, invincible, resultScreen: e.state === 'RESULT' };
  });
  assert.deepEqual(lifecycle, { wrong: true, invincible: true, resultScreen: true });
  await page.evaluate(async () => {
    const { getGameById } = await import('/src/games/registry.js');
    const e = window.__engine;
    e.settings.operation = 'divide';
    e.startGame(getGameById('g11_farm'));
  });
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(100);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, 'farm-phone.png') });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ games: result, farmMouseSubmission: true, ...lifecycle, pageErrors: errors }, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
