export type Pt = { x: number; y: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Where a series of values sits in a chart's own pixel space.
 *
 * Lifted out of `Sparkline` so the share card and the Progress screen draw the
 * same curve by construction rather than by two implementations happening to
 * agree. Nothing here touches the DOM or React: it is a series in, points out,
 * which is also why the card can call it from a canvas.
 *
 * Each series is scaled to its own minimum and maximum. A chart of one lift is
 * about the shape of that lift's progress, not about where it sits against
 * some absolute zero, and anchoring to zero would flatten every curve in the
 * app into the same nearly-straight line.
 */
export function chartGeom(
  vals: number[],
  { width, padT, inner }: { width: number; padT: number; inner: number },
) {
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  // A flat series would divide by zero; give it a span and it draws level.
  const span = max - min || 1;
  const px = (i: number) =>
    vals.length === 1 ? width / 2 : (i / (vals.length - 1)) * width;
  const py = (v: number) => padT + inner - ((v - min) / span) * inner;
  const pts: Pt[] = vals.map((v, i) => ({
    x: +px(i).toFixed(1),
    y: +py(v).toFixed(1),
  }));
  /** The point a fraction `t` of the way along the series. */
  const at = (t: number): Pt => {
    if (vals.length === 1) return pts[0];
    const f = t * (vals.length - 1);
    const lo = Math.max(0, Math.min(vals.length - 2, Math.floor(f)));
    const k = f - lo;
    return {
      x: lerp(pts[lo].x, pts[lo + 1].x, k),
      y: lerp(pts[lo].y, pts[lo + 1].y, k),
    };
  };
  return { pts, at, min, max };
}
