import { useState } from "react";
import { ExercisePicker } from "../components/ExercisePicker";
import { Button, Card, Empty, Screen, Sheet, inputCls } from "../components/ui";
import { PRESETS, type Preset } from "../lib/presets";
import { uid } from "../lib/util";
import { useStore } from "../store";
import type { Routine, RoutineItem, Split } from "../types";

export function Routines() {
  const s = useStore();
  const [editing, setEditing] = useState<Routine | null>(null);
  // held open when switching splits, so the chooser is reachable after picking
  const [choosing, setChoosing] = useState(false);
  const [editSplit, setEditSplit] = useState(false);

  function blank(): Routine {
    const now = Date.now();
    return {
      id: uid(),
      name: "",
      splitId: s.activeSplitId ?? undefined,
      items: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  // Nothing chosen yet — the whole screen is the question.
  if (!s.activeSplit || choosing) {
    return <SplitChooser onDone={() => setChoosing(false)} canCancel={!!s.activeSplit} />;
  }

  const days = s.splitRoutines;

  return (
    <Screen
      title="Routines"
      subtitle={s.activeSplit.name}
      right={
        <Button size="sm" onClick={() => setEditing(blank())}>
          + New
        </Button>
      }
    >
      {days.length === 0 ? (
        <Empty
          icon="📋"
          title="No days yet"
          body="A day is a saved list of exercises with target sets and reps. Start a workout from one and it comes pre-filled."
          action={<Button onClick={() => setEditing(blank())}>Add a day</Button>}
        />
      ) : (
        <div className="space-y-3">
          {days.map((r) => (
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

      <div className="mt-4 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => setChoosing(true)}>
          Change split
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => setEditSplit(true)}>
          Edit split
        </Button>
      </div>

      {editing && <RoutineEditor routine={editing} onClose={() => setEditing(null)} />}
      {editSplit && <SplitEditor split={s.activeSplit} onClose={() => setEditSplit(false)} />}
    </Screen>
  );
}

/**
 * Renames or removes the active split. A preset you tried once and moved on
 * from would otherwise stay in the chooser for good, so it has to be possible
 * to delete one — its days go with it, but logged workouts never do.
 */
function SplitEditor({ split, onClose }: { split: Split; onClose: () => void }) {
  const s = useStore();
  const [name, setName] = useState(split.name);
  const days = s.splitRoutines.length;

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await s.saveSplit({ ...split, name: trimmed });
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Edit split"
      footer={
        <div className="space-y-2">
          <Button className="w-full" size="lg" onClick={() => void save()} disabled={!name.trim()}>
            Save split
          </Button>
          <Button
            variant="danger"
            className="w-full"
            onClick={() => {
              if (
                confirm(
                  `Delete "${split.name}" and its ${days} ${days === 1 ? "day" : "days"}? Logged workouts are kept.`,
                )
              ) {
                void s.deleteSplit(split.id);
                onClose();
              }
            }}
          >
            Delete split
          </Button>
        </div>
      }
    >
      <input
        className={inputCls}
        placeholder="Split name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <p className="mt-3 text-[12px] leading-relaxed text-muted">
        {days} {days === 1 ? "day" : "days"}. Deleting the split removes its days too — your logged
        workouts and history are untouched.
      </p>
    </Sheet>
  );
}

/**
 * The first thing you see on this screen until a split is picked, and reachable
 * again from "Change split". Presets already in use are shown as such: choosing
 * one again switches back to the days you have been editing rather than
 * building a second copy.
 */
function SplitChooser({ onDone, canCancel }: { onDone: () => void; canCancel: boolean }) {
  const s = useStore();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const usedPresets = new Set(s.splits.map((x) => x.preset).filter(Boolean));
  const custom = s.splits.filter((x) => !x.preset);

  async function pick(p: Preset) {
    await s.useSplit(p);
    onDone();
  }

  async function create() {
    await s.createSplit(name);
    setNaming(false);
    setName("");
    onDone();
  }

  return (
    <Screen
      title="Choose a split"
      subtitle="How your training week is organised"
      right={
        canCancel ? (
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {PRESETS.map((p) => {
          const inUse = usedPresets.has(p.key);
          const active = s.activeSplit?.preset === p.key;
          return (
            <Card key={p.key} className="overflow-hidden">
              <button
                onClick={() => void pick(p)}
                className="w-full px-4 pb-3.5 pt-3.5 text-left active:bg-panel2"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[17px] font-semibold">{p.name}</p>
                  {active ? (
                    <span className="shrink-0 text-[11px] font-semibold text-white">Current</span>
                  ) : inUse ? (
                    <span className="shrink-0 text-[11px] text-muted">Saved</span>
                  ) : null}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">{p.blurb}</p>
                <p className="mt-2 text-[12px] leading-relaxed text-muted">
                  {p.days.map(([d]) => d).join(" · ")}
                </p>
              </button>
            </Card>
          );
        })}

        {custom.map((sp) => (
          <Card key={sp.id} className="overflow-hidden">
            <button
              onClick={() => void s.setActiveSplit(sp.id).then(onDone)}
              className="w-full px-4 pb-3.5 pt-3.5 text-left active:bg-panel2"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[17px] font-semibold">{sp.name}</p>
                {s.activeSplitId === sp.id && (
                  <span className="shrink-0 text-[11px] font-semibold text-white">Current</span>
                )}
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                {(() => {
                  const n = s.routines.filter((r) => r.splitId === sp.id).length;
                  return `${n} ${n === 1 ? "day" : "days"} · your own`;
                })()}
              </p>
            </button>
          </Card>
        ))}
      </div>

      <Button variant="outline" className="mt-4 w-full" onClick={() => setNaming(true)}>
        + Build your own
      </Button>

      <p className="mt-3 px-1 text-[12px] leading-relaxed text-muted">
        Every preset is just a starting point — once chosen, its days are yours to edit, add to or
        delete.
      </p>

      <Sheet
        open={naming}
        onClose={() => setNaming(false)}
        title="New split"
        footer={
          <Button className="w-full" size="lg" onClick={() => void create()} disabled={!name.trim()}>
            Create split
          </Button>
        }
      >
        <input
          className={inputCls}
          placeholder="Split name (e.g. My Split)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          You'll add the days yourself afterwards.
        </p>
      </Sheet>
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
      title={exists ? "Edit day" : "New day"}
      footer={
        <div className="space-y-2">
          <Button className="w-full" size="lg" onClick={() => void save()} disabled={!name.trim()}>
            Save day
          </Button>
          {exists && (
            <Button
              variant="danger"
              className="w-full"
              onClick={() => {
                if (confirm(`Delete "${routine.name}"? Logged workouts are kept.`)) {
                  void s.deleteRoutine(routine.id);
                  onClose();
                }
              }}
            >
              Delete day
            </Button>
          )}
        </div>
      }
    >
      <input
        className={`${inputCls} mb-4`}
        placeholder="Day name (e.g. Push A)"
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
