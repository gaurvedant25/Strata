import type { BodyPart } from "./types";
import type { BodyView } from "./index";

/**
 * The vendored female figure wears long flowing hair and a fairly large head.
 * The hair is dropped and the head replaced with a plain oval here, without touching the
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

/**
 * Plain oval heads for both views.
 *
 * The vendored head path is drawn *with* a hairline, so its scalp carries a
 * cutout where the hair used to sit. With the hair gone that notch is exposed,
 * and scaling the path just scales the notch — so the head is replaced outright
 * rather than resized. Each oval is sized to the head it replaces and reaches
 * far enough down to meet the neck.
 */
export function femaleHead(view: BodyView): BodyPart {
  // front neck starts at y250, back neck at y218 — the ovals overlap them
  const o =
    view === "front"
      ? { cx: 320, cy: 174, rx: 60, ry: 80 }
      : { cx: 1109, cy: 158, rx: 63, ry: 84 };
  return {
    slug: "head",
    path: { common: [ellipse(o.cx, o.cy, o.rx, o.ry)] },
  };
}
