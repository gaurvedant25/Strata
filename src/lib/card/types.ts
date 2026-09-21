import type { BodyView } from "../anatomy";
import type { MuscleGroup, MuscleScore, Tier } from "../strength";
import type { Gender } from "../../types";
import type { Layout } from "./draw";

/** The four things worth sending someone. */
export type CardSubject = "streak" | "lift" | "body" | "workout";

export type Stat = { label: string; value: string };

export type StreakData = {
  days: number;
  best: number;
  /** The session it came out of: "Legs · 5 exercises". */
  subject: string;
  dateLabel: string;
  stats: Stat[];
  /** The last twelve weeks, oldest first, true on the days you trained. */
  recent: boolean[];
};

export type LiftData = {
  /** Current qualifying training-day streak when the preview was opened. */
  currentStreak: number;
  metricId: string;
  delta: string;
  name: string;
  dateLabel: string;
  /** What the figure is: "Est. 1RM", "Heaviest set", "Session volume". */
  metricLabel: string;
  unit: string;
  /** The series, oldest first, already filtered to the chosen range. */
  values: number[];
  current: string;
  changePct: number | null;
  /** "Since 12 Jun", or the range's own name when there is no first date. */
  sinceLabel: string;
  /** The first point of the series, formatted the way `current` is. */
  start: string;
  /** The two ends of the range, short: "12 Jun" and "10 Sep". */
  fromLabel: string;
  toLabel: string;
  /**
   * A strict improvement over every earlier reading in the full history.
   */
  record: { value: string; previous: string; gain: string } | null;
  stats: Stat[];
};

export type BodyData = {
  gender: Gender;
  view: BodyView;
  scores: Partial<Record<MuscleGroup, MuscleScore>>;
  dateLabel: string;
  /** Strongest first. */
  top: { label: string; tier: Tier; color: string; value: string }[];
  /**
   * The one region the card leads with.
   *
   * Never a bodyweight multiple: a ratio printed beside an absolute lift is
   * bodyweight by arithmetic, and a card is a thing you hand to strangers.
   */
  headline: { tier: Tier | null; label: string; value: string; unit: string };
};

export type WorkoutData = {
  name: string;
  dateLabel: string;
  unit: string;
  volume: string;
  volumeRecord: boolean;
  duration: string;
  sets: number;
  exerciseCount: number;
  currentStreak: number;
  /** Strict improvements over earlier completions, one record per metric. */
  records: { name: string; metric: "Estimated 1RM" | "Exercise volume"; value: string }[];
  /** Broad groups from completed exercises, not a muscle-intensity estimate. */
  muscles: MuscleGroup[];
  gender: Gender;
};

export type DataFor = {
  streak: StreakData;
  lift: LiftData;
  body: BodyData;
  workout: WorkoutData;
};

/**
 * One card.
 *
 * A template is data with a draw function on it: an id that outlives a rename,
 * a name for anywhere one has to be picked, and the drawing itself. Adding a
 * card means appending one of these to one array — nothing else in the app
 * knows what templates exist.
 *
 * `fits` lets a template decline data it has nothing to say about: the top-set
 * card is not offered for a session of nothing but planks.
 */
export type CardTemplate<S extends CardSubject = CardSubject> = {
  id: string;
  name: string;
  subject: S;
  /**
   * Behind Pro.
   *
   * A marked template is still rendered and still swipeable — somebody has to
   * be able to see what they would be paying for, and a paywall in front of the
   * picture is a paywall in front of the only argument for buying. What Pro
   * buys is the export.
   */
  pro?: true;
  fits?: (d: DataFor[S]) => boolean;
  draw: (L: Layout, d: DataFor[S]) => void;
};
