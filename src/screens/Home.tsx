import { useMemo, useState } from "react";
import { Button, Card, Empty, Screen, Sheet, Stat, inputCls } from "../components/ui";
import { currentStreak, sessionSetCount, sessionVolume } from "../lib/stats";
import { fmtDate, fmtDuration, num, todayKey } from "../lib/util";
import { useStore } from "../store";
import type { Tab } from "../App";

export function Home({ go }: { go: (t: Tab) => void }) {
  const s = useStore();
  const [bwOpen, setBwOpen] = useState(false);
  const [bw, setBw] = useState("");
  const unit = s.settings.unit;

  const done = useMemo(() => s.sessions.filter((x) => x.endedAt), [s.sessions]);

  const week = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
    const from = start.getTime();
    const list = done.filter((x) => x.startedAt >= from);
    return {
      count: list.length,
      volume: list.reduce((t, x) => t + sessionVolume(x), 0),
      sets: list.reduce((t, x) => t + sessionSetCount(x), 0),
    };
  }, [done]);

  const latestBw = s.bodyweight[s.bodyweight.length - 1];
  const streak = useMemo(() => currentStreak(done), [done]);

  async function saveBw() {
    const v = parseFloat(bw.replace(",", "."));
    if (!isFinite(v) || v <= 0) return;
    await s.logBodyWeight(todayKey(), v);
    setBw("");
    setBwOpen(false);
  }

  return (
    <Screen
      title="Gym Log"
      subtitle={new Date().toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      })}
    >
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat label="This week" value={String(week.count)} sub={week.count === 1 ? "workout" : "workouts"} />
        <Stat label="Volume" value={num(week.volume, 0)} sub={unit} />
        <Stat label="Streak" value={String(streak)} sub={streak === 1 ? "day" : "days"} />
      </div>

      <Button size="lg" className="w-full" onClick={() => void s.startSession()}>
        Start empty workout
      </Button>

      <div className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">Start from a routine</h2>
          <button className="text-[13px] text-accent" onClick={() => go("routines")}>
            Manage
          </button>
        </div>
        {s.routines.length === 0 ? (
          <Card className="px-4 py-5 text-center text-sm text-muted">
            No routines yet — build one in the Routines tab.
          </Card>
        ) : (
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {s.routines.map((r) => (
              <button
                key={r.id}
                onClick={() => void s.startSession(r)}
                className="w-40 shrink-0 rounded-2xl border border-line bg-panel p-3.5 text-left active:bg-panel2"
              >
                <p className="truncate text-[15px] font-semibold">{r.name}</p>
                <p className="mt-1 text-[12px] text-muted">
                  {r.items.length} exercises ·{" "}
                  {r.items.reduce((t, i) => t + i.sets, 0)} sets
                </p>
                <p className="mt-3 line-clamp-2 text-[12px] leading-snug text-muted/80">
                  {r.items
                    .map((i) => s.exerciseById.get(i.exerciseId)?.name)
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">Body weight</h2>
          <button className="text-[13px] text-accent" onClick={() => setBwOpen(true)}>
            Log today
          </button>
        </div>
        <Card className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-2xl font-bold tabular-nums leading-none">
              {latestBw ? `${num(latestBw.weight)} ${unit}` : "—"}
            </p>
            <p className="mt-1 text-[12px] text-muted">
              {latestBw ? fmtDate(latestBw.date) : "Nothing logged yet"}
            </p>
          </div>
          {s.bodyweight.length > 1 && (
            <Trend
              delta={latestBw.weight - s.bodyweight[Math.max(0, s.bodyweight.length - 2)].weight}
              unit={unit}
            />
          )}
        </Card>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">Recent</h2>
          <button className="text-[13px] text-accent" onClick={() => go("history")}>
            See all
          </button>
        </div>
        {done.length === 0 ? (
          <Empty
            icon="🏋️"
            title="No workouts yet"
            body="Hit start above, add your lifts, and every set you tick off starts building your history."
          />
        ) : (
          <div className="space-y-2">
            {done.slice(0, 4).map((x) => (
              <Card key={x.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium">{x.name}</p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {fmtDate(x.date)} · {sessionSetCount(x)} sets ·{" "}
                    {x.endedAt ? fmtDuration(x.endedAt - x.startedAt) : "—"}
                  </p>
                </div>
                <p className="shrink-0 text-[13px] tabular-nums text-muted">
                  {num(sessionVolume(x), 0)} {unit}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Sheet
        open={bwOpen}
        onClose={() => setBwOpen(false)}
        title="Log body weight"
        footer={
          <Button className="w-full" size="lg" onClick={() => void saveBw()}>
            Save
          </Button>
        }
      >
        <input
          autoFocus
          inputMode="decimal"
          className={inputCls}
          placeholder={`Weight in ${unit}`}
          value={bw}
          onChange={(e) => setBw(e.target.value)}
        />
        <p className="mt-2 text-[12px] text-muted">Saved against today. One entry per day.</p>
      </Sheet>
    </Screen>
  );
}

function Trend({ delta, unit }: { delta: number; unit: string }) {
  const up = delta > 0;
  const flat = Math.abs(delta) < 0.05;
  return (
    <span
      className={`rounded-lg px-2.5 py-1.5 text-[13px] font-semibold tabular-nums ${
        flat ? "bg-panel2 text-muted" : up ? "bg-amber-400/15 text-amber-300" : "bg-accent/15 text-accent"
      }`}
    >
      {flat ? "±0" : `${up ? "+" : "−"}${num(Math.abs(delta))}`} {unit}
    </span>
  );
}
