import type { Session, SetLog } from "../types";

/** Epley formula. A single heavy rep is its own 1RM. */
export function e1rm(weight: number, reps: number) {
  if (reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export const working = (sets: SetLog[]) => sets.filter((s) => s.done && !s.warmup && s.reps > 0);

export function setVolume(s: SetLog) {
  return s.weight * s.reps;
}

export function sessionVolume(session: Session) {
  return session.entries.reduce(
    (t, e) => t + working(e.sets).reduce((x, s) => x + setVolume(s), 0),
    0,
  );
}

export function sessionSetCount(session: Session) {
  return session.entries.reduce((t, e) => t + working(e.sets).length, 0);
}

export type ExercisePoint = {
  date: string;
  at: number;
  topWeight: number;
  e1rm: number;
  volume: number;
  reps: number;
};

/** One point per session in which the exercise was actually worked, oldest first. */
export function exerciseHistory(sessions: Session[], exerciseId: string): ExercisePoint[] {
  const out: ExercisePoint[] = [];
  for (const s of sessions) {
    for (const e of s.entries) {
      if (e.exerciseId !== exerciseId) continue;
      const sets = working(e.sets);
      if (!sets.length) continue;
      let topWeight = 0;
      let best = 0;
      let volume = 0;
      let reps = 0;
      for (const set of sets) {
        topWeight = Math.max(topWeight, set.weight);
        best = Math.max(best, e1rm(set.weight, set.reps));
        volume += setVolume(set);
        reps += set.reps;
      }
      out.push({ date: s.date, at: s.startedAt, topWeight, e1rm: best, volume, reps });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export type PR = {
  exerciseId: string;
  bestE1rm: number;
  heaviest: number;
  heaviestReps: number;
  bestVolume: number;
  at: number;
  date: string;
};

export function personalRecords(sessions: Session[]): Map<string, PR> {
  const map = new Map<string, PR>();
  for (const s of sessions) {
    for (const e of s.entries) {
      for (const set of working(e.sets)) {
        const cur =
          map.get(e.exerciseId) ??
          ({
            exerciseId: e.exerciseId,
            bestE1rm: 0,
            heaviest: 0,
            heaviestReps: 0,
            bestVolume: 0,
            at: 0,
            date: s.date,
          } as PR);
        const est = e1rm(set.weight, set.reps);
        if (est > cur.bestE1rm) {
          cur.bestE1rm = est;
          cur.at = s.startedAt;
          cur.date = s.date;
        }
        if (set.weight > cur.heaviest) {
          cur.heaviest = set.weight;
          cur.heaviestReps = set.reps;
        }
        map.set(e.exerciseId, cur);
      }
    }
  }
  for (const s of sessions) {
    for (const e of s.entries) {
      const vol = working(e.sets).reduce((t, x) => t + setVolume(x), 0);
      const cur = map.get(e.exerciseId);
      if (cur && vol > cur.bestVolume) cur.bestVolume = vol;
    }
  }
  return map;
}

/** Most recent completed sets for an exercise, excluding a session id. Powers "last time". */
export function lastPerformance(sessions: Session[], exerciseId: string, excludeSessionId?: string) {
  const ordered = [...sessions].sort((a, b) => b.startedAt - a.startedAt);
  for (const s of ordered) {
    if (s.id === excludeSessionId) continue;
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    const sets = working(entry.sets);
    if (sets.length) return { session: s, sets };
  }
  return null;
}

export function currentStreak(sessions: Session[]) {
  const days = new Set(sessions.filter((s) => s.endedAt).map((s) => s.date));
  if (!days.size) return 0;
  let streak = 0;
  const d = new Date();
  const key = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  if (!days.has(key(d))) d.setDate(d.getDate() - 1);
  while (days.has(key(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
