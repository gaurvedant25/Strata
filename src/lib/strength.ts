import type { Exercise, Gender, Session } from "../types";
import { e1rm, personalRecords, working, type PR } from "./stats";
import type { SetLog } from "../types";

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
 * Every lift that can rank a region, and what it is worth against the
 * region's benchmark.
 *
 * A region is ranked on the strongest of these you have logged — not on one
 * nominated lift. That is the whole model: a few recognisable ways to train
 * each muscle, and whichever of them you are best at is the one that counts.
 *
 * `factor` is what makes "strongest" mean anything across lifts that are not
 * loaded alike. It is this lift's typical one-rep max as a multiple of the
 * benchmark's, so dividing your estimated 1RM by it converts the lift into a
 * benchmark-equivalent, and those are what get compared. Without it "strongest"
 * would only ever mean "heaviest by nature": a push press would beat your own
 * overhead press every time, and a lateral raise could never count at all.
 * With it, a lateral raise wins the region when you are unusually strong on a
 * lateral raise — which is the point.
 *
 * The factors are estimates, in exactly the sense the tier thresholds below are
 * estimates. They are calibrated the way a lifter would read them: 60 kg
 * overhead press alongside 25 kg dumbbell presses, 160 kg deadlift alongside a
 * 100 kg shrug.
 *
 * Only free weights rank. A barbell, a dumbbell and your own bodyweight are
 * the same load in every gym, and a rank is a comparison — against the
 * standards, and against what you lifted last year. A stack is not: fifty on
 * one chest press is not fifty on the one across town, and a cable's pulley
 * ratio is nobody's business but the manufacturer's. Machine and cable work is
 * still logged, still charted, still holds its own personal records on the
 * progress screen; it just does not decide a tier.
 *
 * The exceptions are the places where the honest free-weight replacement is
 * worse than the stack: the triceps pushdown, the lat pulldown and the cable
 * crunch, along with the pulldown and pushdown variants beside them. They are
 * how those muscles are actually trained, the thresholds below were written
 * against them, and a close-grip bench is a chest lift that happens to tire the
 * triceps — a region is not improved by being ranked on a lift nobody trains it
 * with. The cable crunch is the newest of them and the clearest case: it is the
 * only way most people load their abs at all, and the alternative was a region
 * that stayed dark unless you owned a dip belt.
 *
 * Two conventions they depend on. A dumbbell lift is the weight of one
 * dumbbell, not the pair — the same reading the entry seeds in `REGION_SEED`
 * assume. And `added` marks a lift logged as what you hung off a bodyweight
 * movement rather than as an absolute load.
 *
 * What an `added` lift is *scored* on is a second question, and the answer is
 * `carriesBodyweight`. On a pull-up, a chin-up or a dip you are the load — the
 * plate on the belt is the small part of it — so scoring those on the plate
 * alone threw most of the lift away, then made it worse by dividing what was
 * left through a factor: a 55 kg lifter pulling +15 kg for four was ranked as a
 * 49 kg pulldown when the honest reading is the 70 kg they actually moved. Those
 * three now score on bodyweight plus the plate, which is why their factors read
 * as whole movements — a pull-up against the pulldown it stands in for, near
 * enough one for one. The rest of the `added` lifts genuinely are the plate:
 * nobody's back extension is loaded by their mass the way a pull-up is, and the
 * core lifts are the case argued below. Those still rank only once weighted, and
 * so are the only ones kept out of the setup shortlist, where a zero would leave
 * the region grey.
 *
 * The benchmark is simply the first entry, at a factor of 1. Names are
 * load-bearing — every one must exist in `seed.ts`.
 */
export type RankingLift = {
  name: string;
  /** This lift's typical 1RM as a multiple of the benchmark's. */
  factor: number;
  /** Logged as added weight rather than as an absolute load. */
  added?: boolean;
  /**
   * You are the load: scored on bodyweight plus whatever is hung off you, so it
   * ranks from the first unweighted rep. Implies `added`.
   */
  carriesBodyweight?: boolean;
  /**
   * Held against the clock rather than counted out, so it is scored from a
   * duration and not from an estimated 1RM. See `holdFigure`.
   */
  hold?: boolean;
};

/**
 * What a forearm plank actually holds up: a little over half of you.
 *
 * The forearms and toes carry the body between them, and the forearms take
 * roughly six tenths of it. The figure only has to be in the right area — it
 * sets the scale of the whole ab ladder below, and every threshold there was
 * written with this number already in it.
 */
const PLANK_SHARE = 0.6;

/**
 * A hold, read as a weight: what you were holding, scaled by how long you held
 * it relative to a minute.
 *
 * A plank has no 1RM to estimate, so it needs its own conversion, and the
 * obvious one — load times time — makes a ten-minute hold ten times a one-minute
 * hold, which no one believes. The square root is the cheapest honest curve:
 * doubling the hold is worth about forty percent more, and the figure lands
 * exactly on the load you carried when the hold is sixty seconds, so it reads
 * as "the plank you could hold for a minute" the way a 1RM reads as "the rep
 * you could do once".
 */
function holdFigure(load: number, seconds: number) {
  return load * Math.sqrt(seconds / 60);
}

/** Timed sets are logged with no reps, so `working` — which wants reps — misses them. */
const held = (sets: SetLog[]) =>
  sets.filter((s) => s.done && (s.seconds ?? 0) > 0);

export const RANKING_LIFTS: Record<MuscleGroup, RankingLift[]> = {
  chest: [
    { name: "Barbell Bench Press", factor: 1 },
    { name: "Incline Barbell Bench Press", factor: 0.85 },
    { name: "Dumbbell Bench Press", factor: 0.4 },
    { name: "Incline Dumbbell Press", factor: 0.35 },
    { name: "Dumbbell Fly", factor: 0.2 },
    { name: "Dip", factor: 1.05, added: true, carriesBodyweight: true },
  ],
  shoulders: [
    { name: "Overhead Press", factor: 1 },
    { name: "Push Press", factor: 1.2 },
    { name: "Upright Row", factor: 0.7 },
    { name: "Dumbbell Shoulder Press", factor: 0.42 },
    { name: "Arnold Press", factor: 0.38 },
    { name: "Dumbbell Lateral Raise", factor: 0.3 },
    { name: "Rear Delt Fly", factor: 0.25 },
  ],
  biceps: [
    { name: "Barbell Curl", factor: 1 },
    { name: "EZ-Bar Curl", factor: 1.05 },
    { name: "Preacher Curl", factor: 0.8 },
    { name: "Hammer Curl", factor: 0.5 },
    { name: "Dumbbell Curl", factor: 0.45 },
    { name: "Chin-up", factor: 2.4, added: true, carriesBodyweight: true },
  ],
  triceps: [
    { name: "Triceps Pushdown", factor: 1 },
    { name: "Close-Grip Bench Press", factor: 2.2 },
    { name: "Rope Pushdown", factor: 0.85 },
    { name: "Skull Crusher", factor: 0.8 },
    { name: "Overhead Triceps Extension", factor: 0.7 },
    { name: "Triceps Kickback", factor: 0.3 },
    { name: "Dip", factor: 2.6, added: true, carriesBodyweight: true },
  ],
  forearms: [
    { name: "Hammer Curl", factor: 1 },
    { name: "Wrist Curl", factor: 1.1 },
    { name: "Dumbbell Curl", factor: 0.9 },
    // A shrug is a grip feat rather than a curl, and carried at its own weight
    // it used to hand the forearms the top of the ladder. Converted at six
    // times the hammer curl it can rank them honestly.
    { name: "Barbell Shrug", factor: 6 },
  ],
  traps: [
    { name: "Barbell Shrug", factor: 1 },
    { name: "Deadlift", factor: 1.45 },
    { name: "Power Clean", factor: 0.9 },
    { name: "Upright Row", factor: 0.5 },
    { name: "Dumbbell Shrug", factor: 0.45 },
  ],
  lats: [
    { name: "Lat Pulldown", factor: 1 },
    { name: "Close-Grip Lat Pulldown", factor: 1 },
    { name: "T-Bar Row", factor: 1.25 },
    { name: "Barbell Row", factor: 1.2 },
    { name: "Seated Cable Row", factor: 1.1 },
    { name: "One-Arm Dumbbell Row", factor: 0.5 },
    { name: "Straight-Arm Pulldown", factor: 0.5 },
    { name: "Pull-up", factor: 1, added: true, carriesBodyweight: true },
  ],
  lowerBack: [
    { name: "Deadlift", factor: 1 },
    { name: "Sumo Deadlift", factor: 1 },
    { name: "Romanian Deadlift", factor: 0.75 },
    { name: "Barbell Row", factor: 0.6 },
    { name: "Good Morning", factor: 0.45 },
    { name: "Back Extension", factor: 0.2, added: true },
  ],
  /*
   * The core is the one place the free-weight rule costs something real.
   *
   * There is no barbell sit-up, so what is left is your own body, a plate
   * hung off it, or a stack. Both regions used to rank on the plate alone, and
   * anyone who trained abs without hanging one off themselves got a dark
   * region for it.
   *
   * Abs no longer do. They rank on the plank, which is the movement most people
   * actually measure a core with, and it is scored on the body doing it: a
   * plank holds up something like six tenths of you, so a heavier lifter is
   * holding more of a load through the same two minutes and is credited for it.
   * That credit is the reason the ab ladder is the one ladder in this file read
   * in kilos rather than in multiples of bodyweight — see `ABSOLUTE`. Dividing
   * by bodyweight would cancel exactly the thing the plank is here to measure.
   *
   * The weighted lifts stay, converted into plank-equivalents through factors
   * cut against an eighty-kilo lifter, and the cable crunch is back among them
   * as the one loaded ab movement most gyms actually offer. Obliques are
   * untouched: a twist is still a plate held through a rotation, and there is
   * no held equivalent of one.
   */
  abs: [
    {
      name: "Plank",
      factor: 1,
      added: true,
      carriesBodyweight: true,
      hold: true,
    },
    { name: "Cable Crunch", factor: 0.9 },
    { name: "Hanging Leg Raise", factor: 0.2, added: true },
    { name: "Sit-up", factor: 0.23, added: true },
    { name: "Ab Wheel Rollout", factor: 0.17, added: true },
    { name: "Crunch", factor: 0.17, added: true },
  ],
  obliques: [
    { name: "Russian Twist", factor: 1, added: true },
    { name: "Bicycle Crunch", factor: 0.6, added: true },
  ],
  quadriceps: [
    { name: "Back Squat", factor: 1 },
    { name: "Front Squat", factor: 0.85 },
    { name: "Goblet Squat", factor: 0.35 },
    { name: "Walking Lunge", factor: 0.35 },
  ],
  hamstrings: [
    { name: "Romanian Deadlift", factor: 1 },
    { name: "Deadlift", factor: 1.35 },
    { name: "Sumo Deadlift", factor: 1.35 },
    { name: "Good Morning", factor: 0.6 },
  ],
  glutes: [
    { name: "Hip Thrust", factor: 1 },
    { name: "Back Squat", factor: 0.82 },
    { name: "Romanian Deadlift", factor: 0.8 },
    { name: "Walking Lunge", factor: 0.25 },
    { name: "Glute Bridge", factor: 0.8, added: true },
  ],
  // One lift, and it has to be read as a loaded one: a bar across the back or a
  // dumbbell in each hand. The press and the seated raise are machines, and the
  // library carries no other calf movement, so calves rank on this or on
  // nothing — and the standards below are cut for what a bar can hold, not for
  // what a calf press stack goes up to.
  calves: [{ name: "Standing Calf Raise", factor: 1 }],
};

/**
 * The lift each region's tier thresholds are written against: the first entry
 * above, the one at a factor of 1. Every other lift is converted into it before
 * it is scored, and it is the lift the app names when a region is empty.
 */
export const CANONICAL_LIFT: Record<MuscleGroup, string> = Object.fromEntries(
  (Object.keys(RANKING_LIFTS) as MuscleGroup[]).map((m) => [
    m,
    RANKING_LIFTS[m][0].name,
  ]),
) as Record<MuscleGroup, string>;

/**
 * The lift you named for a region during setup.
 *
 * It no longer decides anything about the rank. A region is ranked on the
 * strongest of its whole set, and the set you answered from is logged as a real
 * session, so your answer competes in that pool like any other lift rather than
 * standing over it. What it is still good for is knowing which lift to ask for:
 * an empty region names it when it tells you what to log.
 *
 * Absent, or holding a lift the library no longer carries, that prompt falls
 * back to `CANONICAL_LIFT`.
 */
export type BenchmarkLifts = Partial<Record<MuscleGroup, string>>;

/**
 * The lift to suggest for a region — yours if you named one, else the benchmark.
 *
 * The stored answer is checked against the region's ranking set rather than
 * trusted, because that set has shrunk: anyone who set up before machine and
 * cable work stopped counting may have nominated a chest press or a pulldown,
 * and telling them to log a lift that cannot score the region is the worst
 * thing this sentence could say.
 */
export function benchmarkLift(
  muscle: MuscleGroup,
  benchmarks?: BenchmarkLifts,
): string {
  const named = benchmarks?.[muscle];
  const ranks = named && RANKING_LIFTS[muscle].some((l) => l.name === named);
  return ranks ? named : CANONICAL_LIFT[muscle];
}

/**
 * The regions in reading order: the sections above, flattened.
 *
 * Setup walks them in this order, so the questions arrive grouped the same way
 * the answers are listed afterwards — chest and shoulders, then the three arm
 * regions together, and so on.
 */
export const REGION_ORDER: MuscleGroup[] = REGION_SECTIONS.flatMap((s) =>
  s.kind === "single" ? [s.group] : s.children,
);

/** "Arms — Biceps" for a region inside a section, "Chest" for one that is its own. */
export function regionHeading(muscle: MuscleGroup): string {
  const section = REGION_SECTIONS.find((s) =>
    s.kind === "single" ? s.group === muscle : s.children.includes(muscle),
  );
  const label = MUSCLE_LABEL[muscle];
  return section && section.kind === "group"
    ? `${section.label} — ${label}`
    : label;
}

/**
 * The lifts offered for a region during setup, benchmark first.
 *
 * The region's own ranking set, minus the lifts that rank only once weighted.
 * The setup questions exist so a new account is not looking at a grey figure,
 * and a movement whose honest answer is "nothing yet" logs a zero, which scores
 * nothing — offering it there would defeat the only thing those questions are
 * for. A pull-up or a dip is not that movement: it is scored on the body doing
 * it, so an answer of zero added weight is a real answer. Everything offered
 * here can rank the region the moment it is answered.
 */
export const REGION_LIFTS: Record<MuscleGroup, string[]> = Object.fromEntries(
  (Object.keys(RANKING_LIFTS) as MuscleGroup[]).map((m) => [
    m,
    RANKING_LIFTS[m]
      .filter((l) => (!l.added || l.carriesBodyweight) && !l.hold)
      .map((l) => l.name),
  ]),
) as Record<MuscleGroup, string[]>;

/**
 * The lifts whose score already includes the lifter.
 *
 * By name rather than by region, because the screens that ask the question hold
 * an exercise and not a muscle: both the setup flow and the strength screen's
 * one-set shortcut need to know whether a bodyweight movement can still rank
 * something when the added weight is left at zero.
 */
export const BODYWEIGHT_LOADED: ReadonlySet<string> = new Set(
  Object.values(RANKING_LIFTS)
    .flat()
    .filter((l) => l.carriesBodyweight)
    .map((l) => l.name),
);

/**
 * What a setup question actually offers for a region.
 *
 * `REGION_LIFTS` for almost everywhere, but abs and obliques have nothing left
 * in it: with the cable work gone, every core lift is scored on added weight,
 * and a question with no answers is a dead screen. Those two fall back to the
 * whole ranking set — an entry that may well be left at zero is worse than the
 * loaded ones above it, and still far better than nothing to tap.
 */
export function setupLifts(muscle: MuscleGroup): string[] {
  const loaded = REGION_LIFTS[muscle];
  if (loaded.length) return loaded;
  // Still no clock in the fallback: abs land here, and the plank that now
  // benchmarks them is a hold, which the setup entry cannot ask for.
  return RANKING_LIFTS[muscle].filter((l) => !l.hold).map((l) => l.name);
}

/**
 * Where a region's set entry starts, in kilos and reps.
 *
 * Roughly the middle of the Silver band for an eighty-kilo lifter, and rep
 * counts that suit the movement — fives on the squat and the deadlift, twelves
 * on calves and abs. A starting point is not a suggestion about what you ought
 * to lift; it is there so the common case is a couple of taps from correct
 * rather than eighteen from zero.
 */
export const REGION_SEED: Record<MuscleGroup, { kg: number; reps: number }> = {
  chest: { kg: 60, reps: 5 },
  shoulders: { kg: 40, reps: 5 },
  biceps: { kg: 30, reps: 8 },
  triceps: { kg: 30, reps: 10 },
  forearms: { kg: 16, reps: 10 },
  traps: { kg: 80, reps: 10 },
  lats: { kg: 55, reps: 10 },
  lowerBack: { kg: 100, reps: 5 },
  // In plank figures, like every other row is in its own benchmark: the
  // twelve kilos a leg raise used to open at are what 60 comes back to once
  // that lift's factor is applied.
  abs: { kg: 60, reps: 12 },
  obliques: { kg: 12, reps: 12 },
  quadriceps: { kg: 80, reps: 5 },
  hamstrings: { kg: 70, reps: 8 },
  glutes: { kg: 90, reps: 8 },
  calves: { kg: 30, reps: 12 },
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
 * are looser still, because widely agreed figures for a shrug or a weighted
 * Russian twist do not really exist the way they do for a squat. Treat a tier as a
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
  /*
   * Kilos, not multiples of bodyweight — the one region read that way, for the
   * reason set out beside the ab lifts above.
   *
   * Written as the plank figure an unweighted hold produces, so the ladder can
   * be read back as times. For an 80 kg man (48 kg of load): a minute is
   * Silver, two minutes Gold, three Platinum, five Diamond and eight Titan. The
   * women's row is the same five holds at a 65 kg bodyweight, which is why it
   * sits lower rather than being cut by a separate judgement.
   */
  abs: {
    male: [48, 67, 83, 107, 135],
    female: [39, 55, 67, 87, 110],
  },
  obliques: {
    male: [0.12, 0.18, 0.25, 0.35, 0.45],
    female: [0.08, 0.12, 0.18, 0.25, 0.33],
  },
  hamstrings: {
    male: [0.75, 1.1, 1.4, 1.8, 2.25],
    female: [0.45, 0.7, 0.9, 1.25, 1.6],
  },
  // Cut down hard: these used to assume a calf press, and three times
  // bodyweight is a stack rather than a barbell.
  calves: {
    male: [0.3, 0.6, 0.9, 1.2, 1.6],
    female: [0.2, 0.4, 0.6, 0.85, 1.15],
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

/**
 * Regions whose thresholds are kilos rather than multiples of bodyweight.
 *
 * Everywhere else, normalising by bodyweight is the whole point: a 60 kg bench
 * says different things about a 60 kg lifter and a 110 kg one. The plank is the
 * exception, because there the body is not the lifter but the load — carrying
 * more of yourself through the same hold is more work, not less — and dividing
 * it out again would leave the region measuring nothing but time.
 */
const ABSOLUTE: Partial<Record<MuscleGroup, true>> = { abs: true };

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
  /** Benchmark-equivalent 1RM over bodyweight — what the tier is read from. */
  ratio: number;
  score: number; // 0..1, drives glow intensity
  tier: Tier;
  color: string;
  /** What you actually lifted on `lift`, before any conversion. */
  best1rm: number;
  /**
   * The same set read on the plate alone, for a lift that is scored on you
   * plus the plate — null for every lift that is only ever its own weight.
   *
   * `best1rm` is what the rank is computed from and so has to be the whole
   * load, but it is not what you logged: a pull-up is entered as the fifteen
   * kilos on the belt, and a screen that answers "what is my best pull-up"
   * with the sixty-five you and the belt weigh together is answering a
   * question nobody asked. Both readings are kept so each surface can show
   * the one it means.
   */
  added1rm: number | null;
  /**
   * The hold that won the region, for a region won by one — null everywhere
   * else. `best1rm` is that hold read as a weight, which is the figure the
   * tier comes off; this is the stopwatch, which is what a screen should show.
   */
  hold: { seconds: number; added: number } | null;
  /** The lift that won the region: the strongest of its ranking set. */
  lift: string;
  /** `best1rm` converted into the benchmark, which is what was scored. */
  equivalent: number;
  /** The lift the thresholds are written against — `lift` unless converted. */
  benchmark: string;
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

/**
 * The best estimated 1RM logged under a ranking lift, in what that lift is
 * scored on: the bar for most of them, bodyweight plus the plate for the three
 * that carry you.
 *
 * Those three cannot read their answer off `personalRecords`, which only ever
 * saw the plate. Folding bodyweight in afterwards would not work either, since
 * the estimate scales with reps: at 70 kg bodyweight a set of +20 kg × 3 beats
 * an unweighted set of 20 on the plate alone and loses badly on the whole load.
 * So the sets are re-read and the body is added before the estimate, not after.
 */
type Best = {
  /** The figure the rank is read from: an estimated 1RM, or a hold as a weight. */
  total: number;
  /** The plate alone, for a lift scored on you plus the plate. */
  added: number | null;
  /** The stopwatch, for a lift held rather than counted. */
  hold: { seconds: number; added: number } | null;
};

function bestFor(
  lift: RankingLift,
  sessions: Session[],
  exercises: Exercise[],
  prs: Map<string, PR>,
  bodyweight: number,
): Best {
  if (!lift.carriesBodyweight)
    return {
      total: bestNamed(exercises, prs, lift.name)?.bestE1rm ?? 0,
      added: null,
      hold: null,
    };
  const ids = new Set(
    exercises.filter((e) => e.name === lift.name).map((e) => e.id),
  );
  if (!ids.size) return { total: 0, added: null, hold: null };
  const out: Best = { total: 0, added: lift.hold ? null : 0, hold: null };
  for (const s of sessions)
    for (const entry of s.entries) {
      if (!ids.has(entry.exerciseId)) continue;
      if (lift.hold) {
        for (const set of held(entry.sets)) {
          const seconds = set.seconds ?? 0;
          const whole = holdFigure(
            PLANK_SHARE * bodyweight + set.weight,
            seconds,
          );
          if (whole > out.total) {
            out.total = whole;
            out.hold = { seconds, added: set.weight };
          }
        }
        continue;
      }
      for (const set of working(entry.sets)) {
        const whole = e1rm(bodyweight + set.weight, set.reps);
        // The plate is read off the set that won on the whole load, not off
        // whichever set was heaviest on the belt: those are not always the
        // same set, and two figures from two different days would not describe
        // one lift.
        if (whole > out.total) {
          out.total = whole;
          out.added = e1rm(set.weight, set.reps);
        }
      }
    }
  return out;
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

  const done = sessions.filter((s) => s.endedAt);
  const prs = personalRecords(done);
  for (const muscle of Object.keys(RANKING_LIFTS) as MuscleGroup[]) {
    const benchmark = CANONICAL_LIFT[muscle];
    /*
     * The strongest of the set wins, measured in benchmark-equivalents.
     *
     * Every lift in the region is converted through its own factor before
     * anything is compared, so the winner is whichever lift you are best at
     * relative to what that lift is normally worth — not whichever one happens
     * to be the heaviest movement. A set of lateral raises can take the region
     * off an overhead press, and it should, if the raises are the better lift.
     */
    let best: (Best & { lift: RankingLift; equivalent: number }) | null = null;
    for (const lift of RANKING_LIFTS[muscle]) {
      const found = bestFor(lift, done, exercises, prs, bodyweight);
      if (found.total <= 0) continue;
      const equivalent = found.total / lift.factor;
      if (!best || equivalent > best.equivalent)
        best = { ...found, lift, equivalent };
    }
    if (!best) continue;

    // An absolute region's thresholds are already in kilos; everywhere else the
    // comparison only means something once the lifter is divided out.
    const ratio = ABSOLUTE[muscle]
      ? best.equivalent
      : best.equivalent / bodyweight;
    const { score, tier } = scoreFromRatio(ratio, STANDARDS[muscle][gender]);
    out[muscle] = {
      ratio,
      score,
      tier,
      color: TIER_COLOR[tier],
      best1rm: best.total,
      added1rm: best.added,
      hold: best.hold,
      lift: best.lift.name,
      equivalent: best.equivalent,
      benchmark,
    };
  }
  return out;
}
