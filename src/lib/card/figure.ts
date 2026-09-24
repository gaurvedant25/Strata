import { EDGE, SKIN, STRUCTURE, shift } from "../../components/BodyMap";
import { anatomy, groupForSlug, partPaths } from "../anatomy";
import type { MuscleGroup, MuscleScore } from "../strength";
import type { BodyView } from "../anatomy";
import type { Gender } from "../../types";
import type { Layout } from "./draw";

/**
 * The body chart, drawn onto a canvas.
 *
 * The same picture as `Figure` in `BodyMap`, by the same rules and out of the
 * same path data — `new Path2D(d)` takes the anatomy strings verbatim, so the
 * artwork is not duplicated anywhere, only re-inked. The tones and the sheen
 * helper are imported from the component rather than copied, so a change to
 * either moves the screen and the card together.
 *
 * Two things are deliberately not carried over. The ten-layer depth laminate
 * exists to give a figure you can *turn* some volume, and a still card is at
 * rest, where it only smears. And the glow is left off: a shared card draws
 * the figure flat, with each muscle in its tier's colour and nothing around it.
 */

/** Parsed once per path string and kept for the life of the app. */
const cache = new Map<string, { path: Path2D; bb: [number, number, number, number] }>();

/**
 * A loose bounding box for a path, read straight out of its `d` string.
 *
 * SVG gradients here are `objectBoundingBox`, so every path gets its own sheen
 * — which is why the left and right delt each catch the light rather than
 * sharing one gradient across the whole body. Canvas has no way to ask a path
 * how big it is, so the numbers are pulled out of the path data and the
 * extremes taken. Control points overshoot the true outline slightly; for the
 * direction of a sheen that difference is invisible.
 */
function boxOf(d: string): [number, number, number, number] {
  const nums = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  if (nums) {
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = Number(nums[i]);
      const y = Number(nums[i + 1]);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!isFinite(minX)) return [0, 0, 1, 1];
  return [minX, minY, maxX - minX || 1, maxY - minY || 1];
}

function pathOf(d: string) {
  let hit = cache.get(d);
  if (!hit) {
    hit = { path: new Path2D(d), bb: boxOf(d) };
    cache.set(d, hit);
  }
  return hit;
}

export type FigureBox = { x: number; y: number; w: number; h: number };

/**
 * Draws the figure to fit inside `box`, centred, and returns the space it
 * actually took — the artwork is a fixed tall rectangle, so it almost never
 * fills a box exactly and anything placed beside it needs to know.
 */
export function drawFigure(
  L: Layout,
  box: FigureBox,
  {
    gender,
    view,
    scores,
  }: {
    gender: Gender;
    view: BodyView;
    scores: Partial<Record<MuscleGroup, MuscleScore>>;
  },
): FigureBox {
  const { ctx, u } = L;
  const { parts, viewBox } = anatomy(gender, view);
  const [vx, vy, vw, vh] = viewBox.split(" ").map(Number);

  const scale = Math.min((box.w * u) / vw, (box.h * u) / vh);
  const drawnW = (vw * scale) / u;
  const drawnH = (vh * scale) / u;
  const originX = (box.x + (box.w - drawnW) / 2) * u;
  const originY = (box.y + (box.h - drawnH) / 2) * u;

  ctx.save();
  // Built on whatever transform is already in force rather than replacing it,
  // so a figure drawn inside a card's moveable layer moves with that layer.
  ctx.translate(originX - vx * scale, originY - vy * scale);
  ctx.scale(scale, scale);

  // The muscles, each with its own sheen. No glow: on a card the figure is
  // drawn flat, so the tier colours read as colours rather than as light.
  for (const part of parts) {
    const group = groupForSlug(part.slug);
    const sc = group ? scores[group] : undefined;
    for (const d of partPaths(part)) {
      const { path, bb } = pathOf(d);
      if (sc) {
        const g = ctx.createLinearGradient(
          bb[0],
          bb[1],
          bb[0] + bb[2] * 0.25,
          bb[1] + bb[3],
        );
        g.addColorStop(0, shift(sc.color, 0.5));
        g.addColorStop(0.55, sc.color);
        g.addColorStop(1, shift(sc.color, -0.28));
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.8 + sc.score * 0.2;
      } else {
        ctx.fillStyle = group ? SKIN : STRUCTURE;
        ctx.globalAlpha = 1;
      }
      ctx.fill(path);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = 1.5;
      ctx.stroke(path);
    }
  }

  ctx.restore();
  return {
    x: originX / u,
    y: originY / u,
    w: drawnW,
    h: drawnH,
  };
}
