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

async function openDemo() {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const res = await page.goto(base + '/demo/index.html');
  assert.equal(res.status(), 200);
  return { page, ctx, errors };
}

async function clickSwatchAndWait(page, index) {
  const sw = page.locator('.swatch').nth(index);
  const expected = await sw.getAttribute('data-bg');
  await sw.click();
  await page.waitForFunction(() => !document.getElementById('bp-overlay'), null, { timeout: 5000 });
  const hex = await page.evaluate(() => {
    const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  });
  return { expected, hex };
}

test('palette swatch click spreads ink and changes the theme', async () => {
  const { page, ctx, errors } = await openDemo();
  assert.ok((await page.locator('.swatch').count()) >= 8);
  const { expected, hex } = await clickSwatchAndWait(page, 2);
  assert.equal(hex, expected.toLowerCase());
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('glass, gradient and image toggles keep the page correct', async () => {
  const { page, ctx, errors } = await openDemo();
  for (const id of ['#glass', '#gradient', '#image']) await page.locator(id).check();
  const { expected, hex } = await clickSwatchAndWait(page, 4);
  assert.equal(hex, expected.toLowerCase());
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the free colour input spreads ink once the colour is chosen', async () => {
  const { page, ctx, errors } = await openDemo();
  await page.locator('#picker').fill('#336699');
  assert.equal(await page.evaluate(() => !!document.getElementById('bp-overlay')), true, 'ink should start on commit');
  await page.waitForFunction(() => !document.getElementById('bp-overlay'), null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(51, 102, 153)');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a dark free colour keeps the text readable', async () => {
  const { page, ctx } = await openDemo();
  await page.locator('#picker').fill('#101820');
  await page.waitForFunction(() => !document.getElementById('bp-overlay'), null, { timeout: 5000 });
  const text = await page.evaluate(() => getComputedStyle(document.querySelector('h1')).color);
  const [r, g, b] = text.match(/\d+/g).map(Number);
  assert.ok((r + g + b) / 3 > 150, `text should be light on a dark page, got ${text}`);
  await ctx.close();
});
