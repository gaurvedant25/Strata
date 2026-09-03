import type { Gender } from "../../types";
import type { MuscleGroup } from "../strength";
import { bodyBack } from "./bodyBack";
import { bodyFemaleBack } from "./bodyFemaleBack";
import { bodyFemaleFront } from "./bodyFemaleFront";
import { bodyFront } from "./bodyFront";
import { femaleHead } from "./femaleHead";
import type { BodyPart } from "./types";

export type { BodyPart };
export type BodyView = "front" | "back";

/**
 * The source artwork draws front and back on one wide canvas, so each figure is
 * a different window onto it rather than a different coordinate space — and the
 * four windows are all different sizes, framing figures that are themselves
 * drawn at different scales. Since the container was sized from the front view
 * alone, a differently-shaped back view got letterboxed inside it: the female
 * back rendered at 94.8% of her front, so the figure visibly shrank on turning.
 *
 * So the frame is derived per view instead of taken from the source: each one
 * is sized from the height of the figure actually drawn in it, giving every
 * figure the same height on screen and the same margin around it. Turning no
 * longer changes the size of anything.
 *
 * BOX is the union bounding box of each figure as drawn — [centre x, centre y,
 * height] — measured in the browser, and re-measured whenever parts are added
 * or removed, since that moves the box.
 */
const BOX: Record<Gender, Record<BodyView, [number, number, number]>> = {
  male: { front: [364, 664, 1135], back: [1084, 693, 1193] },
  female: { front: [320, 701, 1193], back: [1143, 724, 1278] },
};

/** Share of the frame's height the figure fills; the rest is breathing room. */
const FILL = 0.92;
/** Frame width as a share of its height. Wide enough for the broadest figure. */
export const ASPECT = 0.44;

function frame(gender: Gender, view: BodyView) {
  const [cx, cy, h] = BOX[gender][view];
  const fh = h / FILL;
  const fw = fh * ASPECT;
  const r = (v: number) => Math.round(v * 10) / 10;
  return `${r(cx - fw / 2)} ${r(cy - fh / 2)} ${r(fw)} ${r(fh)}`;
}

const DATA: Record<Gender, Record<BodyView, BodyPart[]>> = {
  male: { front: bodyFront, back: bodyBack },
  female: { front: bodyFemaleFront, back: bodyFemaleBack },
};

/**
 * Which scored region each drawn muscle belongs to. Anything mapped to null is
 * structure (head, hands, joints) or has no benchmark lift behind it (abs,
 * obliques) — it renders neutral and isn't clickable.
 */
const SLUG_GROUP: Record<string, MuscleGroup | null> = {
  chest: "chest",
  deltoids: "shoulders",
  trapezius: "back",
  "upper-back": "back",
  "lower-back": "back",
  biceps: "arms",
  triceps: "arms",
  forearm: "arms",
  quadriceps: "legs",
  hamstring: "legs",
  calves: "legs",
  tibialis: "legs",
  adductors: "legs",
  gluteal: "glutes",
  // structure / unscored
  abs: null,
  obliques: null,
  neck: null,
  head: null,
  hair: null,
  hands: null,
  knees: null,
  ankles: null,
  feet: null,
};

export function groupForSlug(slug: string): MuscleGroup | null {
  return SLUG_GROUP[slug] ?? null;
}

/**
 * Extremities are dropped from every figure: limbs stop at the wrist and the
 * calf. None of them carries a scored region, and the source drawings are the
 * weakest part of the artwork — flat slabs for feet, splayed fingers for hands.
 *
 * The ankles go with the feet rather than staying behind: they are drawn as
 * narrow tapering wedges that only read as ankles because a foot sits under
 * them, and on their own they hang off the calves as spikes.
 */
const DROPPED = new Set(["feet", "hands", "ankles"]);

export function anatomy(gender: Gender, view: BodyView) {
  let parts = DATA[gender][view].filter((p) => !DROPPED.has(p.slug));

  // The female figure loses its hair and gets a redrawn head. Front drops the
  // hair and replaces the head; back has no head part at all — the hair is the
  // head from behind — so there the hair slot becomes the head.
  if (gender === "female") {
    parts =
      view === "front"
        ? parts
            .filter((p) => p.slug !== "hair")
            .map((p) => (p.slug === "head" ? femaleHead("front") : p))
        : parts.map((p) => (p.slug === "hair" ? femaleHead("back") : p));
  }

  return { parts, viewBox: frame(gender, view) };
}

/** Every path of a part, flattened — left/right/common are just draw sides. */
export function partPaths(p: BodyPart): string[] {
  return [...(p.path.left ?? []), ...(p.path.right ?? []), ...(p.path.common ?? [])];
}
