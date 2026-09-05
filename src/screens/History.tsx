import { useMemo, useState } from "react";
import { Button, Empty, Eyebrow, StatBand, TextTabs } from "../components/ui";
import { e1rm, personalRecords, sessionSetCount, sessionVolume, working } from "../lib/stats";
import { fmtDuration, num, parseKey } from "../lib/util";
import { useStore } from "../store";
import type { Session } from "../types";

/** How far back the list reaches. "All" is the default. */
type Filter = "all" | "30d" | "90d" | "year";
const FILTERS: { id: Filter; label: string; days: number }[] = [
  { id: "all", label: "All", days: Infinity },
  { id: "30d", label: "30d", days: 30 },
  { id: "90d", label: "90d", days: 90 },
  { id: "year", label: "1y", days: 365 },
];

export function History() {
  const s = useStore();
  const [open, setOpen] = useState<Session | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const unitLabel = s.settings.unit === "lb" ? "lbs" : "kg";

  const done = useMemo(() => s.sessions.filter((x) => x.endedAt), [s.sessions]);

  const months = useMemo(() => {
    const cutoff = FILTERS.find((f) => f.id === filter)!.days;
    const since = cutoff === Infinity ? 0 : Date.now() - cutoff * 864e5;
    const m = new Map<string, Session[]>();
    for (const x of done) {
      if (x.startedAt < since) continue;
      const key = parseKey(x.date).toLocaleDateString(undefined, { month: "long", year: "numeric" });
      m.set(key, [...(m.get(key) ?? []), x]);
    }
    return [...m.entries()];
  }, [done, filter]);

  // The workout detail is its own screen rather than a sheet: it is a page of
  // record, long enough to scroll, and a sheet over a list made it feel like a
  // peek at something rather than the thing itself.
  if (open) {
    return <Detail session={open} onBack={() => setOpen(null)} />;
  }

  const shown = months.reduce((t, [, l]) => t + l.length, 0);

  return (
    <div className="min-h-full pb-40">
      <div className="sticky top-0 z-20 border-b border-rule bg-ink/95 px-5 pt-[calc(env(safe-area-inset-top)+14px)] backdrop-blur-xl">
        <div className="flex items-baseline justify-between">
          <Eyebrow>History</Eyebrow>
          <Eyebrow className="tracking-[0.16em]">
            {shown} workout{shown === 1 ? "" : "s"}
          </Eyebrow>
        </div>
        <TextTabs
          className="py-4"
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
          <Empty eyebrow="Nothing in range" title="No workouts in this window." />
        </div>
      ) : (
        months.map(([label, list]) => (
          <div key={label}>
            <div className="flex items-baseline justify-between border-b border-rule px-5 pb-2 pt-[22px]">
              <Eyebrow className="tracking-[0.18em]">{label}</Eyebrow>
              <span className="font-mono text-[10px] font-medium text-faint">{list.length}</span>
            </div>
            {list.map((x) => {
              const d = parseKey(x.date);
              return (
                <button
                  key={x.id}
                  onClick={() => setOpen(x)}
                  className="grid w-full grid-cols-[52px_1fr_auto] items-center gap-x-3.5 border-b border-subrule px-5 py-3.5 text-left active:bg-[#0b0b0b]"
                >
                  <span className="font-mono text-[11px] font-medium uppercase leading-[1.35] tracking-[0.06em] text-muted">
                    {d.toLocaleDateString(undefined, { day: "2-digit" })}
                    <br />
                    {d.toLocaleDateString(undefined, { month: "short" })}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium">{x.name}</span>
                    <span className="mt-0.5 block font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted">
                      {x.entries.length} ex · {sessionSetCount(x)} sets
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-mono text-[14px] font-medium">
                      {num(sessionVolume(x), 0)}{" "}
                      <span className="text-[10px] uppercase tracking-[0.1em] text-muted">
                        {unitLabel}
                      </span>
                    </span>
                    <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted">
                      {x.endedAt ? fmtDuration(x.endedAt - x.startedAt) : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

/** One logged workout, as a page. */
function Detail({ session, onBack }: { session: Session; onBack: () => void }) {
  const s = useStore();
  const unitLabel = s.settings.unit === "lb" ? "lbs" : "kg";
  const d = parseKey(session.date);

  // A set is flagged as a PR when it set the best estimated 1RM for that
  // exercise across every finished workout — the same rule the badge uses live.
  const prs = useMemo(
    () => personalRecords(s.sessions.filter((x) => x.endedAt)),
    [s.sessions],
  );

  return (
    <div className="min-h-full pb-40">
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+12px)]">
        <button onClick={onBack} className="flex items-center gap-1.5 text-muted active:text-fg">
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
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]">
            History
          </span>
        </button>
      </div>

      <div className="px-5 pb-5 pt-6">
        <h1 className="text-[31px] font-bold leading-none tracking-[-0.028em]">{session.name}</h1>
        <p className="mt-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
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
            value: session.endedAt ? fmtDuration(session.endedAt - session.startedAt) : "—",
          },
          { label: "Sets", value: String(sessionSetCount(session)) },
          { label: unitLabel, value: num(sessionVolume(session), 0) },
        ]}
      />

      {session.entries.map((e) => {
        const ex = s.exerciseById.get(e.exerciseId);
        const sets = working(e.sets);
        const best = ex ? prs.get(ex.id)?.bestE1rm ?? 0 : 0;
        return (
          <div key={e.id} className="border-b border-rule px-5 pb-3.5 pt-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-[16px] font-medium tracking-[-0.01em]">
                {ex?.name ?? "Exercise"}
              </p>
              <span className="shrink-0 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
                {num(sets.reduce((t, x) => t + x.weight * x.reps, 0), 0)} {unitLabel}
              </span>
            </div>
            <div className="mt-3">
              {sets.map((set, i) => {
                const isPr = best > 0 && e1rm(set.weight, set.reps) >= best - 0.01;
                return (
                  <div
                    key={set.id}
                    className="grid grid-cols-[22px_1fr_44px_34px] items-baseline gap-x-3 border-b border-subrule py-[7px]"
                  >
                    <span className="font-mono text-[11px] text-faint">{i + 1}</span>
                    <span className="font-mono text-[14px]">
                      {num(set.weight)} <span className="text-faint">×</span> {set.reps}
                    </span>
                    <span className="text-center font-mono text-[11px] text-muted">
                      {set.rpe ? `@${set.rpe}` : ""}
                    </span>
                    <span className="text-right font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-fg">
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
          <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-pretty">
            {session.note}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3.5 px-5 pt-6">
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
          onClick={() => {
            if (confirm("Delete this workout permanently?")) {
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
