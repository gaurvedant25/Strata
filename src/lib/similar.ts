import type { Exercise } from "../types";

/**
 * Which lifts stand in for each other.
 *
 * Swapping an exercise mid-workout is nearly always the same situation: the
 * rack is taken, the machine is occupied, or the shoulder is not having it
 * today — and what you want is the nearest thing that trains the same work.
 * That question is not answered by the muscle group the library files a lift
 * under. "Legs" holds a calf raise and a back squat; "Back" holds a shrug and a
 * pulldown. A group is a place to look something up, not a set of substitutes.
 *
 * So substitutes are grouped by the movement instead. These are deliberately
 * loose pools rather than strict biomechanics: a machine chest press sits with
 * the barbell bench because it is what you do when the bench is busy, not
 * because the two are the same lift. Ordering inside a pool is left to the
 * scoring below, which reads the names — that is what puts the incline bench
 * and the dumbbell bench above the dip when a barbell bench press is swapped.
 *
 * Names are matched against the library, so they are load-bearing in the same
 * way `RANKING_LIFTS` is: a name that does not exist in `seed.ts` is a pool
 * member that can never be suggested. `npm run check:similar` fails on one.
 * Anything absent from this table — a lift somebody created themselves, or a
 * library entry with no real substitute like the wrist curl — still gets
 * suggestions, just from its muscle group and its name.
 */
export const FAMILIES: Record<string, string[]> = {
  "horizontal press": [
    "Barbell Bench Press",
    "Close-Grip Bench Press",
    "Dip",
    "Dumbbell Bench Press",
    "Incline Barbell Bench Press",
    "Incline Dumbbell Press",
    "Machine Chest Press",
    "Push-up",
  ],
  "chest fly": ["Cable Fly", "Dumbbell Fly", "Pec Deck"],
  "overhead press": [
    "Arnold Press",
    "Dumbbell Shoulder Press",
    "Machine Shoulder Press",
    "Overhead Press",
    "Push Press",
  ],
  "vertical pull": [
    "Chin-up",
    "Close-Grip Lat Pulldown",
    "Lat Pulldown",
    "Pull-up",
    "Straight-Arm Pulldown",
  ],
  "horizontal row": [
    "Barbell Row",
    "Inverted Row",
    "One-Arm Dumbbell Row",
    "Seated Cable Row",
    "T-Bar Row",
  ],
  hinge: [
    "Back Extension",
    "Deadlift",
    "Good Morning",
    "Kettlebell Swing",
    "Leg Curl",
    "Romanian Deadlift",
    "Sumo Deadlift",
  ],
  squat: [
    "Back Squat",
    "Front Squat",
    "Goblet Squat",
    "Hack Squat",
    "Leg Extension",
    "Leg Press",
  ],
  lunge: ["Reverse Lunge", "Split Squat", "Step-up", "Walking Lunge"],
  "calf raise": ["Seated Calf Raise", "Standing Calf Raise"],
  "hip extension": [
    "Cable Glute Kickback",
    "Cable Pull-Through",
    "Glute Bridge",
    "Hip Thrust",
  ],
  shrug: ["Barbell Shrug", "Dumbbell Shrug"],
  "lateral raise": [
    "Cable Lateral Raise",
    "Dumbbell Lateral Raise",
    "Front Raise",
    "Upright Row",
  ],
  "rear delt": ["Face Pull", "Rear Delt Fly", "Reverse Pec Deck"],
  curl: [
    "Barbell Curl",
    "Cable Curl",
    "Concentration Curl",
    "Dumbbell Curl",
    "EZ-Bar Curl",
    "Hammer Curl",
    "Preacher Curl",
  ],
  "triceps extension": [
    "Bench Dip",
    "Overhead Triceps Extension",
    "Rope Pushdown",
    "Skull Crusher",
    "Triceps Kickback",
    "Triceps Pushdown",
  ],
  "trunk flexion": [
    "Bicycle Crunch",
    "Cable Crunch",
    "Crunch",
    "Hanging Leg Raise",
    "Mountain Climber",
    "Sit-up",
  ],
  "trunk rotation": ["Cable Woodchop", "Russian Twist"],
  "trunk brace": ["Ab Wheel Rollout", "Dead Bug", "Plank"],
  cardio: [
    "Elliptical",
    "Jump Rope",
    "Rowing Machine",
    "Stair Climber",
    "Stationary Bike",
    "Treadmill Run",
    "Walking",
  ],
  "olympic lift": ["Clean and Jerk", "Power Clean", "Snatch", "Thruster"],
  carry: ["Farmer's Carry", "Turkish Get-up"],
};

const FAMILY_OF = new Map<string, string>(
  Object.entries(FAMILIES).flatMap(([family, names]) =>
    names.map((name) => [name.trim().toLowerCase(), family] as const),
  ),
);

/** The movement pool a lift belongs to, or undefined if the table has no view. */
export function familyOf(name: string): string | undefined {
  return FAMILY_OF.get(name.trim().toLowerCase());
}

/**
 * Words that say what a lift is held with rather than what it does.
 *
 * Dropped before two names are compared, because they are the loudest thing
 * two unrelated lifts can have in common: a dumbbell fly and a dumbbell bench
 * press share nothing but the dumbbell. Take them out and what is left of a
 * name is the movement — "bench press", "curl", "row" — which is the part
 * worth matching on.
 */
const EQUIPMENT = new Set([
  "band",
  "bar",
  "barbell",
  "cable",
  "dumbbell",
  "ez",
  "kettlebell",
  "machine",
  "one",
  "rope",
  "seated",
  "smith",
  "standing",
]);

function words(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w && !EQUIPMENT.has(w)),
  );
}

/** Same movement pool. Enough on its own to be worth suggesting. */
const FAMILY = 4;
/** Same muscle group. Only a suggestion once a name agrees with it too. */
const MUSCLE = 2;

/**
 * The handful of lifts to offer in place of this one, best first.
 *
 * Three signals, added: the movement pool, the muscle group, and how much of
 * the two names survives as the same words. The pool decides who is eligible
 * and the names decide the order — which is what makes the incline bench and
 * the dumbbell bench the first two answers for a barbell bench press, ahead of
 * the dip and the push-up that share the pool but not the movement.
 *
 * The threshold is one family match, or a muscle group plus two words of a
 * name. That second route is what carries exercises somebody created
 * themselves: "Smith Machine Bench Press" is in no pool, but it is a chest
 * lift whose name is mostly "bench press", and it is offered accordingly.
 *
 * A lift counted in reps never suggests one held for a duration, and the other
 * way round. Nothing about a plank substitutes for a crunch, and offering
 * either in place of the other is the kind of suggestion that makes the whole
 * list look guessed at.
 */
export function similarExercises(
  target: Exercise,
  pool: Exercise[],
  exclude: ReadonlySet<string> = new Set(),
  limit = 4,
): Exercise[] {
  const family = familyOf(target.name);
  const want = words(target.name);
  const tracks = target.tracks ?? "reps";

  return pool
    .filter(
      (e) =>
        e.id !== target.id &&
        !e.archived &&
        !exclude.has(e.id) &&
        (e.tracks ?? "reps") === tracks,
    )
    .map((e) => {
      const shared = [...words(e.name)].filter((w) => want.has(w)).length;
      return {
        e,
        score:
          (family && familyOf(e.name) === family ? FAMILY : 0) +
          (e.muscle === target.muscle ? MUSCLE : 0) +
          shared,
      };
    })
    .filter((x) => x.score >= FAMILY)
    .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name))
    .slice(0, limit)
    .map((x) => x.e);
}
