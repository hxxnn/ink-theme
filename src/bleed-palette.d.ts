export interface RunOptions {
  /** Where the ink starts, in viewport CSS px. Invalid values fall back to the centre; out-of-range values are clamped. */
  x?: number;
  y?: number;
  /** Rim colour as #rrggbb. Anything else is ignored. */
  color?: string;
  /** Milliseconds. Default 1000. */
  duration?: number;
  /** Same seed, same shape. */
  seed?: number;
  /**
   * What to do when the user prefers reduced motion: 'fade' (default, a 0.2 s crossfade) or 'none' (apply at once).
   * true behaves as if the preference is on; false ignores it and always bleeds.
   */
  reducedMotion?: boolean | 'fade' | 'none';
  /** Called as the run starts, before applyFn. */
  onStart?: () => void;
  /** Called once the run is over (finished, cancelled, or failed). */
  onEnd?: () => void;
}

/** Runs applyFn inside an ink-bleed transition. Resolves when the transition has finished; rejects with applyFn's error. */
export function run(applyFn: () => void | Promise<void>, options?: RunOptions): Promise<void>;
/** Jumps the running transition to its end state. */
export function cancel(): void;
/** Click point of an event, or the centre of an element. Keyboard-activated clicks use the element's centre. */
export function pointFrom(source: Event | Element | null | undefined): { x: number; y: number };
/** Whether the browser has the View Transitions API. */
export function isSupported(): boolean;

declare const BleedPalette: {
  run: typeof run;
  cancel: typeof cancel;
  pointFrom: typeof pointFrom;
  isSupported: typeof isSupported;
  readonly supported: boolean;
};
export default BleedPalette;
