export type Unit = "kg" | "lb";

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
  /** rest override in seconds */
  rest?: number;
};

export type Routine = {
  id: string;
  name: string;
  items: RoutineItem[];
  createdAt: number;
  updatedAt: number;
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
  restSeconds: number;
  restAutoStart: boolean;
  vibrate: boolean;
  sound: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  unit: "kg",
  restSeconds: 120,
  restAutoStart: true,
  vibrate: true,
  sound: true,
};
