import { useMemo, useState } from "react";
import { ExercisePicker } from "../components/ExercisePicker";
import { Button, Empty, Eyebrow, Sheet, StatBand } from "../components/ui";
import { e1rm, lastPerformance, personalRecords, sessionSetCount, sessionVolume } from "../lib/stats";
import { fmtDuration, num } from "../lib/util";
import { useStore } from "../store";
import type { SessionEntry, SetLog } from "../types";

export function ActiveWorkout({ onBack }: { onBack: () => void }) {
  const s = useStore();
  const session = s.active!;
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const unitLabel = s.settings.unit === "lb" ? "lbs" : "kg";

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
      <header className="sticky top-0 z-20 border-b border-rule bg-ink/95 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-xl">
        <div className="flex items-center gap-3.5 px-5 pb-3">
          <button onClick={onBack} aria-label="Back" className="shrink-0 text-muted active:text-fg">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 6l-6 6 6 6" />
            </svg>
          </button>
          <input
            value={session.name}
            onChange={(e) => s.renameSession(e.target.value)}
            className="min-w-0 flex-1 truncate bg-transparent text-[19px] font-medium tracking-[-0.01em] outline-none"
          />
          <Button variant="link" onClick={() => setConfirmFinish(true)}>
            Finish
          </Button>
        </div>
        <StatBand
          stats={[
            { label: "Elapsed", value: fmtDuration(elapsed) },
            { label: "Sets", value: String(setsDone) },
            { label: unitLabel, value: num(volume, 0) },
          ]}
        />
      </header>

      {session.entries.length === 0 ? (
        <div className="px-5">
          <Empty
            eyebrow="Empty workout"
            title="The clock is running. Add your first exercise."
            action={
              <div className="flex flex-col gap-3.5">
                <Button onClick={() => setPicker(true)}>Add exercise</Button>
                <Button
                  variant="quiet"
                  onClick={() => {
                    if (confirm("Discard this workout? It will not be saved.")) {
                      void s.discardSession();
                    }
                  }}
                >
                  Discard workout
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <div className="pb-40">
          {session.entries.map((entry) => (
            <Entry
              key={entry.id}
              entry={entry}
              priorBest={priorPRs.get(entry.exerciseId)?.bestE1rm ?? 0}
              onMenu={() => setMenu(entry.id)}
            />
          ))}

          <button
            onClick={() => setPicker(true)}
            className="w-full border-b border-rule px-5 py-[22px] text-left"
          >
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-fg">
              + Add exercise
            </span>
          </button>

          <div className="px-5 py-[22px]">
            <Eyebrow className="tracking-[0.18em]">Workout notes</Eyebrow>
            <textarea
              className="mt-2 w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-faint"
              rows={2}
              placeholder="How the session felt, what to change next time…"
              value={session.note ?? ""}
              onChange={(e) => s.setSessionNote(e.target.value)}
            />
          </div>
        </div>
      )}

      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(ex) => {
          s.addEntry(ex.id);
          setPicker(false);
        }}
      />

      <Sheet open={!!menu} onClose={() => setMenu(null)} title="Exercise">
        <div className="space-y-2.5">
          <Button
            variant="outline"
            onClick={() => {
              if (menu) s.moveEntry(menu, -1);
              setMenu(null);
            }}
          >
            Move up
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (menu) s.moveEntry(menu, 1);
              setMenu(null);
            }}
          >
            Move down
          </Button>
          <Button
            variant="danger"
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
          <div className="space-y-2.5">
            <Button
              onClick={() => {
                void s.finishSession();
                setConfirmFinish(false);
              }}
            >
              Save workout
            </Button>
            <Button
              variant="danger"
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
        <p className="font-mono text-[13px] text-muted">
          {setsDone} sets · {num(volume, 0)} {unitLabel} · {fmtDuration(elapsed)}
        </p>
        <p className="mt-2.5 text-[13px] text-muted">
          Sets you never ticked off are dropped on save.
        </p>
      </Sheet>
    </div>
  );
}

/** The five-column grid every set row and its header share. */
const GRID = "grid grid-cols-[26px_1fr_1fr_44px_34px] items-center gap-x-2.5";

function Entry({
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
  const unitLabel = s.settings.unit === "lb" ? "lbs" : "kg";
  const last = useMemo(
    () => lastPerformance(s.sessions, entry.exerciseId, s.activeSessionId ?? undefined),
    [s.sessions, entry.exerciseId, s.activeSessionId],
  );

  return (
    <div className="border-b border-rule px-5 pb-3 pt-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-medium tracking-[-0.01em]">
            {ex?.name ?? "Exercise"}
          </p>
          <p className="mt-1 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted">
            {last
              ? `Last · ${last.sets.map((x) => `${num(x.weight)}×${x.reps}`).join(", ")}`
              : "First time logging this"}
          </p>
        </div>
        <button onClick={onMenu} className="shrink-0 text-[16px] text-muted active:text-fg">
          ⋯
        </button>
      </div>

      <div className={`${GRID} mt-4 border-b border-subrule pb-2`}>
        {["#", ex?.bodyweight ? `+${unitLabel}` : unitLabel, "Reps"].map((h) => (
          <span
            key={h}
            className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted"
          >
            {h}
          </span>
        ))}
        <span className="text-center font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
          RPE
        </span>
        <span />
      </div>

      {entry.sets.map((set, i) => (
        <SetRow
          key={set.id}
          set={set}
          index={i}
          entryId={entry.id}
          prev={last?.sets[i]}
          priorBest={priorBest}
        />
      ))}

      <div className="flex gap-6 pt-3">
        <button
          onClick={() => s.addSet(entry.id)}
          className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-fg"
        >
          + Set
        </button>
        <button
          onClick={() => {
            const lastSet = entry.sets[entry.sets.length - 1];
            if (lastSet) s.removeSet(entry.id, lastSet.id);
          }}
          disabled={!entry.sets.length}
          className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted disabled:opacity-40"
        >
          − Set
        </button>
      </div>
    </div>
  );
}

function SetRow({
  set,
  index,
  entryId,
  prev,
  priorBest,
}: {
  set: SetLog;
  index: number;
  entryId: string;
  prev?: { weight: number; reps: number };
  priorBest: number;
}) {
  const s = useStore();
  const isPR =
    set.done && !set.warmup && set.reps > 0 && priorBest > 0 && e1rm(set.weight, set.reps) > priorBest;

  return (
    <div className={`${GRID} border-b border-subrule py-2.5`}>
      <button
        onClick={() => s.updateSet(entryId, set.id, { warmup: !set.warmup })}
        className={`text-left font-mono text-[11px] font-medium ${
          set.warmup ? "text-[#8b8b90]" : "text-muted"
        }`}
      >
        {set.warmup ? "W" : index + 1}
      </button>

      <CellInput
        value={set.weight}
        done={set.done}
        placeholder={prev ? num(prev.weight) : "—"}
        onChange={(v) => s.updateSet(entryId, set.id, { weight: v })}
      />
      <CellInput
        value={set.reps}
        done={set.done}
        integer
        placeholder={prev ? String(prev.reps) : "—"}
        onChange={(v) => s.updateSet(entryId, set.id, { reps: v })}
      />
      <CellInput
        value={set.rpe ?? 0}
        done={set.done}
        small
        placeholder="—"
        onChange={(v) => s.updateSet(entryId, set.id, { rpe: v || undefined })}
      />

      <div className="flex items-center justify-end gap-1">
        {isPR && <span className="animate-pop absolute -translate-x-6 text-[12px]">🏆</span>}
        <button
          onClick={() => s.updateSet(entryId, set.id, { done: !set.done })}
          onDoubleClick={() => s.removeSet(entryId, set.id)}
          aria-label={set.done ? "Undo set" : "Complete set"}
          className={`grid size-[30px] place-items-center rounded-full border transition-colors ${
            set.done ? "border-fg bg-fg text-black" : "border-[#1f1f1f] text-[#2a2a2a]"
          }`}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 13l4.5 4.5L19 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * A number in the grid that happens to be editable. There is no box and no
 * stepper — the value is the control, and it dims until the set is ticked so
 * the row reads as filled-in or not at a glance.
 */
function CellInput({
  value,
  onChange,
  placeholder,
  done,
  integer,
  small,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  done: boolean;
  integer?: boolean;
  small?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value ? num(value) : "");

  /** Write through on every keystroke so a backgrounded app never loses a typed set. */
  function edit(raw: string) {
    setText(raw);
    const v = parseFloat(raw.replace(",", "."));
    onChange(isFinite(v) && v >= 0 ? (integer ? Math.round(v) : v) : 0);
  }

  return (
    <input
      inputMode="decimal"
      enterKeyHint="done"
      className={`w-full min-w-0 bg-transparent font-mono font-medium outline-none transition-colors placeholder:text-[#2a2a2a] ${
        small ? "text-center text-[12px]" : "text-[17px]"
      } ${done ? "text-fg" : "text-faint"}`}
      placeholder={placeholder}
      value={shown}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => edit(e.target.value)}
      onBlur={() => setText(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
