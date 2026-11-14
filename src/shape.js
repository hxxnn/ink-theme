/* bleed-palette: seeded ink shape generator (pure, no DOM). MIT (c) 2026 hxxnn */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else {
    root.BleedPalette = root.BleedPalette || {};
    root.BleedPalette._shape = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var N = 360; // sample angles; constant so frames interpolate smoothly
  var TAU = Math.PI * 2;

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Deterministic lattice value in [-1, 1] for (seed, i, k).
  function lattice(seed, i, k) {
    var h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(i + 1, 0xc2b2ae35) ^ Math.imul(k + 7, 0x27d4eb2f);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    h ^= h >>> 15;
    return ((h >>> 0) / 4294967296) * 2 - 1;
  }

  function smooth(x) { return x * x * (3 - 2 * x); }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function step(a, b, x) { return smooth(clamp01((x - a) / (b - a))); }

  // Noise that is periodic in the angle (freq lattice cells around the circle) and drifts in time.
  function pnoise(seed, u, freq, time) {
    var x = u * freq, i = Math.floor(x), f = smooth(x - i);
    var k = Math.floor(time), g = smooth(time - k);
    function v(ii, kk) { return lattice(seed, ((ii % freq) + freq) % freq, kk); }
    var a = v(i, k) * (1 - f) + v(i + 1, k) * f;
    var b = v(i, k + 1) * (1 - f) + v(i + 1, k + 1) * f;
    return a * (1 - g) + b * g;
  }

  function angDist(a, b) {
    var d = Math.abs(a - b) % TAU;
    return d > Math.PI ? TAU - d : d;
  }

  function createShape(seed, view) {
    var width = Number(view && view.width) > 0 ? Number(view.width) : 1;
    var height = Number(view && view.height) > 0 ? Number(view.height) : 1;
    var cx = Number(view && view.x), cy = Number(view && view.y);
    if (!isFinite(cx)) cx = width / 2;
    if (!isFinite(cy)) cy = height / 2;
    cx = Math.min(width, Math.max(0, cx));
    cy = Math.min(height, Math.max(0, cy));
    seed = (seed | 0) || 1;

    var maxDist = Math.max(
      Math.hypot(cx, cy), Math.hypot(width - cx, cy), Math.hypot(cx, height - cy), Math.hypot(width - cx, height - cy)
    ) + 4;

    var rnd = mulberry32(seed);
    var tendrils = [];
    for (var i = 0; i < 11; i++) {
      tendrils.push({ a: rnd() * TAU, w: 0.03 + rnd() * 0.05, len: 0.12 + rnd() * 0.22, at: 0.08 + rnd() * 0.6 });
    }
    var dropDefs = [];
    for (var j = 0; j < 12; j++) {
      dropDefs.push({ a: rnd() * TAU, r: 1.5 + rnd() * 4.5, off: 3 + rnd() * 20, at: 0.1 + rnd() * 0.3 });
    }

    // Each direction has its own head start or delay, so the front breaks into lobes that arrive at
    // different moments (and never in the same order twice). Every direction still lands by t = 1.
    var LAG = 0.4;
    function lagAt(u) {
      return LAG * (0.5 + 0.5 * (0.6 * pnoise(seed + 3, u, 4, 0) + 0.4 * pnoise(seed + 4, u, 11, 0)));
    }
    // Accelerating front: a slow drop at first, then it keeps gaining speed.
    // The splat (SPLAT) lands instantly; the rest (1.06 - SPLAT) is the accelerating spread, so t = 1 still covers everything.
    function frontR(p, t) { return maxDist * (SPLAT * burst(t) + (1.06 - SPLAT) * Math.pow(p, 1.4)); }
    function baseR(t) { return frontR(t, t); }

    // The moment the ink pot hits the ground: sharp splatter spikes and flung droplets around the impact.
    var SPLAT = 0.2; // impact mark radius, as a fraction of maxDist
    var splashRays = [];
    for (var m = 0; m < 16; m++) splashRays.push({ a: rnd() * TAU, w: 0.025 + rnd() * 0.035, len: 0.6 + rnd() * 1.1 });
    var splashDrops = [];
    for (var m2 = 0; m2 < 14; m2++) splashDrops.push({ a: rnd() * TAU, r: 3 + rnd() * 7, off: 14 + rnd() * 0.26 * maxDist });
    function burst(t) { return 1 - Math.pow(1 - clamp01(t / 0.05), 3); } // fast ease-out over the first 5%
    function splashFade(t) { return 1 - step(0.06, 0.3, t); }

    function radius(theta, t) {
      var u = theta / TAU;
      var lag = lagAt(u);
      var p = clamp01((t - lag) / (1 - lag));
      var R = frontR(p, t);
      // Fast-changing noise makes the edge surge and stall unpredictably; it relaxes only at the very end.
      var time = t * 3.2;
      var amp = 1 - step(0.8, 1, t);
      var n = 0.22 * pnoise(seed, u, 3, time) + 0.18 * pnoise(seed + 1, u, 7, time * 1.4) + 0.08 * pnoise(seed + 2, u, 19, time * 1.9);
      var spike = 0;
      for (var q = 0; q < tendrils.length; q++) {
        var d = angDist(theta, tendrils[q].a) / tendrils[q].w;
        spike += tendrils[q].len * step(tendrils[q].at, tendrils[q].at + 0.18, t) * Math.exp(-d * d);
      }
      var r = R * (1 + amp * n + spike);
      var fade = splashFade(t);
      if (fade > 0) {
        var ray = 0;
        for (var w = 0; w < splashRays.length; w++) {
          var dw = angDist(theta, splashRays[w].a) / splashRays[w].w;
          ray += splashRays[w].len * Math.exp(-dw * dw);
        }
        r += maxDist * SPLAT * burst(t) * ray * fade;
      }
      // Safety net for the final instant only.
      return Math.max(r, maxDist * 1.08 * step(0.97, 1, t));
    }

    function at(t) {
      t = clamp01(t);
      var blob = [];
      for (var i = 0; i < N; i++) {
        var th = (i / N) * TAU, r = radius(th, t);
        blob.push([cx + Math.cos(th) * r, cy + Math.sin(th) * r]);
      }
      var drops = [];
      if (t > 0.1 && t < 0.9) {
        var R = baseR(t);
        for (var k = 0; k < dropDefs.length; k++) {
          var dd = dropDefs[k], life = step(dd.at, dd.at + 0.15, t) * (1 - step(0.75, 0.9, t));
          var dr = dd.r * life;
          if (dr < 0.4) continue;
          var da = (TAU / N);
          var edge = Math.max(radius(dd.a - da, t), radius(dd.a, t), radius(dd.a + da, t));
          var dist = edge + dr + 3 + dd.off * (R / maxDist + 0.2);
          drops.push({ x: cx + Math.cos(dd.a) * dist, y: cy + Math.sin(dd.a) * dist, r: dr });
        }
      }
      if (t > 0 && t < 0.34) {
        var da2 = TAU / N, fly = 1 - Math.pow(1 - clamp01(t / 0.18), 2);
        for (var k2 = 0; k2 < splashDrops.length; k2++) {
          var sd = splashDrops[k2], sl = step(0.002, 0.02, t) * (1 - step(0.18, 0.34, t));
          var sr = sd.r * sl;
          if (sr < 0.4) continue;
          var sedge = Math.max(radius(sd.a - da2, t), radius(sd.a, t), radius(sd.a + da2, t));
          var sdist = sedge + sr + 3 + sd.off * fly;
          drops.push({ x: cx + Math.cos(sd.a) * sdist, y: cy + Math.sin(sd.a) * sdist, r: sr });
        }
      }
      return { blob: blob, drops: drops };
    }

    return { at: at, center: { x: cx, y: cy }, maxDist: maxDist };
  }

  function f1(n) { return Math.round(n * 10) / 10; }

  function toPath(shape) {
    var d = '';
    shape.blob.forEach(function (p, i) { d += (i ? 'L' : 'M') + f1(p[0]) + ' ' + f1(p[1]); });
    d += 'Z';
    shape.drops.forEach(function (c) {
      for (var i = 0; i < 10; i++) {
        var a = (i / 10) * TAU;
        d += (i ? 'L' : 'M') + f1(c.x + Math.cos(a) * c.r) + ' ' + f1(c.y + Math.sin(a) * c.r);
      }
      d += 'Z';
    });
    return d;
  }

  return { createShape: createShape, toPath: toPath, mulberry32: mulberry32 };
});
