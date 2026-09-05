import { useMemo, useState } from "react";
import { Scramble } from "../components/Callout";
import { Sparkline } from "../components/Sparkline";
import { BigNumber, Empty, Eyebrow, Sheet, StatBand, TextTabs } from "../components/ui";
import { exerciseHistory, personalRecords, sessionVolume } from "../lib/stats";
import { num, parseKey } from "../lib/util";
import { useStore } from "../store";

type Metric = "e1rm" | "topWeight" | "volume";
const METRICS: { id: Metric; label: string }[] = [
  { id: "e1rm", label: "Est. 1RM" },
  { id: "topWeight", label: "Top set" },
  { id: "volume", label: "Volume" },
];

const shortDate = (key: string) =>
  parseKey(key).toLocaleDateString(undefined, { day: "numeric", month: "short" });

const longDate = (key: string) =>
  parseKey(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

/** How far back the curve reaches. Matches the windows History offers. */
type Range = "all" | "30d" | "90d" | "year";
const RANGES: { id: Range; label: string; days: number }[] = [
  { id: "all", label: "All", days: Infinity },
  { id: "30d", label: "30d", days: 30 },
  { id: "90d", label: "90d", days: 90 },
  { id: "year", label: "1y", days: 365 },
];

export function Progress() {
  const s = useStore();
  const unitLabel = s.settings.unit === "lb" ? "lbs" : "kg";
  const [metric, setMetric] = useState<Metric>("e1rm");

  const done = useMemo(() => s.sessions.filter((x) => x.endedAt), [s.sessions]);
  const prs = useMemo(() => personalRecords(done), [done]);

  const tracked = useMemo(
    () =>
      s.exercises
        .filter((e) => prs.has(e.id))
        .sort((a, b) => (prs.get(b.id)!.at ?? 0) - (prs.get(a.id)!.at ?? 0)),
    [s.exercises, prs],
  );

  // Held by id, not index, so the selection survives a new exercise being
  // tracked or the list reordering as PRs land.
  const [exId, setExId] = useState<string>("");
  const [picker, setPicker] = useState(false);
  const [range, setRange] = useState<Range>("all");
  // Which session the finger is on. Cleared whenever the series underneath it
  // changes, so an index can never point at a different lift's history.
  const [scrub, setScrub] = useState<number | null>(null);
  const current = tracked.find((e) => e.id === exId) ?? tracked[0];

  const points = useMemo(() => {
    if (!current) return [];
    const days = RANGES.find((r) => r.id === range)!.days;
    const since = days === Infinity ? 0 : Date.now() - days * 864e5;
    return exerciseHistory(done, current.id).filter((p) => p.at >= since);
  }, [done, current, range]);

  const totals = useMemo(
    () => ({
      workouts: done.length,
      volume: done.reduce((t, x) => t + sessionVolume(x), 0),
      tracked: prs.size,
    }),
    [done, prs],
  );

  if (!done.length) {
    return (
      <div className="min-h-full px-5 pb-40 pt-[calc(env(safe-area-inset-top)+14px)]">
        <Eyebrow>Progress</Eyebrow>
        <Empty
          eyebrow="No curve yet"
          title="Two finished workouts and a lift has a trend."
          body="Every number on this screen comes from your own logs — nothing is estimated from anyone else."
        />
      </div>
    );
  }

  const pr = current ? prs.get(current.id) : undefined;
  const values = points.map((p) => p[metric]);
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const change = first > 0 ? ((last - first) / first) * 100 : 0;
  const at = scrub != null && points[scrub] ? points[scrub] : null;
  const shown = at ? at[metric] : last;
  const bwValues = s.bodyweight.map((b) => b.weight);

  return (
    <div className="min-h-full pb-40">
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+14px)]">
        <Eyebrow>Progress</Eyebrow>
      </div>

      <div className="mt-3.5">
        <StatBand
          stats={[
            { label: "Workouts", value: String(totals.workouts) },
            { label: unitLabel, value: `${num(totals.volume / 1000, 1)}k` },
            { label: "Tracked", value: String(totals.tracked) },
          ]}
        />
      </div>

      {current && (
        <>
          <div className="px-5 pt-6">
            <button
              onClick={() => setPicker(true)}
              className="flex items-center gap-2.5 text-left"
              aria-label="Choose exercise"
            >
              <span className="text-[23px] font-bold tracking-[-0.024em]">{current.name}</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#666"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            <div className="flex items-baseline justify-between gap-4 pt-4.5">
              <div className="flex gap-5">
              {METRICS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setMetric(m.id);
                    setScrub(null);
                  }}
                  className={`border-b pb-[3px] font-mono text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${
                    metric === m.id ? "border-fg text-fg" : "border-transparent text-faint"
                  }`}
                >
                  {m.label}
                </button>
              ))}
              </div>
              <TextTabs
                gap="gap-3.5"
                options={RANGES.map((r) => ({ id: r.id, label: r.label }))}
                value={range}
                onChange={(r) => {
                  setRange(r);
                  setScrub(null);
                }}
              />
            </div>

            <div className="pt-6">
              <BigNumber
                // Scrambles when the series changes under it, but not while a
                // session is being read off the curve: mid-drag the figure has
                // to keep up with the finger, and a value resolving out of
                // noise cannot be read at the speed it is being changed.
                value={
                  at ? (
                    num(shown, 1)
                  ) : (
                    <Scramble text={num(shown, 1)} delay={0} hold={110} perChar={40} />
                  )
                }
                unit={unitLabel}
                size={46}
              />
            </div>
            <p className="mt-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              {at ? (
                <span className="text-fg">{longDate(at.date)}</span>
              ) : points.length > 1 ? (
                <>
                  {change >= 0 ? "+" : ""}
                  {num(change, 1)}% since {shortDate(points[0].date)}
                </>
              ) : (
                `${points.length} session${points.length === 1 ? "" : "s"} in range`
              )}
            </p>
          </div>

          <div className="px-5 pt-5">
            <Sparkline
              values={values}
              selected={scrub}
              onSelect={setScrub}
              labels={
                points.length > 1
                  ? [shortDate(points[0].date), shortDate(points[points.length - 1].date)]
                  : undefined
              }
            />
            <p className="pt-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-faint">
              {at ? "Drag to read another session · tap away to reset" : "Drag the curve to read a session"}
            </p>
          </div>

          {pr && (
            <div className="mt-6">
              <StatBand
                size="sm"
                stats={[
                  { label: "Best est. 1RM", value: `${num(pr.bestE1rm, 1)}` },
                  { label: "Heaviest set", value: `${num(pr.heaviest)}×${pr.heaviestReps}` },
                  { label: "Best session", value: `${num(pr.bestVolume, 0)}` },
                ]}
              />
            </div>
          )}
        </>
      )}

      <Sheet open={picker} onClose={() => setPicker(false)} title="Exercise">
        <div className="border-t border-rule">
          {tracked.map((e) => {
            const pr = prs.get(e.id);
            const on = current?.id === e.id;
            return (
              <button
                key={e.id}
                onClick={() => {
                  setExId(e.id);
                  setScrub(null);
                  setPicker(false);
                }}
                className={`flex w-full items-center gap-3 border-b border-subrule py-3 text-left transition-colors ${
                  on ? "text-fg" : "text-[#8b8b90]"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{e.name}</span>
                  <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                    {e.muscle}
                  </span>
                </span>
                <span className="shrink-0 text-right font-mono text-[13px] text-muted">
                  {pr ? `${num(pr.bestE1rm, 1)} ${unitLabel}` : ""}
                </span>
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: on ? "#f5f5f5" : "transparent" }}
                />
              </button>
            );
          })}
        </div>
        <p className="pt-4 text-[12px] leading-relaxed text-muted">
          Every exercise you have logged a working set for. The figure beside each is its best
          estimated 1RM.
        </p>
      </Sheet>

      {bwValues.length > 1 && (
        <div className="px-5 pt-6">
          <div className="flex items-baseline justify-between">
            <Eyebrow className="tracking-[0.18em]">Body weight</Eyebrow>
            <span className="font-mono text-[15px] font-medium">
              {num(bwValues[bwValues.length - 1])}{" "}
              <span className="text-[9px] uppercase tracking-[0.16em] text-muted">{unitLabel}</span>
            </span>
          </div>
          <div className="mt-3">
            <Sparkline
              values={bwValues}
              width={348}
              height={84}
              padT={6}
              padB={8}
              stroke="#666"
              strokeWidth={1.4}
              showBaseline={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
