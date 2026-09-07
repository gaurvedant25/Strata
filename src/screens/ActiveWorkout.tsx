import { useState } from "react";
import { useConfirm } from "../components/confirm";
import { ExercisePicker } from "../components/ExercisePicker";
import { Button, Empty, Eyebrow, Scrim, Sheet } from "../components/ui";
import { useDialog, usePresence } from "../lib/useDialog";
import {
  e1rm,
  lastPerformance,
  personalRecords,
  sessionSetCount,
  sessionVolume,
} from "../lib/stats";
import { fmtDuration, mmss, num } from "../lib/util";
import { useStore } from "../store";
import type { SetLog } from "../types";

/** How long the rest clock runs after a set is logged. */
const REST_SECONDS = 120;
/**
 * The tone a value settles to once its set is logged: still readable, but no
 * longer the live figure the dials are pointed at.
 */
const DIM = "#a5a5aa";
/**
 * The tone a set drops to once it is settled, or a number the cursor is not on.
 *
 * This used to be #666, which is 3.7:1 on black and under the 4.5:1 that text
 * this size needs — so the set list, which is the record of what you have
 * actually done this session, was the least readable thing on the screen. It
 * is a de-emphasis, not a disappearance.
 */
const DIMMED = "var(--color-dim)";

/** Which number the pad and the steppers are editing. */
type Field = "weight" | "reps";
type Pad = { entryId: string; setId: string; field: Field; buf: string | null };

/** A dial reads "—" rather than "0": an untouched number is not a logged zero. */
const dial = (v: number) => (v ? num(v) : "—");
const pad2 = (n: number) => String(n).padStart(2, "0");
const settled = (x: SetLog) => !!(x.done || x.skipped);

/**
 * The logger, rebuilt around one set at a time.
 *
 * It used to be a spreadsheet: every exercise, every set and every field on
 * screen at once, all of them the same size. Mid-set that is the wrong shape —
 * you are holding a bar and looking for one number. So the workout now has a
 * focus: the exercise you are on gets the top of the screen and two dials big
 * enough to hit without looking, and everything else collapses to a list you
 * tap to switch. The pips under the header are the only thing that still shows
 * the whole session at once.
 */
export function ActiveWorkout({ onBack }: { onBack: () => void }) {
  const s = useStore();
  const session = s.active!;
  const ask = useConfirm();
  const askDiscard = () =>
    ask({
      title: "Discard this workout?",
      body: "Nothing logged in it is saved.",
      confirmLabel: "Discard",
      danger: true,
    });

  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  // Which exercise has the screen. Held by id so it survives the list changing.
  const [openId, setOpenId] = useState<string | null>(
    () => session.entries.find((e) => e.sets.some((x) => !x.done))?.id ?? null,
  );
  // An explicitly tapped set. Null means "whichever one is up next".
  const [cursor, setCursor] = useState<string | null>(null);
  const [restEnds, setRestEnds] = useState<number | null>(null);
  const [pad, setPad] = useState<Pad | null>(null);
  // The pad's title and value are read out of `pad`, which is cleared the
  // instant it closes. Holding the last one keeps the panel populated while it
  // animates out instead of blanking a frame before it goes.
  const [lastPad, setLastPad] = useState<Pad | null>(null);
  if (pad && pad !== lastPad) setLastPad(pad);
  const shownPad = pad ?? lastPad;

  const unit = s.settings.unit === "lb" ? "lbs" : "kg";
  const step = s.settings.unit === "lb" ? 5 : 2.5;
  const elapsed = s.now - session.startedAt;
  const volume = sessionVolume(session);
  const setsDone = sessionSetCount(session);
  const restLeft = restEnds
    ? Math.max(0, Math.round((restEnds - s.now) / 1000))
    : 0;

  const entry =
    session.entries.find((e) => e.id === openId) ??
    session.entries.find((e) => e.sets.some((x) => !settled(x))) ??
    session.entries[0];

  const summary = `${setsDone} sets · ${num(volume, 0)} ${unit} · ${fmtDuration(elapsed)}`;

  /** Writes one dial. Kept explicit so the patch stays a typed `Partial<SetLog>`. */
  const write = (entryId: string, setId: string, field: Field, v: number) =>
    s.updateSet(entryId, setId, field === "reps" ? { reps: v } : { weight: v });

  function bump(entryId: string, setId: string, field: Field, d: number) {
    const st = session.entries
      .find((e) => e.id === entryId)
      ?.sets.find((x) => x.id === setId);
    if (!st) return;
    write(
      entryId,
      setId,
      field,
      Math.max(0, Math.round(((st[field] || 0) + d) * 100) / 100),
    );
    // A stepper press supersedes anything half-typed on the pad.
    setPad((p) => (p ? { ...p, buf: null } : p));
  }

  function press(k: string) {
    if (!pad) return;
    const st = session.entries
      .find((e) => e.id === pad.entryId)
      ?.sets.find((x) => x.id === pad.setId);
    const existing = st ? String(st[pad.field] || "") : "";
    // The pad opens on the number already there; the first keystroke replaces
    // it rather than appending, which is what you want when fixing a prefill.
    const fresh = pad.buf == null;
    const shown = pad.buf ?? existing;
    let next: string;
    if (k === "del") next = shown.slice(0, -1);
    else if (k === ".")
      next = fresh ? "0." : shown.includes(".") ? shown : (shown || "0") + ".";
    else next = fresh ? k : (shown === "0" ? "" : shown) + k;
    setPad({ ...pad, buf: next });
    const v = parseFloat(next);
    const ok = isFinite(v) && v >= 0;
    write(
      pad.entryId,
      pad.setId,
      pad.field,
      ok ? (pad.field === "reps" ? Math.round(v) : v) : 0,
    );
  }

  const header = (
    <Header
      onBack={onBack}
      name={session.name}
      onRename={(v) => s.renameSession(v)}
      elapsed={fmtDuration(elapsed)}
      onFinish={() => setConfirmFinish(true)}
      pips={session.entries.flatMap((e) =>
        e.sets.map((x) =>
          x.done ? "bg-fg" : x.skipped ? "bg-faint" : "bg-rule",
        ),
      )}
    />
  );

  const finishSheet = (
    <FinishSheet
      open={confirmFinish}
      onClose={() => setConfirmFinish(false)}
      line={summary}
      onSave={() => {
        void s.finishSession();
        setConfirmFinish(false);
      }}
      onDiscard={async () => {
        if (await askDiscard()) {
          void s.discardSession();
          setConfirmFinish(false);
        }
      }}
    />
  );

  const exercisePicker = (
    <ExercisePicker
      open={picker}
      onClose={() => setPicker(false)}
      onPick={(x) => {
        s.addEntry(x.id);
        setPicker(false);
      }}
    />
  );

  if (!entry) {
    return (
      <div className="min-h-full bg-ink">
        {header}
        <div className="px-5">
          <Empty
            eyebrow="Empty workout"
            title="The clock is running. Add your first exercise."
            action={
              <div className="flex flex-col gap-3.5">
                <Button onClick={() => setPicker(true)}>Add exercise</Button>
                <Button
                  variant="quiet"
                  onClick={async () => {
                    if (await askDiscard()) void s.discardSession();
                  }}
                >
                  Discard workout
                </Button>
              </div>
            }
          />
        </div>
        {exercisePicker}
        {finishSheet}
      </div>
    );
  }

  const ex = s.exerciseById.get(entry.exerciseId);
  const last = lastPerformance(
    s.sessions,
    entry.exerciseId,
    s.activeSessionId ?? undefined,
  );
  const priorBest =
    personalRecords(s.sessions.filter((x) => x.id !== session.id)).get(
      entry.exerciseId,
    )?.bestE1rm ?? 0;

  const cur =
    entry.sets.find((x) => x.id === cursor) ??
    entry.sets.find((x) => !settled(x)) ??
    entry.sets[entry.sets.length - 1];
  const idx = cur ? entry.sets.indexOf(cur) : -1;
  const prev = idx >= 0 ? last?.sets[idx] : undefined;
  // Added weight, for a movement that is mostly your own bodyweight.
  const weightLabel = ex?.bodyweight ? `+${unit}` : unit;

  function logSet() {
    if (!cur) return;
    s.updateSet(entry.id, cur.id, { done: true, skipped: false });
    setCursor(null);
    setRestEnds(REST_SECONDS > 0 ? Date.now() + REST_SECONDS * 1000 : null);
    // Last one of this exercise: move on rather than leaving a finished block up.
    if (entry.sets.every((x) => x.id === cur.id || settled(x))) {
      const next = session.entries.find(
        (e) => e.id !== entry.id && e.sets.some((x) => !settled(x)),
      );
      if (next) setOpenId(next.id);
    }
  }

  /** A logged set that beats every session before this one. */
  const isPR = (x: SetLog) =>
    x.done && x.reps > 0 && priorBest > 0 && e1rm(x.weight, x.reps) > priorBest;

  return (
    <div className="flex min-h-full flex-col bg-ink">
      {header}

      <section
        key={entry.id}
        className="animate-fade border-t border-rule px-5 pb-5 pt-6"
      >
        <div className="flex justify-between font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-muted">
          <span>
            Exercise {session.entries.indexOf(entry) + 1} of{" "}
            {session.entries.length}
          </span>
          <span className="flex items-center gap-3">
            {idx >= 0 && `Set ${idx + 1} of ${entry.sets.length}`}
            <button
              onClick={() => setMenu(entry.id)}
              aria-label={`Options for ${ex?.name ?? "exercise"}`}
              /* Hit area padded to 44px and pulled back out with negative
                 margins, so the target grows without the header row moving. */
              className="-my-3 -mr-3 grid size-11 place-items-center text-[0.75rem] leading-none tracking-normal text-dim active:text-fg"
            >
              ⋯
            </button>
          </span>
        </div>

        <p className="mt-3 text-pretty text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.03em]">
          {ex?.name ?? "Exercise"}
        </p>
        <p className="mt-2 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted">
          {prev
            ? `Last time · ${dial(prev.weight)} × ${prev.reps}`
            : "First time logging this"}
        </p>

        {cur && (
          <>
            <div className="mt-[26px]">
              <Dial
                label={weightLabel}
                value={dial(cur.weight)}
                dim={settled(cur)}
                onLess={() => bump(entry.id, cur.id, "weight", -step)}
                onMore={() => bump(entry.id, cur.id, "weight", step)}
                onEdit={() =>
                  setPad({
                    entryId: entry.id,
                    setId: cur.id,
                    field: "weight",
                    buf: null,
                  })
                }
              />
              <Dial
                label="Reps"
                value={dial(cur.reps)}
                dim={settled(cur)}
                bottomRule
                onLess={() => bump(entry.id, cur.id, "reps", -1)}
                onMore={() => bump(entry.id, cur.id, "reps", 1)}
                onEdit={() =>
                  setPad({
                    entryId: entry.id,
                    setId: cur.id,
                    field: "reps",
                    buf: null,
                  })
                }
              />
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => {
                  if (!cur.done) logSet();
                }}
                className="press h-14 flex-1 rounded-full bg-fg font-mono text-[0.8125rem] font-semibold uppercase tracking-[0.14em] text-black"
              >
                {cur.done ? "Logged" : "Log set"}
              </button>
              <button
                onClick={() =>
                  settled(cur)
                    ? s.updateSet(entry.id, cur.id, {
                        done: false,
                        skipped: false,
                      })
                    : s.updateSet(entry.id, cur.id, { skipped: true })
                }
                className="press h-14 w-26 rounded-full border border-faint font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted active:text-fg"
              >
                {settled(cur) ? "Undo" : "Skip"}
              </button>
            </div>
          </>
        )}

        {restLeft > 0 && (
          <div className="animate-fade mt-4 flex items-center justify-between rounded-full border border-faint px-[18px] py-[11px] font-mono">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-muted">
              Rest
            </span>
            <span className="text-[0.9375rem] font-medium tracking-[-0.02em]">
              {mmss(restLeft)}
            </span>
            <button
              onClick={() => setRestEnds(null)}
              className="-my-3 -mr-2 flex h-11 items-center px-2 text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-muted active:text-fg"
            >
              Skip
            </button>
          </div>
        )}
      </section>

      <div className="px-5 pt-1">
        {entry.sets.map((x, i) => (
          <button
            key={x.id}
            onClick={() => setCursor(x.id)}
            className="press press-row flex w-full items-center gap-3.5 border-b border-subrule py-3 text-left"
          >
            <span
              className="w-5 font-mono text-[0.6875rem] font-medium"
              style={{ color: i === idx ? undefined : DIMMED }}
            >
              {i + 1}
            </span>
            <span
              className="flex-1 font-mono text-[0.9375rem] font-medium"
              style={{
                color: x.skipped
                  ? DIMMED
                  : x.done || i !== idx
                    ? DIM
                    : undefined,
                textDecoration: settled(x) ? "line-through" : undefined,
              }}
            >
              {dial(x.weight)} × {dial(x.reps)}
            </span>
            <span
              className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.18em]"
              style={{ color: settled(x) && !isPR(x) ? DIMMED : undefined }}
            >
              {x.skipped
                ? "Skipped"
                : x.done
                  ? isPR(x)
                    ? "PR"
                    : "Done"
                  : i === idx
                    ? "Now"
                    : ""}
            </span>
          </button>
        ))}

        <div className="flex items-center gap-5 pb-1 pt-4">
          <button
            onClick={() => s.addSet(entry.id)}
            className="-mx-2 flex h-11 items-center px-2 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-fg underline decoration-[1.5px] underline-offset-[5px]"
          >
            + Set
          </button>
          <button
            onClick={() => {
              const lastSet = entry.sets[entry.sets.length - 1];
              if (lastSet && entry.sets.length > 1)
                s.removeSet(entry.id, lastSet.id);
            }}
            disabled={entry.sets.length < 2}
            className="-mx-2 flex h-11 items-center px-2 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-muted disabled:opacity-40"
          >
            − Set
          </button>
        </div>
      </div>

      <div className="mt-auto pt-5">
        {session.entries
          .filter((e) => e.id !== entry.id)
          .map((e) => {
            const done = e.sets.filter((x) => x.done).length;
            const complete = e.sets.every((x) => settled(x));
            return (
              <button
                key={e.id}
                onClick={() => {
                  setOpenId(e.id);
                  setCursor(null);
                }}
                className="press press-row flex w-full items-center gap-3.5 border-t border-rule px-5 py-[17px] text-left"
              >
                <span className="w-5 font-mono text-[0.6875rem] text-dim">
                  {pad2(session.entries.indexOf(e) + 1)}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-[1rem] font-medium tracking-[-0.015em]"
                  style={{
                    color: complete ? DIMMED : undefined,
                    textDecoration: complete ? "line-through" : undefined,
                  }}
                >
                  {s.exerciseById.get(e.exerciseId)?.name ?? "Exercise"}
                </span>
                <span className="flex items-center gap-[5px]">
                  {e.sets.map((x) => (
                    <span
                      key={x.id}
                      className={`size-1.5 rounded-full border ${
                        x.done ? "border-fg bg-fg" : "border-faint"
                      }`}
                    />
                  ))}
                </span>
                <span className="min-w-10 text-right font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
                  {complete ? "Done" : `${done}/${e.sets.length}`}
                </span>
              </button>
            );
          })}

        <button
          onClick={() => setPicker(true)}
          className="group flex w-full items-center gap-3 border-t border-rule p-5 text-left"
        >
          <span className="grid size-7 place-items-center rounded-full border border-muted font-mono text-[0.9375rem] leading-none text-fg transition-colors group-active:border-fg">
            +
          </span>
          <span className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-fg">
            Add exercise
          </span>
        </button>

        <div className="border-t border-rule px-5 pb-8 pt-5">
          <Eyebrow className="tracking-[0.18em]">Workout notes</Eyebrow>
          <textarea
            className="mt-2 w-full resize-none bg-transparent text-[0.9375rem] leading-relaxed outline-none placeholder:text-dim"
            rows={2}
            placeholder="How the session felt, what to change next time…"
            value={session.note ?? ""}
            onChange={(e) => s.setSessionNote(e.target.value)}
          />
        </div>
      </div>

      {shownPad && (
        <NumberPad
          open={!!pad}
          title={
            shownPad.field === "weight" ? `Weight · ${weightLabel}` : "Reps"
          }
          value={
            (shownPad.buf ??
              String(
                session.entries
                  .find((e) => e.id === shownPad.entryId)
                  ?.sets.find((x) => x.id === shownPad.setId)?.[
                  shownPad.field
                ] || "",
              )) ||
            "—"
          }
          steps={
            shownPad.field === "weight"
              ? [-step * 2, -step, step, step * 2]
              : [-2, -1, 1, 2]
          }
          onStep={(d) =>
            bump(shownPad.entryId, shownPad.setId, shownPad.field, d)
          }
          onKey={press}
          onClose={() => setPad(null)}
        />
      )}

      {exercisePicker}

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
              if (menu) {
                s.removeEntry(menu);
                // The focused exercise just left; fall back to whatever is next.
                if (menu === openId) setOpenId(null);
                setCursor(null);
              }
              setMenu(null);
            }}
          >
            Remove from workout
          </Button>
        </div>
      </Sheet>

      {finishSheet}
    </div>
  );
}

/**
 * The name of the workout, the clock, and one pip per set in the whole session.
 * The pips are the only place the session is still visible end to end.
 */
function Header({
  onBack,
  name,
  onRename,
  elapsed,
  onFinish,
  pips,
}: {
  onBack: () => void;
  name: string;
  onRename: (v: string) => void;
  elapsed: string;
  onFinish: () => void;
  pips: string[];
}) {
  return (
    <header className="sticky top-0 z-20 bg-ink/95 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-xl">
      <div className="flex items-center gap-3.5 px-5 pb-3">
        <button
          onClick={onBack}
          aria-label="Back"
          className="-my-3 -ml-3 grid size-11 shrink-0 place-items-center text-muted active:text-fg"
        >
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
          value={name}
          onChange={(e) => onRename(e.target.value)}
          className="min-w-0 flex-1 truncate bg-transparent text-[1.1875rem] font-medium tracking-[-0.01em] outline-none"
        />
        <span className="shrink-0 font-mono text-[0.6875rem] text-muted">
          {elapsed}
        </span>
        <button
          onClick={onFinish}
          className="-my-3 -mr-2 flex h-11 shrink-0 items-center px-2 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-fg underline decoration-[1.5px] underline-offset-[5px]"
        >
          Finish
        </button>
      </div>
      <div className="flex gap-1 px-5 pb-3.5">
        {pips.map((bg, i) => (
          <span key={i} className={`h-[3px] flex-1 transition-colors ${bg}`} />
        ))}
      </div>
    </header>
  );
}

/**
 * One number, sized to be hit without looking, flanked by a step either way.
 * The number itself is the button that opens the pad, so a coarse adjustment
 * and an exact one are the same control.
 */
function Dial({
  label,
  value,
  dim,
  bottomRule,
  onLess,
  onMore,
  onEdit,
}: {
  label: string;
  value: string;
  dim: boolean;
  bottomRule?: boolean;
  onLess: () => void;
  onMore: () => void;
  onEdit: () => void;
}) {
  const round =
    "press size-[46px] shrink-0 rounded-full border border-faint font-mono text-[1.25rem] leading-none active:border-muted";
  return (
    <div
      className={`flex items-center gap-3.5 border-t border-rule py-4 ${bottomRule ? "border-b" : ""}`}
    >
      <button onClick={onLess} aria-label={`Less ${label}`} className={round}>
        −
      </button>
      <button onClick={onEdit} className="min-w-0 flex-1 text-center">
        <span
          className="block font-mono text-[3rem] font-medium leading-none tracking-[-0.04em]"
          style={{ color: dim ? DIM : undefined }}
        >
          {value}
        </span>
        <span className="mt-2 block font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-muted">
          {label}
        </span>
      </button>
      <button onClick={onMore} aria-label={`More ${label}`} className={round}>
        +
      </button>
    </div>
  );
}

/**
 * Typing a number exactly. It sits over the screen rather than pushing it up,
 * so the set list stays visible while a figure is corrected.
 */
function NumberPad({
  title,
  value,
  steps,
  onStep,
  onKey,
  onClose,
  open,
}: {
  title: string;
  value: string;
  steps: number[];
  onStep: (d: number) => void;
  onKey: (k: string) => void;
  onClose: () => void;
  open: boolean;
}) {
  const panel = useDialog(open, onClose);
  const { present, closing } = usePresence(open);
  if (!present) return null;
  return (
    <div className="fixed inset-0 z-50 mx-auto max-w-lg">
      <Scrim
        onClose={onClose}
        closing={closing}
        className="bg-black/[0.78] backdrop-blur-none"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-closing={closing || undefined}
        className="animate-rise leave-panel absolute inset-x-0 bottom-0 border-t border-rule bg-ink outline-none"
      >
        <div className="flex items-baseline justify-between border-b border-rule px-5 py-3.5">
          <span className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-muted">
            {title}
          </span>
          <span className="font-mono text-[1.75rem] font-medium tracking-[-0.03em]">
            {value}
          </span>
        </div>
        <div className="flex gap-2.5 px-5 pb-0.5 pt-3.5">
          {steps.map((d) => (
            <button
              key={d}
              onClick={() => onStep(d)}
              className="press h-11 flex-1 rounded-full border border-faint font-mono text-[0.75rem] font-medium active:border-muted"
            >
              {d > 0 ? `+${num(d)}` : num(d)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 px-5 pt-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"].map(
            (k) => (
              <button
                key={k}
                onClick={() => onKey(k)}
                aria-label={k === "del" ? "Delete" : k}
                className="press h-[54px] font-mono text-[1.375rem] font-medium active:text-muted"
              >
                {k === "del" ? "⌫" : k}
              </button>
            ),
          )}
        </div>
        <div className="px-5 pb-[calc(env(safe-area-inset-bottom)+26px)] pt-2.5">
          <button
            onClick={onClose}
            className="press h-13 w-full rounded-full bg-fg font-mono text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-black"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function FinishSheet({
  open,
  onClose,
  line,
  onSave,
  onDiscard,
}: {
  open: boolean;
  onClose: () => void;
  line: string;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Finish workout?"
      footer={
        <div className="space-y-2.5">
          <Button onClick={onSave}>Save workout</Button>
          <Button variant="danger" onClick={onDiscard}>
            Discard workout
          </Button>
        </div>
      }
    >
      <p className="font-mono text-[0.8125rem] text-muted">{line}</p>
      <p className="mt-2.5 text-[0.8125rem] text-muted">
        Sets you never logged are dropped on save.
      </p>
    </Sheet>
  );
}
