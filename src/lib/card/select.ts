import type { BodyView } from "../anatomy";
import {
  MUSCLE_LABEL,
  TIER_LEVEL,
  type MuscleGroup,
  type MuscleScore,
  type Tier,
} from "../strength";
import {
  e1rm,
  qualifiesForStreak,
  streakSummary,
  working,
} from "../stats";
import { fmtClock, fmtDuration, localDate, num, parseKey, todayKey } from "../util";
import type { Gender, Session } from "../../types";
import type { BodyData, LiftData, StreakData } from "./types";

/**
 * The four payloads, built from values the screens already hold.
 *
 * Pure functions, taking plain arguments: no React, no store, no drawing. A
 * template never sees a `Session` or a `MuscleScore` map it has to interpret —
 * it gets strings that are already formatted and numbers that are already
 * scaled, which is what keeps the drawing code free of the app's data model.
 *
 * These are also where privacy is enforced rather than left to a template's
 * good manners. Absolute body weight never reaches a card, and neither does a
 * bodyweight multiple — a ratio printed next to an absolute lift is body
 * weight by arithmetic. Session notes never reach one either: they are written
 * to yourself.
 */

const dayLabel = (dateKey: string) =>
  localDate(parseKey(dateKey), {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** The last twelve weeks as a flat run of days, oldest first. */
function recentDays(sessions: Session[], now: number, span = 84) {
  const trained = new Set(
    sessions
      .filter(
        (s): s is Session & { endedAt: number } =>
          typeof s.endedAt === "number" && qualifiesForStreak(s),
      )
      .map((s) => todayKey(new Date(s.endedAt))),
  );
  const out: boolean[] = [];
  const d = new Date(now);
  d.setDate(d.getDate() - (span - 1));
  for (let i = 0; i < span; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push(trained.has(key));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function streakCard(
  sessions: Session[],
  session: Session,
  now: number,
  unit: string,
): StreakData {
  const streak = streakSummary(sessions, now);
  return {
    days: streak.current,
    best: streak.best,
    subject: `${session.name} · ${plural(session.entries.length, "exercise")}`,
    dateLabel: dayLabel(todayKey(new Date(session.endedAt ?? now))),
    recent: recentDays(sessions, now),
    stats: sessionStats(session, now, unit),
  };
}

/** Time, sets and volume — the three the finish card shows. */
function sessionStats(session: Session, now: number, unit: string) {
  let sets = 0;
  let volume = 0;
  for (const e of session.entries)
    for (const s of working(e.sets)) {
      sets++;
      volume += s.weight * s.reps;
    }
  return [
    {
      label: "Time",
      value: fmtDuration((session.endedAt ?? now) - session.startedAt),
    },
    { label: "Sets", value: String(sets) },
    { label: unit, value: num(volume, 0) },
  ];
}

export { workoutCard } from "./workoutData";

/**
 * The lift, as the three cards need it.
 *
 * The screen hands over the series and the two things a card cannot work out
 * for itself — the date under each point, and how many decimals this metric is
 * written to — and the rest is derived here rather than on the page. That
 * keeps the record card's one real question, *is the latest point actually the
 * best one*, in the same file as every other claim a card makes, instead of
 * inside a template that would have to be trusted to ask it.
 */
export function liftCard({
  currentStreak,
  metricId,
  history,
  name,
  values,
  metricLabel,
  unit,
  sinceLabel,
  stats,
  dates,
  decimals,
}: Omit<
  LiftData,
  "dateLabel" | "start" | "fromLabel" | "toLabel" | "record" | "delta" | "current" | "changePct"
> & {
  history: number[];
  /** One short date per point, in the same order as `values`. */
  dates: string[];
  decimals: number;
}): LiftData {
  const last = values[values.length - 1] ?? 0;
  const before = history.slice(0, -1).filter(Number.isFinite);
  const beat = before.length ? Math.max(...before) : 0;
  return {
    currentStreak,
    metricId,
    delta: `${last > (values[0] ?? 0) ? "+" : ""}${num(last - (values[0] ?? 0), decimals)}`,
    name,
    values,
    current: num(last, decimals),
    metricLabel,
    unit,
    changePct: values.length > 1 && values[0] > 0 ? (last - values[0]) / values[0] * 100 : null,
    sinceLabel,
    stats,
    start: num(values[0] ?? 0, decimals),
    fromLabel: dates[0] ?? "",
    toLabel: dates[dates.length - 1] ?? "",
    // A record needs something to have been beaten: the first session a lift
    // is logged is the best it has ever been, and saying so is not news.
    record:
      before.length && last === history[history.length - 1] && last > beat
        ? {
            value: num(last, decimals),
            previous: num(beat, decimals),
            gain: `+${num(last - beat, decimals)}`,
          }
        : null,
    dateLabel: dates[dates.length - 1] ?? dayLabel(todayKey()),
  };
}

export function bodyCard(
  gender: Gender,
  view: BodyView,
  scores: Partial<Record<MuscleGroup, MuscleScore>>,
  unit: string,
): BodyData {
  const entries = Object.entries(scores) as [MuscleGroup, MuscleScore][];
  /*
   * The same figure the strength screen shows, so one region never carries two
   * different "bests" across the app: the plate for a lift scored on you plus
   * the plate, signed, because "+15" and "15" are different claims on a card
   * with no room to explain which one it means.
   */
  const figure = (sc: MuscleScore) =>
    sc.hold
      ? fmtClock(sc.hold.seconds)
      : sc.added1rm == null
        ? num(sc.best1rm, 0)
        : `+${num(sc.added1rm, 0)}`;
  // Strongest first, by the score the body chart lights each region with.
  const ranked = [...entries].sort((a, b) => b[1].score - a[1].score);
  const top = ranked.map(([group, sc]) => ({
    group,
    label: MUSCLE_LABEL[group] ?? group,
    tier: sc.tier as Tier,
    color: sc.color,
    value: figure(sc),
  }));
  const lead = ranked[0];
  return {
    gender,
    view,
    scores,
    dateLabel: dayLabel(todayKey()),
    top,
    headline: lead
      ? {
          tier: lead[1].tier as Tier,
          label: MUSCLE_LABEL[lead[0]] ?? lead[0],
          value: figure(lead[1]),
          unit,
        }
      : { tier: null, label: "Unscored", value: "—", unit },
  };
}

/** What each tier means, for anywhere a card wants to spell it out. */
export const tierLevel = (t: Tier) => TIER_LEVEL[t];

/** Best estimated 1RM per exercise, which is what a PR flag is measured against. */
export function prBests(sessions: Session[]) {
  const best = new Map<string, number>();
  for (const s of sessions) {
    if (!s.endedAt) continue;
    for (const e of s.entries)
      for (const set of working(e.sets)) {
        const est = e1rm(set.weight, set.reps);
        if (est > (best.get(e.exerciseId) ?? 0)) best.set(e.exerciseId, est);
      }
  }
  return best;
}

