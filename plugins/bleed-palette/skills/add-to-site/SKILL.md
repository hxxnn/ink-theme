---
description: Adds the bleed-palette ink-bleed colour transition to the user's website so that picking a colour or palette spreads the new look from the click point like ink. Use when the user wants an ink, splash or spreading transition for a theme, palette or colour picker, or asks to add bleed-palette.
---

# Add bleed-palette to a site

bleed-palette makes a palette change spread from the click point like a drop of ink. It is one dependency-free file built on the View Transitions API. This plugin bundles it, so you copy it into the user's project; nothing is downloaded.

Bundled files (MIT, © 2026 hxxnn):

- `${CLAUDE_PLUGIN_ROOT}/skills/add-to-site/lib/bleed-palette.js`: plain `<script>`, creates `window.BleedPalette`
- `${CLAUDE_PLUGIN_ROOT}/skills/add-to-site/lib/bleed-palette.mjs`: ES module, for bundlers and `import`
- `${CLAUDE_PLUGIN_ROOT}/skills/add-to-site/lib/bleed-palette.d.ts`: TypeScript types (copy it next to the `.mjs`)

## Steps

1. **Find how the site applies colours.** Look for the function that sets the theme or palette (often CSS variables on `<html>`, a `data-theme` attribute, or a class) and for the handler that triggers it when the user picks a colour. If there are several entry points, or you cannot find one, ask the user which to wire up before changing anything.
2. **Copy the library into the project.** Use the `.mjs` (plus `.d.ts` for TypeScript) when the project uses a bundler or ES modules, otherwise the `.js`. Put it where the project keeps static or vendored files and ask if that is unclear. Do not edit the library, and keep its first-line licence comment.
3. **Load it.** `<script src="…/bleed-palette.js"></script>` before the site's own script, or `import BleedPalette from '…/bleed-palette.mjs'`.
4. **Wrap the colour change, not the page load.** Keep the existing apply function and call it inside `run`:

   ```js
   swatch.addEventListener('click', (e) => {
     const { x, y } = BleedPalette.pointFrom(e);   // keyboard clicks use the element's centre
     BleedPalette.run(() => applyPalette(palette), { x, y, color: palette.accent });
   });
   ```

   - `color` is the rim colour as `#rrggbb`. Use the palette's accent when there is one; it can be omitted.
   - Do **not** wrap the apply that runs when the page first loads or restores a saved theme.
   - For continuous inputs such as a colour picker's `input` event, keep applying directly, or run the ink once on the `change` event (when the colour is confirmed). Never run it on every `input`.
5. **Check the caveats and tell the user about any that apply.**
   - Elements that already have their own `view-transition-name` are not revealed by the ink; they keep the browser's default crossfade.
   - Under a strict CSP the library needs no extra allowances (no inline styles, no blob URLs).
   - With "reduce motion" on, users get a short crossfade instead of the ink (`reducedMotion: 'none'` applies the change at once).
   - Browsers without View Transitions apply the change immediately, with no animation.
6. **Verify.** Run the project's tests or build if it has them, then run the site and click a palette to see the ink. Say plainly if you could not run it.

Options for `run`: `x`, `y`, `color`, `duration` (ms, default 1000), `seed`, `reducedMotion`, `onStart`, `onEnd`. `BleedPalette.cancel()` jumps to the end state.
