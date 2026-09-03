import type { BodyPart } from "./types";

/**
 * The vendored female figure wears long flowing hair and a fairly large head.
 * The hair is dropped and the face scaled down here, without touching the
 * third-party path data.
 *
 * Measured from the female figure's own coordinate space:
 *   front (viewBox "-50 -40 734 1538"): head x248..393 y85..243, hair x176..398 y0..270
 *   back  (viewBox "756 0 774 1448"):   no head part at all, hair x998..1220 y0..269
 *
 * That asymmetry is the catch: from behind, the hair *is* the head. Removing it
 * outright leaves the back view headless, so the back gets a plain skull in its
 * place while the front simply drops the part.
 */

const n = (v: number) => Math.round(v * 10) / 10;

function ellipse(cx: number, cy: number, rx: number, ry: number) {
  return `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(rx * 2)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-rx * 2)} 0Z`;
}

/** Plain skull for the back view, sized to the head the front view shows. */
export function femaleBackHead(): BodyPart {
  return {
    slug: "head",
    path: { common: [ellipse(1109, 158, 66, 88)] },
  };
}

/**
 * Shrinks the face about the neck join, so it scales down without floating off
 * the neck. translate(c(1-s)) scale(s) is the compact form of
 * translate(c) scale(s) translate(-c).
 */
export function femaleHeadTransform(): string {
  const s = 0.88;
  const cx = 320; // head centre
  const cy = 248; // where the head meets the neck
  return `translate(${n(cx * (1 - s))} ${n(cy * (1 - s))}) scale(${s})`;
}
