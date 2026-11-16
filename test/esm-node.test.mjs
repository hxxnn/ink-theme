import test from 'node:test';
import assert from 'node:assert/strict';
import BleedPalette, { run, cancel, pointFrom, isSupported } from 'bleed-palette';

test('package entry exposes the API and works without a DOM (applies at once)', async () => {
  assert.equal(isSupported(), false);
  assert.equal(typeof cancel, 'function');
  assert.equal(BleedPalette.run, run);
  const log = [];
  await run(() => { log.push('apply'); }, { onStart: () => log.push('start'), onEnd: () => log.push('end') });
  assert.deepEqual(log, ['start', 'apply', 'end']);
  assert.deepEqual(pointFrom(null), { x: NaN, y: NaN });
});
