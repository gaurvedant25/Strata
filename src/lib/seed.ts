import type { Exercise } from "../types";

/**
 * The starting library: the lifts most people walk into a gym already able to
 * name, one entry per movement.
 *
 * Deliberately not exhaustive. There is no Spoto press here, no Meadows row,
 * and exactly one push-up — a library exists so somebody can find the lift they
 * mean in a couple of taps, and eight near-identical variants of one movement
 * makes that harder rather than easier. Anything missing is one tap away in
 * "Create new exercise", which is where the long tail belongs.
 *
 * Names are load-bearing. `RANKING_LIFTS` and the routine presets reach for
 * exercises by name rather than by id, so renaming a row here silently drops a
 * lift out of a region's ranking set on the strength screen, or empties a day
 * in a preset split. Every name they reference must exist in this list.
 */
/** Held for a duration rather than counted out in reps. */
const TIMED = new Set([
  "Plank",
  "Farmer's Carry",
  "Elliptical",
  "Jump Rope",
  "Rowing Machine",
  "Stair Climber",
  "Stationary Bike",
  "Treadmill Run",
  "Walking",
]);

const LIB: [string, string, boolean?][] = [
  ["Barbell Bench Press", "Chest"],
  ["Cable Fly", "Chest"],
  ["Dip", "Chest", true],
  ["Dumbbell Bench Press", "Chest"],
  ["Dumbbell Fly", "Chest"],
  ["Incline Barbell Bench Press", "Chest"],
  ["Incline Dumbbell Press", "Chest"],
  ["Machine Chest Press", "Chest"],
  ["Pec Deck", "Chest"],
  ["Push-up", "Chest", true],

  ["Back Extension", "Back", true],
  ["Barbell Row", "Back"],
  ["Barbell Shrug", "Back"],
  ["Chin-up", "Back", true],
  ["Close-Grip Lat Pulldown", "Back"],
  ["Deadlift", "Back"],
  ["Dumbbell Shrug", "Back"],
  ["Good Morning", "Back"],
  ["Inverted Row", "Back", true],
  ["Lat Pulldown", "Back"],
  ["One-Arm Dumbbell Row", "Back"],
  ["Pull-up", "Back", true],
  ["Seated Cable Row", "Back"],
  ["Straight-Arm Pulldown", "Back"],
  ["Sumo Deadlift", "Back"],
  ["T-Bar Row", "Back"],

  ["Arnold Press", "Shoulders"],
  ["Cable Lateral Raise", "Shoulders"],
  ["Dumbbell Lateral Raise", "Shoulders"],
  ["Dumbbell Shoulder Press", "Shoulders"],
  ["Face Pull", "Shoulders"],
  ["Front Raise", "Shoulders"],
  ["Machine Shoulder Press", "Shoulders"],
  ["Overhead Press", "Shoulders"],
  ["Push Press", "Shoulders"],
  ["Rear Delt Fly", "Shoulders"],
  ["Reverse Pec Deck", "Shoulders"],
  ["Upright Row", "Shoulders"],

  ["Barbell Curl", "Arms"],
  ["Bench Dip", "Arms", true],
  ["Cable Curl", "Arms"],
  ["Close-Grip Bench Press", "Arms"],
  ["Concentration Curl", "Arms"],
  ["Dumbbell Curl", "Arms"],
  ["EZ-Bar Curl", "Arms"],
  ["Hammer Curl", "Arms"],
  ["Overhead Triceps Extension", "Arms"],
  ["Preacher Curl", "Arms"],
  ["Rope Pushdown", "Arms"],
  ["Skull Crusher", "Arms"],
  ["Triceps Kickback", "Arms"],
  ["Triceps Pushdown", "Arms"],
  ["Wrist Curl", "Arms"],

  ["Back Squat", "Legs"],
  ["Box Jump", "Legs", true],
  ["Front Squat", "Legs"],
  ["Goblet Squat", "Legs"],
  ["Hack Squat", "Legs"],
  ["Leg Curl", "Legs"],
  ["Leg Extension", "Legs"],
  ["Leg Press", "Legs"],
  ["Reverse Lunge", "Legs"],
  ["Romanian Deadlift", "Legs"],
  ["Seated Calf Raise", "Legs"],
  ["Split Squat", "Legs"],
  ["Standing Calf Raise", "Legs"],
  ["Step-up", "Legs"],
  ["Walking Lunge", "Legs"],

  ["Cable Glute Kickback", "Glutes"],
  ["Cable Pull-Through", "Glutes"],
  ["Glute Bridge", "Glutes", true],
  ["Hip Thrust", "Glutes"],

  ["Ab Wheel Rollout", "Core", true],
  ["Bicycle Crunch", "Core", true],
  ["Cable Crunch", "Core"],
  ["Cable Woodchop", "Core"],
  ["Crunch", "Core", true],
  ["Dead Bug", "Core", true],
  ["Hanging Leg Raise", "Core", true],
  ["Mountain Climber", "Core", true],
  ["Plank", "Core", true],
  ["Russian Twist", "Core", true],
  ["Sit-up", "Core", true],

  ["Elliptical", "Cardio", true],
  ["Jump Rope", "Cardio", true],
  ["Rowing Machine", "Cardio", true],
  ["Stair Climber", "Cardio", true],
  ["Stationary Bike", "Cardio", true],
  ["Treadmill Run", "Cardio", true],
  ["Walking", "Cardio", true],

  ["Clean and Jerk", "Other"],
  ["Farmer's Carry", "Other"],
  ["Kettlebell Swing", "Other"],
  ["Power Clean", "Other"],
  ["Snatch", "Other"],
  ["Thruster", "Other"],
  ["Turkish Get-up", "Other"],
];

/**
 * The id a seeded exercise always gets, derived from its name.
 *
 * Deliberately not random. Seeding runs whenever the library is found empty,
 * and the library is emptied for real — signing into a different account wipes
 * the local copy before repulling it. With random ids each of those passes
 * minted a fresh set of rows that sync then pushed up as new records, so the
 * server accumulated another complete copy of the library every time and the
 * picker filled with twenty-one identical Barbell Curls.
 *
 * Derived from the name, re-seeding writes the same keys it wrote last time:
 * the second pass overwrites the first instead of doubling it, and two devices
 * seeding independently agree on the id rather than each inventing one. The
 * prefix keeps them distinguishable from the random ids `uid()` hands to
 * exercises somebody creates themselves.
 */
export function seedId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `sx-${slug}`;
}

/** True for an id this file would have minted — i.e. a library exercise. */
export function isSeedId(id: string): boolean {
  return id.startsWith("sx-");
}

/** Every name in the starting library, in the order it is defined. */
export function seedNames(): string[] {
  return LIB.map(([name]) => name);
}

export function seedExercises(): Exercise[] {
  const now = Date.now();
  return LIB.map(([name, muscle, bw], i) => ({
    id: seedId(name),
    name,
    muscle,
    bodyweight: bw ?? false,
    tracks: TIMED.has(name) ? ("time" as const) : ("reps" as const),
    createdAt: now + i,
  }));
}
