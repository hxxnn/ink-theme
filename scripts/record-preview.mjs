// Records demo/index.html while clicking a few palette swatches and writes docs/preview.gif.
// Needs Playwright (Chromium) and ffmpeg. Run: node scripts/record-preview.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/preview.gif');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bleed-preview-'));

const SIZE = { width: 800, height: 520 };
// [swatch index, ms to wait after the click]
const STEPS = [[1, 1500], [3, 1500], [6, 1500], [0, 1700], [4, 1500], [7, 1700]];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: tmp, size: SIZE } });
const page = await ctx.newPage();
await page.goto('file://' + path.join(root, 'demo/index.html'));
await page.waitForTimeout(600);
for (const [i, wait] of STEPS) {
  await page.locator('.swatch').nth(i).click({ position: { x: 20 + (i * 17) % 90, y: 14 + (i * 11) % 36 } });
  await page.waitForTimeout(wait);
}
await ctx.close(); // flushes the video
await browser.close();

const video = path.join(tmp, fs.readdirSync(tmp).find((f) => f.endsWith('.webm')));
const palette = path.join(tmp, 'palette.png');
const filters = 'fps=15,scale=640:-1:flags=lanczos';
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', video, '-vf', `${filters},palettegen=max_colors=96`, palette]);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', video, '-i', palette, '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4`, out]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('wrote', out, (fs.statSync(out).size / 1024 / 1024).toFixed(2) + ' MB');
