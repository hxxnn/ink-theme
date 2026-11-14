const test = require('node:test');
const assert = require('node:assert/strict');
const { createShape, toPath } = require('../src/shape.js');

const VIEW = { x: 500, y: 300, width: 1000, height: 600 };

function inside(poly, px, py) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const meanR = (blob, cx, cy) => blob.reduce((s, [x, y]) => s + Math.hypot(x - cx, y - cy), 0) / blob.length;

test('same seed gives identical paths', () => {
  const a = toPath(createShape(7, VIEW).at(0.5));
  const b = toPath(createShape(7, VIEW).at(0.5));
  assert.equal(a, b);
});

test('different seeds differ', () => {
  assert.notEqual(toPath(createShape(1, VIEW).at(0.5)), toPath(createShape(2, VIEW).at(0.5)));
});

test('t=0 is a tiny drop', () => {
  const { blob } = createShape(3, VIEW).at(0);
  for (const [x, y] of blob) assert.ok(Math.hypot(x - 500, y - 300) <= 6);
});

test('mean radius grows with t', () => {
  const s = createShape(5, VIEW);
  const r = [0.2, 0.5, 0.8].map((t) => meanR(s.at(t).blob, 500, 300));
  assert.ok(r[0] < r[1] && r[1] < r[2]);
});

test('covers the whole viewport at t=1', () => {
  for (const v of [VIEW, { x: 0, y: 0, width: 1000, height: 600 }, { x: 1000, y: 600, width: 1000, height: 600 }]) {
    for (const seed of [1, 2, 3, 99]) {
      const { blob } = createShape(seed, v).at(1);
      for (const [cx, cy] of [[0, 0], [v.width, 0], [0, v.height], [v.width, v.height]]) {
        assert.ok(inside(blob, cx, cy), `seed ${seed} corner ${cx},${cy} not covered`);
      }
    }
  }
});

test('all numbers are finite and point count is constant', () => {
  const s = createShape(11, VIEW);
  const n = s.at(0).blob.length;
  for (const t of [0, 0.1, 0.4, 0.7, 1]) {
    const f = s.at(t);
    assert.equal(f.blob.length, n);
    for (const [x, y] of f.blob) assert.ok(Number.isFinite(x) && Number.isFinite(y));
    for (const d of f.drops) assert.ok(Number.isFinite(d.x) && Number.isFinite(d.y) && Number.isFinite(d.r));
  }
});

test('drops sit outside the blob front', () => {
  const { blob, drops } = createShape(4, VIEW).at(0.5);
  assert.ok(drops.length > 0);
  for (const d of drops) assert.equal(inside(blob, d.x, d.y), false);
});

test('x/y not finite falls back to the viewport center', () => {
  const { blob } = createShape(1, { x: NaN, y: 'a', width: 800, height: 400 }).at(0);
  for (const [x, y] of blob) assert.ok(Math.hypot(x - 400, y - 200) <= 6);
});

test('spreads gently at first, like a drop soaking in', () => {
  const s = createShape(5, VIEW);
  assert.ok(meanR(s.at(0.25).blob, 500, 300) < 0.2 * s.maxDist);
});

test('keeps spreading steadily to the end (no stall in the last stretch)', () => {
  for (const seed of [1, 5, 9]) {
    const s = createShape(seed, VIEW);
    const m = (t) => meanR(s.at(t).blob, 500, 300);
    const early = m(0.4) - m(0.3);
    for (const [a, b] of [[0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1]]) {
      assert.ok(m(b) - m(a) >= 0.6 * early, `seed ${seed}: growth over ${a}-${b} stalled`);
    }
  }
});

test('the last corner is reached at the very end, not early', () => {
  for (const seed of [1, 5, 9, 42]) {
    const s = createShape(seed, VIEW);
    let first = null;
    for (let i = 0; i <= 100 && first === null; i++) {
      const { blob } = s.at(i / 100);
      if ([[0, 0], [1000, 0], [0, 600], [1000, 600]].every(([x, y]) => inside(blob, x, y))) first = i / 100;
    }
    assert.ok(first >= 0.85 && first <= 1, `seed ${seed}: everything covered at t=${first}`);
  }
});
