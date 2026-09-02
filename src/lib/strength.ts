import type { Exercise, Gender, Session } from "../types";
import { personalRecords } from "./stats";

export type MuscleGroup = "shoulders" | "chest" | "arms" | "legs";

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  shoulders: "Shoulders",
  chest: "Chest",
  arms: "Arms",
  legs: "Legs",
};

/** The one lift each region is scored against — picked to match the seeded
 *  exercise library so the map has data out of the box. */
export const CANONICAL_LIFT: Record<MuscleGroup, string> = {
  shoulders: "Overhead Press",
  chest: "Barbell Bench Press",
  arms: "Barbell Curl",
  legs: "Back Squat",
};

const TIERS = ["Beginner", "Novice", "Intermediate", "Advanced", "Elite"] as const;
export type Tier = (typeof TIERS)[number];

/**
 * Bodyweight multiples at each tier boundary (estimated 1RM ÷ bodyweight),
 * approximated from commonly published strength-standard charts. This is a
 * rough compass for a home workout log, not a certified or medical table.
 */
const STANDARDS: Record<MuscleGroup, Record<Gender, number[]>> = {
  chest: { male: [0.5, 0.75, 1.0, 1.5, 2.0], female: [0.27, 0.4, 0.6, 0.9, 1.25] },
  legs: { male: [0.75, 1.0, 1.5, 2.0, 2.5], female: [0.5, 0.75, 1.0, 1.5, 2.0] },
  shoulders: { male: [0.35, 0.5, 0.7, 0.9, 1.2], female: [0.2, 0.3, 0.45, 0.6, 0.8] },
  arms: { male: [0.25, 0.35, 0.5, 0.7, 0.9], female: [0.15, 0.2, 0.3, 0.45, 0.6] },
};

const SCORE_AT_TIER = [0.2, 0.4, 0.6, 0.8, 1.0];

function scoreFromRatio(ratio: number, points: number[]): { score: number; tier: Tier } {
  const xs = [0, ...points];
  const ys = [0, ...SCORE_AT_TIER];
  for (let i = 1; i < xs.length; i++) {
    if (ratio <= xs[i] || i === xs.length - 1) {
      const span = xs[i] - xs[i - 1];
      const t = span === 0 ? 1 : Math.min(1, Math.max(0, (ratio - xs[i - 1]) / span));
      const score = ys[i - 1] + t * (ys[i] - ys[i - 1]);
      return { score: Math.min(1, Math.max(0, score)), tier: TIERS[Math.max(0, i - 1)] };
    }
  }
  return { score: 1, tier: TIERS[TIERS.length - 1] };
}

export type MuscleScore = {
  ratio: number;
  score: number; // 0..1, drives how "lit up" the region is
  tier: Tier;
  best1rm: number;
  lift: string;
};

/** null bodyweight (nothing logged yet) means nothing can be normalized, so every region stays unscored. */
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
    out[muscle] = { ratio, score, tier, best1rm: pr.bestE1rm, lift };
  }
  return out;
}
