export type Unit = "kg" | "lb";
export type Gender = "male" | "female";

export type Exercise = {
  id: string;
  name: string;
  muscle: string;
  /** bodyweight exercises log reps only (weight = added weight) */
  bodyweight?: boolean;
  createdAt: number;
  archived?: boolean;
};

export type RoutineItem = {
  exerciseId: string;
  sets: number;
  reps: number;
};

/** One training day. Belongs to the split it was created under. */
export type Routine = {
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
export type Split = {
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
  weight: number;
  rpe?: number;
  done: boolean;
  warmup?: boolean;
};

export type SessionEntry = {
  id: string;
  exerciseId: string;
  sets: SetLog[];
  note?: string;
};

export type Session = {
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

export type BodyWeight = {
  /** YYYY-MM-DD, one entry per day */
  date: string;
  weight: number;
  at: number;
};

export type Settings = {
  unit: Unit;
  /** drives which bodyweight-relative strength standards the body map scores against */
  gender: Gender;
};

export const DEFAULT_SETTINGS: Settings = {
  unit: "kg",
  gender: "male",
};
