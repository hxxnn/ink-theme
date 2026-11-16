import BleedPalette, { run, cancel, pointFrom, isSupported, type RunOptions } from '../../dist/bleed-palette';

const opts: RunOptions = {
  x: 10, y: 20, color: '#336699', duration: 800, seed: 3,
  reducedMotion: 'fade',
  onStart: () => {}, onEnd: () => {},
};
const p: Promise<void> = run(async () => {}, opts);
const point: { x: number; y: number } = pointFrom(document.body);
const ok: boolean = isSupported();
cancel();
BleedPalette.run(() => {});

// @ts-expect-error unknown reducedMotion value
run(() => {}, { reducedMotion: 'maybe' });
// @ts-expect-error duration must be a number
run(() => {}, { duration: '1s' });

export { p, point, ok };
