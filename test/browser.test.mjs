import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

let server, browser, base;
test.before(async () => {
  server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
test.after(async () => { await browser?.close(); server?.close(); });

async function open(url = '/test/fixtures/basic.html', opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + url);
  return { page, ctx, errors };
}
const bg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const leftovers = (page) => page.evaluate(() => ({
  clip: document.documentElement.style.getPropertyValue('--bp-clip'),
  overlay: !!document.getElementById('bp-overlay'),
}));

test('run applies the change and resolves', async () => {
  const { page, ctx } = await open();
  await page.evaluate(() => BleedPalette.run(() => setBg('#00ff00'), { x: 100, y: 100, duration: 300 }));
  assert.equal(await bg(page), 'rgb(0, 255, 0)');
  await ctx.close();
});

test('mid-transition the ink clip is active and is cleaned up after', async () => {
  const { page, ctx } = await open();
  const clip = await page.evaluate(async () => {
    const p = BleedPalette.run(() => setBg('#00ff00'), { x: 100, y: 100, duration: 800 });
    await new Promise((r) => setTimeout(r, 300));
    const c = getComputedStyle(document.documentElement, '::view-transition-new(root)').clipPath;
    const overlay = !!document.getElementById('bp-overlay');
    await p;
    return { c, overlay };
  });
  assert.ok(clip.c.startsWith('path('), `clip-path was ${clip.c}`);
  assert.equal(clip.overlay, true);
  assert.deepEqual(await leftovers(page), { clip: '', overlay: false });
  await ctx.close();
});

test('reduced motion applies instantly', async () => {
  const { page, ctx } = await open('/test/fixtures/basic.html', { reducedMotion: 'reduce' });
  const r = await page.evaluate(() => { BleedPalette.run(() => setBg('#00ff00')); return { overlay: !!document.getElementById('bp-overlay'), v: document.documentElement.style.getPropertyValue('--bg') }; });
  assert.equal(r.overlay, false);
  assert.equal(r.v, '#00ff00');
  await ctx.close();
});

test('unsupported browser applies instantly', async () => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { document.startViewTransition = undefined; });
  const page = await ctx.newPage();
  await page.goto(base + '/test/fixtures/basic.html');
  assert.equal(await page.evaluate(() => BleedPalette.supported), false);
  await page.evaluate(() => BleedPalette.run(() => setBg('#00ff00')));
  assert.equal(await bg(page), 'rgb(0, 255, 0)');
  await ctx.close();
});

test('second run skips the first and the last colour wins', async () => {
  const { page, ctx } = await open();
  const done = await page.evaluate(async () => {
    const a = BleedPalette.run(() => setBg('#00ff00'), { duration: 600 });
    await new Promise((r) => setTimeout(r, 100));
    const b = BleedPalette.run(() => setBg('#0000ff'), { duration: 300 });
    await Promise.all([a, b]);
    return true;
  });
  assert.equal(done, true);
  assert.equal(await bg(page), 'rgb(0, 0, 255)');
  assert.deepEqual(await leftovers(page), { clip: '', overlay: false });
  await ctx.close();
});

test('applyFn rejection is rethrown and cleans up', async () => {
  const { page, ctx } = await open();
  const msg = await page.evaluate(async () => {
    try { await BleedPalette.run(() => { throw new Error('boom'); }, { duration: 200 }); return 'no error'; }
    catch (e) { return e.message; }
  });
  assert.equal(msg, 'boom');
  assert.deepEqual(await leftovers(page), { clip: '', overlay: false });
  await ctx.close();
});

test('async applyFn is awaited', async () => {
  const { page, ctx } = await open();
  await page.evaluate(() => BleedPalette.run(() => new Promise((r) => setTimeout(() => { setBg('#00ff00'); r(); }, 50)), { duration: 300 }));
  assert.equal(await bg(page), 'rgb(0, 255, 0)');
  await ctx.close();
});

test('invalid x/y and color do not throw', async () => {
  const { page, ctx, errors } = await open();
  for (const o of [{ x: NaN, y: 'a' }, { color: 'red' }, { color: '#12' }, { x: -5000, y: 99999 }]) {
    const ok = await page.evaluate(async (opts) => { await BleedPalette.run(() => setBg('#00ff00'), { duration: 150, ...opts }); return true; }, o);
    assert.equal(ok, true);
  }
  assert.equal(await bg(page), 'rgb(0, 255, 0)');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('resize mid-run still completes', async () => {
  const { page, ctx } = await open();
  const p = page.evaluate(() => BleedPalette.run(() => setBg('#00ff00'), { x: 100, y: 100, duration: 600 }));
  await page.waitForTimeout(150);
  await page.setViewportSize({ width: 500, height: 900 });
  await p;
  assert.equal(await bg(page), 'rgb(0, 255, 0)');
  assert.deepEqual(await leftovers(page), { clip: '', overlay: false });
  await ctx.close();
});

test('works under a strict CSP', async () => {
  const { page, ctx, errors } = await open('/test/fixtures/csp.html');
  await page.evaluate(() => BleedPalette.run(() => setBg('#00ff00'), { x: 50, y: 50, duration: 300 }));
  assert.equal(await bg(page), 'rgb(0, 255, 0)');
  assert.deepEqual(errors.filter((e) => /Content Security Policy|CSP/i.test(e)), []);
  await ctx.close();
});

test('mid-transition only part of the page shows the new colour', async () => {
  const { page, ctx } = await open();
  await page.evaluate(() => setBg('#ffffff'));
  const p = page.evaluate(() => BleedPalette.run(() => setBg('#ff0000'), { x: 100, y: 100, duration: 1500, seed: 5 }));
  await page.waitForTimeout(450);
  const shot = await page.screenshot();
  await p;
  // Sample via the browser: decode the screenshot on a canvas.
  const px = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const at = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data.slice(0, 3));
    return { nearOrigin: at(100, 100), farCorner: at(780, 580) };
  }, shot.toString('base64'));
  assert.ok(px.nearOrigin[1] < 80, `origin should be red-ish, got ${px.nearOrigin}`);
  assert.ok(px.farCorner[1] > 200, `far corner should still be white, got ${px.farCorner}`);
  await ctx.close();
});
