import { useMemo, useState } from "react";
import { Sparkline } from "../components/Sparkline";
import { BigNumber, Empty, Eyebrow, StatBand } from "../components/ui";
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

  // The exercise is stepped through rather than picked from a menu: a native
  // select is a system-chrome box, which is exactly what this screen removed.
  const [exIdx, setExIdx] = useState(0);
  const current = tracked[exIdx % Math.max(1, tracked.length)];

  const points = useMemo(
    () => (current ? exerciseHistory(done, current.id) : []),
    [done, current],
  );

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
              onClick={() => setExIdx((i) => (i + 1) % tracked.length)}
              className="flex items-center gap-2.5 text-left"
              aria-label="Next exercise"
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

            <div className="flex gap-5 pt-4.5">
              {METRICS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMetric(m.id)}
                  className={`border-b pb-[3px] font-mono text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${
                    metric === m.id ? "border-fg text-fg" : "border-transparent text-faint"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="pt-6">
              <BigNumber value={num(last, 1)} unit={unitLabel} size={46} />
            </div>
            {points.length > 1 && (
              <p className="mt-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                {change >= 0 ? "+" : ""}
                {num(change, 1)}% since {shortDate(points[0].date)}
              </p>
            )}
          </div>

          <div className="px-5 pt-5">
            <Sparkline
              values={values}
              labels={
                points.length > 1
                  ? [shortDate(points[0].date), shortDate(points[points.length - 1].date)]
                  : undefined
              }
            />
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
