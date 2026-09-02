import { useMemo, useState } from "react";
import { Heatmap } from "../components/Heatmap";
import { Plus, Ring, Tune } from "../components/icons";
import { Button, DashCard, IconButton, Sheet, inputCls } from "../components/ui";
import { sessionVolume } from "../lib/stats";
import { fmtRelative, mostCommonWeekdayLabel, num, todayKey } from "../lib/util";
import { useStore } from "../store";
import type { Tab } from "../App";
import type { Routine } from "../types";

const WEEK_MS = 7 * 86400000;

export function Home({ go }: { go: (t: Tab) => void }) {
  const s = useStore();
  const [bwOpen, setBwOpen] = useState(false);
  const [bw, setBw] = useState("");
  const unitLabel = s.settings.unit === "lb" ? "lbs" : "kg";

  const done = useMemo(() => s.sessions.filter((x) => x.endedAt), [s.sessions]);
  const activeDates = useMemo(() => new Set(done.map((x) => x.date)), [done]);

  const pinned = s.routines.slice(0, 2);
  const latestBw = s.bodyweight[s.bodyweight.length - 1];

  const weekVolume = useMemo(() => {
    const from = s.now - WEEK_MS;
    return done.filter((x) => x.startedAt >= from).reduce((t, x) => t + sessionVolume(x), 0);
  }, [done, s.now]);

  async function saveBw() {
    const v = parseFloat(bw.replace(",", "."));
    if (!isFinite(v) || v <= 0) return;
    await s.logBodyWeight(todayKey(), v);
    setBw("");
    setBwOpen(false);
  }

  return (
    <div className="min-h-full px-4 pb-40 pt-[calc(env(safe-area-inset-top)+18px)]">
      <div className="flex items-center justify-between">
        <h1 className="text-[32px] font-bold tracking-tight">Workouts</h1>
        <div className="flex items-center gap-2.5">
          <IconButton onClick={() => go("settings")}>
            <Tune />
          </IconButton>
          <IconButton tone="light" onClick={() => void s.startSession()}>
            <Plus />
          </IconButton>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {pinned[0] ? (
          <RoutineCard routine={pinned[0]} n={1} go={go} />
        ) : (
          <EmptyRoutineCard go={go} />
        )}

        <DashCard className="relative p-4" onClick={() => setBwOpen(true)}>
          <IconButton
            size={30}
            className="absolute right-3 top-3"
            onClick={() => {
              go("progress");
            }}
          >
            <Tune size={14} />
          </IconButton>
          <p className="text-3xl font-bold tabular-nums leading-none">
            {latestBw ? num(latestBw.weight) : "—"}{" "}
            <span className="text-base font-semibold text-muted">{unitLabel}</span>
          </p>
          <p className="mt-6 text-[15px] font-semibold leading-tight">Body weight</p>
          <p className="mt-0.5 text-[12px] text-muted">
            {latestBw ? fmtRelative(latestBw.at, s.now) : "Tap to log"}
          </p>
        </DashCard>
      </div>

      <DashCard className="mt-3 p-4">
        <button className="block w-full text-left" onClick={() => go("history")}>
          <Heatmap activeDates={activeDates} />
        </button>

        {pinned[1] ? (
          <RoutineRow routine={pinned[1]} n={2} go={go} className="mt-4" />
        ) : (
          <button
            onClick={() => go("routines")}
            className="mt-4 flex w-full items-center gap-3 border-t border-line pt-4 text-left"
          >
            <span className="grid size-[46px] shrink-0 place-items-center rounded-full border border-dashed border-faint text-muted">
              <Plus size={18} />
            </span>
            <span className="text-[15px] font-medium text-muted">Add a routine</span>
          </button>
        )}
      </DashCard>

      <DashCard className="relative mt-3 flex items-center justify-between p-5">
        <IconButton
          size={30}
          className="absolute right-3 top-3"
          onClick={() => go("progress")}
        >
          <Tune size={14} />
        </IconButton>
        <div>
          <p className="text-[15px] font-semibold leading-tight">Volume lifted</p>
          <p className="mt-0.5 text-[12px] text-muted">Last 7 days</p>
        </div>
        <p className="text-[28px] font-bold tabular-nums leading-none">
          {weekVolume.toLocaleString()}{" "}
          <span className="text-base font-semibold text-muted">{unitLabel}</span>
        </p>
      </DashCard>

      <DashCard
        className="mt-3 grid h-[104px] place-items-center"
        onClick={() => go("routines")}
      >
        <Plus size={26} className="text-muted" />
      </DashCard>

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
          placeholder={`Weight in ${unitLabel}`}
          value={bw}
          onChange={(e) => setBw(e.target.value)}
        />
        <p className="mt-2 text-[12px] text-muted">Saved against today. One entry per day.</p>
      </Sheet>
    </div>
  );
}

function useRoutineMeta(routine: Routine) {
  const s = useStore();
  return useMemo(() => {
    const forRoutine = s.sessions.filter((x) => x.routineId === routine.id && x.endedAt);
    const doneThisWeek = forRoutine.filter((x) => x.startedAt >= s.now - WEEK_MS).length;
    // no per-routine weekly target yet, so a session or two fills the ring — refine once
    // routines carry their own scheduled frequency
    const progress = Math.min(1, doneThisWeek / 2);
    const label =
      mostCommonWeekdayLabel(forRoutine.map((x) => x.date)) ??
      `${routine.items.length} exercise${routine.items.length === 1 ? "" : "s"}`;
    return { progress, label };
  }, [s.sessions, s.now, routine.id, routine.items.length]);
}

// Tapping the card (or its tune icon) only opens Routines — starting a session
// from a routine happens there, not straight off the dashboard.
function RoutineCard({ routine, n, go }: { routine: Routine; n: number; go: (t: Tab) => void }) {
  const { progress, label } = useRoutineMeta(routine);

  return (
    <DashCard className="relative p-4" onClick={() => go("routines")}>
      <div className="flex items-start justify-between">
        <Ring n={n} progress={progress} />
        <IconButton size={30} onClick={() => go("routines")}>
          <Tune size={14} />
        </IconButton>
      </div>
      <p className="mt-6 truncate text-[15px] font-semibold leading-tight">{routine.name}</p>
      <p className="mt-0.5 truncate text-[12px] text-muted">{label}</p>
    </DashCard>
  );
}

function RoutineRow({
  routine,
  n,
  go,
  className,
}: {
  routine: Routine;
  n: number;
  go: (t: Tab) => void;
  className?: string;
}) {
  const { progress, label } = useRoutineMeta(routine);

  // a div, not a button: it needs to contain the real IconButton below it, and
  // a <button> can't legally nest another interactive control. Tapping the row
  // (or its tune icon) only opens Routines — same reasoning as RoutineCard above.
  return (
    <div
      onClick={() => go("routines")}
      className={`flex w-full cursor-pointer items-center gap-3 border-t border-line pt-4 text-left ${className ?? ""}`}
    >
      <Ring n={n} progress={progress} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-tight">{routine.name}</p>
        <p className="mt-0.5 truncate text-[12px] text-muted">{label}</p>
      </div>
      <IconButton size={30} onClick={() => go("routines")}>
        <Tune size={14} />
      </IconButton>
    </div>
  );
}

function EmptyRoutineCard({ go }: { go: (t: Tab) => void }) {
  return (
    <DashCard className="grid place-items-center p-4 text-center" onClick={() => go("routines")}>
      <span className="grid size-[46px] place-items-center rounded-full border border-dashed border-faint text-muted">
        <Plus size={18} />
      </span>
      <p className="mt-3 text-[13px] font-medium text-muted">Create a routine</p>
    </DashCard>
  );
}
