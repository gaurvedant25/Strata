import { useMemo, useState } from "react";
import { Button, Card, Empty, Screen, Sheet } from "../components/ui";
import { sessionSetCount, sessionVolume, working } from "../lib/stats";
import { fmtDate, fmtDuration, num, parseKey } from "../lib/util";
import { useStore } from "../store";
import type { Session } from "../types";

export function History() {
  const s = useStore();
  const [open, setOpen] = useState<Session | null>(null);
  const unit = s.settings.unit;

  const months = useMemo(() => {
    const done = s.sessions.filter((x) => x.endedAt);
    const m = new Map<string, Session[]>();
    for (const x of done) {
      const key = parseKey(x.date).toLocaleDateString(undefined, { month: "long", year: "numeric" });
      m.set(key, [...(m.get(key) ?? []), x]);
    }
    return [...m.entries()];
  }, [s.sessions]);

  const total = s.sessions.filter((x) => x.endedAt).length;

  return (
    <Screen title="History" subtitle={`${total} workout${total === 1 ? "" : "s"} logged`}>
      {total === 0 ? (
        <Empty icon="📆" title="Nothing here yet" body="Finished workouts show up here, grouped by month." />
      ) : (
        <div className="space-y-6">
          {months.map(([label, list]) => (
            <div key={label}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {label} · {list.length}
              </p>
              <div className="space-y-2">
                {list.map((x) => (
                  <button key={x.id} onClick={() => setOpen(x)} className="block w-full text-left">
                    <Card className="flex items-center justify-between px-4 py-3 active:bg-panel2">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-medium">{x.name}</p>
                        <p className="mt-0.5 text-[12px] text-muted">
                          {fmtDate(x.date)} · {x.entries.length}{" "}
                          {x.entries.length === 1 ? "exercise" : "exercises"} · {sessionSetCount(x)}{" "}
                          sets
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[13px] font-medium tabular-nums">
                          {num(sessionVolume(x), 0)} {unit}
                        </p>
                        <p className="text-[12px] text-muted">
                          {x.endedAt ? fmtDuration(x.endedAt - x.startedAt) : ""}
                        </p>
                      </div>
                    </Card>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.name ?? ""}
        footer={
          open && (
            <div className="flex gap-2">
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => {
                  if (confirm("Delete this workout permanently?")) {
                    void s.deleteSession(open.id);
                    setOpen(null);
                  }
                }}
              >
                Delete
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  void s.resumeSession(open.id);
                  setOpen(null);
                }}
              >
                Reopen & edit
              </Button>
            </div>
          )
        }
      >
        {open && (
          <>
            <p className="mb-4 text-[13px] text-muted">
              {fmtDate(open.date)} ·{" "}
              {open.endedAt ? fmtDuration(open.endedAt - open.startedAt) : "in progress"} ·{" "}
              {num(sessionVolume(open), 0)} {unit} volume
            </p>
            <div className="space-y-3">
              {open.entries.map((e) => (
                <Card key={e.id} className="px-3.5 py-3">
                  <p className="text-[15px] font-semibold">
                    {s.exerciseById.get(e.exerciseId)?.name ?? "Exercise"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {working(e.sets).map((set, i) => (
                      <span
                        key={set.id}
                        className="rounded-lg bg-panel2 px-2.5 py-1.5 text-[13px] tabular-nums"
                      >
                        <span className="text-muted">{i + 1}</span>{" "}
                        {num(set.weight)}
                        <span className="text-muted">×</span>
                        {set.reps}
                      </span>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
            {open.note && (
              <p className="mt-4 whitespace-pre-wrap rounded-xl bg-panel2 p-3 text-[14px] text-white/85">
                {open.note}
              </p>
            )}
          </>
        )}
      </Sheet>
    </Screen>
  );
}
