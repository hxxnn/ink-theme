import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parts = ['src/shape.js', 'src/bleed-palette.js'];
const banner = '/*! bleed-palette | MIT (c) 2026 hxxnn */\n';
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'dist/bleed-palette.js'),
  banner + parts.map((p) => fs.readFileSync(path.join(root, p), 'utf8')).join('\n'),
);
