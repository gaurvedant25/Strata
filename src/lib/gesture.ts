/**
 * The two pieces of arithmetic that make a drag feel like an object rather than
 * a slider.
 *
 * Both are the standard forms rather than anything invented here: the same
 * resistance curve Apple's scroll views use past their edges, and the velocity
 * threshold Sonner dismisses a toast on.
 */

/**
 * Resistance past a boundary.
 *
 * The further you drag beyond the edge, the less the element follows — so the
 * edge is felt as something pushing back rather than as the drag simply
 * stopping. Real things slow before they stop; a hard clamp reads as the
 * interface having died under your finger.
 *
 * `overshoot` and the return are in the same units; `dim` is the span the
 * resistance is scaled against (here the drag travel, so the feel is
 * independent of screen size).
 */
export function rubberband(overshoot: number, dim: number, c = 0.55): number {
  return (overshoot * dim * c) / (dim + c * Math.abs(overshoot));
}

/**
 * Whether a release was a flick.
 *
 * Distance alone is the wrong question. A short, fast swipe is unambiguously a
 * throw, and requiring it to also cross half the travel is what makes a gesture
 * feel heavy — you flick, nothing happens, and you learn to drag instead.
 *
 * Units are px/ms; 0.11 is the threshold Sonner uses, kept rather than retuned.
 */
export const FLICK = 0.11;

/**
 * The fastest a flick is allowed to be reported as, in px/ms.
 *
 * Four pixels a millisecond crosses a phone screen in under a tenth of a
 * second, which is already faster than a thumb actually moves. Beyond that the
 * figure is not a fast gesture, it is a division by a very small number: two
 * pointer events landing in the same millisecond will report thousands, and
 * handed to a spring as an initial velocity that flings the element somewhere
 * it can never come back from.
 */
const MAX_VELOCITY = 4;

/**
 * Speed of the last stretch of a drag, in px/ms.
 *
 * Measured over the closing moments rather than the whole gesture: someone who
 * drags slowly, pauses, then flicks has released a flick, and averaging from
 * pointerdown would score that as slow.
 */
export function velocityOf(
  samples: { x: number; t: number }[],
  windowMs = 100,
): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  // Walk back to the first sample still inside the window, so a long pause
  // before the flick contributes nothing to the average.
  let first = samples[0];
  for (let i = samples.length - 1; i >= 0; i--) {
    first = samples[i];
    if (last.t - samples[i].t >= windowMs) break;
  }
  const dt = last.t - first.t;
  if (dt <= 0) return 0;
  const v = (last.x - first.x) / dt;
  return Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, v));
}
