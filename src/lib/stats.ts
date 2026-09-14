import type { Session, SetLog } from "../types";
import { todayKey } from "./util";

/** Epley formula. A single heavy rep is its own 1RM. */
export function e1rm(weight: number, reps: number) {
  if (reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export const working = (sets: SetLog[]) =>
  sets.filter((s) => s.done && s.reps > 0);

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

/**
 * How long the session took, in ms.
 *
 * A workout that has been ended has a fixed length and keeps it forever. Only
 * one that is still running counts up, and it counts against the clock passed
 * in rather than reading the time itself, so every display of it in a render
 * agrees to the millisecond.
 *
 * Reopening a finished workout to correct a number used to restart this: the
 * session went back to being the active one, the header resumed counting from
 * its original start, and finishing again stamped a fresh end — so a set fixed
 * the next morning turned a 48-minute session into a 14-hour one. Editing is
 * not training, and it does not add time.
 */
export function sessionElapsed(session: Session, now: number) {
  return (session.endedAt ?? now) - session.startedAt;
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
export function exerciseHistory(
  sessions: Session[],
  exerciseId: string,
): ExercisePoint[] {
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
      out.push({
        date: s.date,
        at: s.startedAt,
        topWeight,
        e1rm: best,
        volume,
        reps,
      });
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
export function lastPerformance(
  sessions: Session[],
  exerciseId: string,
  excludeSessionId?: string,
) {
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

/**
 * The best of a set of sets — what a lift is worth quoting from a session.
 *
 * Ranked by estimated 1RM rather than by raw weight, because that is what the
 * rest of the app means by "best": a PR is measured against `bestE1rm`, and the
 * body map scores a region the same way. On that measure 100×5 beats 105×1,
 * which is also the honest answer to what you should have on the bar next time.
 *
 * A held movement has no reps to estimate from, so the longest hold wins.
 */
export function bestSet(sets: SetLog[]): SetLog | null {
  let best: SetLog | null = null;
  for (const x of sets) {
    if (!best) { best = x; continue; }
    const better = x.reps > 0 || best.reps > 0
      ? e1rm(x.weight, x.reps) > e1rm(best.weight, best.reps)
      : (x.seconds ?? 0) > (best.seconds ?? 0);
    if (better) best = x;
  }
  return best;
}

/**
 * What you did on this lift the last time you trained it, and the best set in
 * it — the numbers a fresh set is opened on.
 */
export function lastBestSet(
  sessions: Session[],
  exerciseId: string,
  excludeSessionId?: string,
): SetLog | null {
  const prev = lastPerformance(sessions, exerciseId, excludeSessionId);
  return prev ? bestSet(prev.sets) : null;
}

/**
 * How long a streak survives on its own: the clock starts when a workout is
 * finished, and runs out sixty hours later.
 *
 * A day is too tight — a rest day is training, not a lapse — and a week is not
 * a streak at all. Sixty hours leaves room for two rest nights while still
 * making the next session a real continuation of the run.
 */
export const STREAK_WINDOW_MS = 60 * 60 * 60 * 1000;

/** A streak needs real work, but timed sets count even though they have no reps. */
export function qualifiesForStreak(session: Session) {
  return session.entries.some((entry) =>
    entry.sets.some((set) => set.done && !set.skipped),
  );
}

type CompletedSession = Session & { endedAt: number };

function qualifyingSessions(sessions: Session[]): CompletedSession[] {
  return sessions
    .filter(
      (session): session is CompletedSession =>
        typeof session.endedAt === "number" &&
        Number.isFinite(session.endedAt) &&
        session.endedAt > 0 &&
        qualifiesForStreak(session),
    )
    .sort((a, b) => b.endedAt - a.endedAt);
}

/** A streak day follows the local date on which the workout was completed. */
const completionDay = (session: CompletedSession) =>
  todayKey(new Date(session.endedAt));

export type Streak = {
  /** Distinct days trained in the run that is still alive. Zero when broken. */
  days: number;
  /** When the streak lapses if nothing else is finished. Null with no streak. */
  expiresAt: number | null;
};

export type StreakSummary = {
  current: number;
  best: number;
  expiresAt: number | null;
  remainingMs: number;
  latestCompletedAt: number | null;
  latestSessionId: string | null;
};

function longestRun(ended: CompletedSession[]) {
  let best = 0;
  let run = new Set<string>();
  for (let i = 0; i < ended.length; i++) {
    if (i > 0 && ended[i - 1].endedAt - ended[i].endedAt > STREAK_WINDOW_MS) {
      best = Math.max(best, run.size);
      run = new Set();
    }
    run.add(completionDay(ended[i]));
  }
  return Math.max(best, run.size);
}

/** The single source of truth for every streak surface in the app. */
export function streakSummary(
  sessions: Session[],
  now = Date.now(),
): StreakSummary {
  const ended = qualifyingSessions(sessions);
  if (!ended.length) {
    return {
      current: 0,
      best: 0,
      expiresAt: null,
      remainingMs: 0,
      latestCompletedAt: null,
      latestSessionId: null,
    };
  }

  const latest = ended[0];
  const expiresAt = latest.endedAt + STREAK_WINDOW_MS;
  const common = {
    best: longestRun(ended),
    latestCompletedAt: latest.endedAt,
    latestSessionId: latest.id,
  };
  if (now >= expiresAt) {
    return { current: 0, expiresAt: null, remainingMs: 0, ...common };
  }

  const days = new Set<string>();
  for (let i = 0; i < ended.length; i++) {
    if (i > 0 && ended[i - 1].endedAt - ended[i].endedAt > STREAK_WINDOW_MS)
      break;
    days.add(completionDay(ended[i]));
  }
  return {
    current: days.size,
    expiresAt,
    remainingMs: Math.max(0, expiresAt - now),
    ...common,
  };
}

/**
 * The run of training days you are currently on.
 *
 * Counted in days rather than in workouts, so two sessions in one day are one
 * day of the streak — the streak is a record of showing up, and you can only
 * show up once a day. But the chain that links those days is measured from one
 * finish to the next in hours, not in calendar squares: miss a day and the
 * streak holds, miss two and it is gone. That is the same promise whichever
 * side of midnight you train on, which a calendar rule is not — under one,
 * finishing at 11pm buys you an hour and finishing at 6am buys you a day.
 *
 * An unfinished workout is not a day trained. The session in progress counts
 * only after its completion time has been persisted.
 */
export function currentStreak(sessions: Session[], now = Date.now()): Streak {
  const summary = streakSummary(sessions, now);
  return { days: summary.current, expiresAt: summary.expiresAt };
}

/**
 * The longest run you have ever put together, by the same rule.
 *
 * The current streak is only half a figure on its own — eight days means one
 * thing to someone whose best is nine and quite another to someone whose best
 * is thirty. This is what the arc on the finish card is measured against, so
 * the number has something to be a fraction of.
 *
 * Walks every finished workout oldest-last and cuts the log into runs wherever
 * more than the window passed between two finishes, counting the distinct days
 * in each. The run you are on now is one of the runs considered, so the best
 * is never smaller than the current streak and a personal best reads as a full
 * ring rather than as a ring that has overshot.
 */
export function bestStreak(sessions: Session[]) {
  return longestRun(qualifyingSessions(sessions));
}
