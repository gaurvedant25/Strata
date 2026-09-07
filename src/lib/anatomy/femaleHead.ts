import type { BodyPart } from "./types";
import type { BodyView } from "./index";

/**
 * The vendored female figure wears long flowing hair, and its head path is
 * drawn *with* a hairline — so the scalp carries a cutout where the hair sat.
 * The hair is dropped and the head redrawn here, without touching the
 * third-party path data.
 *
 * Measured from the female figure's own coordinate space:
 *   front: head x248..393 y85..243, neck from y250
 *   back:  no head part at all, hair x998..1220
 *
 * Two catches worth knowing:
 *  - From behind, the hair *is* the head. Removing it leaves the back headless,
 *    so there the hair slot becomes the head.
 *  - cx is the body's centre line, not the old hair's. Every part of the back
 *    figure centres on 1143; the hair measured 1109 because its draping strands
 *    pulled the bounding box off-axis, and an off-centre head reads as a tilt.
 */

const n = (v: number) => Math.round(v * 10) / 10;

/**
 * Half a head outline, given as fractions: x of the half-width, y of the
 * height, from the crown down to the chin. Mirrored to make the other half.
 *
 * The proportions matter more than the curve maths. An outline that reaches
 * full width late and tapers to a point reads as a teardrop rather than a
 * head, so the widest part sits high (the temple, around a third down), holds
 * through the cheekbone, and turns the corner at the jaw angle into a chin
 * that is rounded rather than pointed.
 */
type Half = {
  /** Control x for the crown dome: lower is a flatter, rounder top. */
  crown: number;
  /** Where the head is at its widest, as a fraction of its height. */
  temple: number;
  /** [x, y] of the jaw angle — the corner the jawline turns at. */
  gonion: [number, number];
  /** Half-width of the chin, so it ends blunt instead of pointed. */
  chin: number;
};

function headPath(cx: number, top: number, h: number, hw: number, s: Half) {
  const x = (f: number) => n(cx + hw * f);
  const y = (f: number) => n(top + h * f);
  const [gx, gy] = s.gonion;
  const side = (d: 1 | -1) => {
    const X = (f: number) => x(f * d);
    return (
      // crown: a dome from the apex out to the widest point
      `C${X(s.crown)} ${y(0)} ${X(1)} ${y(s.temple * 0.38)} ${X(1)} ${y(s.temple)}` +
      // temple holding width down through the cheekbone to the jaw angle
      `C${X(1)} ${y(s.temple + (gy - s.temple) * 0.55)} ${X((1 + gx) / 2)} ${y(gy - 0.05)} ${X(gx)} ${y(gy)}` +
      // jawline turning in to the chin
      `C${X(gx * 0.78)} ${y(gy + (1 - gy) * 0.55)} ${X(s.chin * 1.9)} ${y(0.97)} ${X(s.chin)} ${y(1)}`
    );
  };
  // down the right side, across the chin, back up the left
  return (
    `M${n(cx)} ${y(0)}${side(1)}L${x(-s.chin)} ${y(1)}` +
    // the left side reversed: same curve, run upward
    `C${x(-s.chin * 1.9)} ${y(0.97)} ${x(-gx * 0.78)} ${y(gy + (1 - gy) * 0.55)} ${x(-gx)} ${y(gy)}` +
    `C${x(-(1 + gx) / 2)} ${y(gy - 0.05)} ${x(-1)} ${y(s.temple + (gy - s.temple) * 0.55)} ${x(-1)} ${y(s.temple)}` +
    `C${x(-1)} ${y(s.temple * 0.38)} ${x(-s.crown)} ${y(0)} ${n(cx)} ${y(0)}` +
    `Z`
  );
}

/**
 * Front gets a defined jaw and chin. The back is the cranium seen from behind,
 * so it is fuller and squarer through the jaw — there is no chin to show.
 */
export function femaleHead(view: BodyView): BodyPart {
  const o =
    view === "front"
      ? {
          cx: 320,
          top: 100,
          h: 158,
          hw: 60,
          s: {
            crown: 0.55,
            temple: 0.34,
            gonion: [0.78, 0.7],
            chin: 0.2,
          } as Half,
        }
      : {
          cx: 1143,
          top: 82,
          h: 164,
          hw: 63,
          s: {
            crown: 0.6,
            temple: 0.33,
            gonion: [0.88, 0.74],
            chin: 0.34,
          } as Half,
        };
  return {
    slug: "head",
    path: { common: [headPath(o.cx, o.top, o.h, o.hw, o.s)] },
  };
}
