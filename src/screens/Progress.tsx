import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, Empty, Screen, Stat } from "../components/ui";
import { exerciseHistory, personalRecords, sessionVolume } from "../lib/stats";
import { num, parseKey } from "../lib/util";
import { useStore } from "../store";

type Metric = "e1rm" | "topWeight" | "volume";
const METRICS: { id: Metric; label: string }[] = [
  { id: "e1rm", label: "Est. 1RM" },
  { id: "topWeight", label: "Top set" },
  { id: "volume", label: "Volume" },
];

const axis = { stroke: "#8b93a7", fontSize: 11 };

export function Progress() {
  const s = useStore();
  const unit = s.settings.unit;
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

  const [exId, setExId] = useState<string>("");
  const current = tracked.find((e) => e.id === exId) ?? tracked[0];

  const points = useMemo(
    () => (current ? exerciseHistory(done, current.id) : []),
    [done, current],
  );

  const chartData = points.map((p) => ({
    x: parseKey(p.date).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    value: Number(p[metric].toFixed(1)),
  }));

  const totals = useMemo(
    () => ({
      workouts: done.length,
      volume: done.reduce((t, x) => t + sessionVolume(x), 0),
      prs: prs.size,
    }),
    [done, prs],
  );

  const bwData = s.bodyweight.map((b) => ({
    x: parseKey(b.date).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    value: b.weight,
  }));

  if (!done.length) {
    return (
      <Screen title="Progress">
        <Empty
          icon="📈"
          title="No data to chart yet"
          body="Finish a couple of workouts and your strength curve per exercise shows up here."
        />
      </Screen>
    );
  }

  const pr = current ? prs.get(current.id) : undefined;
  const first = points[0]?.[metric] ?? 0;
  const last = points[points.length - 1]?.[metric] ?? 0;
  const change = first > 0 ? ((last - first) / first) * 100 : 0;

  return (
    <Screen title="Progress" subtitle="Every number comes from your own logs">
      <div className="mb-5 grid grid-cols-3 gap-2">
        <Stat label="Workouts" value={String(totals.workouts)} sub="all time" />
        <Stat label="Volume" value={num(totals.volume / 1000, 1) + "k"} sub={unit} />
        <Stat label="Exercises" value={String(totals.prs)} sub="tracked" />
      </div>

      {current && (
        <Card className="overflow-hidden">
          <div className="border-b border-line px-3.5 py-3">
            <select
              value={current.id}
              onChange={(e) => setExId(e.target.value)}
              className="w-full rounded-lg bg-panel2 px-3 py-2.5 font-semibold text-white outline-none"
            >
              {tracked.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <div className="mt-2.5 flex gap-1.5">
              {METRICS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMetric(m.id)}
                  className={`flex-1 rounded-lg py-2 text-[13px] font-medium ${
                    metric === m.id ? "bg-accent text-ink" : "bg-panel2 text-muted"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="px-1 pb-2 pt-4">
            <div className="mb-1 flex items-baseline gap-2 px-3">
              <span className="text-2xl font-bold tabular-nums">
                {num(last, 1)} <span className="text-sm font-medium text-muted">{unit}</span>
              </span>
              {points.length > 1 && (
                <span
                  className={`text-[13px] font-semibold tabular-nums ${
                    change >= 0 ? "text-accent" : "text-red-400"
                  }`}
                >
                  {change >= 0 ? "+" : ""}
                  {num(change, 1)}% since {chartData[0]?.x}
                </span>
              )}
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 12, right: 16, left: -8, bottom: 4 }}>
                  <CartesianGrid stroke="#262a35" vertical={false} />
                  <XAxis dataKey="x" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{
                      background: "#12141a",
                      border: "1px solid #262a35",
                      borderRadius: 12,
                      fontSize: 13,
                    }}
                    labelStyle={{ color: "#8b93a7" }}
                    formatter={(v) => [`${num(Number(v), 1)} ${unit}`, METRICS.find((m) => m.id === metric)!.label]}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#b8f130"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#b8f130", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {pr && (
            <div className="grid grid-cols-3 border-t border-line text-center">
              <PRCell label="Best est. 1RM" value={`${num(pr.bestE1rm, 1)} ${unit}`} />
              <PRCell
                label="Heaviest set"
                value={`${num(pr.heaviest)} × ${pr.heaviestReps}`}
                divider
              />
              <PRCell label="Best session volume" value={`${num(pr.bestVolume, 0)} ${unit}`} divider />
            </div>
          )}
        </Card>
      )}

      {bwData.length > 1 && (
        <Card className="mt-5 px-1 pb-2 pt-4">
          <p className="mb-1 px-3 text-[15px] font-semibold">Body weight</p>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bwData} margin={{ top: 10, right: 16, left: -8, bottom: 4 }}>
                <defs>
                  <linearGradient id="bwFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b8f130" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#b8f130" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#262a35" vertical={false} />
                <XAxis dataKey="x" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={axis} tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{
                    background: "#12141a",
                    border: "1px solid #262a35",
                    borderRadius: 12,
                    fontSize: 13,
                  }}
                  labelStyle={{ color: "#8b93a7" }}
                  formatter={(v) => [`${num(Number(v))} ${unit}`, "Body weight"]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#b8f130"
                  strokeWidth={2.5}
                  fill="url(#bwFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </Screen>
  );
}

function PRCell({ label, value, divider }: { label: string; value: string; divider?: boolean }) {
  return (
    <div className={`px-2 py-3 ${divider ? "border-l border-line" : ""}`}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-[15px] font-bold tabular-nums">{value}</p>
    </div>
  );
}
