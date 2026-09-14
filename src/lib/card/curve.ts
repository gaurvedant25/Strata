import { chartGeom } from "../chart";
import type { Layout } from "./draw";

/**
 * The lift's curve, drawn onto a card.
 *
 * The geometry is `chartGeom` — the same function the Progress screen's
 * sparkline uses — so the shape on a card is the shape on the screen it came
 * from, not a second implementation that happens to look similar. Only the
 * inking is different: no scrub rule, no date labels, no entrance, and a
 * heavier line, because a card is read across a room rather than under a
 * thumb.
 *
 * Two inkings are asked for. The card that leads with the curve draws it in
 * white with a dot per session; the card that leads with a percentage drops
 * the same series to the tone just off black, fills underneath it and lets it
 * bleed off both edges, where it is scenery rather than a chart.
 */
export function drawCurve(
  L: Layout,
  box: { x: number; y: number; w: number; h: number },
  values: number[],
  {
    color,
    markers = "dots",
    lineWidth = 0.45,
    fill,
    fillTo,
    head,
  }: {
    color: string;
    /** A dot per session, filled or outlined, or nothing but the line. */
    markers?: "dots" | "hollow" | "none";
    lineWidth?: number;
    /** Fills the area under the line, down to `fillTo`. */
    fill?: string;
    fillTo?: number;
    /** The last point, called out. `{ r, color }` in units. */
    head?: { r: number; color: string };
  },
) {
  const { ctx, u } = L;
  if (!values.length) return;

  const { pts } = chartGeom(values, {
    width: box.w * u,
    padT: 0,
    inner: box.h * u,
  });
  const ox = box.x * u;
  const oy = box.y * u;
  const at = (i: number) => ({ x: ox + pts[i].x, y: oy + pts[i].y });

  ctx.save();
  const trace = () => {
    ctx.beginPath();
    pts.forEach((_, i) => {
      const p = at(i);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
  };

  if (fill && fillTo != null) {
    trace();
    // Closed down to a floor rather than to the box, so the ghost sits on the
    // card's own baseline and the shape underneath it stays a solid mass.
    ctx.lineTo(at(pts.length - 1).x, fillTo * u);
    ctx.lineTo(at(0).x, fillTo * u);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth * u;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  trace();
  ctx.stroke();

  if (markers !== "none") {
    // A dot per session, and — unless a head has been asked for separately —
    // the latest one filled solid and larger: the point of the curve on a card
    // is where it has got to, not where it has been.
    const upto = head ? pts.length - 1 : pts.length;
    for (let i = 0; i < upto; i++) {
      const p = at(i);
      const last = i === pts.length - 1;
      const r = (last ? 1.05 : markers === "hollow" ? 0.63 : 0.5) * u;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      if (markers === "hollow" && !last) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.37 * u;
        ctx.stroke();
      } else {
        ctx.globalAlpha = last ? 1 : 0.5;
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  if (head) {
    const p = at(pts.length - 1);
    ctx.beginPath();
    ctx.arc(p.x, p.y, head.r * u, 0, Math.PI * 2);
    ctx.fillStyle = head.color;
    ctx.fill();
  }
  ctx.restore();
}
