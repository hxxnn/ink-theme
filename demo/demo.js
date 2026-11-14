(function () {
  'use strict';
  var PALETTES = [
    { bg: '#f4efe6', accent: '#c4471d', text: '#1d1b19' },
    { bg: '#0d1117', accent: '#54c2b8', text: '#e8eef2' },
    { bg: '#e8eeec', accent: '#1f7a74', text: '#102a2e' },
    { bg: '#eeeaf6', accent: '#6b4ba1', text: '#251d3a' },
    { bg: '#10141c', accent: '#6aa6ff', text: '#e9eef9' },
    { bg: '#f3edcb', accent: '#7a5c00', text: '#2f2808' },
    { bg: '#0f1c17', accent: '#5dbb8a', text: '#e5f3ec' },
    { bg: '#f7e4e7', accent: '#c2305a', text: '#3a1520' }
  ];

  function onAccent(hex) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 ? '#111111' : '#ffffff';
  }

  // The site's own colour logic: just sets CSS variables on <html>.
  function apply(p) {
    var st = document.documentElement.style;
    st.setProperty('--bg', p.bg);
    st.setProperty('--accent', p.accent);
    st.setProperty('--text', p.text || '#111111');
    st.setProperty('--on-accent', onAccent(p.accent));
  }

  var palette = document.getElementById('palette');
  PALETTES.forEach(function (p, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.setAttribute('data-bg', p.bg);
    b.setAttribute('aria-label', 'Palette ' + (i + 1));
    b.style.setProperty('--sw-bg', p.bg);
    b.style.setProperty('--sw-accent', p.accent);
    b.addEventListener('click', function (e) {
      var origin = BleedPalette.pointFrom(e);
      BleedPalette.run(function () { apply(p); }, { x: origin.x, y: origin.y, color: p.accent, duration: 1400 });
    });
    palette.appendChild(b);
  });

  function bind(id, fn) { document.getElementById(id).addEventListener('change', function (e) { fn(e.target.checked); }); }
  bind('glass', function (on) { document.documentElement.classList.toggle('glass', on); });
  bind('gradient', function (on) { document.body.classList.toggle('has-gradient', on); });
  bind('image', function (on) {
    // A tiny generated SVG (data URL) so no external file is needed.
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><circle cx='90' cy='110' r='90' fill='%23808080'/><circle cx='300' cy='280' r='120' fill='%23404040'/></svg>";
    document.documentElement.style.setProperty('--demo-image', 'url("data:image/svg+xml,' + svg + '")');
    document.body.classList.toggle('has-image', on);
  });

  // Dragging a colour input fires many events; apply directly instead of animating each one.
  document.getElementById('picker').addEventListener('input', function (e) {
    document.documentElement.style.setProperty('--bg', e.target.value);
  });
})();
