import type { Exercise, Gender, Session } from "../types";
import { personalRecords, type PR } from "./stats";

/**
 * Regions the body map scores.
 *
 * Fourteen rather than six: an "arms" score that averaged a curl and a pushdown
 * told you nothing about either, and the artwork already draws biceps, triceps
 * and forearms as separate paths, so the map could always show more than the
 * model did.
 */
export type MuscleGroup =
  | "shoulders"
  | "chest"
  | "biceps"
  | "triceps"
  | "forearms"
  | "abs"
  | "obliques"
  | "quadriceps"
  | "hamstrings"
  | "calves"
  | "traps"
  | "lats"
  | "lowerBack"
  | "glutes";

/** Which side of the figure each region reads best from. */
export const FRONT_GROUPS: MuscleGroup[] = [
  "chest",
  "shoulders",
  "biceps",
  "forearms",
  "abs",
  "obliques",
  "quadriceps",
];
export const BACK_GROUPS: MuscleGroup[] = [
  "traps",
  "lats",
  "lowerBack",
  "triceps",
  "hamstrings",
  "calves",
  "glutes",
];

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  shoulders: "Shoulders",
  chest: "Chest",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  abs: "Abs",
  obliques: "Obliques",
  quadriceps: "Quads",
  hamstrings: "Hamstrings",
  calves: "Calves",
  traps: "Traps",
  lats: "Lats",
  lowerBack: "Lower back",
  glutes: "Glutes",
};

/**
 * How the regions are grouped for reading.
 *
 * Fourteen rows is a wall of text, but the split exists precisely because these
 * muscles progress separately, so rolling them back up into one score would
 * undo it. Grouping is presentation only: a section is a heading you can open,
 * never a score of its own, and chest, shoulders and glutes stay flat because
 * they have nothing under them to hide.
 */
export type RegionSection =
  | { kind: "single"; group: MuscleGroup }
  | { kind: "group"; id: string; label: string; children: MuscleGroup[] };

export const REGION_SECTIONS: RegionSection[] = [
  { kind: "single", group: "chest" },
  { kind: "single", group: "shoulders" },
  {
    kind: "group",
    id: "arms",
    label: "Arms",
    children: ["biceps", "triceps", "forearms"],
  },
  {
    kind: "group",
    id: "back",
    label: "Back",
    children: ["traps", "lats", "lowerBack"],
  },
  { kind: "group", id: "core", label: "Core", children: ["abs", "obliques"] },
  {
    kind: "group",
    id: "legs",
    label: "Legs",
    // Glutes sit here rather than alone: they are trained by the same sessions
    // as the rest of the leg, and a section of one is not a section.
    children: ["quadriceps", "hamstrings", "glutes", "calves"],
  },
];

/**
 * The one lift each region is scored against.
 *
 * Every one has to be loadable: a bodyweight movement logs added weight, which
 * is usually zero, and a zero can never produce a ratio. That rules out the
 * pull-up for lats and the hanging leg raise for abs, however well they train
 * them.
 */
export const CANONICAL_LIFT: Record<MuscleGroup, string> = {
  shoulders: "Overhead Press",
  chest: "Barbell Bench Press",
  biceps: "Barbell Curl",
  triceps: "Triceps Pushdown",
  forearms: "Hammer Curl",
  abs: "Cable Crunch",
  obliques: "Cable Woodchop",
  quadriceps: "Back Squat",
  hamstrings: "Romanian Deadlift",
  calves: "Standing Calf Raise",
  traps: "Barbell Shrug",
  lats: "Lat Pulldown",
  lowerBack: "Deadlift",
  glutes: "Hip Thrust",
};

/** Six rungs. Bronze is the floor - below the first threshold. */
export const TIERS = [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Titan",
] as const;
export type Tier = (typeof TIERS)[number];

/**
 * Chosen for dark mode: each one has to read as a glow against a black body,
 * and each has to be tellable from the rung either side of it at a glance.
 *
 * Platinum and Diamond share a hue — 175 and 179 degrees, near enough the same
 * teal — and are told apart by brightness instead, Diamond carrying some two
 * and a half times the luminance of Platinum. That is a deliberate pairing
 * rather than the accident it replaced: the earlier cyan and blue differed
 * slightly in both hue and brightness and so resolved in neither, where a dim
 * teal against a brilliant one separates cleanly and reads as the same metal,
 * brighter.
 *
 * Every rung is also set as small text — the tier name sits beside the muscle
 * group in its own colour — so each has to clear 4.5:1 against the darkest
 * ground it lands on, which is the selected card at #161616. Two did not:
 * Platinum was a dim teal at 4.4:1 and Titan a deep violet at 3.2:1, the tier
 * name effectively unreadable at the top of the ladder. Both have been lifted
 * to the same hue at a brightness that clears the bar (Platinum 6.1:1, Titan
 * 5.4:1) — Platinum keeps its place well below Diamond, and Titan is still
 * unmistakably the violet rung.
 */
export const TIER_COLOR: Record<Tier, string> = {
  Bronze: "#CD7F32",
  Silver: "#C0C0C0",
  Gold: "#FFD700",
  Platinum: "#12A79B",
  Diamond: "#00FFF9",
  Titan: "#AE6BF5",
};

/** What each rung says about the lifter, for anywhere a tier needs explaining. */
export const TIER_LEVEL: Record<Tier, string> = {
  Bronze: "Novice",
  Silver: "Intermediate",
  Gold: "Advanced",
  Platinum: "Dedicated Elite",
  Diamond: "Master",
  Titan: "Legend",
};

/**
 * Text colour to put on a solid patch of a tier colour.
 *
 * Picked by luminance rather than hardcoded, which is what let the palette
 * above be relit for contrast without touching anything here: every rung is
 * now light enough to take near-black text, where the darker violet Titan used
 * to be took white. A future palette change stays readable the same way.
 */
export function tierInk(hex: string): string {
  const v = parseInt(hex.slice(1), 16);
  const lum = [(v >> 16) & 255, (v >> 8) & 255, v & 255]
    .map((c) => {
      const x = c / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    })
    .reduce((t, c, i) => t + [0.2126, 0.7152, 0.0722][i] * c, 0);
  // contrast against near-black vs against white, whichever is higher
  return (lum + 0.05) / 0.0527 >= 1.05 / (lum + 0.05) ? "#0a0a0b" : "#ffffff";
}

/**
 * Bodyweight multiples at the entry to each tier above Bronze, i.e.
 * [Silver, Gold, Platinum, Diamond, Titan].
 *
 * These are estimates, and worth being blunt about: they are not taken from any
 * published dataset. The six original rows were approximated from commonly
 * cited strength-standard charts; the eight added when the regions were split
 * are looser still, because widely agreed figures for a shrug or a cable
 * woodchop do not really exist the way they do for a squat. Treat a tier as a
 * rough compass for your own progress over time, not as a ranking against
 * anybody else.
 */
const STANDARDS: Record<MuscleGroup, Record<Gender, number[]>> = {
  // — approximated from published charts —
  chest: {
    male: [0.5, 0.75, 1.0, 1.5, 2.0],
    female: [0.27, 0.4, 0.6, 0.9, 1.25],
  },
  shoulders: {
    male: [0.35, 0.5, 0.7, 0.9, 1.2],
    female: [0.2, 0.3, 0.45, 0.6, 0.8],
  },
  biceps: {
    male: [0.25, 0.35, 0.5, 0.7, 0.9],
    female: [0.15, 0.2, 0.3, 0.45, 0.6],
  },
  quadriceps: {
    male: [0.75, 1.0, 1.5, 2.0, 2.5],
    female: [0.5, 0.75, 1.0, 1.5, 2.0],
  },
  lowerBack: {
    male: [1.0, 1.5, 1.75, 2.25, 2.75],
    female: [0.6, 1.0, 1.25, 1.75, 2.25],
  },
  glutes: {
    male: [1.0, 1.5, 2.0, 2.5, 3.0],
    female: [0.75, 1.25, 1.75, 2.25, 2.75],
  },
  // — estimated, with no chart behind them —
  triceps: {
    male: [0.3, 0.45, 0.6, 0.8, 1.0],
    female: [0.18, 0.25, 0.35, 0.5, 0.65],
  },
  forearms: {
    male: [0.2, 0.3, 0.4, 0.55, 0.75],
    female: [0.12, 0.18, 0.25, 0.35, 0.5],
  },
  abs: {
    male: [0.3, 0.45, 0.6, 0.85, 1.1],
    female: [0.2, 0.3, 0.45, 0.6, 0.8],
  },
  obliques: {
    male: [0.25, 0.35, 0.5, 0.7, 0.9],
    female: [0.15, 0.25, 0.35, 0.5, 0.65],
  },
  hamstrings: {
    male: [0.75, 1.1, 1.4, 1.8, 2.25],
    female: [0.45, 0.7, 0.9, 1.25, 1.6],
  },
  calves: {
    male: [0.75, 1.25, 1.75, 2.25, 3.0],
    female: [0.5, 0.85, 1.25, 1.75, 2.25],
  },
  traps: {
    male: [0.75, 1.25, 1.75, 2.25, 3.0],
    female: [0.5, 0.8, 1.2, 1.6, 2.1],
  },
  lats: {
    male: [0.5, 0.75, 1.0, 1.25, 1.6],
    female: [0.35, 0.5, 0.7, 0.9, 1.2],
  },
};

/** Score at each threshold; below the first one it ramps from 0. */
const SCORE_AT_TIER = [0.2, 0.4, 0.6, 0.8, 1.0];

function scoreFromRatio(
  ratio: number,
  points: number[],
): { score: number; tier: Tier } {
  const xs = [0, ...points];
  const ys = [0, ...SCORE_AT_TIER];
  let tier: Tier = TIERS[0];
  for (let i = 0; i < points.length; i++)
    if (ratio >= points[i]) tier = TIERS[i + 1];

  for (let i = 1; i < xs.length; i++) {
    if (ratio <= xs[i] || i === xs.length - 1) {
      const span = xs[i] - xs[i - 1];
      const t =
        span === 0 ? 1 : Math.min(1, Math.max(0, (ratio - xs[i - 1]) / span));
      const score = ys[i - 1] + t * (ys[i] - ys[i - 1]);
      return { score: Math.min(1, Math.max(0, score)), tier };
    }
  }
  return { score: 1, tier };
}

export type MuscleScore = {
  ratio: number;
  score: number; // 0..1, drives glow intensity
  tier: Tier;
  color: string;
  best1rm: number;
  lift: string;
};

/**
 * The best record held under a given exercise name, across every exercise that
 * carries it.
 *
 * A library can hold the same name more than once — an import, a restore or a
 * re-seed leaves duplicates behind, and all but one of them have no history
 * against them. Resolving the name with `find` picks whichever copy happens to
 * come back first, so a region would blank out at random depending on which
 * one that was, even with years of the lift logged under its twin.
 */
export function bestNamed(
  exercises: Exercise[],
  prs: Map<string, PR>,
  name: string,
): PR | undefined {
  let best: PR | undefined;
  for (const e of exercises) {
    if (e.name !== name) continue;
    const pr = prs.get(e.id);
    if (pr && (!best || pr.bestE1rm > best.bestE1rm)) best = pr;
  }
  return best;
}

/** No bodyweight means nothing can be normalized, so every region stays unscored. */
export function computeMuscleScores(
  sessions: Session[],
  exercises: Exercise[],
  bodyweight: number | null,
  gender: Gender,
): Partial<Record<MuscleGroup, MuscleScore>> {
  const out: Partial<Record<MuscleGroup, MuscleScore>> = {};
  if (!bodyweight) return out;

  const prs = personalRecords(sessions.filter((s) => s.endedAt));
  for (const muscle of Object.keys(CANONICAL_LIFT) as MuscleGroup[]) {
    const lift = CANONICAL_LIFT[muscle];
    const pr = bestNamed(exercises, prs, lift);
    if (!pr || pr.bestE1rm <= 0) continue;
    const ratio = pr.bestE1rm / bodyweight;
    const { score, tier } = scoreFromRatio(ratio, STANDARDS[muscle][gender]);
    out[muscle] = {
      ratio,
      score,
      tier,
      color: TIER_COLOR[tier],
      best1rm: pr.bestE1rm,
      lift,
    };
  }
  return out;
}
