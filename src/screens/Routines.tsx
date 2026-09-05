import { useState } from "react";
import { ExercisePicker } from "../components/ExercisePicker";
import { Button, Empty, Eyebrow, Row, Sheet, inputCls } from "../components/ui";
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
  const exCount = days.reduce((t, d) => t + d.items.length, 0);

  return (
    <div className="min-h-full pb-40">
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+14px)]">
        <div className="flex items-baseline justify-between">
          <Eyebrow>Routines</Eyebrow>
          <Button variant="link" onClick={() => setChoosing(true)}>
            Change split
          </Button>
        </div>
        <h1 className="mt-5 text-[27px] font-bold leading-none tracking-[-0.025em]">
          {s.activeSplit.name}
        </h1>
        <button onClick={() => setEditSplit(true)} className="mb-5 mt-2 block">
          <Eyebrow className="tracking-[0.14em]">
            {days.length} {days.length === 1 ? "day" : "days"} · {exCount} exercises · Edit
          </Eyebrow>
        </button>
      </div>

      {days.length === 0 ? (
        <div className="border-t border-rule px-5">
          <Empty
            eyebrow="No days yet"
            title="A day is a list of exercises with target sets and reps."
            body="Start a workout from one and it comes pre-filled."
            action={<Button onClick={() => setEditing(blank())}>Add a day</Button>}
          />
        </div>
      ) : (
        <div className="border-t border-rule">
          {days.map((r) => (
            <div key={r.id} className="border-b border-rule px-5 py-[18px]">
              <div className="flex items-baseline justify-between gap-3">
                <button onClick={() => setEditing(r)} className="min-w-0 text-left">
                  <p className="truncate text-[17px] font-medium tracking-[-0.01em]">{r.name}</p>
                </button>
                <Button
                  variant="link"
                  onClick={() => void s.startSession(r)}
                  className={r.items.length ? "" : "pointer-events-none opacity-30"}
                >
                  Start
                </Button>
              </div>
              <div className="mt-3">
                {r.items.length === 0 ? (
                  <p className="text-[13px] text-faint">No exercises yet</p>
                ) : (
                  r.items.map((i, n) => (
                    <div
                      key={`${i.exerciseId}-${n}`}
                      className="flex items-baseline justify-between gap-3 py-[5px]"
                    >
                      <span className="min-w-0 truncate text-[13px] text-muted">
                        {s.exerciseById.get(i.exerciseId)?.name ?? "?"}
                      </span>
                      <span className="shrink-0 font-mono text-[12px] text-muted">
                        {i.sets}×{i.reps}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
          <Row onClick={() => setEditing(blank())} className="py-[22px]">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-fg">
              + New day
            </span>
          </Row>
        </div>
      )}

      {editing && <RoutineEditor routine={editing} onClose={() => setEditing(null)} />}
      {editSplit && <SplitEditor split={s.activeSplit} onClose={() => setEditSplit(false)} />}
    </div>
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
        <div className="space-y-2.5">
          <Button onClick={() => void save()} disabled={!name.trim()}>
            Save split
          </Button>
          <Button
            variant="danger"
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
      <p className="mt-3.5 text-[12px] leading-relaxed text-muted">
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
    <div className="min-h-full pb-40">
      <div className="px-5 pb-5 pt-[calc(env(safe-area-inset-top)+14px)]">
        <div className="flex items-baseline justify-between">
          <Eyebrow>Choose a split</Eyebrow>
          {canCancel && (
            <button onClick={onDone}>
              <Eyebrow tone="fg" className="tracking-[0.16em]">
                Cancel
              </Eyebrow>
            </button>
          )}
        </div>
        <h1 className="mt-5 text-[27px] font-bold leading-[1.1] tracking-[-0.025em] text-pretty">
          How your training week is organised.
        </h1>
      </div>

      <div className="border-t border-rule">
        {PRESETS.map((p) => {
          const inUse = usedPresets.has(p.key);
          const active = s.activeSplit?.preset === p.key;
          return (
            <Row key={p.key} onClick={() => void pick(p)} className="py-[18px]">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[17px] font-medium tracking-[-0.01em]">{p.name}</p>
                {active ? (
                  <Eyebrow tone="fg" className="shrink-0 tracking-[0.16em]">
                    Current
                  </Eyebrow>
                ) : inUse ? (
                  <Eyebrow className="shrink-0 tracking-[0.16em]">Saved</Eyebrow>
                ) : null}
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{p.blurb}</p>
              <p className="mt-2 font-mono text-[11px] leading-relaxed text-faint">
                {p.days.map(([d]) => d).join(" · ")}
              </p>
            </Row>
          );
        })}

        {custom.map((sp) => {
          const n = s.routines.filter((r) => r.splitId === sp.id).length;
          return (
            <Row
              key={sp.id}
              onClick={() => void s.setActiveSplit(sp.id).then(onDone)}
              className="py-[18px]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[17px] font-medium tracking-[-0.01em]">{sp.name}</p>
                {s.activeSplitId === sp.id && (
                  <Eyebrow tone="fg" className="shrink-0 tracking-[0.16em]">
                    Current
                  </Eyebrow>
                )}
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-muted">
                {n} {n === 1 ? "day" : "days"} · your own
              </p>
            </Row>
          );
        })}

        <Row onClick={() => setNaming(true)} className="py-[22px]">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-fg">
            + Build your own
          </span>
        </Row>
      </div>

      <p className="px-5 pt-5 text-[12px] leading-relaxed text-muted text-pretty">
        Every preset is just a starting point — once chosen, its days are yours to edit, add to or
        delete.
      </p>

      <Sheet
        open={naming}
        onClose={() => setNaming(false)}
        title="New split"
        footer={
          <Button onClick={() => void create()} disabled={!name.trim()}>
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
        <p className="mt-3.5 text-[12px] leading-relaxed text-muted">
          You'll add the days yourself afterwards.
        </p>
      </Sheet>
    </div>
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
        <div className="space-y-2.5">
          <Button onClick={() => void save()} disabled={!name.trim()}>
            Save day
          </Button>
          {exists && (
            <Button
              variant="danger"
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
        className={`${inputCls} mb-5`}
        placeholder="Day name (e.g. Push A)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <div className="border-t border-rule">
        {items.map((item, i) => (
          <div key={`${item.exerciseId}-${i}`} className="border-b border-subrule py-3">
            <div className="flex items-center gap-1">
              <p className="min-w-0 flex-1 truncate text-[15px] font-medium">
                {s.exerciseById.get(item.exerciseId)?.name ?? "Unknown exercise"}
              </p>
              <button onClick={() => move(i, -1)} className="size-8 text-muted active:text-fg">
                ↑
              </button>
              <button onClick={() => move(i, 1)} className="size-8 text-muted active:text-fg">
                ↓
              </button>
              <button
                onClick={() => setItems((l) => l.filter((_, j) => j !== i))}
                className="size-8 text-danger active:opacity-70"
              >
                ✕
              </button>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-6">
              <Counter
                label="Sets"
                value={item.sets}
                min={1}
                onChange={(v) => patch(i, { sets: v })}
              />
              <Counter
                label="Reps"
                value={item.reps}
                min={1}
                onChange={(v) => patch(i, { reps: v })}
              />
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => setPicker(true)} className="w-full py-5 text-left">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-fg">
          + Add exercise
        </span>
      </button>

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
    <div className="flex items-center justify-between">
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="h-9 w-8 text-muted active:text-fg"
        >
          −
        </button>
        <span className="w-6 text-center font-mono text-[15px]">{value}</span>
        <button onClick={() => onChange(value + 1)} className="h-9 w-8 text-muted active:text-fg">
          +
        </button>
      </div>
    </div>
  );
}
