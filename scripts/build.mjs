import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const banner = '/*! bleed-palette | MIT (c) 2026 hxxnn */\n';
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });

const shape = read('src/shape.js');
const palette = read('src/bleed-palette.js');

// 1. <script> build: sets window.BleedPalette.
fs.writeFileSync(path.join(root, 'dist/bleed-palette.js'), banner + shape + '\n' + palette);

// 2. ES module build: same sources run in a private scope, nothing is added to the global object.
fs.writeFileSync(
  path.join(root, 'dist/bleed-palette.mjs'),
  banner +
    `const __shape = (() => { const module = { exports: {} }; const require = undefined;\n${shape}\nreturn module.exports; })();\n` +
    `const __api = (() => { const module = { exports: {} }; const require = () => __shape;\n${palette}\nreturn module.exports; })();\n` +
    'export const run = __api.run;\nexport const cancel = __api.cancel;\nexport const pointFrom = __api.pointFrom;\n' +
    'export const isSupported = __api.isSupported;\nexport default __api;\n',
);

// 3. Type definitions.
fs.copyFileSync(path.join(root, 'src/bleed-palette.d.ts'), path.join(root, 'dist/bleed-palette.d.ts'));
