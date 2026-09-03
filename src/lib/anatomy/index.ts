import type { Gender } from "../../types";
import type { MuscleGroup } from "../strength";
import { bodyBack } from "./bodyBack";
import { bodyFemaleBack } from "./bodyFemaleBack";
import { bodyFemaleFront } from "./bodyFemaleFront";
import { bodyFront } from "./bodyFront";
import { feetPart } from "./feet";
import { femaleBackHead, femaleHeadTransform } from "./femaleHead";
import type { BodyPart } from "./types";

export type { BodyPart };
export type BodyView = "front" | "back";

/**
 * The source artwork draws front and back on one wide canvas, so each figure is
 * a different window onto it rather than a different coordinate space.
 */
const VIEWBOX: Record<Gender, Record<BodyView, string>> = {
  male: { front: "0 0 724 1448", back: "724 0 724 1448" },
  female: { front: "-50 -40 734 1538", back: "756 0 774 1448" },
};

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

export function anatomy(gender: Gender, view: BodyView) {
  const source = DATA[gender][view];
  // Front swaps in the redrawn feet; back drops its feet altogether, since from
  // behind the original renders them as flat slabs below the ankles.
  let parts =
    view === "front"
      ? source.map((p) => (p.slug === "feet" ? feetPart(gender) : p))
      : source.filter((p) => p.slug !== "feet");

  // The female figure loses its hair and gets a slightly smaller face. On the
  // back there is no head part — the hair is the head — so that view swaps in a
  // plain skull rather than dropping the part and going headless.
  if (gender === "female") {
    parts =
      view === "front"
        ? parts
            .filter((p) => p.slug !== "hair")
            .map((p) => (p.slug === "head" ? { ...p, transform: femaleHeadTransform() } : p))
        : parts.map((p) => (p.slug === "hair" ? femaleBackHead() : p));
  }

  return { parts, viewBox: VIEWBOX[gender][view] };
}

/** Every path of a part, flattened — left/right/common are just draw sides. */
export function partPaths(p: BodyPart): string[] {
  return [...(p.path.left ?? []), ...(p.path.right ?? []), ...(p.path.common ?? [])];
}
