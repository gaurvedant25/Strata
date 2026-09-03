import type { Exercise } from "../types";
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
