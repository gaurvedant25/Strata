import type { Gender } from "../../types";
import type { BodyPart } from "./types";
import type { BodyView } from "./index";

/**
 * The vendored artwork draws front-view feet as plain stumps with no toes.
 * Rather than editing the third-party path data, the feet are redrawn here and
 * swapped in for the front views only — from behind you see heels, which the
 * original renders correctly.
 *
 * Geometry comes from measuring the original `feet` bounding box in each
 * figure's own coordinate space, so the replacements land exactly where the
 * ankles end.
 */
type FootBox = { center: number; span: number; width: number; top: number; bottom: number };

const BOX: Record<Gender, FootBox> = {
  // male front viewBox "0 0 724 1448": original feet bbox x 245..482, y 1284..1341
  male: { center: 363, span: 67, width: 104, top: 1282, bottom: 1346 },
  // female front viewBox "-50 -40 734 1538": original feet bbox x 227..414, y 1383..1428
  female: { center: 320, span: 47, width: 92, top: 1381, bottom: 1434 },
};

const n = (v: number) => Math.round(v * 10) / 10;

/** An ellipse expressed as a path, since BodyPart only carries path data. */
function ellipse(cx: number, cy: number, rx: number, ry: number) {
  return `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(rx * 2)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-rx * 2)} 0Z`;
}

/**
 * One foot. `s` is +1 for the foot on the +x side and -1 for the mirrored one;
 * the big toe always sits on the inner edge (toward the body's centre line).
 */
function foot(cx: number, w: number, top: number, bottom: number, s: 1 | -1): string[] {
  const h = bottom - top;
  const x = (f: number) => n(cx + s * w * f);
  const y = (f: number) => n(top + h * f);

  // dorsum: narrow at the ankle, widening only gently to the ball of the foot
  const body =
    `M${x(-0.18)} ${y(0)}` +
    `C${x(-0.28)} ${y(0.26)} ${x(-0.33)} ${y(0.5)} ${x(-0.33)} ${y(0.66)}` +
    `Q${x(-0.32)} ${y(0.74)} ${x(-0.24)} ${y(0.75)}` +
    `L${x(0.26)} ${y(0.72)}` +
    `Q${x(0.34)} ${y(0.7)} ${x(0.33)} ${y(0.62)}` +
    `C${x(0.32)} ${y(0.42)} ${x(0.24)} ${y(0.18)} ${x(0.17)} ${y(0)}` +
    `Z`;

  /**
   * Five toes, listed inner to outer as [offset, centre-y, rx, ry] in fractions
   * of the foot box. Spacing and size are deliberately uneven — the big toe is
   * much larger and sits slightly apart, and the second toe reaches furthest.
   * An even row of same-sized beads is what stops it reading as a foot.
   */
  const TOES: [number, number, number, number][] = [
    [-0.27, 0.8, 0.085, 0.21],
    [-0.09, 0.815, 0.062, 0.17],
    [0.03, 0.81, 0.055, 0.152],
    [0.14, 0.795, 0.048, 0.134],
    [0.235, 0.775, 0.042, 0.115],
  ];
  const toes = TOES.map(([ox, oy, orx, ory]) =>
    ellipse(cx + s * w * ox, top + h * oy, w * orx, h * ory),
  );

  return [body, ...toes];
}

export function feetPart(gender: Gender, view: BodyView): BodyPart | null {
  if (view !== "front") return null; // the back view shows heels, already fine
  const b = BOX[gender];
  return {
    slug: "feet",
    path: {
      right: foot(b.center + b.span, b.width, b.top, b.bottom, 1),
      left: foot(b.center - b.span, b.width, b.top, b.bottom, -1),
    },
  };
}
