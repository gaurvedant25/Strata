import type { Gender } from "../../types";
import type { MuscleGroup } from "../strength";
import { BACK_GROUPS, FRONT_GROUPS } from "../strength";
import type { BodyView } from ".";

/** Where a leader line lands, as a fraction of the figure's own box. */
export type Anchor = [x: number, y: number];

/** A region's two landing points — one per side of the body. */
export type SideAnchors = { left: Anchor; right: Anchor };

/**
 * Where each region's leader lines land, per figure and per side.
 *
 * Measured rather than eyeballed: every number is the centre of the bounding
 * box of that muscle's own paths on that side of that drawing, converted to a
 * fraction of the figure's box the way the callout SVG reads it. Re-measure
 * whenever the artwork or the framing in `BOX` changes.
 *
 * Two things this replaces are worth naming, because both were visible.
 *
 * There used to be one table for both figures, with the right-hand line drawn
 * by mirroring the left one. So the female figure — narrower shoulders, higher
 * waist, a different frame entirely — was annotated with the male figure's
 * geometry, and every line on her landed somewhere near the muscle rather than
 * on it. Each figure now carries its own measurements.
 *
 * And because a mirrored anchor is the same point twice, the two lines out of a
 * midline region — chest, traps, the lower back — left from a single spot and
 * read as one line forking, unlike the biceps or the shoulders whose lines
 * plainly come from two different muscles. Left and right are measured
 * separately here, so the chest's lines leave from the left and the right pec.
 *
 * A region is listed only for the views it is actually drawn in. That absence
 * is load-bearing: it is what stops the back of the figure from answering a
 * question about the chest.
 */
export const ANCHORS: Record<
  Gender,
  Record<BodyView, Partial<Record<MuscleGroup, SideAnchors>>>
> = {
  male: {
    front: {
      chest: { left: [0.395, 0.28], right: [0.605, 0.281] },
      shoulders: { left: [0.265, 0.261], right: [0.735, 0.261] },
      biceps: { left: [0.202, 0.336], right: [0.798, 0.336] },
      triceps: { left: [0.246, 0.336], right: [0.755, 0.336] },
      forearms: { left: [0.142, 0.445], right: [0.858, 0.445] },
      traps: { left: [0.39, 0.219], right: [0.61, 0.219] },
      abs: { left: [0.444, 0.43], right: [0.556, 0.43] },
      obliques: { left: [0.351, 0.403], right: [0.65, 0.403] },
      quadriceps: { left: [0.352, 0.609], right: [0.648, 0.609] },
      calves: { left: [0.359, 0.848], right: [0.641, 0.848] },
    },
    back: {
      shoulders: { left: [0.261, 0.254], right: [0.737, 0.254] },
      triceps: { left: [0.229, 0.33], right: [0.769, 0.33] },
      forearms: { left: [0.148, 0.435], right: [0.85, 0.435] },
      traps: { left: [0.425, 0.277], right: [0.573, 0.277] },
      lats: { left: [0.37, 0.327], right: [0.628, 0.327] },
      lowerBack: { left: [0.405, 0.406], right: [0.593, 0.406] },
      quadriceps: { left: [0.45, 0.595], right: [0.548, 0.595] },
      hamstrings: { left: [0.368, 0.631], right: [0.631, 0.631] },
      glutes: { left: [0.403, 0.504], right: [0.595, 0.504] },
      calves: { left: [0.364, 0.818], right: [0.634, 0.818] },
    },
  },
  female: {
    front: {
      chest: { left: [0.406, 0.264], right: [0.596, 0.264] },
      shoulders: { left: [0.294, 0.229], right: [0.708, 0.229] },
      biceps: { left: [0.256, 0.303], right: [0.745, 0.303] },
      triceps: { left: [0.266, 0.328], right: [0.735, 0.328] },
      forearms: { left: [0.16, 0.402], right: [0.842, 0.402] },
      traps: { left: [0.401, 0.2], right: [0.601, 0.2] },
      abs: { left: [0.442, 0.397], right: [0.56, 0.397] },
      obliques: { left: [0.366, 0.366], right: [0.636, 0.366] },
      quadriceps: { left: [0.374, 0.569], right: [0.627, 0.569] },
      calves: { left: [0.405, 0.842], right: [0.597, 0.842] },
    },
    back: {
      shoulders: { left: [0.306, 0.233], right: [0.695, 0.233] },
      triceps: { left: [0.27, 0.296], right: [0.729, 0.296] },
      forearms: { left: [0.185, 0.393], right: [0.815, 0.393] },
      traps: { left: [0.408, 0.242], right: [0.591, 0.242] },
      lats: { left: [0.403, 0.299], right: [0.596, 0.299] },
      lowerBack: { left: [0.425, 0.39], right: [0.574, 0.39] },
      quadriceps: { left: [0.451, 0.61], right: [0.548, 0.61] },
      hamstrings: { left: [0.36, 0.606], right: [0.64, 0.606] },
      glutes: { left: [0.389, 0.481], right: [0.61, 0.481] },
      calves: { left: [0.411, 0.805], right: [0.588, 0.805] },
    },
  },
};

/** The lines for a region, or nothing if this side of the figure has no such muscle. */
export function anchorsFor(
  gender: Gender,
  view: BodyView,
  group: MuscleGroup,
): SideAnchors | undefined {
  return ANCHORS[gender][view][group];
}

/** Whether the region is drawn at all on the side of the figure being shown. */
export function drawnInView(
  gender: Gender,
  view: BodyView,
  group: MuscleGroup,
): boolean {
  return !!ANCHORS[gender][view][group];
}

/**
 * The regions this side of the figure can show, in reading order.
 *
 * The side's own regions first — that is what makes the back open on the traps
 * rather than on whichever shoulder happens to sort first — then the rest of
 * what the drawing happens to carry.
 */
export function groupsInView(gender: Gender, view: BodyView): MuscleGroup[] {
  const order =
    view === "front"
      ? [...FRONT_GROUPS, ...BACK_GROUPS]
      : [...BACK_GROUPS, ...FRONT_GROUPS];
  return order.filter((g) => drawnInView(gender, view, g));
}
