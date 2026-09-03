import type { Exercise, Routine, Split } from "../types";
import { uid } from "./util";

/**
 * The built-in splits offered when you have not picked one yet.
 *
 * These are the common templates rather than anything prescriptive — every day
 * is an ordinary routine once created, so any of it can be edited or deleted
 * afterwards. Exercise names must match the seeded library in seed.ts; a name
 * that doesn't match is skipped rather than breaking the split.
 */

type Day = [name: string, rows: [string, number, number][]];

export type Preset = {
  key: string;
  name: string;
  blurb: string;
  days: Day[];
};

export const PRESETS: Preset[] = [
  {
    key: "full-body",
    name: "Full Body",
    blurb: "3 days · every muscle each session. The most forgiving if you miss a day.",
    days: [
      [
        "Full Body A",
        [
          ["Back Squat", 3, 5],
          ["Barbell Bench Press", 3, 5],
          ["Barbell Row", 3, 8],
          ["Overhead Press", 3, 8],
          ["Plank", 3, 1],
        ],
      ],
      [
        "Full Body B",
        [
          ["Deadlift", 3, 5],
          ["Overhead Press", 3, 8],
          ["Lat Pulldown", 3, 10],
          ["Leg Press", 3, 12],
          ["Hanging Leg Raise", 3, 12],
        ],
      ],
      [
        "Full Body C",
        [
          ["Front Squat", 3, 6],
          ["Incline Dumbbell Press", 3, 10],
          ["Seated Cable Row", 3, 10],
          ["Dumbbell Lateral Raise", 3, 15],
          ["Cable Crunch", 3, 15],
        ],
      ],
    ],
  },
  {
    key: "ppl",
    name: "Push / Pull / Legs",
    blurb: "3 days · grouped by movement. Run it once or twice a week.",
    days: [
      [
        "Push",
        [
          ["Barbell Bench Press", 4, 6],
          ["Overhead Press", 3, 8],
          ["Incline Dumbbell Press", 3, 10],
          ["Dumbbell Lateral Raise", 3, 15],
          ["Triceps Pushdown", 3, 12],
        ],
      ],
      [
        "Pull",
        [
          ["Deadlift", 3, 5],
          ["Pull-up", 4, 8],
          ["Barbell Row", 3, 8],
          ["Face Pull", 3, 15],
          ["Barbell Curl", 3, 10],
        ],
      ],
      [
        "Legs",
        [
          ["Back Squat", 4, 6],
          ["Romanian Deadlift", 3, 8],
          ["Leg Press", 3, 12],
          ["Leg Curl", 3, 12],
          ["Standing Calf Raise", 4, 15],
        ],
      ],
    ],
  },
  {
    key: "upper-lower",
    name: "Upper / Lower",
    blurb: "4 days · alternating halves. Hits everything twice a week.",
    days: [
      [
        "Upper A",
        [
          ["Barbell Bench Press", 4, 6],
          ["Barbell Row", 4, 8],
          ["Overhead Press", 3, 8],
          ["Lat Pulldown", 3, 10],
          ["Barbell Curl", 3, 10],
          ["Triceps Pushdown", 3, 12],
        ],
      ],
      [
        "Lower A",
        [
          ["Back Squat", 4, 6],
          ["Romanian Deadlift", 3, 8],
          ["Leg Press", 3, 12],
          ["Leg Curl", 3, 12],
          ["Standing Calf Raise", 4, 15],
        ],
      ],
      [
        "Upper B",
        [
          ["Incline Dumbbell Press", 4, 8],
          ["Pull-up", 4, 8],
          ["Seated Cable Row", 3, 10],
          ["Dumbbell Lateral Raise", 3, 15],
          ["Hammer Curl", 3, 12],
          ["Skull Crusher", 3, 12],
        ],
      ],
      [
        "Lower B",
        [
          ["Deadlift", 3, 5],
          ["Front Squat", 3, 8],
          ["Walking Lunge", 3, 12],
          ["Leg Extension", 3, 15],
          ["Standing Calf Raise", 4, 15],
        ],
      ],
    ],
  },
  {
    key: "body-part",
    name: "5-Day Body Part Split",
    blurb: "5 days · one body part a day. High volume, needs the days.",
    days: [
      [
        "Chest",
        [
          ["Barbell Bench Press", 4, 8],
          ["Incline Dumbbell Press", 3, 10],
          ["Cable Fly", 3, 12],
          ["Dip", 3, 10],
          ["Push-up", 2, 15],
        ],
      ],
      [
        "Back",
        [
          ["Deadlift", 3, 5],
          ["Pull-up", 4, 8],
          ["Barbell Row", 4, 8],
          ["Seated Cable Row", 3, 10],
          ["Lat Pulldown", 3, 12],
        ],
      ],
      [
        "Shoulders",
        [
          ["Overhead Press", 4, 8],
          ["Dumbbell Lateral Raise", 4, 15],
          ["Rear Delt Fly", 3, 15],
          ["Face Pull", 3, 15],
        ],
      ],
      [
        "Legs",
        [
          ["Back Squat", 4, 8],
          ["Romanian Deadlift", 3, 10],
          ["Leg Press", 3, 12],
          ["Leg Curl", 3, 12],
          ["Leg Extension", 3, 15],
          ["Standing Calf Raise", 4, 15],
        ],
      ],
      [
        "Arms",
        [
          ["Barbell Curl", 4, 10],
          ["Skull Crusher", 4, 10],
          ["Hammer Curl", 3, 12],
          ["Triceps Pushdown", 3, 12],
          ["Dip", 3, 10],
        ],
      ],
    ],
  },
  {
    key: "arnold",
    name: "Arnold Split",
    blurb: "3 days run twice a week · chest+back, shoulders+arms, legs. Very high volume.",
    days: [
      [
        "Chest & Back",
        [
          ["Barbell Bench Press", 4, 8],
          ["Barbell Row", 4, 8],
          ["Incline Dumbbell Press", 3, 10],
          ["Pull-up", 3, 10],
          ["Cable Fly", 3, 12],
          ["Lat Pulldown", 3, 12],
        ],
      ],
      [
        "Shoulders & Arms",
        [
          ["Overhead Press", 4, 8],
          ["Dumbbell Lateral Raise", 4, 15],
          ["Rear Delt Fly", 3, 15],
          ["Barbell Curl", 3, 10],
          ["Skull Crusher", 3, 10],
          ["Hammer Curl", 3, 12],
        ],
      ],
      [
        "Legs & Core",
        [
          ["Back Squat", 4, 8],
          ["Romanian Deadlift", 3, 10],
          ["Leg Press", 3, 12],
          ["Leg Curl", 3, 12],
          ["Standing Calf Raise", 4, 20],
          ["Hanging Leg Raise", 3, 12],
        ],
      ],
    ],
  },
];

/** Turns a preset into a split and the routines that belong to it. */
export function buildPreset(p: Preset, exercises: Exercise[]) {
  const byName = new Map(exercises.map((e) => [e.name, e.id]));
  const now = Date.now();
  const split: Split = {
    id: uid(),
    name: p.name,
    blurb: p.blurb,
    preset: p.key,
    createdAt: now,
  };
  const routines: Routine[] = p.days.map(([name, rows], i) => ({
    id: uid(),
    name,
    splitId: split.id,
    items: rows.flatMap(([n, sets, reps]) => {
      const exerciseId = byName.get(n);
      return exerciseId ? [{ exerciseId, sets, reps }] : [];
    }),
    // spaced so the days keep their listed order
    createdAt: now + i,
    updatedAt: now + i,
  }));
  return { split, routines };
}
