import type { Exercise, Gender, Session, SetLog } from "../../types";
import { e1rm, streakSummary } from "../stats";
import { MUSCLE_LABEL, type MuscleGroup } from "../strength";
import { fmtDuration, num } from "../util";
import type { WorkoutData } from "./types";

const GROUPS: Record<string, MuscleGroup[]> = {
  chest: ["chest"], back: ["lats", "traps", "lowerBack"], shoulders: ["shoulders"],
  arms: ["biceps", "triceps", "forearms"], legs: ["quadriceps", "hamstrings", "calves"],
  glutes: ["glutes"], core: ["abs", "obliques"],
};
// Only settled, non-skipped, meaningful sets contribute to the share summary.
const completed = (sets: SetLog[]) => sets.filter(s => s.done && !s.skipped &&
  (s.reps > 0 || (s.seconds ?? 0) > 0));

function readings(session: Session, exerciseById: Map<string, Exercise>) {
  const byExercise = new Map<string, { best: number; volume: number; sets: number }>();
  for (const entry of session.entries) {
    const ex = exerciseById.get(entry.exerciseId);
    const sets = completed(entry.sets);
    if (!sets.length) continue;
    const reading = byExercise.get(entry.exerciseId) ?? { best: 0, volume: 0, sets: 0 };
    for (const set of sets) {
      reading.sets++;
      if (ex?.tracks === "time" || set.reps <= 0 || !Number.isFinite(set.weight) || set.weight < 0) continue;
      reading.volume += set.weight * set.reps;
      reading.best = Math.max(reading.best, e1rm(set.weight, set.reps));
    }
    byExercise.set(entry.exerciseId, reading);
  }
  return byExercise;
}

/** Frozen when Share is opened; never reads the clock or includes private notes. */
export function workoutCard(session: Session, exerciseById: Map<string, Exercise>, now: number,
  unit: string, sessions: Session[], gender: Gender): WorkoutData {
  const endedAt = session.endedAt ?? now;
  const previous = sessions.filter(s => s.id !== session.id && !s.deleted &&
    typeof s.endedAt === "number" && s.endedAt < endedAt);
  const history = previous.map(s => readings(s, exerciseById));
  const current = readings(session, exerciseById);
  const records: WorkoutData["records"] = [];
  const muscles = new Set<MuscleGroup>();
  let volume = 0;
  let sets = 0;
  for (const [id, reading] of current) {
    volume += reading.volume;
    sets += reading.sets;
    const ex = exerciseById.get(id);
    const earlier = history.flatMap(map => map.has(id) ? [map.get(id)!] : []);
    if (earlier.length && ex?.tracks !== "time") {
      const best = Math.max(...earlier.map(r => r.best));
      const bestVolume = Math.max(...earlier.map(r => r.volume));
      if (best > 0 && reading.best > best + 1e-6) records.push({
        name: ex?.name ?? "Exercise", metric: "Estimated 1RM", value: `${num(reading.best, 1)} ${unit}`,
      });
      if (bestVolume > 0 && reading.volume > bestVolume + 1e-6) records.push({
        name: ex?.name ?? "Exercise", metric: "Exercise volume", value: `${num(reading.volume, 0)} ${unit}`,
      });
    }
    const category = ex?.muscle.toLowerCase().trim() ?? "";
    const exact = Object.entries(MUSCLE_LABEL).find(([key, label]) =>
      key.toLowerCase() === category || label.toLowerCase() === category)?.[0] as MuscleGroup | undefined;
    for (const group of exact ? [exact] : GROUPS[category] ?? []) muscles.add(group);
  }
  const previousVolume = Math.max(0, ...history.map(map => [...map.values()].reduce((n, r) => n + r.volume, 0)));
  const all = [...sessions.filter(s => s.id !== session.id && !s.deleted), session];
  return {
    name: session.name,
    dateLabel: new Date(endedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
    unit, volume: num(volume, 0),
    volumeRecord: previousVolume > 0 && volume > previousVolume + 1e-6,
    duration: fmtDuration(Math.max(0, endedAt - session.startedAt)),
    sets, exerciseCount: current.size,
    currentStreak: streakSummary(all, now).current,
    records, muscles: [...muscles], gender,
  };
}
