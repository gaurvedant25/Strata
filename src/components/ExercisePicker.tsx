import { useMemo, useState } from "react";
import { useStore } from "../store";
import type { Exercise } from "../types";
import { Sheet, inputCls } from "./ui";

export function ExercisePicker({
  open,
  onClose,
  onPick,
  title = "Add exercise",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
  title?: string;
}) {
  const s = useStore();
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = s.exercises
      .filter((e) => !e.archived)
      .filter(
        (e) =>
          !needle ||
          e.name.toLowerCase().includes(needle) ||
          e.muscle.toLowerCase().includes(needle),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    const m = new Map<string, Exercise[]>();
    for (const e of list) m.set(e.muscle, [...(m.get(e.muscle) ?? []), e]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [s.exercises, q]);

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <input
        className={`${inputCls} mb-4`}
        placeholder="Search exercises…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {groups.length === 0 && (
        <p className="py-6 text-[0.8125rem] text-muted">
          Nothing matches that.
        </p>
      )}
      <div className="space-y-5">
        {groups.map(([m, list]) => (
          <div key={m}>
            <p className="mb-1 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted">
              {m}
            </p>
            <div className="border-t border-rule">
              {list.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onPick(e)}
                  className="flex w-full items-center border-b border-subrule py-3 text-left active:bg-[#0b0b0b]"
                >
                  <span className="text-[0.9375rem]">{e.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
