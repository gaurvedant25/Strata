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
type FootBox = {
  center: number;
  span: number;
  width: number;
  top: number;
  bottom: number;
  /** How far the foot turns out from the ankle. Nobody stands feet-parallel. */
  splay: number;
};

const BOX: Record<Gender, FootBox> = {
  // male front viewBox "0 0 724 1448": original feet bbox x 245..482, y 1284..1341
  male: { center: 363, span: 63, width: 91, top: 1282, bottom: 1342, splay: 24 },
  // female front viewBox "-50 -40 734 1538": original feet bbox x 227..414, y 1383..1428
  female: { center: 320, span: 47, width: 92, top: 1381, bottom: 1434, splay: 22 },
};

const n = (v: number) => Math.round(v * 10) / 10;

/**
 * One foot, rotated outward about the ankle so it points away from the centre
 * line. `s` is +1 for the foot on the +x side and -1 for the mirrored one; the
 * big toe always sits on the inner edge.
 */
function foot(
  cx: number,
  w: number,
  top: number,
  bottom: number,
  s: 1 | -1,
  splay: number,
): string[] {
  const h = bottom - top;

  // outward means the toes swing away from the body centre line
  const rot = -s * splay;
  const rad = (rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // pivot at the ankle, so the leg joint stays put while the foot turns
  const px = cx;
  const py = top;
  const spin = (ax: number, ay: number): [number, number] => {
    const dx = ax - px;
    const dy = ay - py;
    return [px + dx * cos - dy * sin, py + dx * sin + dy * cos];
  };

  /** fractional foot coords -> rotated absolute point */
  const at = (fx: number, fy: number) => spin(cx + s * w * fx, top + h * fy);
  const pt = (fx: number, fy: number) => {
    const [X, Y] = at(fx, fy);
    return `${n(X)} ${n(Y)}`;
  };

  // dorsum: narrow at the ankle, widening only gently to the ball of the foot
  const body =
    `M${pt(-0.18, 0)}` +
    `C${pt(-0.28, 0.26)} ${pt(-0.33, 0.5)} ${pt(-0.33, 0.66)}` +
    `Q${pt(-0.32, 0.74)} ${pt(-0.24, 0.75)}` +
    `L${pt(0.26, 0.72)}` +
    `Q${pt(0.34, 0.7)} ${pt(0.33, 0.62)}` +
    `C${pt(0.32, 0.42)} ${pt(0.24, 0.18)} ${pt(0.17, 0)}` +
    `Z`;

  /**
   * Five toes as [offset, centre-y, rx, ry] in fractions of the foot box, inner
   * to outer. Spacing and size are deliberately uneven — the big toe is much
   * larger and sits slightly apart. An even row of same-sized beads reads as a
   * flipper, not a foot. Each is rotated with the foot.
   */
  const TOES: [number, number, number, number][] = [
    [-0.27, 0.8, 0.085, 0.21],
    [-0.09, 0.815, 0.062, 0.17],
    [0.03, 0.81, 0.055, 0.152],
    [0.14, 0.795, 0.048, 0.134],
    [0.235, 0.775, 0.042, 0.115],
  ];

  const toes = TOES.map(([ox, oy, orx, ory]) => {
    const [ecx, ecy] = at(ox, oy);
    const rx = w * orx;
    const ry = h * ory;
    // the ellipse turns with the foot, so its own x-axis carries the rotation
    const dx = rx * cos;
    const dy = rx * sin;
    const x1 = n(ecx - dx);
    const y1 = n(ecy - dy);
    const x2 = n(ecx + dx);
    const y2 = n(ecy + dy);
    return (
      `M${x1} ${y1}` +
      `a${n(rx)} ${n(ry)} ${rot} 1 0 ${n(x2 - x1)} ${n(y2 - y1)}` +
      `a${n(rx)} ${n(ry)} ${rot} 1 0 ${n(x1 - x2)} ${n(y1 - y2)}` +
      `Z`
    );
  });

  /**
   * Extensor tendons fanning from the ankle to the toe bases. Every other part
   * of the figure is built from separate shapes whose outlines read as muscle
   * separation; without these the foot is one blank slab and looks flat next to
   * the rest of the body.
   */
  const tendons = [0, 1, 2].map((i) => {
    const xTop = -0.02 + i * 0.075;
    const xBot = -0.15 + i * 0.145;
    return (
      `M${pt(xTop - 0.016, 0.22)}` +
      `C${pt(xTop - 0.03, 0.4)} ${pt(xBot - 0.035, 0.54)} ${pt(xBot - 0.03, 0.66)}` +
      `L${pt(xBot + 0.03, 0.65)}` +
      `C${pt(xBot + 0.032, 0.53)} ${pt(xTop + 0.03, 0.4)} ${pt(xTop + 0.016, 0.22)}` +
      `Z`
    );
  });

  return [body, ...tendons, ...toes];
}

export function feetPart(gender: Gender, view: BodyView): BodyPart | null {
  if (view !== "front") return null; // the back view shows heels, already fine
  const b = BOX[gender];
  return {
    slug: "feet",
    path: {
      right: foot(b.center + b.span, b.width, b.top, b.bottom, 1, b.splay),
      left: foot(b.center - b.span, b.width, b.top, b.bottom, -1, b.splay),
    },
  };
}
