import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the type definitions accept valid usage and reject invalid usage', () => {
  try {
    execFileSync(process.execPath, [
      path.join(ROOT, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--target', 'es2020',
      '--module', 'esnext', '--moduleResolution', 'bundler', '--lib', 'es2020,dom', 'test/fixtures/types-usage.ts',
    ], { cwd: ROOT, stdio: 'pipe' });
  } catch (e) {
    assert.fail(String(e.stdout || e.stderr || e));
  }
});
