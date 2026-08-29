import type { Exercise, Routine } from "../types";
import { uid } from "./util";

const LIB: [string, string, boolean?][] = [
  ["Barbell Bench Press", "Chest"],
  ["Incline Dumbbell Press", "Chest"],
  ["Cable Fly", "Chest"],
  ["Push-up", "Chest", true],
  ["Overhead Press", "Shoulders"],
  ["Dumbbell Lateral Raise", "Shoulders"],
  ["Face Pull", "Shoulders"],
  ["Rear Delt Fly", "Shoulders"],
  ["Deadlift", "Back"],
  ["Barbell Row", "Back"],
  ["Lat Pulldown", "Back"],
  ["Seated Cable Row", "Back"],
  ["Pull-up", "Back", true],
  ["Chin-up", "Back", true],
  ["Back Squat", "Legs"],
  ["Front Squat", "Legs"],
  ["Romanian Deadlift", "Legs"],
  ["Leg Press", "Legs"],
  ["Leg Extension", "Legs"],
  ["Leg Curl", "Legs"],
  ["Walking Lunge", "Legs"],
  ["Standing Calf Raise", "Legs"],
  ["Hip Thrust", "Glutes"],
  ["Barbell Curl", "Arms"],
  ["Dumbbell Curl", "Arms"],
  ["Hammer Curl", "Arms"],
  ["Triceps Pushdown", "Arms"],
  ["Skull Crusher", "Arms"],
  ["Dip", "Arms", true],
  ["Plank", "Core", true],
  ["Hanging Leg Raise", "Core", true],
  ["Cable Crunch", "Core"],
];

export function seedExercises(): Exercise[] {
  const now = Date.now();
  return LIB.map(([name, muscle, bw], i) => ({
    id: uid(),
    name,
    muscle,
    bodyweight: bw ?? false,
    createdAt: now + i,
  }));
}

export function seedRoutines(ex: Exercise[]): Routine[] {
  const find = (n: string) => ex.find((e) => e.name === n)?.id;
  const build = (name: string, rows: [string, number, number][]): Routine | null => {
    const items = rows
      .map(([n, sets, reps]) => {
        const id = find(n);
        return id ? { exerciseId: id, sets, reps } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    if (!items.length) return null;
    const now = Date.now();
    return { id: uid(), name, items, createdAt: now, updatedAt: now };
  };
  return [
    build("Push", [
      ["Barbell Bench Press", 4, 6],
      ["Overhead Press", 3, 8],
      ["Incline Dumbbell Press", 3, 10],
      ["Dumbbell Lateral Raise", 3, 15],
      ["Triceps Pushdown", 3, 12],
    ]),
    build("Pull", [
      ["Deadlift", 3, 5],
      ["Pull-up", 4, 8],
      ["Barbell Row", 3, 8],
      ["Face Pull", 3, 15],
      ["Barbell Curl", 3, 10],
    ]),
    build("Legs", [
      ["Back Squat", 4, 6],
      ["Romanian Deadlift", 3, 8],
      ["Leg Press", 3, 12],
      ["Leg Curl", 3, 12],
      ["Standing Calf Raise", 4, 15],
    ]),
  ].filter((r): r is Routine => !!r);
}
