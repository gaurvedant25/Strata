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
 * rest, where it only smears. And the two stacked CSS drop-shadows become two
 * canvas shadow passes — which is where the one real trap in this file lives,
 * below.
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
  ctx.setTransform(scale, 0, 0, scale, originX - vx * scale, originY - vy * scale);

  // Everything lit, grouped by muscle. One glow per group rather than per
  // path: the paths of a group touch, so the halo is the same picture, and it
  // is a third of the fills.
  const lit = new Map<MuscleGroup, Path2D>();
  for (const part of parts) {
    const group = groupForSlug(part.slug);
    if (!group || !scores[group]) continue;
    let p = lit.get(group);
    if (!p) {
      p = new Path2D();
      lit.set(group, p);
    }
    for (const d of partPaths(part)) p.addPath(pathOf(d).path);
  }

  /*
   * The trap.
   *
   * `shadowBlur` is measured in the canvas' own pixels and is NOT scaled by
   * the transform, unlike every other length here. The figure on a card is
   * drawn some three times the size it appears on screen, so the component's
   * radii have to be multiplied by the scale by hand. Left alone, the glow
   * comes out as a hairline rim and the whole card looks dead.
   */
  for (const [group, path] of lit) {
    const sc = scores[group]!;
    ctx.save();
    ctx.fillStyle = sc.color;
    ctx.shadowColor = sc.color;
    ctx.shadowBlur = (3 + sc.score * 7) * scale;
    ctx.fill(path);
    ctx.shadowBlur = (9 + sc.score * 20) * scale;
    ctx.fill(path);
    ctx.restore();
  }

  // Then the bodies of the muscles themselves, each with its own sheen.
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
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return {
    x: originX / u,
    y: originY / u,
    w: drawnW,
    h: drawnH,
  };
}
