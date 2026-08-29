import { useMemo, useState } from "react";
import { ExercisePicker } from "../components/ExercisePicker";
import { Button, Card, Sheet } from "../components/ui";
import { e1rm, lastPerformance, personalRecords, sessionSetCount, sessionVolume } from "../lib/stats";
import { fmtDuration, num } from "../lib/util";
import { useStore } from "../store";
import type { SessionEntry, SetLog } from "../types";

export function ActiveWorkout() {
  const s = useStore();
  const session = s.active!;
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const unit = s.settings.unit;

  // records from every *other* session, so a new best inside this one lights up
  const priorPRs = useMemo(
    () => personalRecords(s.sessions.filter((x) => x.id !== session.id)),
    [s.sessions, session.id],
  );

  const elapsed = s.now - session.startedAt;
  const volume = sessionVolume(session);
  const setsDone = sessionSetCount(session);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-ink/85 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <input
              value={session.name}
              onChange={(e) => s.renameSession(e.target.value)}
              className="w-full truncate bg-transparent text-[22px] font-bold tracking-tight outline-none"
            />
            <p className="mt-0.5 text-[13px] tabular-nums text-muted">
              {fmtDuration(elapsed)} · {setsDone} sets · {num(volume, 0)} {unit}
            </p>
          </div>
          <Button size="sm" onClick={() => setConfirmFinish(true)}>
            Finish
          </Button>
        </div>
      </header>

      <div className="space-y-3 px-4 pb-44 pt-4">
        {session.entries.length === 0 && (
          <p className="py-10 text-center text-sm text-muted">
            Empty workout. Add your first exercise below.
          </p>
        )}

        {session.entries.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            priorBest={priorPRs.get(entry.exerciseId)?.bestE1rm ?? 0}
            onMenu={() => setMenu(entry.id)}
          />
        ))}

        <Button variant="outline" className="w-full" onClick={() => setPicker(true)}>
          + Add exercise
        </Button>

        <Card className="p-3">
          <textarea
            className="w-full resize-none bg-transparent text-[15px] outline-none placeholder:text-muted/70"
            rows={2}
            placeholder="Workout notes…"
            value={session.note ?? ""}
            onChange={(e) => s.setSessionNote(e.target.value)}
          />
        </Card>
      </div>

      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(ex) => {
          s.addEntry(ex.id);
          setPicker(false);
        }}
      />

      <Sheet open={!!menu} onClose={() => setMenu(null)} title="Exercise">
        <div className="space-y-2">
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              if (menu) s.moveEntry(menu, -1);
              setMenu(null);
            }}
          >
            Move up
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              if (menu) s.moveEntry(menu, 1);
              setMenu(null);
            }}
          >
            Move down
          </Button>
          <Button
            variant="danger"
            className="w-full"
            onClick={() => {
              if (menu) s.removeEntry(menu);
              setMenu(null);
            }}
          >
            Remove from workout
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={confirmFinish}
        onClose={() => setConfirmFinish(false)}
        title="Finish workout?"
        footer={
          <div className="space-y-2">
            <Button
              className="w-full"
              size="lg"
              onClick={() => {
                void s.finishSession();
                setConfirmFinish(false);
              }}
            >
              Save workout
            </Button>
            <Button
              variant="danger"
              className="w-full"
              onClick={() => {
                if (confirm("Discard this workout? It will not be saved.")) {
                  void s.discardSession();
                  setConfirmFinish(false);
                }
              }}
            >
              Discard workout
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted">
          {setsDone} sets · {num(volume, 0)} {unit} total volume · {fmtDuration(elapsed)}.
        </p>
        <p className="mt-2 text-sm text-muted">Sets you never ticked off are dropped on save.</p>
      </Sheet>
    </div>
  );
}

function EntryCard({
  entry,
  priorBest,
  onMenu,
}: {
  entry: SessionEntry;
  priorBest: number;
  onMenu: () => void;
}) {
  const s = useStore();
  const ex = s.exerciseById.get(entry.exerciseId);
  const unit = s.settings.unit;
  const last = useMemo(
    () => lastPerformance(s.sessions, entry.exerciseId, s.activeSessionId ?? undefined),
    [s.sessions, entry.exerciseId, s.activeSessionId],
  );

  function toggleDone(set: SetLog) {
    const nowDone = !set.done;
    s.updateSet(entry.id, set.id, { done: nowDone });
    if (nowDone && !set.warmup && s.settings.restAutoStart) s.startRest();
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-2 px-3.5 pt-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold">{ex?.name ?? "Exercise"}</p>
          <p className="mt-0.5 text-[12px] text-muted">
            {last
              ? `Last: ${last.sets.map((x) => `${num(x.weight)}×${x.reps}`).join(", ")}`
              : "First time logging this"}
          </p>
        </div>
        <button
          onClick={onMenu}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted active:bg-panel2"
        >
          ⋯
        </button>
      </div>

      <div className="mt-2 grid grid-cols-[38px_1fr_1fr_46px] gap-x-2 px-3.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
        <span>Set</span>
        <span>{ex?.bodyweight ? "+" + unit : unit}</span>
        <span>Reps</span>
        <span />
      </div>

      <div className="pb-2">
        {entry.sets.map((set, i) => {
          const isPR =
            set.done && !set.warmup && set.reps > 0 && priorBest > 0 && e1rm(set.weight, set.reps) > priorBest;
          const prev = last?.sets[i];
          return (
            <div
              key={set.id}
              className={`grid grid-cols-[38px_1fr_1fr_46px] items-center gap-x-2 px-3.5 py-1.5 ${
                set.done ? "bg-accent/[0.06]" : ""
              }`}
            >
              <button
                onClick={() => s.updateSet(entry.id, set.id, { warmup: !set.warmup })}
                className={`grid h-10 place-items-center rounded-lg text-[13px] font-semibold ${
                  set.warmup ? "bg-amber-400/15 text-amber-300" : "bg-panel2 text-muted"
                }`}
              >
                {set.warmup ? "W" : i + 1}
              </button>

              <NumInput
                value={set.weight}
                placeholder={prev ? num(prev.weight) : "0"}
                step={2.5}
                onChange={(v) => s.updateSet(entry.id, set.id, { weight: v })}
              />
              <NumInput
                value={set.reps}
                placeholder={prev ? String(prev.reps) : "0"}
                step={1}
                integer
                onChange={(v) => s.updateSet(entry.id, set.id, { reps: v })}
              />

              <div className="flex items-center justify-end gap-1">
                {isPR && <span className="animate-pop text-[13px]">🏆</span>}
                <button
                  onClick={() => toggleDone(set)}
                  onDoubleClick={() => s.removeSet(entry.id, set.id)}
                  className={`grid size-10 place-items-center rounded-lg text-[17px] font-bold transition-colors ${
                    set.done ? "bg-accent text-ink" : "bg-panel2 text-muted"
                  }`}
                >
                  ✓
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 border-t border-line px-3.5 py-2.5">
        <Button size="sm" variant="ghost" className="flex-1" onClick={() => s.addSet(entry.id)}>
          + Set
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="flex-1"
          onClick={() => {
            const lastSet = entry.sets[entry.sets.length - 1];
            if (lastSet) s.removeSet(entry.id, lastSet.id);
          }}
          disabled={!entry.sets.length}
        >
          − Set
        </Button>
        <Button size="sm" variant="ghost" onClick={() => s.startRest()}>
          Rest
        </Button>
      </div>
    </Card>
  );
}

function NumInput({
  value,
  onChange,
  placeholder,
  step,
  integer,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  step: number;
  integer?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value ? num(value) : "");

  /** Write through on every keystroke so a backgrounded app never loses a typed set. */
  function edit(raw: string) {
    setText(raw);
    const v = parseFloat(raw.replace(",", "."));
    onChange(isFinite(v) && v >= 0 ? (integer ? Math.round(v) : v) : 0);
  }

  function commit() {
    setText(null); // fall back to the canonical formatting of the stored number
  }

  return (
    <div className="flex items-center rounded-lg bg-panel2">
      <button
        onClick={() => onChange(Math.max(0, value - step))}
        className="h-10 w-8 shrink-0 text-muted active:text-white"
      >
        −
      </button>
      <input
        inputMode="decimal"
        enterKeyHint="done"
        className="h-10 w-full min-w-0 bg-transparent text-center font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-muted/50"
        placeholder={placeholder}
        value={shown}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => edit(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <button
        onClick={() => onChange(value + step)}
        className="h-10 w-8 shrink-0 text-muted active:text-white"
      >
        +
      </button>
    </div>
  );
}
