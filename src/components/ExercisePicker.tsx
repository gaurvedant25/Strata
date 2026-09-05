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
            <p className="mb-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
              Muscle group
            </p>
            <div className="flex flex-wrap gap-2">
              {MUSCLES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMuscle(m)}
                  className={`rounded-full border px-3.5 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] transition-colors ${
                    muscle === m
                      ? "border-fg bg-fg text-black"
                      : "border-rule text-muted"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between border-y border-rule py-3">
            <span className="text-[15px]">Bodyweight exercise</span>
            <input
              type="checkbox"
              className="size-5 accent-white"
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
            <p className="py-6 text-[13px] text-muted">No match. Create it with the button below.</p>
          )}
          <div className="space-y-5">
            {groups.map(([m, list]) => (
              <div key={m}>
                <p className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
                  {m}
                </p>
                <div className="border-t border-rule">
                  {list.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => onPick(e)}
                      className="flex w-full items-center justify-between border-b border-subrule py-3 text-left active:bg-[#0b0b0b]"
                    >
                      <span className="text-[15px]">{e.name}</span>
                      {e.bodyweight && (
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                          bodyweight
                        </span>
                      )}
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
