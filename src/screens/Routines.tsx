import { useState } from "react";
import { ExercisePicker } from "../components/ExercisePicker";
import { Button, Card, Empty, Screen, Sheet, inputCls } from "../components/ui";
import { uid } from "../lib/util";
import { useStore } from "../store";
import type { Routine, RoutineItem } from "../types";

export function Routines() {
  const s = useStore();
  const [editing, setEditing] = useState<Routine | null>(null);

  function blank(): Routine {
    const now = Date.now();
    return { id: uid(), name: "", items: [], createdAt: now, updatedAt: now };
  }

  return (
    <Screen
      title="Routines"
      subtitle="Reusable templates for your split"
      right={
        <Button size="sm" onClick={() => setEditing(blank())}>
          + New
        </Button>
      }
    >
      {s.routines.length === 0 ? (
        <Empty
          icon="📋"
          title="No routines"
          body="A routine is a saved list of exercises with target sets and reps. Start a workout from one and it comes pre-filled."
          action={<Button onClick={() => setEditing(blank())}>Create routine</Button>}
        />
      ) : (
        <div className="space-y-3">
          {s.routines.map((r) => (
            <Card key={r.id} className="overflow-hidden">
              <div className="px-4 pb-3 pt-3.5">
                <p className="text-[17px] font-semibold">{r.name}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  {r.items.length === 0
                    ? "No exercises yet"
                    : r.items
                        .map(
                          (i) =>
                            `${s.exerciseById.get(i.exerciseId)?.name ?? "?"} ${i.sets}×${i.reps}`,
                        )
                        .join(" · ")}
                </p>
              </div>
              <div className="flex gap-2 border-t border-line px-3 py-2.5">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => void s.startSession(r)}
                  disabled={!r.items.length}
                >
                  Start
                </Button>
                <Button size="sm" variant="ghost" className="flex-1" onClick={() => setEditing(r)}>
                  Edit
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && <RoutineEditor routine={editing} onClose={() => setEditing(null)} />}
    </Screen>
  );
}

function RoutineEditor({ routine, onClose }: { routine: Routine; onClose: () => void }) {
  const s = useStore();
  const [name, setName] = useState(routine.name);
  const [items, setItems] = useState<RoutineItem[]>(routine.items);
  const [picker, setPicker] = useState(false);
  const exists = s.routines.some((r) => r.id === routine.id);

  function patch(i: number, p: Partial<RoutineItem>) {
    setItems((list) => list.map((x, j) => (j === i ? { ...x, ...p } : x)));
  }
  function move(i: number, dir: -1 | 1) {
    setItems((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await s.saveRoutine({ ...routine, name: trimmed, items, updatedAt: Date.now() });
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={exists ? "Edit routine" : "New routine"}
      footer={
        <div className="space-y-2">
          <Button className="w-full" size="lg" onClick={() => void save()} disabled={!name.trim()}>
            Save routine
          </Button>
          {exists && (
            <Button
              variant="danger"
              className="w-full"
              onClick={() => {
                if (confirm(`Delete routine "${routine.name}"? Logged workouts are kept.`)) {
                  void s.deleteRoutine(routine.id);
                  onClose();
                }
              }}
            >
              Delete routine
            </Button>
          )}
        </div>
      }
    >
      <input
        className={`${inputCls} mb-4`}
        placeholder="Routine name (e.g. Push A)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <div className="space-y-2">
        {items.map((item, i) => (
          <Card key={`${item.exerciseId}-${i}`} className="p-3">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-[15px] font-medium">
                {s.exerciseById.get(item.exerciseId)?.name ?? "Unknown exercise"}
              </p>
              <button onClick={() => move(i, -1)} className="size-8 rounded-lg text-muted active:bg-panel2">
                ↑
              </button>
              <button onClick={() => move(i, 1)} className="size-8 rounded-lg text-muted active:bg-panel2">
                ↓
              </button>
              <button
                onClick={() => setItems((l) => l.filter((_, j) => j !== i))}
                className="size-8 rounded-lg text-red-400 active:bg-panel2"
              >
                ✕
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Counter label="Sets" value={item.sets} min={1} onChange={(v) => patch(i, { sets: v })} />
              <Counter label="Reps" value={item.reps} min={1} onChange={(v) => patch(i, { reps: v })} />
            </div>
          </Card>
        ))}
      </div>

      <Button variant="outline" className="mt-3 w-full" onClick={() => setPicker(true)}>
        + Add exercise
      </Button>

      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(ex) => {
          setItems((l) => [...l, { exerciseId: ex.id, sets: 3, reps: 8 }]);
          setPicker(false);
        }}
      />
    </Sheet>
  );
}

function Counter({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-panel2 px-1">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="h-10 w-9 text-muted active:text-white"
      >
        −
      </button>
      <span className="text-center text-[13px] text-muted">
        {label} <b className="ml-1 text-[15px] tabular-nums text-white">{value}</b>
      </span>
      <button onClick={() => onChange(value + 1)} className="h-10 w-9 text-muted active:text-white">
        +
      </button>
    </div>
  );
}
