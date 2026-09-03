import type { Session, Unit } from "../types";
import { currentStreak, sessionVolume } from "./stats";

/**
 * Overall progression rank, earned by turning up rather than by lifting heavy.
 *
 * This is deliberately a separate axis from the per-muscle tiers in strength.ts,
 * which score a lift against bodyweight. Those describe how strong you are and
 * so are answerable to reality; these describe how much you have put in, and
 * the thresholds below are a product decision — nothing is claimed about how
 * you compare to anyone else.
 */
export type RankTier = "bronze" | "silver" | "gold" | "platinum" | "diamond" | "titan";

export type RankInfo = {
  /** Display name. */
  name: string;
  hex: string;
  /** What reaching it says about the lifter. */
  level: string;
  description: string;
  /** Position in the ladder, 0 = lowest. */
  order: number;
  /** What has to be true to hold it; the lowest rank requires nothing. */
  requires: RankStats;
};

/** The stats a rank is calculated from. Volume is in kilograms. */
export type RankStats = {
  /** Finished workouts, all time. */
  workouts: number;
  /** Consecutive days with a finished workout, up to today. */
  streakDays: number;
  /** Weight moved across every finished workout, in kg. */
  volume: number;
};

/**
 * The ladder, lowest first.
 *
 * Each rung's three requirements are set to land at roughly the same point in a
 * training history — around 5,000 kg of volume per session — so no single axis
 * is systematically the one holding you back. Streaks are the exception and are
 * set far lower: currentStreak counts consecutive calendar days, which any rest
 * day breaks, so it can never carry the same weight as the other two.
 */
export const RANKS: Record<RankTier, RankInfo> = {
  bronze: {
    name: "Bronze",
    hex: "#CD7F32",
    level: "Novice",
    description: "Where everyone starts. Log your first workouts and get the habit going.",
    order: 0,
    requires: { workouts: 0, streakDays: 0, volume: 0 },
  },
  silver: {
    name: "Silver",
    hex: "#C0C0C0",
    level: "Consistent Lifter",
    description: "You are showing up. Training has become a routine rather than an attempt.",
    order: 1,
    requires: { workouts: 10, streakDays: 3, volume: 50_000 },
  },
  gold: {
    name: "Gold",
    hex: "#FFD700",
    level: "Advanced Athlete",
    description: "Months of steady work behind you, with the volume to show for it.",
    order: 2,
    requires: { workouts: 40, streakDays: 7, volume: 200_000 },
  },
  platinum: {
    name: "Platinum",
    hex: "#00D2D3",
    level: "Dedicated Elite",
    description: "Training is part of your life now. Adherence most people never reach.",
    order: 3,
    requires: { workouts: 100, streakDays: 14, volume: 500_000 },
  },
  diamond: {
    name: "Diamond",
    hex: "#70A1FF",
    level: "Master",
    description: "Years of accumulated work. Very few logs ever look like this.",
    order: 4,
    requires: { workouts: 250, streakDays: 30, volume: 1_250_000 },
  },
  titan: {
    name: "Titan",
    hex: "#8A2BE2",
    level: "Legend",
    description: "The top of the ladder, and nothing above it but more of the same.",
    order: 5,
    requires: { workouts: 500, streakDays: 60, volume: 2_500_000 },
  },
};

/** The ladder in order, lowest first. */
export const RANK_ORDER: RankTier[] = (Object.keys(RANKS) as RankTier[]).sort(
  (a, b) => RANKS[a].order - RANKS[b].order,
);

export const LOWEST_RANK: RankTier = RANK_ORDER[0];

/** Anything missing, negative or not a number counts as zero. */
function clean(v: number | undefined | null) {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/** How far up the ladder one stat alone reaches. */
function axisOrder(value: number, pick: (r: RankStats) => number) {
  let order = 0;
  for (const tier of RANK_ORDER) {
    if (value >= pick(RANKS[tier].requires)) order = RANKS[tier].order;
  }
  return order;
}

/**
 * The rank a set of stats earns.
 *
 * Two of the three axes have to reach a rung to hold it — the median of the
 * three, rather than the best or the worst. The best would let one huge session
 * buy a rank outright; the worst would trap a committed lifter at Bronze over a
 * single missed day. Falls back to the lowest rank for empty or malformed
 * stats, so there is always a rank to show.
 */
export function calculateUserRank(stats: Partial<RankStats> | null | undefined): RankTier {
  if (!stats) return LOWEST_RANK;
  const orders = [
    axisOrder(clean(stats.workouts), (r) => r.workouts),
    axisOrder(clean(stats.streakDays), (r) => r.streakDays),
    axisOrder(clean(stats.volume), (r) => r.volume),
  ].sort((a, b) => b - a);
  return RANK_ORDER[orders[1]] ?? LOWEST_RANK;
}

/** The rung above the given one, or null at the top. */
export function nextRank(tier: RankTier): RankTier | null {
  return RANK_ORDER[RANKS[tier].order + 1] ?? null;
}

/**
 * Progress toward the next rank, 0..1, and which axes are still short.
 * Since two axes carry a rung, the second-closest axis is the one to report.
 */
export function rankProgress(stats: RankStats) {
  const tier = calculateUserRank(stats);
  const next = nextRank(tier);
  if (!next) return { tier, next: null, progress: 1, remaining: [] as string[] };

  const need = RANKS[next].requires;
  const axes = [
    { label: "workouts", have: clean(stats.workouts), want: need.workouts },
    { label: "day streak", have: clean(stats.streakDays), want: need.streakDays },
    { label: "kg volume", have: clean(stats.volume), want: need.volume },
  ];
  const shares = axes
    .map((a) => (a.want <= 0 ? 1 : Math.min(1, a.have / a.want)))
    .sort((a, b) => b - a);

  return {
    tier,
    next,
    progress: shares[1],
    remaining: axes.filter((a) => a.have < a.want).map((a) => a.label),
  };
}

/** Pounds logged as-is would inflate volume against kg thresholds. */
const LB_TO_KG = 0.45359237;

/** Reads the rank stats out of a training history. */
export function rankStatsFrom(sessions: Session[], unit: Unit): RankStats {
  const done = sessions.filter((s) => s.endedAt);
  const raw = done.reduce((t, s) => t + sessionVolume(s), 0);
  return {
    workouts: done.length,
    streakDays: currentStreak(sessions),
    volume: unit === "lb" ? raw * LB_TO_KG : raw,
  };
}
