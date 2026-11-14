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

    var duration = Number(opts.duration) > 0 ? Number(opts.duration) : 1400;
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
