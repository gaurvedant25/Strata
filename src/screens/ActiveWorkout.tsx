import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useAuth } from "../auth";
import { useConfirm } from "../components/confirm";
import { ExercisePicker } from "../components/ExercisePicker";
import { Check, ChevronRight, Minus, Plus, Share } from "../components/icons";
import { Button, Empty, Eyebrow, Scrim, Sheet } from "../components/ui";
import { useDialog, usePresence } from "../lib/useDialog";
import { streakCard } from "../lib/card/select";
import { useShareCard } from "../lib/card/useShareCard";
import {
  e1rm,
  lastPerformance,
  personalRecords,
  sessionElapsed,
  sessionSetCount,
  sessionVolume,
  streakSummary,
  qualifiesForStreak,
} from "../lib/stats";
import { fmtClock, fmtDuration, num } from "../lib/util";
import { useStore } from "../store";
import type { Session, SetLog } from "../types";

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

/**
 * The set row the dials are pointed at.
 *
 * Lifted off the card rather than tinted or ruled: on a raised surface a wash
 * of light is the quietest way to say "this one", and it leaves the tone of the
 * text alone so the row you are working on is not also the hardest to read.
 */
const ROW_ON = "#242424";

/**
 * Sessions whose finish card has already been waved away.
 *
 * Module-level rather than component state because leaving the logger unmounts
 * this screen. Held in the component, a workout you had already dismissed the
 * card for would produce it again every time you came back to the tab.
 */
const celebrated = new Set<string>();

/**
 * The streak this workout leaves you on, and whether it is the workout that
 * moved it.
 *
 * Scored from the persisted completion time. By the time the card appears the
 * workout is already durable locally, even though it stays open behind the
 * celebration until the athlete chooses Finish or Keep going.
 *
 * `grew` is the difference the session made: the second workout of a day lands
 * on a day already counted, so the run is the same length as it was an hour
 * ago and the card should not claim otherwise.
 */
function streakFor(sessions: Session[], session: Session, now: number) {
  const others = sessions.filter((x) => x.id !== session.id);
  const ended: Session = { ...session, endedAt: session.endedAt ?? now };
  const all = [...others, ended];
  const current = streakSummary(all, now);
  const before = streakSummary(others, now);
  return {
    days: current.current,
    grew: current.current > before.current,
    best: current.best,
    qualified: qualifiesForStreak(ended),
  };
}

/** Which number the pad and the steppers are editing. */
type Field = "weight" | "reps" | "seconds";
type Pad = { entryId: string; setId: string; field: Field; buf: string | null };

/** A dial reads "—" rather than "0": an untouched number is not a logged zero. */
const dial = (v: number) => (v ? num(v) : "—");
/** The same rule for a held set: a clock, or a dash until it has been set. */
const clock = (v: number | undefined) => (v ? fmtClock(v) : "—");
const settled = (x: SetLog) => !!(x.done || x.skipped);
/** How much a press of the time stepper moves, in seconds. */
const HOLD_STEP = 5;

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
  const auth = useAuth();
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
  const [pad, setPad] = useState<Pad | null>(null);
  // The pad's title and value are read out of `pad`, which is cleared the
  // instant it closes. Holding the last one keeps the panel populated while it
  // animates out instead of blanking a frame before it goes.
  const [lastPad, setLastPad] = useState<Pad | null>(null);
  if (pad && pad !== lastPad) setLastPad(pad);
  const shownPad = pad ?? lastPad;

  const unit = s.settings.unit === "lb" ? "lbs" : "kg";
  const step = s.settings.unit === "lb" ? 5 : 2.5;
  const elapsed = sessionElapsed(session, s.now);
  const volume = sessionVolume(session);
  const setsDone = sessionSetCount(session);
  // Every set accounted for, logged or skipped, is the end of the workout.
  const allSets = session.entries.flatMap((e) => e.sets);
  const workoutDone = allSets.length > 0 && allSets.every(settled);
  const [celebrationOff, setCelebrationOff] = useState(() =>
    celebrated.has(session.id),
  );
  function dismissCelebration() {
    celebrated.add(session.id);
    setCelebrationOff(true);
  }
  const pendingCompletion =
    s.pendingCompletionId === session.id && !!session.endedAt;
  const completionAttempted = useRef(false);
  const [completionRetry, setCompletionRetry] = useState(0);
  const [completionSaving, setCompletionSaving] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);

  // Crossing into the all-settled state is the completion event. Persist it
  // before presenting the celebration, so closing the app on that card cannot
  // lose the workout or its streak.
  useEffect(() => {
    if (!workoutDone) {
      completionAttempted.current = false;
      celebrated.delete(session.id);
      if (celebrationOff) setCelebrationOff(false);
      return;
    }
    if (
      session.endedAt ||
      pendingCompletion ||
      celebrationOff ||
      completionAttempted.current
    )
      return;
    completionAttempted.current = true;
    setCompletionSaving(true);
    setCompletionError(null);
    void s
      .markSessionComplete()
      .then((completed) => {
        if (completed) void auth.push();
      })
      .catch(() => {
        completionAttempted.current = false;
        setCompletionError("Couldn't save this workout. Your sets are still here.");
      })
      .finally(() => setCompletionSaving(false));
  }, [
    auth,
    celebrationOff,
    completionRetry,
    pendingCompletion,
    s,
    session.endedAt,
    session.id,
    workoutDone,
  ]);

  // Only worth counting when the persisted celebration is up.
  const streak =
    workoutDone && pendingCompletion && !celebrationOff
      ? streakFor(s.sessions, session, s.now)
      : null;

  /*
   * The picture the share button hands over.
   *
   * Built here rather than inside the card so it is drawn the moment the card
   * appears — seconds before anyone reaches the button — because the share
   * sheet has to open on the tap itself and a PNG takes long enough to encode
   * to lose the gesture. Null while there is no card, and the hook idles.
   */
  const shareData = streak
    ? streakCard(s.sessions, session, s.now, unit)
    : null;
  const shareCard = useShareCard(
    shareData && 'streak',
    shareData,
    'gym-log-streak-' + session.date + '.png',
  );

  const entry =
    session.entries.find((e) => e.id === openId) ??
    session.entries.find((e) => e.sets.some((x) => !settled(x))) ??
    session.entries[0];

  const summary = `${setsDone} sets · ${num(volume, 0)} ${unit} · ${fmtDuration(elapsed)}`;

  /** Writes one dial. Kept explicit so the patch stays a typed `Partial<SetLog>`. */
  const write = (entryId: string, setId: string, field: Field, v: number) =>
    s.updateSet(
      entryId,
      setId,
      field === "reps"
        ? { reps: v }
        : field === "seconds"
          ? { seconds: v }
          : { weight: v },
    );

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
      ok ? (pad.field === "weight" ? v : Math.round(v)) : 0,
    );
  }

  const header = (
    <Header
      onBack={onBack}
      name={session.name}
      onRename={(v) => s.renameSession(v)}
      elapsed={fmtDuration(elapsed)}
      onFinish={() => setConfirmFinish(true)}
    />
  );

  const finishSheet = (
    <FinishSheet
      open={confirmFinish}
      onClose={() => setConfirmFinish(false)}
      line={summary}
      saving={completionSaving}
      error={completionError}
      onSave={() => {
        setCompletionSaving(true);
        setCompletionError(null);
        void s
          .finishSession()
          .then((completed) => {
            if (completed) void auth.push();
            setConfirmFinish(false);
          })
          .catch(() =>
            setCompletionError(
              "Couldn't save this workout. Your sets are still here.",
            ),
          )
          .finally(() => setCompletionSaving(false));
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
  /** Held for a duration rather than counted out — a plank, a treadmill run. */
  const timed = ex?.tracks === "time";
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

  // Which of the other exercises still has work in it decides what the second
  // card calls itself: a queue, or a list of what else is here.
  const upNext = session.entries.some(
    (e) => e.id !== entry.id && e.sets.some((x) => !settled(x)),
  );

  return (
    <div className="flex min-h-full flex-col bg-ink">
      {header}

      {/*
        Two cards on the black ground, in a gutter narrower than the rest of the
        app's. This is the one screen read at arm's length with a bar in your
        hands, so the panel carrying the numbers takes all the width it can and
        the ground is left showing as a seam rather than as a margin.
      */}
      <div className="flex flex-1 flex-col gap-3 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
        <section
          key={entry.id}
          className="animate-exswap rounded-2xl border border-cardrule bg-card px-5 pb-2 pt-[22px]"
        >
          <div className="flex justify-between font-mono text-label font-semibold uppercase tracking-[0.2em] text-muted">
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
          <p className="mt-2 font-mono text-label font-medium uppercase tracking-[0.12em] text-muted">
            {prev
              ? timed
                ? `Last time · ${clock(prev.seconds)}`
                : `Last time · ${dial(prev.weight)} × ${prev.reps}`
              : "First time logging this"}
          </p>

          {cur && (
            <>
              {/*
                The two dials side by side rather than stacked. Weight and reps
                are read as one figure — "forty by six" — and a set is logged by
                adjusting one of them and hitting the button, so they belong on
                one line with the button under both.
              */}
              <div className="mt-5 grid grid-cols-2 items-center gap-2.5">
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
                {timed ? (
                  <Dial
                    label="Time"
                    value={clock(cur.seconds)}
                    dim={settled(cur)}
                    onLess={() =>
                      bump(entry.id, cur.id, "seconds", -HOLD_STEP)
                    }
                    onMore={() => bump(entry.id, cur.id, "seconds", HOLD_STEP)}
                    onEdit={() =>
                      setPad({
                        entryId: entry.id,
                        setId: cur.id,
                        field: "seconds",
                        buf: null,
                      })
                    }
                  />
                ) : (
                  <Dial
                    label="Reps"
                    value={dial(cur.reps)}
                    dim={settled(cur)}
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
                )}
              </div>

              {/*
                Logging the set is the whole point of the screen, so it gets the
                full width and the only filled button on it. Skip and undo sit
                under it as words: they are the exception, and setting them side
                by side made them look like the same kind of choice.
              */}
              <div className="mt-4 flex flex-col items-center gap-3">
                <button
                  onClick={() => {
                    if (!cur.done) logSet();
                  }}
                  className="press h-13 w-full rounded-full bg-fg font-mono text-[0.8125rem] font-semibold uppercase tracking-[0.14em] text-black"
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
                  className="press flex h-11 items-center px-5 font-mono text-label font-semibold uppercase tracking-[0.16em] text-muted active:text-fg"
                >
                  {settled(cur) ? "Undo" : "Skip"}
                </button>
              </div>
            </>
          )}

          {/*
            The record of the exercise, inside the card that is working on it.
            The rule runs the full width of the card, so the list reads as the
            underside of the panel rather than as a separate thing below it.
          */}
          <div className="-mx-5 mt-3.5 border-t border-cardrule px-5 pb-4 pt-2">
            {entry.sets.map((x, i) => {
              const now = i === idx;
              const pr = isPR(x);
              return (
                <button
                  key={x.id}
                  onClick={() => setCursor(x.id)}
                  style={{ background: now ? ROW_ON : undefined }}
                  className="press press-row flex w-full items-center gap-3.5 rounded-[10px] p-3 text-left"
                >
                  {/*
                    The mark carries the state, which is what lets every row
                    keep the same tone: a check for a set that happened, its own
                    number for one that has not.
                  */}
                  <span
                    className="grid size-5 shrink-0 place-items-center rounded-full border font-mono text-label font-medium leading-none"
                    style={{
                      borderColor:
                        x.done || now ? "var(--color-fg)" : "var(--color-rule)",
                      background: x.done ? "var(--color-fg)" : undefined,
                      color: x.done ? "#000" : now ? undefined : DIM,
                    }}
                  >
                    {x.done ? <Check size={11} /> : i + 1}
                  </span>
                  <span
                    className="min-w-0 flex-1 font-mono text-[1rem] font-medium tracking-[-0.01em]"
                    style={{
                      color: x.skipped ? DIMMED : undefined,
                      textDecoration: x.skipped ? "line-through" : undefined,
                    }}
                  >
                    {timed
                      ? x.weight
                        ? `+${dial(x.weight)} ${unit} · ${clock(x.seconds)}`
                        : clock(x.seconds)
                      : `${dial(x.weight)} ${unit} × ${dial(x.reps)}`}
                  </span>
                  {(pr || (now && !x.done)) && (
                    <span className="font-mono text-label font-semibold uppercase tracking-[0.18em] text-fg">
                      {pr ? "PR" : "Now"}
                    </span>
                  )}
                </button>
              );
            })}

            <div className="flex items-center gap-2 pt-1.5">
              <button
                onClick={() => s.addSet(entry.id)}
                className="press flex h-11 items-center gap-1.5 font-mono text-label font-medium text-muted active:text-fg"
              >
                <Plus size={14} />
                Add set
              </button>
              <span className="flex-1" />
              <button
                onClick={() => {
                  const lastSet = entry.sets[entry.sets.length - 1];
                  if (lastSet && entry.sets.length > 1)
                    s.removeSet(entry.id, lastSet.id);
                }}
                disabled={entry.sets.length < 2}
                className="press flex h-11 items-center px-2 font-mono text-label font-medium text-dim active:text-muted disabled:opacity-40"
              >
                Remove last
              </button>
            </div>
          </div>
        </section>

        {/*
          Everything that is not the set in front of you: the rest of the
          workout, a way to add to it, and the note. `mt-auto` holds it against
          the bottom edge when the exercise above it is short.
        */}
        <section className="mt-auto overflow-hidden rounded-2xl border border-cardrule bg-card">
          <div className="px-5 pb-1 pt-4">
            <Eyebrow className="tracking-[0.2em]">
              {upNext ? "Up next" : "Other exercises"}
            </Eyebrow>
          </div>

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
                  className="press press-row flex w-full items-center gap-3.5 px-5 py-3.5 text-left"
                >
                  <span
                    className="min-w-0 flex-1 truncate text-[1rem] font-medium tracking-[-0.015em]"
                    style={{
                      color: complete ? DIM : undefined,
                      textDecoration: complete ? "line-through" : undefined,
                    }}
                  >
                    {s.exerciseById.get(e.exerciseId)?.name ?? "Exercise"}
                  </span>
                  <span className="whitespace-nowrap font-mono text-label font-medium text-muted">
                    {complete
                      ? "Complete"
                      : done
                        ? `${done} of ${e.sets.length} sets`
                        : `${e.sets.length} sets`}
                  </span>
                  {/* A mark, not a word: `faint` is the floor for one of those. */}
                  <ChevronRight size={16} className="shrink-0 text-faint" />
                </button>
              );
            })}

          <button
            onClick={() => setPicker(true)}
            className="press press-row group flex w-full items-center gap-2.5 px-5 pb-5 pt-4 text-left"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full border border-faint text-fg transition-colors group-active:border-fg">
              <Plus size={13} />
            </span>
            <span className="whitespace-nowrap font-mono text-label font-semibold uppercase tracking-[0.16em] text-fg">
              Add exercise
            </span>
          </button>

          <div className="border-t border-cardrule px-5 pb-5 pt-4">
            <Eyebrow className="tracking-[0.18em]">Workout notes</Eyebrow>
            <textarea
              className="mt-2 w-full resize-none bg-transparent text-[0.9375rem] leading-relaxed outline-none placeholder:text-dim"
              rows={2}
              placeholder="How the session felt, what to change next time…"
              value={session.note ?? ""}
              onChange={(e) => s.setSessionNote(e.target.value)}
            />
          </div>
        </section>
      </div>

      {streak && (
        <Celebration
          streak={streak}
          busy={completionSaving}
          error={completionError}
          onShare={shareCard.share}
          canShare={shareCard.ready}
          stats={[
            { label: "Time", value: fmtDuration(elapsed) },
            { label: "Sets", value: String(setsDone) },
            { label: unit, value: num(volume, 0) },
          ]}
          onFinish={() => {
            setCompletionSaving(true);
            setCompletionError(null);
            void s
              .finishSession()
              .then((completed) => {
                if (completed) void auth.push();
              })
              .catch(() =>
                setCompletionError(
                  "Couldn't close this workout. Your progress is still saved.",
                ),
              )
              .finally(() => setCompletionSaving(false));
          }}
          onKeepGoing={() => {
            setCompletionSaving(true);
            setCompletionError(null);
            void s
              .reopenPendingCompletion()
              .then(() => {
                dismissCelebration();
                void auth.push();
              })
              .catch(() =>
                setCompletionError(
                  "Couldn't reopen this workout. Please try again.",
                ),
              )
              .finally(() => setCompletionSaving(false));
          }}
        />
      )}

      {workoutDone && !pendingCompletion && completionSaving && (
        <div
          role="status"
          className="fixed inset-x-5 bottom-[calc(env(safe-area-inset-bottom)+20px)] z-[70] mx-auto max-w-md rounded-[18px] border border-cardrule bg-card px-5 py-4 text-center font-mono text-label font-semibold uppercase tracking-[0.16em] text-muted"
        >
          Saving workout…
        </div>
      )}

      {workoutDone && !pendingCompletion && completionError && !completionSaving && (
        <div
          role="alert"
          className="fixed inset-x-5 bottom-[calc(env(safe-area-inset-bottom)+20px)] z-[70] mx-auto max-w-md rounded-[18px] border border-cardrule bg-card p-5"
        >
          <p className="text-[0.875rem] leading-relaxed text-muted">
            {completionError}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              setCompletionError(null);
              completionAttempted.current = false;
              setCompletionRetry((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </div>
      )}

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

/** The name of the workout, the clock, and the way out of it. */
function Header({
  onBack,
  name,
  onRename,
  elapsed,
  onFinish,
}: {
  onBack: () => void;
  name: string;
  onRename: (v: string) => void;
  elapsed: string;
  onFinish: () => void;
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
    </header>
  );
}

/**
 * One number, sized to be hit without looking, flanked by a step either way.
 * The number itself is the button that opens the pad, so a coarse adjustment
 * and an exact one are the same control.
 *
 * Boxed in the ground colour on a raised card: two of these sit side by side,
 * and without a box of their own the pair read as four loose buttons in a row
 * rather than as two dials. Black rather than a lighter grey because these are
 * wells you set a number into, not more panels stacked on the panel.
 */
function Dial({
  label,
  value,
  dim,
  onLess,
  onMore,
  onEdit,
}: {
  label: string;
  value: string;
  dim: boolean;
  onLess: () => void;
  onMore: () => void;
  onEdit: () => void;
}) {
  const step =
    "press grid size-11 shrink-0 place-items-center text-muted active:text-fg";
  return (
    <div className="flex min-w-0 items-center justify-center gap-0.5 rounded-2xl border border-cardrule bg-ink py-2.5">
      <button onClick={onLess} aria-label={`Less ${label}`} className={step}>
        <Minus size={18} />
      </button>
      <button onClick={onEdit} className="press min-w-0 flex-1 text-center">
        <span
          className="block font-mono text-[2.125rem] font-medium leading-none tracking-[-0.035em]"
          style={{ color: dim ? DIM : undefined }}
        >
          {value}
        </span>
        <span className="mt-1.5 block font-mono text-label font-semibold uppercase tracking-[0.2em] text-muted">
          {label}
        </span>
      </button>
      <button onClick={onMore} aria-label={`More ${label}`} className={step}>
        <Plus size={18} />
      </button>
    </div>
  );
}

/**
 * The card that says the workout is over.
 *
 * It arrives on its own — the last set being accounted for is the event, not a
 * button you pressed — so it has to say what happened and then get out of the
 * way.
 *
 * What it leads with is the streak rather than the session. The three figures
 * underneath are the last hour and they are already true; the number in the
 * ring is the only thing on the card still at stake, and it is the reason to
 * come back on a day you would rather not. The ring around it is that run
 * measured against your best, so eight days reads as most of the way to
 * something rather than as a number on its own.
 *
 * The warm tone is spent here and nowhere else in the app.
 */
function Celebration({
  streak,
  stats,
  onFinish,
  onKeepGoing,
  onShare,
  canShare,
  busy,
  error,
}: {
  streak: { days: number; grew: boolean; best: number; qualified: boolean };
  stats: { label: string; value: string }[];
  onFinish: () => void;
  onKeepGoing: () => void;
  onShare: () => void;
  canShare: boolean;
  busy: boolean;
  error: string | null;
}) {
  // Escape reads as "not yet", which is the reversible half of the choice.
  const panel = useDialog(true, onKeepGoing);

  // The arc. A stroked circle whose dash pattern is its own circumference, so
  // the visible length is a fraction of the whole and the entrance is that
  // fraction being uncovered rather than a shape appearing.
  const R = 84;
  const CIRC = 2 * Math.PI * R;
  const best = Math.max(streak.best, streak.days, 1);
  const progress = Math.min(1, streak.days / best);

  return (
    <div className="animate-fade fixed inset-0 z-[60] mx-auto flex max-w-lg items-center justify-center bg-black/[0.88] p-7">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Workout complete"
        tabIndex={-1}
        className="animate-cb-card relative w-full overflow-hidden rounded-[20px] border border-cardrule bg-card text-center outline-none"
      >
        {/* A slow band of light crossing the card once every eight seconds.
            Ambient rather than arrival motion: it starts long after everything
            has landed, and it is there to keep the card alive while you decide
            rather than to be watched. */}
        <span
          aria-hidden="true"
          className="animate-cb-sheen pointer-events-none absolute -top-[40%] left-0 h-[180%] w-[30%] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent"
        />

        <div
          className="relative px-7 pb-[26px] pt-9"
          style={{
            background:
              "radial-gradient(130% 80% at 50% 0%, rgba(255,150,70,.09), rgba(255,150,70,0) 72%)",
          }}
        >
          <div className="relative mx-auto size-[184px]">
            <svg
              width="184"
              height="184"
              viewBox="0 0 184 184"
              aria-hidden="true"
              className="absolute inset-0 -rotate-90"
            >
              <circle
                cx="92"
                cy="92"
                r={R}
                fill="none"
                stroke="#333333"
                strokeWidth="3"
              />
              <circle
                cx="92"
                cy="92"
                r={R}
                fill="none"
                stroke="var(--color-ember)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                className="animate-cb-arc"
                style={
                  {
                    "--dash-full": CIRC,
                    "--dash-off": CIRC * (1 - progress),
                  } as CSSProperties
                }
              />
            </svg>

            <div
              role="img"
              aria-label={streak.days + " day streak"}
              className="absolute inset-0 flex flex-col items-center justify-center gap-[9px]"
            >
              <span
                aria-hidden="true"
                className="animate-cb-ember absolute size-[104px] rounded-full blur-[30px]"
                style={{
                  background:
                    "radial-gradient(closest-side, var(--color-ember), transparent)",
                }}
              />
              <span
                aria-hidden="true"
                className="relative font-mono text-[68px] font-medium leading-[0.9] tracking-[-0.05em] text-ember"
              >
                {streak.grew ? (
                  <span className="inline-block h-[1em] overflow-hidden align-text-bottom leading-[1em]">
                    <span className="animate-cb-roll block">
                      <span className="block h-[1em]">{streak.days - 1}</span>
                      <span className="block h-[1em]">{streak.days}</span>
                    </span>
                  </span>
                ) : (
                  streak.days
                )}
              </span>
              <span
                aria-hidden="true"
                className="relative whitespace-nowrap font-mono text-[10px] font-semibold uppercase tracking-[0.26em] text-muted"
              >
                Day streak
              </span>
            </div>

            {/* The mark that used to be the whole card, now the size of a full
                stop and hung on the rim of the ring. The workout being over is
                the premise here, not the news. */}
            <span
              aria-hidden="true"
              className="animate-cb-check absolute -bottom-[14px] left-1/2 -ml-[15px] grid size-[30px] place-items-center rounded-full border-4 border-card bg-fg text-black"
            >
              <Check size={14} />
            </span>
          </div>

          <p
            className="animate-cb-stat mt-[34px] text-[1.4375rem] font-semibold tracking-[-0.03em]"
            style={{ animationDelay: "0.9s" }}
          >
            Workout complete
          </p>
          <p
            className="animate-cb-stat mt-[9px] whitespace-nowrap font-mono text-label font-semibold uppercase tracking-[0.16em] text-muted"
            style={{ animationDelay: "0.96s" }}
          >
            {/* A full ring with "best run 8" under it while you are on 8 reads
                as a bug. At the top of your own ladder the line says so. */}
            {!streak.qualified
              ? "Streak unchanged · complete one set to extend it"
              : streak.days >= streak.best
              ? "Your best run yet"
              : "Best run " + streak.best}
          </p>
        </div>

        {/* One-pixel gaps, with the rule showing through as the grid lines. */}
        <div className="grid grid-cols-3 gap-px border-t border-cardrule bg-cardrule">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className="animate-cb-stat bg-card px-2 py-4"
              style={{ animationDelay: `${1.02 + i * 0.05}s` }}
            >
              <div className="font-mono text-[1.375rem] font-medium tracking-[-0.02em]">
                {stat.value}
              </div>
              <div className="mt-1.5 font-mono text-label font-semibold uppercase tracking-[0.18em] text-muted">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2.5 border-t border-cardrule px-7 pb-[26px] pt-[22px]">
          <div className="flex gap-2.5">
            <button
              onClick={onFinish}
              disabled={busy}
              className="press animate-cb-stat h-13 flex-1 rounded-full bg-fg font-mono text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-black disabled:opacity-40"
              style={{ animationDelay: "1.18s" }}
            >
              {busy ? "Saving…" : "Finish"}
            </button>
            {/* Arrives last and on its own, a third of a second after the
                buttons either side of it have settled. Sharing is an
                afterthought by design: the card's job is to close the workout,
                and an offer landing at the same moment as "Finish" competes
                with it. */}
            <button
              onClick={onShare}
              disabled={!canShare || busy}
              aria-label="Share streak"
              className="press animate-cb-stat grid size-13 shrink-0 place-items-center rounded-full border border-[#3a3a3a] text-fg transition-opacity disabled:opacity-40"
              style={{ animationDelay: "1.55s" }}
            >
              <Share size={18} />
            </button>
          </div>
          <button
            onClick={onKeepGoing}
            disabled={busy}
            className="press animate-cb-stat h-11 w-full font-mono text-label font-semibold uppercase tracking-[0.14em] text-muted active:text-fg disabled:opacity-40"
            style={{ animationDelay: "1.24s" }}
          >
            I ain&apos;t done yet
          </button>
          {error && (
            <p role="alert" className="text-left text-[0.75rem] leading-relaxed text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Typing a number exactly. It sits over the screen rather than pushing it up,
 * so the set list stays visible while a figure is corrected.
 *
 * Just the keys. The row of ±step chips that used to sit above them is gone:
 * the dial behind this pad now carries a step either side of the number, one
 * tap away, and the pad is the place you go when stepping is not what you
 * want.
 */
function NumberPad({
  title,
  value,
  onKey,
  onClose,
  open,
}: {
  title: string;
  value: string;
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
        <div className="grid grid-cols-3 px-5 pt-4">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"].map(
            (k) => (
              <button
                key={k}
                onClick={() => onKey(k)}
                aria-label={k === "del" ? "Delete" : k}
                className="press h-[54px] rounded-xl font-mono text-[1.375rem] font-medium active:bg-rule"
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
  saving,
  error,
}: {
  open: boolean;
  onClose: () => void;
  line: string;
  onSave: () => void;
  onDiscard: () => void;
  saving: boolean;
  error: string | null;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Finish workout?"
      footer={
        <div className="space-y-2.5">
          <Button disabled={saving} onClick={onSave}>
            {saving ? "Saving…" : "Save workout"}
          </Button>
          <Button disabled={saving} variant="danger" onClick={onDiscard}>
            Discard workout
          </Button>
        </div>
      }
    >
      <p className="font-mono text-[0.8125rem] text-muted">{line}</p>
      <p className="mt-2.5 text-[0.8125rem] text-muted">
        Sets you never logged are dropped on save.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-[0.8125rem] text-danger">
          {error}
        </p>
      )}
    </Sheet>
  );
}
