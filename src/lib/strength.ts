import type { Exercise, Gender, Session } from "../types";
import { personalRecords } from "./stats";

/** Regions the body map scores. Front view shows the first four; back view the last two. */
export type MuscleGroup = "shoulders" | "chest" | "arms" | "legs" | "back" | "glutes";

export const FRONT_GROUPS: MuscleGroup[] = ["shoulders", "chest", "arms", "legs"];
export const BACK_GROUPS: MuscleGroup[] = ["back", "glutes"];

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  shoulders: "Shoulders",
  chest: "Chest",
  arms: "Arms",
  legs: "Legs",
  back: "Back",
  glutes: "Glutes",
};

/** The one lift each region is scored against — all present in the seeded library. */
export const CANONICAL_LIFT: Record<MuscleGroup, string> = {
  shoulders: "Overhead Press",
  chest: "Barbell Bench Press",
  arms: "Barbell Curl",
  legs: "Back Squat",
  back: "Deadlift",
  glutes: "Hip Thrust",
};

/** Six rungs. Beginner is the floor - below the first threshold. */
export const TIERS = ["Beginner", "Novice", "Bronze", "Silver", "Gold", "Elite"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_COLOR: Record<Tier, string> = {
  Beginner: "#55555c",
  Novice: "#6f4a2d",
  Bronze: "#b5713a",
  Silver: "#b9bec9",
  Gold: "#e8b33a",
  Elite: "#a065f0",
};

/**
 * Bodyweight multiples at the entry to each tier above Beginner, i.e.
 * [Novice, Bronze, Silver, Gold, Elite]. Approximated from commonly published
 * strength-standard charts, split by sex because the distributions genuinely
 * differ. A rough compass for a personal log, not a certified table.
 */
const STANDARDS: Record<MuscleGroup, Record<Gender, number[]>> = {
  chest: { male: [0.5, 0.75, 1.0, 1.5, 2.0], female: [0.27, 0.4, 0.6, 0.9, 1.25] },
  legs: { male: [0.75, 1.0, 1.5, 2.0, 2.5], female: [0.5, 0.75, 1.0, 1.5, 2.0] },
  shoulders: { male: [0.35, 0.5, 0.7, 0.9, 1.2], female: [0.2, 0.3, 0.45, 0.6, 0.8] },
  arms: { male: [0.25, 0.35, 0.5, 0.7, 0.9], female: [0.15, 0.2, 0.3, 0.45, 0.6] },
  back: { male: [1.0, 1.5, 1.75, 2.25, 2.75], female: [0.6, 1.0, 1.25, 1.75, 2.25] },
  glutes: { male: [1.0, 1.5, 2.0, 2.5, 3.0], female: [0.75, 1.25, 1.75, 2.25, 2.75] },
};

/** Score at each threshold; below the first one it ramps from 0. */
const SCORE_AT_TIER = [0.2, 0.4, 0.6, 0.8, 1.0];

function scoreFromRatio(ratio: number, points: number[]): { score: number; tier: Tier } {
  const xs = [0, ...points];
  const ys = [0, ...SCORE_AT_TIER];
  let tier: Tier = TIERS[0];
  for (let i = 0; i < points.length; i++) if (ratio >= points[i]) tier = TIERS[i + 1];

  for (let i = 1; i < xs.length; i++) {
    if (ratio <= xs[i] || i === xs.length - 1) {
      const span = xs[i] - xs[i - 1];
      const t = span === 0 ? 1 : Math.min(1, Math.max(0, (ratio - xs[i - 1]) / span));
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
    const exercise = exercises.find((e) => e.name === lift);
    const pr = exercise ? prs.get(exercise.id) : undefined;
    if (!pr || pr.bestE1rm <= 0) continue;
    const ratio = pr.bestE1rm / bodyweight;
    const { score, tier } = scoreFromRatio(ratio, STANDARDS[muscle][gender]);
    out[muscle] = { ratio, score, tier, color: TIER_COLOR[tier], best1rm: pr.bestE1rm, lift };
  }
  return out;
}
