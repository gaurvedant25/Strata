import { useState } from "react";
import { useConfirm } from "../components/confirm";
import { ExercisePicker } from "../components/ExercisePicker";
import { SlideToStart } from "../components/SlideToStart";
import {
  Button,
  Empty,
  Eyebrow,
  IconButton,
  Row,
  Sheet,
  inputCls,
} from "../components/ui";
import { canStartWorkout } from "../lib/entitlement";
import { useEntitlement, useWriteGate } from "../lib/useEntitlement";
import { PRESETS, type Preset } from "../lib/presets";
import { fmtClock, uid } from "../lib/util";
import { useStore } from "../store";
import type { Routine, RoutineItem, Split } from "../types";

export function Routines({
  onOpenLogger,
  onLocked,
}: {
  onOpenLogger: () => void;
  /** Opens the subscription sheet when the preview has been spent. */
  onLocked: () => void;
}) {
  const s = useStore();
  const { ent } = useEntitlement();
  const canStart = canStartWorkout(ent);
  // Building and rearranging routines is an action too, not just running one.
  const { guard } = useWriteGate(onLocked);
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
    return (
      <SplitChooser
        onDone={() => setChoosing(false)}
        canCancel={!!s.activeSplit}
      />
    );
  }

  const days = s.splitRoutines;

  // Which day is up next is kept by the store: it is set by hand here, and
  // moved on by finishing a workout, so it has to outlive this screen.
  const hero = days.find((d) => d.id === s.nextUpId) ?? days[0] ?? null;
  const rest = days.filter((d) => d.id !== hero?.id);

  return (
    <div className="min-h-full pb-stack">
      <div className="flex items-center justify-between gap-3 px-5 pt-[calc(env(safe-area-inset-top)+16px)]">
        <Eyebrow>Routines</Eyebrow>
        <Button variant="link" onClick={guard(() => setChoosing(true))}>
          Change split <span className="text-dim">↗</span>
        </Button>
      </div>

      {days.length === 0 ? (
        <div className="mt-4 border-t border-rule px-5">
          <Empty
            eyebrow="No days yet"
            title="A day is a list of exercises with target sets and reps."
            body="Start a workout from one and it comes pre-filled."
            action={
              <Button onClick={guard(() => setEditing(blank()))}>Add a day</Button>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4 pt-[18px]">
          {/*
            The next workout is the whole reason this screen is opened, so it
            stops being a row in a list and becomes the screen's subject — the
            name at display size, and the one control that matters underneath it.
          */}
          {hero && (
            <section className="rounded-[28px] border border-rule bg-[#101010] px-[22px] pb-6 pt-[22px]">
              <div className="flex items-start justify-between gap-3">
                <Eyebrow className="tracking-[0.22em]">Next up</Eyebrow>
                <IconButton
                  label={`Edit ${hero.name}`}
                  onClick={guard(() => setEditing(hero))}
                  // The canvas draws this at 40px; 44 is the floor every other
                  // control in the app is held to, and four pixels on a pencil
                  // in a card corner is a cheaper deviation than a control that
                  // is harder to hit than the rest of the app.
                  size={44}
                  className="-mr-2.5 -mt-2.5 border border-faint bg-[#0a0a0a]"
                >
                  <PencilIcon />
                </IconButton>
              </div>
              <h1 className="mb-6 mt-2.5 text-[3.125rem] font-bold leading-[0.9] tracking-[-0.035em] text-pretty">
                {hero.name}
              </h1>
              {/*
                With a workout already running the slide is a way back into it,
                not a way to begin another — there is only ever one, and asking
                for a second used to overwrite it: the first stayed in the log
                unfinished, with nothing left that could end or discard it.
              */}
              <SlideToStart
                verb={s.active ? "Resume" : "Start"}
                label={s.active ? s.active.name : hero.name}
                disabled={!s.active && hero.items.length === 0}
                onStart={() => {
                  /*
                   * Resuming is never gated. A workout already running is work
                   * already being done, and locking somebody out of it would
                   * lose the sets they have logged since — including the case
                   * that matters most, a preview that runs out mid-session.
                   */
                  if (s.active) {
                    onOpenLogger();
                    return;
                  }
                  if (!canStart) {
                    onLocked();
                    return;
                  }
                  void s.startSession(hero);
                }}
              />
              {hero.items.length === 0 && (
                <p className="mt-3 text-center text-[0.8125rem] text-dim">
                  Add an exercise before you can start this one.
                </p>
              )}
              {/* The state is readable before the control is pressed, rather
                  than only discovered by pressing it. */}
              {!canStart && !s.active && (
                <p className="mt-3 text-center text-[0.8125rem] leading-relaxed text-dim">
                  Your Pro preview has ended. Everything you have logged stays
                  here to read — adding to it needs Pro.
                </p>
              )}
            </section>
          )}

          {rest.length > 0 && (
            <div className="px-1.5 pb-0.5 pt-3">
              <Eyebrow tone="dim">The rest of the week</Eyebrow>
            </div>
          )}

          {rest.map((r) => (
            <button
              key={r.id}
              onClick={guard(() => void s.makeNextUp(r.id))}
              className="press press-row flex w-full items-center justify-between gap-3 rounded-[20px] border border-rule bg-[#101010] px-[22px] py-5 text-left"
            >
              <span className="min-w-0 truncate text-[1.5rem] font-semibold tracking-[-0.02em]">
                {r.name}
              </span>
              <span className="shrink-0 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-dim">
                Make next ↑
              </span>
            </button>
          ))}

          <button
            onClick={guard(() => setEditing(blank()))}
            className="press flex w-full items-center gap-3 rounded-[20px] border border-dashed border-faint px-[22px] py-5 text-left"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full border border-faint text-[0.9375rem] leading-none text-dim">
              +
            </span>
            <span className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-fg">
              New day
            </span>
          </button>
        </div>
      )}

      {editing && (
        <RoutineEditor routine={editing} onClose={() => setEditing(null)} />
      )}
      {editSplit && (
        <SplitEditor
          split={s.activeSplit}
          onClose={() => setEditSplit(false)}
        />
      )}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}

/**
 * Renames or removes the active split. A preset you tried once and moved on
 * from would otherwise stay in the chooser for good, so it has to be possible
 * to delete one — its days go with it, but logged workouts never do.
 */
function SplitEditor({
  split,
  onClose,
}: {
  split: Split;
  onClose: () => void;
}) {
  const s = useStore();
  const ask = useConfirm();
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
            onClick={async () => {
              const yes = await ask({
                title: `Delete "${split.name}"?`,
                body: `Its ${days} ${days === 1 ? "day goes" : "days go"} with it. Logged workouts are kept.`,
                confirmLabel: "Delete split",
                danger: true,
              });
              if (yes) {
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
      <p className="mt-3.5 text-[0.75rem] leading-relaxed text-muted">
        {days} {days === 1 ? "day" : "days"}. Deleting the split removes its
        days too — your logged workouts and history are untouched.
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
function SplitChooser({
  onDone,
  canCancel,
}: {
  onDone: () => void;
  canCancel: boolean;
}) {
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
    <div className="min-h-full pb-stack">
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
        <h1 className="mt-5 text-[1.6875rem] font-bold leading-[1.1] tracking-[-0.025em] text-pretty">
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
                <p className="text-[1.0625rem] font-medium tracking-[-0.01em]">
                  {p.name}
                </p>
                {active ? (
                  <Eyebrow tone="fg" className="shrink-0 tracking-[0.16em]">
                    Current
                  </Eyebrow>
                ) : inUse ? (
                  <Eyebrow className="shrink-0 tracking-[0.16em]">
                    Saved
                  </Eyebrow>
                ) : null}
              </div>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
                {p.blurb}
              </p>
              <p className="mt-2 font-mono text-[0.6875rem] leading-relaxed text-dim">
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
                <p className="text-[1.0625rem] font-medium tracking-[-0.01em]">
                  {sp.name}
                </p>
                {s.activeSplitId === sp.id && (
                  <Eyebrow tone="fg" className="shrink-0 tracking-[0.16em]">
                    Current
                  </Eyebrow>
                )}
              </div>
              <p className="mt-1.5 font-mono text-[0.6875rem] text-muted">
                {n} {n === 1 ? "day" : "days"} · your own
              </p>
            </Row>
          );
        })}

        <Row onClick={() => setNaming(true)} className="py-[22px]">
          <span className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-fg">
            + Build your own
          </span>
        </Row>
      </div>

      <p className="px-5 pt-5 text-[0.75rem] leading-relaxed text-muted text-pretty">
        Every preset is just a starting point — once chosen, its days are yours
        to edit, add to or delete.
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
        <p className="mt-3.5 text-[0.75rem] leading-relaxed text-muted">
          You'll add the days yourself afterwards.
        </p>
      </Sheet>
    </div>
  );
}

function RoutineEditor({
  routine,
  onClose,
}: {
  routine: Routine;
  onClose: () => void;
}) {
  const s = useStore();
  const ask = useConfirm();
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
    await s.saveRoutine({
      ...routine,
      name: trimmed,
      items,
      updatedAt: Date.now(),
    });
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
              onClick={async () => {
                const yes = await ask({
                  title: `Delete "${routine.name}"?`,
                  body: "The day is removed from this split. Logged workouts are kept.",
                  confirmLabel: "Delete day",
                  danger: true,
                });
                if (yes) {
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
          <div
            key={`${item.exerciseId}-${i}`}
            className="border-b border-subrule py-3"
          >
            <div className="flex items-center gap-1">
              <p className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">
                {s.exerciseById.get(item.exerciseId)?.name ??
                  "Unknown exercise"}
              </p>
              <button
                onClick={() => move(i, -1)}
                aria-label="Move up"
                className="-my-1.5 grid size-11 place-items-center text-muted active:text-fg"
              >
                ↑
              </button>
              <button
                onClick={() => move(i, 1)}
                aria-label="Move down"
                className="-my-1.5 grid size-11 place-items-center text-muted active:text-fg"
              >
                ↓
              </button>
              <button
                onClick={() => setItems((l) => l.filter((_, j) => j !== i))}
                aria-label="Remove from day"
                className="-my-1.5 grid size-11 place-items-center text-danger active:opacity-70"
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
              {s.exerciseById.get(item.exerciseId)?.tracks === "time" ? (
                <Counter
                  label="Time"
                  value={item.reps}
                  min={5}
                  step={5}
                  format={fmtClock}
                  onChange={(v) => patch(i, { reps: v })}
                />
              ) : (
                <Counter
                  label="Reps"
                  value={item.reps}
                  min={1}
                  onChange={(v) => patch(i, { reps: v })}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => setPicker(true)} className="w-full py-5 text-left">
        <span className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-fg">
          + Add exercise
        </span>
      </button>

      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(ex) => {
          // The per-set target is read according to the exercise, so a held
          // one starts at a plausible hold rather than at eight seconds.
          setItems((l) => [
            ...l,
            {
              exerciseId: ex.id,
              sets: 3,
              reps: ex.tracks === "time" ? 45 : 8,
            },
          ]);
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
  step = 1,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  /** How the number reads, when it is not simply a count. */
  format?: (v: number) => string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          className="-my-1.5 grid size-11 place-items-center text-muted active:text-fg"
        >
          −
        </button>
        <span className="min-w-6 text-center font-mono text-[0.9375rem]">
          {format ? format(value) : value}
        </span>
        <button
          onClick={() => onChange(value + step)}
          className="-my-1.5 grid size-11 place-items-center text-muted active:text-fg"
        >
          +
        </button>
      </div>
    </div>
  );
}
