import { useMemo, useState } from "react";
import { uid } from "../lib/util";
import { useStore } from "../store";
import type { Exercise } from "../types";
import { Button, Sheet, inputCls } from "./ui";

const MUSCLES = ["Chest", "Back", "Shoulders", "Arms", "Legs", "Glutes", "Core", "Cardio", "Other"];

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
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [muscle, setMuscle] = useState("Chest");
  const [bodyweight, setBodyweight] = useState(false);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = s.exercises
      .filter((e) => !e.archived)
      .filter((e) => !needle || e.name.toLowerCase().includes(needle) || e.muscle.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
    const m = new Map<string, Exercise[]>();
    for (const e of list) m.set(e.muscle, [...(m.get(e.muscle) ?? []), e]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [s.exercises, q]);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const ex: Exercise = {
      id: uid(),
      name: trimmed,
      muscle,
      bodyweight,
      createdAt: Date.now(),
    };
    await s.saveExercise(ex);
    setName("");
    setBodyweight(false);
    setCreating(false);
    onPick(ex);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={creating ? "New exercise" : title}
      footer={
        creating ? (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={() => void create()} disabled={!name.trim()}>
              Create & add
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
            + Create new exercise
          </Button>
        )
      }
    >
      {creating ? (
        <div className="space-y-4">
          <input
            autoFocus
            className={inputCls}
            placeholder="Exercise name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div>
            <p className="mb-2 text-[13px] font-medium text-muted">Muscle group</p>
            <div className="flex flex-wrap gap-2">
              {MUSCLES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMuscle(m)}
                  className={`rounded-full px-3.5 py-2 text-[13px] ${
                    muscle === m ? "bg-accent font-semibold text-ink" : "bg-panel2 text-white/80"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between rounded-xl bg-panel2 px-3.5 py-3">
            <span className="text-[15px]">Bodyweight exercise</span>
            <input
              type="checkbox"
              className="size-5 accent-[var(--color-accent)]"
              checked={bodyweight}
              onChange={(e) => setBodyweight(e.target.checked)}
            />
          </label>
        </div>
      ) : (
        <>
          <input
            className={`${inputCls} mb-4`}
            placeholder="Search exercises…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {groups.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">
              No match. Create it with the button below.
            </p>
          )}
          <div className="space-y-5">
            {groups.map(([m, list]) => (
              <div key={m}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {m}
                </p>
                <div className="overflow-hidden rounded-xl border border-line">
                  {list.map((e, i) => (
                    <button
                      key={e.id}
                      onClick={() => onPick(e)}
                      className={`flex w-full items-center justify-between px-3.5 py-3 text-left active:bg-panel2 ${
                        i ? "border-t border-line" : ""
                      }`}
                    >
                      <span className="text-[15px]">{e.name}</span>
                      {e.bodyweight && <span className="text-[11px] text-muted">bodyweight</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}
