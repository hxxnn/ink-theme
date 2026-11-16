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
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

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

test("reducedMotion: 'none' applies instantly under reduced motion", async () => {
  const { page, ctx } = await open('/test/fixtures/basic.html', { reducedMotion: 'reduce' });
  const r = await page.evaluate(() => {
    BleedPalette.run(() => setBg('#00ff00'), { reducedMotion: 'none' });
    return { overlay: !!document.getElementById('bp-overlay'), fade: document.documentElement.classList.contains('bp-fade'), v: document.documentElement.style.getPropertyValue('--bg') };
  });
  assert.deepEqual(r, { overlay: false, fade: false, v: '#00ff00' });
  await ctx.close();
});

test('reduced motion gets a short crossfade instead of the ink by default', async () => {
  const { page, ctx } = await open('/test/fixtures/basic.html', { reducedMotion: 'reduce' });
  const mid = await page.evaluate(async () => {
    const p = BleedPalette.run(() => setBg('#00ff00'), { x: 100, y: 100 });
    await new Promise((r) => setTimeout(r, 60));
    const info = {
      fade: document.documentElement.classList.contains('bp-fade'),
      overlay: !!document.getElementById('bp-overlay'),
      dur: getComputedStyle(document.documentElement, '::view-transition-group(root)').animationDuration,
    };
    await p;
    return info;
  });
  assert.deepEqual(mid, { fade: true, overlay: false, dur: '0.2s' });
  assert.equal(await bg(page), 'rgb(0, 255, 0)');
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('bp-fade')), false);
  await ctx.close();
});

test('reducedMotion: false ignores the OS setting and bleeds', async () => {
  const { page, ctx } = await open('/test/fixtures/basic.html', { reducedMotion: 'reduce' });
  const overlay = await page.evaluate(async () => {
    const p = BleedPalette.run(() => setBg('#00ff00'), { duration: 400, reducedMotion: false });
    await new Promise((r) => setTimeout(r, 120));
    const has = !!document.getElementById('bp-overlay');
    await p;
    return has;
  });
  assert.equal(overlay, true);
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

test('a slower async applyFn from an earlier run cannot overwrite the last colour', async () => {
  const { page, ctx } = await open();
  await page.evaluate(async () => {
    const a = BleedPalette.run(() => new Promise((r) => setTimeout(() => { setBg('#ff0000'); r(); }, 300)), { duration: 300 });
    await new Promise((r) => setTimeout(r, 30));
    const b = BleedPalette.run(() => setBg('#0000ff'), { duration: 300 });
    await Promise.all([a, b]);
  });
  assert.equal(await bg(page), 'rgb(0, 0, 255)');
  await ctx.close();
});

test("the site's own view transitions keep their animations after a run", async () => {
  const { page, ctx } = await open('/test/fixtures/own-vt.html');
  await page.evaluate(() => BleedPalette.run(() => setBg('#00ff00'), { duration: 200 }));
  const ms = await page.evaluate(async () => {
    const t0 = performance.now();
    await document.startViewTransition(() => setBg('#0000ff')).finished;
    return performance.now() - t0;
  });
  assert.ok(ms > 500, `own transition finished in ${ms}ms, expected about 700ms`);
  await ctx.close();
});

test('pointFrom uses the element centre for keyboard-activated clicks', async () => {
  const { page, ctx } = await open();
  const r = await page.evaluate(() => {
    const b = document.createElement('button');
    b.textContent = 'x'; b.style.cssText = 'position:fixed;left:200px;top:300px;width:100px;height:40px';
    document.body.appendChild(b);
    let p;
    b.addEventListener('click', (e) => { p = BleedPalette.pointFrom(e); });
    b.click(); // detail 0, clientX/Y 0, like Enter or Space
    return p;
  });
  assert.deepEqual(r, { x: 250, y: 320 });
  await ctx.close();
});

test('loading the script twice does not throw', async () => {
  const { page, ctx, errors } = await open();
  await page.addScriptTag({ url: '/dist/bleed-palette.js' });
  assert.deepEqual(errors, []);
  await page.evaluate(() => BleedPalette.run(() => setBg('#00ff00'), { duration: 150 }));
  assert.equal(await bg(page), 'rgb(0, 255, 0)');
  await ctx.close();
});

test('fallback rim colour reads the page background when body is transparent', async () => {
  const { page, ctx } = await open();
  await page.evaluate(() => { document.documentElement.style.background = '#fafafa'; document.body.style.background = 'transparent'; });
  const stroke = await page.evaluate(async () => {
    const p = BleedPalette.run(() => document.documentElement.style.setProperty('--x', '1'), { duration: 600 });
    await new Promise((r) => setTimeout(r, 200));
    const s = document.querySelector('#bp-overlay path').getAttribute('stroke');
    await p;
    return s;
  });
  const ch = parseInt(stroke.slice(1, 3), 16);
  assert.ok(ch > 0xa0 && ch < 0xe0, `light page should get a darker light-grey rim, got ${stroke}`);
  await ctx.close();
});

test('a synchronous startViewTransition failure rejects and leaves nothing behind', async () => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { document.startViewTransition = () => { throw new Error('vt failed'); }; });
  const page = await ctx.newPage();
  await page.goto(base + '/test/fixtures/basic.html');
  const msg = await page.evaluate(async () => {
    try { await BleedPalette.run(() => setBg('#00ff00'), { duration: 150 }); return 'no error'; }
    catch (e) { return e.message; }
  });
  assert.equal(msg, 'vt failed');
  assert.deepEqual(await page.evaluate(() => ({
    overlay: !!document.getElementById('bp-overlay'),
    cls: document.documentElement.classList.contains('bp-run'),
    clip: document.documentElement.style.getPropertyValue('--bp-clip'),
  })), { overlay: false, cls: false, clip: '' });
  await ctx.close();
});

test('ES module build works and leaves no global behind', async () => {
  const { page, ctx, errors } = await open('/test/fixtures/esm.html');
  await page.waitForFunction(() => window.ready === true);
  assert.equal(await page.evaluate(() => typeof window.BleedPalette), 'undefined');
  assert.equal(await page.evaluate(() => BP.isSupported()), true);
  await page.evaluate(() => BP.run(() => setBg('#00ff00'), { duration: 200 }));
  assert.equal(await bg(page), 'rgb(0, 255, 0)');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('onStart runs before applyFn and onEnd after the transition', async () => {
  const { page, ctx } = await open();
  const log = await page.evaluate(async () => {
    const l = [];
    await BleedPalette.run(() => { l.push('apply'); setBg('#00ff00'); }, { duration: 200, onStart: () => l.push('start'), onEnd: () => l.push('end') });
    return l;
  });
  assert.deepEqual(log, ['start', 'apply', 'end']);
  await ctx.close();
});

test('onEnd also fires when applyFn throws, and a throwing callback does not break the run', async () => {
  const { page, ctx } = await open();
  const r = await page.evaluate(async () => {
    let ended = 0;
    try { await BleedPalette.run(() => { throw new Error('x'); }, { duration: 150, onEnd: () => { ended++; } }); } catch (e) { /* expected */ }
    await BleedPalette.run(() => setBg('#00ff00'), { duration: 150, onStart: () => { throw new Error('cb'); } });
    return ended;
  });
  assert.equal(r, 1);
  assert.equal(await bg(page), 'rgb(0, 255, 0)');
  await ctx.close();
});

test('callbacks also fire for the instant path', async () => {
  const { page, ctx } = await open('/test/fixtures/basic.html', { reducedMotion: 'reduce' });
  const log = await page.evaluate(async () => {
    const l = [];
    await BleedPalette.run(() => l.push('apply'), { reducedMotion: 'none', onStart: () => l.push('start'), onEnd: () => l.push('end') });
    return l;
  });
  assert.deepEqual(log, ['start', 'apply', 'end']);
  await ctx.close();
});

test('cancel() jumps to the end state, resolves the run, and fires onEnd once', async () => {
  const { page, ctx } = await open();
  const r = await page.evaluate(async () => {
    let ended = 0;
    const t0 = performance.now();
    const p = BleedPalette.run(() => setBg('#00ff00'), { duration: 3000, onEnd: () => { ended++; } });
    await new Promise((res) => setTimeout(res, 200));
    BleedPalette.cancel();
    await p;
    return { ended, ms: performance.now() - t0 };
  });
  assert.equal(r.ended, 1);
  assert.ok(r.ms < 1500, `cancel took ${r.ms}ms`);
  assert.equal(await bg(page), 'rgb(0, 255, 0)');
  assert.deepEqual(await leftovers(page), { clip: '', overlay: false });
  await ctx.close();
});

test('cancel() with nothing running is harmless', async () => {
  const { page, ctx, errors } = await open();
  await page.evaluate(() => BleedPalette.cancel());
  assert.deepEqual(errors, []);
  await ctx.close();
});
