// 실제 브라우저 폰트로 공통 오답 식의 경계를 검사. 진행/입력은 게임별 browser 테스트에서 검증.
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
    if (rel.startsWith('..') || isAbsolute(rel)) { res.writeHead(403).end(); return; }
    if (!rel) p = resolve(root, 'index.html');
    const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp' };
    res.setHeader('Content-Type', mime[extname(p)] || 'application/octet-stream');
    res.end(await readFile(p));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const page = await browser.newPage();
  const errors = [], results = [];
  page.on('pageerror', e => errors.push(e.stack));
  await page.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto(origin);
  await page.waitForFunction(() => window.__engine);
  for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport);
    const result = await page.evaluate(async () => {
      const { L } = await import('/src/core/layout.js');
      const { fullEquationLines } = await import('/src/core/mathText.js');
      const e = window.__engine, ctx = e.ctx, out = [];
      const original = ctx.fillText;
      let expected;
      ctx.fillText = function (value, x, y, ...rest) {
        if (expected.includes(value)) {
          const width = this.measureText(value).width;
          if (x - width / 2 < L.safe - .1 || x + width / 2 > L.W - L.safe + .1) throw Error('Clipped equation: ' + JSON.stringify({value,width,font:this.font,x,safe:L.safe,W:L.W}));
          out.push({ value, width, font: this.font });
        }
        return original.call(this, value, x, y, ...rest);
      };
      try {
        for (const problem of [
          { a: 999, b: 12, op: '÷', answer: 83, remainder: 3 },
          { a: 123, b: 456, op: '×', answer: 56088 },
          { a: 2, b: 3, op: '×', answer: 6 },
          { a: 17, b: 5, op: '÷', answer: 3, remainder: 2 },
        ]) {
          expected = fullEquationLines(problem);
          ctx.clearRect(0, 0, L.W, L.H);
          e.ui.renderAnswerFeedback(ctx, problem, .5);
        }
      } finally { ctx.fillText = original; }
      return out;
    });
    assert.equal(result.length, 6);
    results.push({ viewport, equations: result });
    if (process.env.SCREENSHOT_DIR) {
      await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, `feedback-${viewport.width}.png`) });
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally {
  await browser?.close();
  await new Promise(r => server.close(r));
}
