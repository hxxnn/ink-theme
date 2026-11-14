/*! bleed-palette | MIT (c) 2026 hxxnn */
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
    function frontR(p, t) { return maxDist * (SPLAT * burst(t) + (1.06 - SPLAT) * Math.pow(p, 1.25)); }
    function baseR(t) { return frontR(t, t); }

    // The moment the ink pot hits the ground: sharp splatter spikes and flung droplets around the impact.
    var SPLAT = 0.14; // impact mark radius, as a fraction of maxDist
    var splashRays = [];
    for (var m = 0; m < 16; m++) splashRays.push({ a: rnd() * TAU, w: 0.025 + rnd() * 0.035, len: 0.6 + rnd() * 1.1 });
    var splashDrops = [];
    for (var m2 = 0; m2 < 14; m2++) splashDrops.push({ a: rnd() * TAU, r: 3 + rnd() * 7, off: 12 + rnd() * 0.2 * maxDist });
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

/* bleed-palette: ink-bleed palette transitions on the View Transitions API. MIT (c) 2026 hxxnn */
(function (root) {
  'use strict';

  var BP = (root.BleedPalette = root.BleedPalette || {});
  var shapeLib = BP._shape;
  var HEX = /^#[0-9a-fA-F]{6}$/;
  var NS = 'http://www.w3.org/2000/svg';
  var current = null; // the run in flight, if any
  var sheetInstalled = false;

  function isSupported() {
    return typeof document !== 'undefined' && typeof document.startViewTransition === 'function';
  }

  function prefersReducedMotion() {
    try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { return false; }
  }

  // Rules for the transition pseudo-elements. Adopted stylesheets (no <style> tag) keep strict CSPs happy.
  function installSheet() {
    if (sheetInstalled) return;
    sheetInstalled = true;
    if (!('adoptedStyleSheets' in document) || typeof CSSStyleSheet === 'undefined') return;
    var sheet = new CSSStyleSheet();
    // Scoped to .bp-run so the host site's own view transitions are left alone between our runs.
    sheet.replaceSync(
      ':root.bp-run::view-transition-group(root),:root.bp-run::view-transition-image-pair(root),:root.bp-run::view-transition-old(root),:root.bp-run::view-transition-new(root){animation:none;mix-blend-mode:normal}' +
      ':root.bp-run::view-transition-new(root){clip-path:var(--bp-clip)}' +
      ':root.bp-run::view-transition-group(bp-overlay),:root.bp-run::view-transition-old(bp-overlay),:root.bp-run::view-transition-new(bp-overlay){animation:none}' +
      ':root.bp-run::view-transition-old(bp-overlay){display:none}'
    );
    document.adoptedStyleSheets = document.adoptedStyleSheets.concat([sheet]);
  }

  // Opaque-enough rgb(a) colour as [r, g, b], else null (transparent, or a syntax we do not parse).
  function rgbOf(str) {
    var m = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?/.exec(str || '');
    if (!m) return null;
    var a = m[4] === undefined ? 1 : m[4].slice(-1) === '%' ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return a > 0.05 ? [+m[1], +m[2], +m[3]] : null;
  }
  function hex2(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? '0' : '') + n.toString(16); }

  // Pigment colour: explicit option, then --ink-bleed-color, then a shade of the new page background.
  function resolveColor(option) {
    if (typeof option === 'string' && HEX.test(option)) return option;
    var cssVar = getComputedStyle(document.documentElement).getPropertyValue('--ink-bleed-color').trim();
    if (HEX.test(cssVar)) return cssVar;
    var rgb =
      rgbOf(getComputedStyle(document.body || document.documentElement).backgroundColor) ||
      rgbOf(getComputedStyle(document.documentElement).backgroundColor) ||
      [128, 128, 128];
    var lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    var k = lum > 0.5 ? 0.78 : 1.35; // darker on light pages, lighter on dark ones
    var out = rgb.map(function (v) { return lum > 0.5 ? v * k : v * k + 24; });
    return '#' + out.map(hex2).join('');
  }

  function makeOverlay() {
    var svg = document.createElementNS(NS, 'svg');
    svg.id = 'bp-overlay';
    svg.setAttribute('aria-hidden', 'true');
    var s = svg.style;
    s.position = 'fixed'; s.left = '0'; s.top = '0'; s.width = '100vw'; s.height = '100vh';
    s.pointerEvents = 'none'; s.zIndex = '2147483647';
    s.setProperty('view-transition-name', 'bp-overlay');
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-width', '4');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    document.documentElement.appendChild(svg);
    return { svg: svg, path: path };
  }

  function stepFn(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  function cleanup(run) {
    if (run.raf) { root.cancelAnimationFrame(run.raf); run.raf = 0; }
    if (run.keep) { try { run.keep.cancel(); } catch (e) { /* already gone */ } run.keep = null; }
    if (run.overlay && run.overlay.svg.parentNode) run.overlay.svg.parentNode.removeChild(run.overlay.svg);
    run.overlay = null;
    if (current === run) {
      document.documentElement.style.removeProperty('--bp-clip');
      document.documentElement.classList.remove('bp-run');
      current = null;
    }
  }

  function applyNow(applyFn) {
    try { return Promise.resolve(applyFn()).then(function () {}); }
    catch (e) { return Promise.reject(e); }
  }

  function run(applyFn, opts) {
    opts = opts || {};
    var reduced = opts.reducedMotion === undefined ? prefersReducedMotion() : !!opts.reducedMotion;
    if (!isSupported() || reduced) return applyNow(applyFn);

    installSheet();
    var prevDone = Promise.resolve();
    if (current) {
      var prev = current;
      prevDone = prev.vt.updateCallbackDone.catch(function () {});
      try { prev.vt.skipTransition(); } catch (e) { /* already finished */ }
      cleanup(prev);
      current = null;
    }

    var duration = Number(opts.duration) > 0 ? Number(opts.duration) : 1000;
    var seed = isFinite(opts.seed) ? opts.seed | 0 : (Math.random() * 4294967296) | 0;
    var view = { x: Number(opts.x), y: Number(opts.y), width: root.innerWidth, height: root.innerHeight };
    var shape = shapeLib.createShape(seed, view);
    var run = { raf: 0, keep: null, overlay: null, vt: null };
    current = run;
    try {
      run.overlay = makeOverlay();
      document.documentElement.classList.add('bp-run');
      document.documentElement.style.setProperty('--bp-clip', "path('" + shapeLib.toPath(shape.at(0)) + "')");

      // Wait for an interrupted run's update callback first, so a slower earlier applyFn cannot land after this one.
      run.vt = document.startViewTransition(function () { return prevDone.then(function () { return applyFn(); }); });
    } catch (err) {
      cleanup(run);
      return Promise.reject(err);
    }
    run.vt.updateCallbackDone.catch(function () {});

    run.vt.ready.then(function () {
      if (current !== run) return;
      var color = resolveColor(opts.color);
      run.overlay.path.setAttribute('stroke', color);
      // The transition ends when its pseudo-element animations end, so keep one alive for the ink's duration.
      run.keep = document.documentElement.animate([{ opacity: 1 }, { opacity: 1 }], {
        duration: duration + 40,
        pseudoElement: '::view-transition-new(root)',
      });
      var start = performance.now();
      (function frame(now) {
        if (current !== run) return;
        var t = Math.min(1, (now - start) / duration);
        var frameShape = shape.at(t);
        var d = shapeLib.toPath(frameShape);
        document.documentElement.style.setProperty('--bp-clip', t >= 1 ? 'none' : "path('" + d + "')");
        run.overlay.path.setAttribute('d', d);
        run.overlay.path.setAttribute('stroke-opacity', String(0.55 * (1 - stepFn(0.7, 1, t))));
        if (t < 1) run.raf = root.requestAnimationFrame(frame);
        else { run.raf = 0; if (run.keep) run.keep.cancel(); }
      })(start);
    }, function () {});

    return new Promise(function (resolve, reject) {
      run.vt.finished.then(
        function () { cleanup(run); resolve(); },
        function (err) { cleanup(run); reject(err); }
      );
    });
  }

  function pointFrom(source) {
    // Enter/Space on a button gives a click with detail 0 and clientX/Y 0: use the element's centre instead.
    if (source && source.detail === 0 && source.currentTarget && typeof source.currentTarget.getBoundingClientRect === 'function') {
      return pointFrom(source.currentTarget);
    }
    if (source && typeof source.clientX === 'number') return { x: source.clientX, y: source.clientY };
    if (source && source.changedTouches && source.changedTouches[0]) {
      return { x: source.changedTouches[0].clientX, y: source.changedTouches[0].clientY };
    }
    if (source && typeof source.getBoundingClientRect === 'function') {
      var r = source.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return { x: NaN, y: NaN };
  }

  BP.run = run;
  BP.pointFrom = pointFrom;
  Object.defineProperty(BP, 'supported', { get: isSupported, enumerable: true, configurable: true });
})(typeof self !== 'undefined' ? self : this);
