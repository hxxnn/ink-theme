# bleed-palette

Ink-bleed colour transitions for palette pickers. When the user picks a colour, the new look spreads from the click point like a drop of ink. No dependencies, one file, works with or without glass effects.

It is built on the [View Transitions API](https://developer.mozilla.org/docs/Web/API/View_Transition_API): the browser captures the old and new page itself, so glass cards (`backdrop-filter`), gradients and image backgrounds render correctly. The ink shape (blob, tendrils, droplets, coloured rim) is generated in JS from a seed.

Inspired by the idea of ink-spread theme switches. This library is written from scratch and contains no code from other projects.

## Use

```html
<script src="dist/bleed-palette.js"></script>
```

Wrap whatever code applies your colours:

```js
swatch.addEventListener('click', (e) => {
  const { x, y } = BleedPalette.pointFrom(e);          // click point, or pass an element
  BleedPalette.run(() => applyPalette(palette), { x, y, color: palette.accent });
});
```

`run` returns a Promise that resolves when the transition has finished. `applyFn` may be sync or async; if it throws, the error is rethrown from `run`.

| Option | Default | Meaning |
| --- | --- | --- |
| `x`, `y` | viewport centre | Where the ink starts (viewport CSS px). Invalid values fall back to the centre; values outside the viewport are clamped. |
| `color` | `--ink-bleed-color`, else a shade of the new background | Colour of the rim that pools at the front. Must be `#rrggbb`; anything else is ignored. |
| `duration` | `1000` | Milliseconds. |
| `seed` | random | Same seed, same shape. |
| `reducedMotion` | `'fade'` | What to do when the user prefers reduced motion: `'fade'` (a 0.2 s crossfade, no ink) or `'none'` (apply at once). `true` behaves like the preference is on; `false` ignores it and always bleeds. |

`BleedPalette.supported` tells you whether the browser has View Transitions. Without it, `applyFn` just runs immediately. With "reduce motion" on, the ink is replaced by a short crossfade (or nothing, with `reducedMotion: 'none'`).

## Good to know

- Use it for discrete choices (clicking a swatch, confirming a colour). For continuous input such as dragging inside a colour picker, apply colours directly on `input`, or run the ink once on `change` (when the colour is confirmed) as the demo does; animating every `input` event would be slow.
- Elements that already have their own `view-transition-name` keep the browser's default cross-fade instead of being revealed by the ink (only the page root is). Avoid named elements during a palette change, or remove the name while `run` is active.
- A new `run` during a running transition skips the old one; the last colour wins.
- Works under a strict CSP (`img-src 'self' data:`, no `unsafe-inline`): styles are applied through adopted stylesheets and CSSOM, and no blob URLs are used.
- Browsers: those with `document.startViewTransition` (current Chrome/Edge, Safari 18+, recent Firefox).

## Develop

```bash
npm run build   # src/*.js -> dist/bleed-palette.js
npm test        # shape unit tests + Chromium browser tests (Playwright)
```

Open `demo/index.html` through any static server to try it, with toggles for glass, gradient and image backgrounds.

## License

MIT © 2026 hxxnn
