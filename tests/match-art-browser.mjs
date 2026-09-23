// Isolated real-RAF interaction and optional-image regression. No external writes.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = http.createServer(async (req, res) => {
  try {
    let p = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    const rel = relative(root, p);
    if (rel.startsWith('..') || isAbsolute(rel)) return res.writeHead(403).end();
    if (!rel) p = resolve(root, 'index.html');
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.webp': 'image/webp', '.png': 'image/png' })[extname(p)] || 'application/octet-stream');
    res.end(await readFile(p));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
const dir = resolve(root, 'test-output/match-toy');
await mkdir(dir, { recursive: true });
const errors = [];
try {
  for (const fallback of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 800, height: 1280 } });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', r => {
      const u = r.request().url();
      if (new URL(u).origin !== origin || (fallback && /assets\/(match\/|world\/match-)/.test(u))) return r.abort();
      return r.continue();
    });
    await page.goto(origin);
    await page.waitForFunction(() => window.__engine);
    await page.evaluate(async () => {
      const e = window.__engine;
      e.settings.operation = 'multiply'; e.sound.setEnabled(false);
      e.startGame((await import('/src/games/registry.js')).getGameById('g05_match'));
    });
    if (!fallback) await page.waitForFunction(async () => {
      const s = (await import('/src/art/matchAssets.js')).matchAssetStatus();
      return s.animals === 'ready' && s.cookie === 'ready' && !!(await import('/src/art/worldAssets.js')).worldImage('g05_match');
    });
    await page.waitForTimeout(450);
    await page.screenshot({ path: resolve(dir, fallback ? 'fallback.png' : 'desktop.png') });
    const clickRect = async r => {
      const b = await page.locator('canvas').boundingBox();
      await page.mouse.click(b.x + (r.x + r.w / 2) * b.width / 800, b.y + (r.y + r.h / 2) * b.height / 1280);
    };
    const deliver = async (wrong = false) => {
      const pair = await page.evaluate(wrong => {
        const g = window.__engine.game;
        const s = g._activeSnacks().find(s => g._activeAnimals().some(a => !a.fed && a.value === s.value));
        const a = g._activeAnimals().find(a => !a.fed && (wrong ? a.value !== s.value : a.value === s.value));
        return [g._snackRect(s), g._animalRect(a)];
      }, wrong);
      await clickRect(pair[0]); await clickRect(pair[1]); await page.waitForTimeout(500);
    };
    const firstFrame = await page.evaluate(() => window.__engine._lastTs);
    for (let i = 0; i < (fallback ? 4 : 8); i++) await deliver();
    assert.ok(await page.evaluate(() => window.__engine.session.current.filter(r => r.correct).length) >= (fallback ? 4 : 8));
    assert.ok(await page.evaluate(() => window.__engine._lastTs) > firstFrame);
    if (!fallback) {
      await page.evaluate(() => { const e = window.__engine; e.fever.active = false; e.fever.gauge = 0; });
      await page.waitForTimeout(100);
      await deliver(true);
      await page.waitForTimeout(1400);
      assert.ok(await page.evaluate(() => window.__engine.session.current.some(r => !r.correct && !r.missed)));
      await deliver();
      await page.evaluate(() => { window.__engine.game._activeAnimals().find(a => !a.isTrap && !a.fed).patience = .1; });
      await page.waitForTimeout(400);
      assert.ok(await page.evaluate(() => window.__engine.session.current.some(r => r.missed)));
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => window.__engine.state), 'PAUSED');
      const t = await page.evaluate(() => window.__engine.game.time);
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => window.__engine.game.time), t);
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => window.__engine.state), 'PLAYING');
      await page.evaluate(() => window.__engine.sound.setEnabled(true));
      await deliver();
      await page.evaluate(() => { window.__engine.sound.setEnabled(false); window.__engine.fever.gain(100); });
      await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => window.__engine.game.wasFever), true);
      await page.screenshot({ path: resolve(dir, 'fever.png') });
      for (let i = 0; i < 3; i++) await deliver();
      await page.evaluate(() => { window.__engine.fever.active = false; });
      await page.waitForTimeout(400); await deliver();
      await page.setViewportSize({ width: 375, height: 667 });
      await page.evaluate(() => { window.__engine.fever.active = false; window.__engine.fever.gauge = 0; });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: resolve(dir, 'phone.png') });
      await deliver();
      await page.evaluate(() => { window.__engine.scoreManager.lives = 1; window.__engine.fever.active = false; });
      await page.waitForTimeout(100); await deliver(true); await page.waitForTimeout(1400);
      assert.equal(await page.evaluate(() => window.__engine.state), 'RESULT');
      await clickRect(await page.evaluate(() => window.__engine.scene.retryBtn));
      assert.equal(await page.evaluate(() => window.__engine.state), 'PLAYING');
      await page.waitForTimeout(500); await deliver();
      // All existing games render through both fever boundaries, using isolated state.
      const count = await page.evaluate(async () => {
        const { CATALOG, getGameById } = await import('/src/games/registry.js');
        const e = window.__engine;
        for (const item of CATALOG) {
          e.startGame(getGameById(item.id)); e._update(.016); e._render();
          e.fever.gain(100); e._update(.016); e._render();
          e.fever.active = false; e._update(.016); e._render();
        }
        e.setState('MENU'); return CATALOG.length;
      });
      assert.equal(count, 11);
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(JSON.stringify({ realRAF: true, correctWrongMissRecovery: true, pauseResume: true, fever: true,
    resultRetry: true, soundOnOff: true, mobile: true, failedAssetFallback: true, allGameTransitions: 11, errors }));
} finally { await browser.close(); await new Promise(r => server.close(r)); }
