// 비교 점검용: 정답을 아는 자동 조작이다. 초3 계산 시간/재미/중독성 검증으로 해석하지 않는다.
// 모든 입력은 실제 mouse/keyboard, RAF 유지. 외부 통신/사용자 저장소는 격리한다.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = http.createServer(async (req, res) => {
  try {
    let p = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    const rel = relative(root, p);
    if (rel.startsWith('..') || isAbsolute(rel)) { res.writeHead(403).end(); return; }
    if (!rel) p = resolve(root, 'index.html');
    const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };
    res.setHeader('Content-Type', mime[extname(p)] || 'application/octet-stream');
    res.end(await readFile(p));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const seconds = Number(process.env.REVIEW_SECONDS || 30);
const dir = process.env.SCREENSHOT_DIR;
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
  const errors = [], blocked = [];
  page.on('pageerror', e => errors.push(e.stack));
  await page.route('**/*', r => {
    if (new URL(r.request().url()).origin === origin) return r.continue();
    blocked.push(r.request().url()); return r.abort();
  });
  await page.goto(origin);
  await page.waitForFunction(() => window.__engine);
  const games = await page.evaluate(async () => (await import('/src/games/registry.js')).CATALOG);
  const results = [];
  if (dir) await mkdir(dir, { recursive: true });
  for (const item of games.filter(g => !process.env.GAME_ID || g.id === process.env.GAME_ID)) {
    await page.evaluate(async id => {
      const e = window.__engine;
      e.game?.destroy?.();
      e.sound.setEnabled(false); e.settings.operation = 'mixed';
      e.storage.set('g10_remain.oneShotSeen', true);
      e.startGame((await import('/src/games/registry.js')).getGameById(id));
    }, item.id);
    let lastFrame = 0, lastAdvance = Date.now(), entered = false, exited = false, forced = false;
    let normalShot = false, feverShot = false, firstCorrectMs = null, actions = 0, status;
    const start = Date.now();
    while (Date.now() - start < seconds * 1000) {
      const state = await page.evaluate(async () => {
        const e = window.__engine, g = e.game, r = e.canvas.getBoundingClientRect();
        const point = p => ({ x: r.x + p.x * r.width / 800, y: r.y + p.y * r.height / 1280 });
        const rect = b => point({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
        let action = null;
        if (e.state === 'PLAYING' && !e.isFrozen()) {
          switch (g.id) {
            case 'g01_delivery':
              if (g.phase === 'ready') action = { key: 'Enter' };
              else if (g.queue[0]) action = { key: g.targets.indexOf(g.queue[0].answer) ? 'ArrowRight' : 'ArrowLeft' };
              break;
            case 'g02_catch': {
              const f = g.fallers.find(f => !f.judged && (g.multiMode ? e.fever.isMultiple(f.value) : f.correct) && f.y > 350 && f.y < 1120);
              if (f) action = { click: point(f) }; break;
            }
            case 'g03_racing':
              if (g.mode === 'select') action = { key: '1' };
              else if (g.gate && !g.gate.locked && g.targetLane !== g.gate.correctLane) action = { key: g.gate.correctLane < g.targetLane ? 'ArrowLeft' : 'ArrowRight' };
              break;
            case 'g04_timing': {
              const n = g.numbers.find(n => g.multiMode ? e.fever.isMultiple(n.value) : n.correct);
              if (n) action = { click: point(g._numPos(n)) }; break;
            }
            case 'g05_match': {
              if (g.selected) {
                const a = g._activeAnimals().find(a => !a.fed && a.value === g.selected.value);
                if (a) action = { click: rect(g._animalRect(a)) };
              } else {
                const s = g._activeSnacks().find(s => g._activeAnimals().some(a => !a.fed && a.value === s.value));
                if (s) action = { click: rect(g._snackRect(s)) };
              }
              break;
            }
            case 'g06_stack': {
              const b = g.blocks.filter(b => !b.resolved && (g.multiMode ? b.isMultiple : b.correct)).sort((a, b) => b.y - a.y)[0];
              if (b) action = { click: point({ x: b.x, y: 1050 }) }; break;
            }
            case 'g07_shoot': {
              const en = g.enemies.find(en => !en.judged && (g.multiMode ? en.isMultiple : en.correct) && !g.bullets.some(b => Math.abs(b.x - en.x) < g.enemyR));
              if (en) action = { click: point({ x: en.x, y: g.charY }) }; break;
            }
            case 'g08_chain': {
              const path = (await import('/src/games/chainBoard.js')).findChain(g.board, g.D, 5);
              if (path.length) action = { drag: path.map(i => point(g._layout().points[i])) }; break;
            }
            case 'g09_balloon': {
              const b = g.balloons.find(b => g.multiMode ? e.fever.isMultiple(b.value) : b.correct);
              if (b) action = { click: point(b) }; break;
            }
            case 'g10_remain':
              if (g.mode === 'play') action = { keys: [String(g.q), 'Enter'] };
              else if (g.mode === 'collect') action = { key: 'Enter' };
              break;
            case 'g11_farm': {
              const { board, cell, button } = g._layout();
              if (g.hasSelection) action = { click: rect(button) };
              else action = { drag: [point({ x: board.x + cell / 2, y: board.y + cell / 2 }), point({
                x: board.x + ((g.division ? g.problem.answer : g.problem.b) - .5) * cell,
                y: board.y + ((g.division ? g.problem.b : g.problem.a) - .5) * cell,
              })] }; break;
            }
          }
        }
        return { frame: e._lastTs, state: e.state, fever: !!e.fever?.active, action,
          records: e.session.current.length, correct: e.session.current.filter(x => x.correct).length,
          wrong: e.session.current.filter(x => !x.correct && !x.missed).length,
          missed: e.session.current.filter(x => x.missed).length, score: e.scoreManager.score, lives: e.scoreManager.lives,
          progress: g.delivered ?? g.waveIndex ?? g.phrases ?? g.bouquets ?? g.cargoCount ?? g.completed ?? null };
      });
      status = state;
      assert.deepEqual(errors, []);
      if (state.correct && firstCorrectMs === null) firstCorrectMs = Date.now() - start;
      if (state.fever) entered = true; else if (entered) exited = true;
      if (state.frame !== lastFrame) { lastFrame = state.frame; lastAdvance = Date.now(); }
      assert.ok(Date.now() - lastAdvance < 2500, item.id + ' RAF stalled');
      if (!normalShot && !state.fever && Date.now() - start > 2000) {
        if (dir) await page.screenshot({ path: resolve(dir, item.id + '-normal.png') }); normalShot = true;
      }
      if (!feverShot && state.fever) {
        if (dir) await page.screenshot({ path: resolve(dir, item.id + '-fever.png') }); feverShot = true;
      }
      if (state.state !== 'PLAYING') break;
      if (!entered && !forced && Date.now() - start > 18000) {
        await page.evaluate(() => window.__engine.fever?.gain(100)); forced = true;
      }
      const a = state.action;
      if (a) {
        if (a.key) await page.keyboard.press(a.key);
        if (a.keys) for (const key of a.keys) await page.keyboard.press(key);
        if (a.click) await page.mouse.click(a.click.x, a.click.y);
        if (a.drag) {
          await page.mouse.move(a.drag[0].x, a.drag[0].y); await page.mouse.down();
          for (const p of a.drag.slice(1)) await page.mouse.move(p.x, p.y, { steps: 3 });
          await page.mouse.up();
        }
        actions++;
      }
      await page.waitForTimeout(['g02_catch','g03_racing','g06_stack','g07_shoot'].includes(item.id) ? 110 : 380);
    }
    assert.ok(status.correct >= 3, item.id + ' did not progress beyond first answer');
    const result = { id: item.id, name: item.name, seconds: Math.round((Date.now() - start) / 100) / 10,
      firstCorrectMs, actions, entered, exited, forcedFever: forced, ...status };
    delete result.action; delete result.frame;
    results.push(result); console.log(JSON.stringify(result));
  }
  assert.deepEqual(errors, []);
  if (dir) await writeFile(resolve(dir, 'arcade-review-results.json'), JSON.stringify({ results, errors, blockedRequests: blocked.length }, null, 2));
  console.log(JSON.stringify({ tested: results.length, errors, blockedRequests: blocked.length }));
} finally {
  await browser?.close();
  await new Promise(r => server.close(r));
}
