import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const SKILL = 'plugins/bleed-palette/skills/add-to-site';

test('marketplace lists the plugin with a valid relative source', () => {
  const m = readJson('.claude-plugin/marketplace.json');
  assert.equal(m.name, 'hxxnn-plugins');
  assert.ok(m.owner && m.owner.name);
  const entry = m.plugins.find((p) => p.name === 'bleed-palette');
  assert.ok(entry, 'plugin entry missing');
  assert.equal(entry.source, './plugins/bleed-palette');
  assert.ok(!entry.source.includes('..'));
  assert.ok(fs.existsSync(path.join(ROOT, entry.source, '.claude-plugin/plugin.json')));
});

test('entry name and manifest name are the same', () => {
  const entry = readJson('.claude-plugin/marketplace.json').plugins[0];
  const manifest = readJson('plugins/bleed-palette/.claude-plugin/plugin.json');
  assert.equal(manifest.name, entry.name);
  assert.ok(manifest.version && manifest.description);
});

test('the skill has a description and points at the bundled library through CLAUDE_PLUGIN_ROOT', () => {
  const md = fs.readFileSync(path.join(ROOT, SKILL, 'SKILL.md'), 'utf8');
  const front = /^---\n([\s\S]*?)\n---\n/.exec(md);
  assert.ok(front, 'frontmatter missing');
  assert.match(front[1], /^description: .{40,}/m);
  assert.ok(md.includes('${CLAUDE_PLUGIN_ROOT}/skills/add-to-site/lib/bleed-palette.js'));
  assert.ok(md.includes('${CLAUDE_PLUGIN_ROOT}/skills/add-to-site/lib/bleed-palette.mjs'));
});

test('the bundled library files are identical to dist/ (run npm run build after changing src)', () => {
  for (const f of ['bleed-palette.js', 'bleed-palette.mjs', 'bleed-palette.d.ts']) {
    const bundled = fs.readFileSync(path.join(ROOT, SKILL, 'lib', f), 'utf8');
    const built = fs.readFileSync(path.join(ROOT, 'dist', f), 'utf8');
    assert.equal(bundled, built, `${f} is out of date`);
  }
});

test('the README documents the install commands that match the marketplace and plugin names', () => {
  for (const file of ['README.md', 'README.ko.md']) {
    const md = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(md.includes('/plugin marketplace add hxxnn/ink-theme'), `${file}: marketplace command`);
    assert.ok(md.includes('/plugin install bleed-palette@hxxnn-plugins'), `${file}: install command`);
  }
});
