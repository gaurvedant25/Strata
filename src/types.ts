import type { BenchmarkLifts } from "./lib/strength";

export type Unit = "kg" | "lb";

/**
 * Fields every stored record carries so it can be synced.
 *
 * `updatedAt` is stamped centrally on write, and conflicts between a device and
 * the server are resolved by taking the later one. `deleted` is a tombstone:
 * a removed record is kept as a marker rather than dropped, because a row that
 * simply vanishes locally is indistinguishable from one the server has never
 * heard of, and would be resurrected on the next pull.
 */
export type Synced = {
  updatedAt?: number;
  deleted?: boolean;
};
export type Gender = "male" | "female";

export type Exercise = Synced & {
  id: string;
  name: string;
  muscle: string;
  /** bodyweight exercises log reps only (weight = added weight) */
  bodyweight?: boolean;
  /**
   * What a set of this is counted in. Absent means reps, which is almost
   * everything; a plank or a treadmill run is held for a duration instead, and
   * asking those for a rep count only ever produced a 1 standing in for
   * "I did it".
   */
  tracks?: "reps" | "time";
  createdAt: number;
  archived?: boolean;
};

export type RoutineItem = {
  exerciseId: string;
  sets: number;
  reps: number;
};

/** One training day. Belongs to the split it was created under. */
export type Routine = Synced & {
  id: string;
  name: string;
  /** The split this day belongs to. Absent only on data from before splits existed. */
  splitId?: string;
  items: RoutineItem[];
  createdAt: number;
  updatedAt: number;
};

/**
 * A training programme: a named set of days you rotate through. One split is
 * active at a time, and the Routines screen shows that split's days.
 */
export type Split = Synced & {
  id: string;
  name: string;
  /** One line describing who the split suits, shown when choosing. */
  blurb: string;
  /** Which built-in preset this came from, so choosing it twice reuses it. */
  preset?: string;
  createdAt: number;
};

export type SetLog = {
  id: string;
  reps: number;
  /**
   * How long the set was held, for an exercise that tracks time.
   *
   * Kept beside `reps` rather than replacing it, and a timed set leaves `reps`
   * at zero. Everything that scores training — volume, estimated 1RMs, personal
   * bests — already ignores a set with no reps in it, so a minute of plank
   * stays out of the strength maths on its own rather than each of those
   * places having to learn what a timed set is.
   */
  seconds?: number;
  weight: number;
  rpe?: number;
  done: boolean;
  /** Deliberately passed over rather than logged. Counts as settled, not as work. */
  skipped?: boolean;
};

export type SessionEntry = {
  id: string;
  exerciseId: string;
  sets: SetLog[];
  note?: string;
};

export type Session = Synced & {
  id: string;
  name: string;
  routineId?: string;
  /** local YYYY-MM-DD, used for grouping/calendar */
  date: string;
  startedAt: number;
  endedAt?: number;
  entries: SessionEntry[];
  note?: string;
};

export type BodyWeight = Synced & {
  /** YYYY-MM-DD, one entry per day */
  date: string;
  weight: number;
  at: number;
};

export type Settings = {
  unit: Unit;
  /** drives which bodyweight-relative strength standards the body map scores against */
  gender: Gender;
  /**
   * The lift each region is scored on, where you named one during setup.
   * Regions you never answered for are absent and use the built-in benchmark.
   */
  benchmarks?: BenchmarkLifts;
};

export const DEFAULT_SETTINGS: Settings = {
  unit: "kg",
  gender: "male",
};
