import { useMemo, useState } from "react";
import { useConfirm } from "../components/confirm";
import { StreakDetails } from "../components/StreakDetails";
import { StreakIcon } from "../components/icons";
import { Button, Empty, Eyebrow, StatBand, TextTabs } from "../components/ui";
import {
  e1rm,
  personalRecords,
  sessionSetCount,
  sessionVolume,
  streakSummary,
  working,
} from "../lib/stats";
import { fmtClock, fmtDuration, num, parseKey, todayKey } from "../lib/util";
import { workoutCard } from "../lib/card/select";
import type { WorkoutData } from "../lib/card/types";
import { WorkoutSharePreview } from "../components/WorkoutSharePreview";
import { useStore } from "../store";
import { useWriteGate } from "../lib/useEntitlement";
import type { GateSubject } from "../lib/entitlement";
import type { Session } from "../types";

/** How far back the list reaches. "All" is the default. */
type Filter = "all" | "30d" | "90d" | "year";
const FILTERS: { id: Filter; label: string; days: number }[] = [
  { id: "all", label: "All", days: Infinity },
  { id: "30d", label: "30d", days: 30 },
  { id: "90d", label: "90d", days: 90 },
  { id: "year", label: "1y", days: 365 },
];

/**
 * The last four weeks, a row per week, Monday first.
 *
 * A glance at rhythm rather than a record: which days you trained, whether the
 * weeks look alike, and how much of this one is still to come. A day with a
 * finished workout is lit; a day not yet reached is drawn darker than a day
 * that passed without one, so an empty Sunday ahead is not read as a miss.
 */
function FourWeeks({ sessions, now }: { sessions: Session[]; now: number }) {
  const trained = new Set(sessions.filter((x) => x.endedAt).map((x) => x.date));
  const today = todayKey(new Date(now));
  const start = parseKey(today);
  // Back to this week's Monday, then three weeks further.
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 21);
  const days = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = todayKey(d);
    return { key, on: trained.has(key), future: key > today };
  });
  const count = days.filter((d) => d.on).length;
  return (
    <div
      role="img"
      aria-label={`${count} training day${count === 1 ? "" : "s"} in the last four weeks`}
      className="grid grid-cols-7 gap-1 pb-1 pt-4"
    >
      {["M", "T", "W", "T", "F", "S", "S"].map((l, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="pb-0.5 text-center font-mono text-[0.625rem] font-medium text-dim"
        >
          {l}
        </span>
      ))}
      {days.map((d) => (
        <span
          key={d.key}
          aria-hidden="true"
          className="h-3 rounded-[3px]"
          style={{
            background: d.on ? "var(--color-fg)" : d.future ? "#0c0c0c" : "var(--color-rule)",
          }}
        />
      ))}
    </div>
  );
}

export function History({ onUnlock }: { onUnlock: (f: GateSubject) => void }) {
  const s = useStore();
  const [open, setOpen] = useState<Session | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [streakOpen, setStreakOpen] = useState(false);
  const unitLabel = s.settings.unit === "lb" ? "lbs" : "kg";

  const done = useMemo(() => s.sessions.filter((x) => x.endedAt), [s.sessions]);
  const streak = useMemo(
    () => streakSummary(s.sessions, s.now),
    [s.sessions, s.now],
  );
  const latestStreakWorkout = streak.latestSessionId
    ? (s.sessions.find((x) => x.id === streak.latestSessionId)?.name ?? null)
    : null;

  const months = useMemo(() => {
    const cutoff = FILTERS.find((f) => f.id === filter)!.days;
    const since = cutoff === Infinity ? 0 : Date.now() - cutoff * 864e5;
    const m = new Map<string, Session[]>();
    for (const x of done) {
      if (x.startedAt < since) continue;
      const key = parseKey(x.date).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
      m.set(key, [...(m.get(key) ?? []), x]);
    }
    return [...m.entries()];
  }, [done, filter]);

  // The workout detail is its own screen rather than a sheet: it is a page of
  // record, long enough to scroll, and a sheet over a list made it feel like a
  // peek at something rather than the thing itself.
  if (open) {
    return <Detail session={open} onBack={() => setOpen(null)} onUnlock={onUnlock} />;
  }

  const shown = months.reduce((t, [, l]) => t + l.length, 0);

  return (
    <div className="min-h-full pb-stack">
      <div className="sticky top-0 z-20 border-b border-rule bg-ink/95 px-5 pt-[calc(env(safe-area-inset-top)+14px)] backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <Eyebrow>History</Eyebrow>
          <div className="-my-3 -mr-3 flex items-center gap-1">
            <Eyebrow className="tracking-[0.16em]">
              {shown} workout{shown === 1 ? "" : "s"}
            </Eyebrow>
            <button
              onClick={() => setStreakOpen(true)}
              aria-label={`View streak, ${streak.current} day${streak.current === 1 ? "" : "s"}`}
              className={`press flex size-11 items-center justify-center gap-1 font-mono text-label font-semibold ${streak.current ? "text-ember" : "text-muted"}`}
            >
              <StreakIcon size={18} />
              <span>{streak.current}</span>
            </button>
          </div>
        </div>
        <FourWeeks sessions={s.sessions} now={s.now} />
        <TextTabs
          className="pb-3"
          options={FILTERS.map((f) => ({ id: f.id, label: f.label }))}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {done.length === 0 ? (
        <div className="px-5">
          <Empty
            eyebrow="Nothing logged"
            title="Finished workouts land here, newest month first."
          />
        </div>
      ) : shown === 0 ? (
        <div className="px-5">
          <Empty
            eyebrow="Nothing in range"
            title="No workouts in this window."
          />
        </div>
      ) : (
        months.map(([label, list]) => (
          <div key={label} className="px-5">
            <div className="flex items-baseline justify-between px-1.5 pb-2.5 pt-[22px]">
              <Eyebrow className="tracking-[0.18em]">{label}</Eyebrow>
              <span className="font-mono text-[0.6875rem] font-medium text-dim">
                {list.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {list.map((x) => {
                const d = parseKey(x.date);
                return (
                  <button
                    key={x.id}
                    onClick={() => setOpen(x)}
                    className="press press-row grid w-full grid-cols-[46px_1fr_auto] items-center gap-x-3.5 rounded-[18px] border border-rule bg-[#101010] px-[18px] py-4 text-left"
                  >
                    <span className="font-mono text-[0.6875rem] font-medium uppercase leading-[1.35] tracking-[0.06em] text-muted">
                      {d.toLocaleDateString(undefined, { day: "2-digit" })}
                      <br />
                      {d.toLocaleDateString(undefined, { month: "short" })}
                    </span>
                    <span className="min-w-0">
                      {/*
                      The one thing at full brightness in the row. What you come
                      to this screen for is which session a line was, and the
                      name was competing on level terms with the volume — two
                      numerals of the same weight, one of them holding the
                      right-hand edge, so the eye went to the tonnage first and
                      had to come back for the answer.
                    */}
                      <span className="block truncate text-[1.0625rem] font-medium tracking-[-0.01em]">
                        {x.name}
                      </span>
                      <span className="mt-0.5 block font-mono text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-dim">
                        {x.entries.length} ex · {sessionSetCount(x)} sets
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-mono text-[0.875rem] font-medium text-muted">
                        {num(sessionVolume(x), 0)}{" "}
                        <span className="text-[0.6875rem] uppercase tracking-[0.1em] text-dim">
                          {unitLabel}
                        </span>
                      </span>
                      <span className="block font-mono text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-dim">
                        {x.endedAt ? fmtDuration(x.endedAt - x.startedAt) : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
      <StreakDetails
        open={streakOpen}
        onClose={() => setStreakOpen(false)}
        summary={streak}
        latestWorkout={latestStreakWorkout}
      />
    </div>
  );
}

/** One logged workout, as a page. */
function Detail({
  session,
  onBack,
  onUnlock,
}: {
  session: Session;
  onBack: () => void;
  onUnlock: (f: GateSubject) => void;
}) {
  const { guard } = useWriteGate(() => onUnlock("start-workout"));
  const s = useStore();
  const ask = useConfirm();
  const unitLabel = s.settings.unit === "lb" ? "lbs" : "kg";
  const d = parseKey(session.date);

  // A set is flagged as a PR when it set the best estimated 1RM for that
  // exercise across every finished workout — the same rule the badge uses live.
  const prs = useMemo(
    () => personalRecords(s.sessions.filter((x) => x.endedAt)),
    [s.sessions],
  );

  const [shareData, setShareData] = useState<WorkoutData | null>(null);

  return (
    <div className="min-h-full pb-stack">
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+12px)]">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-muted active:text-fg"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 6l-6 6 6 6" />
          </svg>
          <span className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em]">
            History
          </span>
        </button>
      </div>

      <div className="px-5 pb-5 pt-6">
        <h1 className="text-[1.9375rem] font-bold leading-none tracking-[-0.028em]">
          {session.name}
        </h1>
        <p className="mt-2.5 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted">
          {d.toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      <StatBand
        stats={[
          {
            label: "Duration",
            value: session.endedAt
              ? fmtDuration(session.endedAt - session.startedAt)
              : "—",
          },
          { label: "Sets", value: String(sessionSetCount(session)) },
          { label: unitLabel, value: num(sessionVolume(session), 0) },
        ]}
      />

      {session.entries.map((e) => {
        const ex = s.exerciseById.get(e.exerciseId);
        const sets = working(e.sets);
        const best = ex ? (prs.get(ex.id)?.bestE1rm ?? 0) : 0;
        return (
          <div key={e.id} className="border-b border-rule px-5 pb-3.5 pt-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-[1rem] font-medium tracking-[-0.01em]">
                {ex?.name ?? "Exercise"}
              </p>
              <span className="shrink-0 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted">
                {ex?.tracks === "time"
                  ? fmtClock(sets.reduce((t, x) => t + (x.seconds ?? 0), 0))
                  : `${num(
                      sets.reduce((t, x) => t + x.weight * x.reps, 0),
                      0,
                    )} ${unitLabel}`}
              </span>
            </div>
            <div className="mt-3">
              {sets.map((set, i) => {
                // A held set has no estimated 1RM to beat, so it is never a PR.
                const isPr =
                  ex?.tracks !== "time" &&
                  best > 0 &&
                  e1rm(set.weight, set.reps) >= best - 0.01;
                return (
                  <div
                    key={set.id}
                    className="grid grid-cols-[22px_1fr_44px_34px] items-baseline gap-x-3 border-b border-subrule py-[7px]"
                  >
                    <span className="font-mono text-[0.6875rem] text-dim">
                      {i + 1}
                    </span>
                    <span className="font-mono text-[0.875rem]">
                      {ex?.tracks === "time" ? (
                        set.weight ? (
                          <>
                            +{num(set.weight)}{" "}
                            <span className="text-dim">·</span>{" "}
                            {fmtClock(set.seconds ?? 0)}
                          </>
                        ) : (
                          fmtClock(set.seconds ?? 0)
                        )
                      ) : (
                        <>
                          {num(set.weight)} <span className="text-dim">×</span>{" "}
                          {set.reps}
                        </>
                      )}
                    </span>
                    <span className="text-center font-mono text-[0.6875rem] text-muted">
                      {set.rpe ? `@${set.rpe}` : ""}
                    </span>
                    <span className="text-right font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-fg">
                      {isPr ? "PR" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {session.note && (
        <div className="border-b border-rule px-5 py-5">
          <Eyebrow className="tracking-[0.18em]">Note</Eyebrow>
          <p className="mt-2 whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-pretty">
            {session.note}
          </p>
        </div>
      )}

      {shareData && (
        <WorkoutSharePreview
          data={shareData}
          onClose={() => setShareData(null)}
          onUnlock={() => {
            setShareData(null);
            onUnlock("premium-share");
          }}
        />
      )}
      <div className="flex flex-col gap-3.5 px-5 pt-6">
        <Button
          variant="quiet"
          onClick={guard(() =>
            setShareData(
              workoutCard(session, s.exerciseById, s.now, unitLabel,
                s.sessions, s.settings.gender),
            ),
          )}
        >
          Share workout
        </Button>
        <Button
          onClick={() => {
            void s.resumeSession(session.id);
            onBack();
          }}
        >
          Reopen &amp; edit
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            const yes = await ask({
              title: "Delete this workout?",
              body: "It is removed permanently, and the lifts in it stop counting toward your scores.",
              confirmLabel: "Delete workout",
              danger: true,
            });
            if (yes) {
              void s.deleteSession(session.id);
              onBack();
            }
          }}
        >
          Delete workout
        </Button>
      </div>
    </div>
  );
}
