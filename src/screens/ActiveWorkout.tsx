import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useAuth } from "../auth";
import { useConfirm } from "../components/confirm";
import { AddExerciseSheet } from "../components/AddExerciseSheet";
import { Elapsed } from "../components/Elapsed";
import { Check, Plus, Share, Swap, Trash } from "../components/icons";
import { SwipeRow } from "../components/SwipeRow";
import { Button, Empty, Scrim, Sheet } from "../components/ui";
import { useDialog, usePresence } from "../lib/useDialog";
import { workoutCard } from "../lib/card/select";
import type { WorkoutData } from "../lib/card/types";
import { WorkoutSharePreview } from "../components/WorkoutSharePreview";
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
import { fmtClock, fmtDuration, num, uid } from "../lib/util";
import { useNow } from "../lib/useNow";
import { useStore } from "../store";
import type { GateSubject } from "../lib/entitlement";
import type { Exercise, Session, SetLog } from "../types";

/**
 * The tone a value settles to once its set is logged: still readable, but no
 * longer the live figure the dials are pointed at.
 */
const DIM = "#a5a5aa";
/**
 * The set row the dock is pointed at.
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

/** Which number the pad and the dock are editing. */
type Field = "weight" | "reps" | "seconds";
type Pad = { entryId: string; setId: string; field: Field; buf: string | null };
/** The set the dock is pointed at. */
type Focus = { entryId: string; setId: string };
type SheetState = { kind: "add" } | { kind: "replace"; entryId: string };
type Toast = { text: string; undo: () => void };

/** How long an Undo stays on offer. */
const TOAST_MS = 4000;
/** Set once the swipe has been used, which is when its explanation can go. */
const HINT_KEY = "strata.swipeHintSeen";
function hintSeen() {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}
function markHintSeen() {
  try {
    localStorage.setItem(HINT_KEY, "1");
  } catch {
    /* The hint just shows again next time. */
  }
}

/** A set is either an empty-handed plan or a settled fact. */
const settled = (x: SetLog) => !!(x.done || x.skipped);
/** How much a press of the time stepper moves, in seconds. */
const HOLD_STEP = 5;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * The step a weight chip moves by, in kilograms.
 *
 * Scaled to the load rather than fixed, because the plates are: a bar moves in
 * 2.5s, dumbbells in 2s, and the light end of a rack in ones. A pound bar moves
 * in fives throughout.
 */
function weightStep(unit: "kg" | "lb", w: number) {
  if (unit === "lb") return 5;
  return w >= 40 ? 2.5 : w >= 10 ? 2 : 1;
}

/**
 * The logger: the whole session as one sheet, with a dock for the set in hand.
 *
 * Every exercise is a card with its sets as a table — Prev, weight, reps, and a
 * check — and one card is open at a time. The number being changed is not
 * edited in the table: the table points at it, and the dock at the foot of the
 * screen carries it large, with steps either side and the button that logs it.
 * That keeps the whole workout in view while leaving the one thing you touch
 * mid-set big enough to hit without looking.
 *
 * A card's header can be swiped: left takes the exercise out, right asks what
 * to put in its place. Both are undoable for a few seconds, and both are also in
 * the card's ⋯ menu, since a swipe is an enhancement and never the only route.
 */
export function ActiveWorkout({
  onBack,
  onUnlock,
}: {
  onBack: () => void;
  /** Opened only from a tap on a Pro template, never by the app itself. */
  onUnlock: (f: GateSubject) => void;
}) {
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

  const [sheet, setSheet] = useState<SheetState | null>(null);
  // Kept while the sheet closes, so its title does not blank a frame before it
  // goes.
  const [lastSheet, setLastSheet] = useState<SheetState | null>(null);
  if (sheet && sheet !== lastSheet) setLastSheet(sheet);
  const shownSheet = sheet ?? lastSheet;
  const [workoutShare, setWorkoutShare] = useState<WorkoutData | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  // Which card is open. Held by id so it survives the list changing; "" means
  // every card has been folded, and an id that is gone falls back to the next
  // exercise with work left in it.
  const [openId, setOpenId] = useState<string>(
    () => session.entries.find((e) => e.sets.some((x) => !settled(x)))?.id ?? "",
  );
  // After an add, the first new card opens — but its id is minted by the store,
  // so it is found by position on the render after.
  const [openAt, setOpenAt] = useState<number | null>(null);
  if (openAt != null && session.entries[openAt]) {
    setOpenId(session.entries[openAt].id);
    setOpenAt(null);
  }
  // An explicitly tapped set. Null means "whichever one is up next".
  const [focus, setFocus] = useState<Focus | null>(null);
  const [field, setField] = useState<"value" | "reps">("value");
  const [pad, setPad] = useState<Pad | null>(null);
  const [lastPad, setLastPad] = useState<Pad | null>(null);
  if (pad && pad !== lastPad) setLastPad(pad);
  const shownPad = pad ?? lastPad;
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const [hint, setHint] = useState(() => !hintSeen());
  /** The swipe has been used, so the line explaining it can go. */
  function retireHint() {
    if (!hint) return;
    markHintSeen();
    setHint(false);
  }

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const unitKey = s.settings.unit === "lb" ? "lb" : "kg";
  const unit = unitKey === "lb" ? "lbs" : "kg";
  // The header's clock ticks on its own (see Elapsed). The rest of this screen
  // needs the time only for the finish sheet's summary, kept live while the
  // sheet is open, and for the streak, which moves by the day.
  const now = useNow(confirmFinish ? 1000 : 60_000);
  const elapsed = sessionElapsed(session, now);
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

  // Only worth counting when the persisted celebration is up. The pending id
  // is the whole condition rather than "every set is settled": a workout you
  // end early from the header is finished too, and it earns the same answer
  // about where it left your streak.
  const streak =
    pendingCompletion && !celebrationOff
      ? streakFor(s.sessions, session, now)
      : null;

  // The best estimated 1RM each lift had before today, for counting PRs.
  const priorBest = useMemo(
    () => personalRecords(s.sessions.filter((x) => x.id !== session.id)),
    [s.sessions, session.id],
  );
  const isPR = (exerciseId: string, x: SetLog) => {
    const best = priorBest.get(exerciseId)?.bestE1rm ?? 0;
    return x.done && x.reps > 0 && best > 0 && e1rm(x.weight, x.reps) > best;
  };
  const prCount = session.entries.reduce(
    (t, e) => t + e.sets.filter((x) => isPR(e.exerciseId, x)).length,
    0,
  );

  function showToast(text: string, undo: () => void) {
    window.clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }

  const nameOf = (exerciseId: string) =>
    s.exerciseById.get(exerciseId)?.name ?? "Exercise";

  // The card that is open, and the set the dock is pointed at.
  const openEntry = openId
    ? session.entries.find((e) => e.id === openId) ??
      session.entries.find((e) => e.sets.some((x) => !settled(x)))
    : undefined;
  let f: Focus | null = null;
  if (openEntry) {
    const tapped =
      focus?.entryId === openEntry.id &&
      openEntry.sets.some((x) => x.id === focus.setId)
        ? focus
        : null;
    const next = openEntry.sets.find((x) => !settled(x));
    f = tapped ?? (next ? { entryId: openEntry.id, setId: next.id } : null);
  }
  if (!f) {
    const e = session.entries.find((x) => x.sets.some((y) => !settled(y)));
    const x = e?.sets.find((y) => !settled(y));
    if (e && x) f = { entryId: e.id, setId: x.id };
  }
  const fEntry = f ? session.entries.find((e) => e.id === f.entryId) : undefined;
  const fSet = fEntry?.sets.find((x) => x.id === f?.setId);
  const fEx = fEntry ? s.exerciseById.get(fEntry.exerciseId) : undefined;
  const fTimed = fEx?.tracks === "time";
  /** The second number the dock can hold for this lift: reps, or a hold. */
  const second: Field = fTimed ? "seconds" : "reps";
  const dockField: Field = field === "value" ? "weight" : second;

  /** Writes one number. Kept explicit so the patch stays a typed `Partial<SetLog>`. */
  const write = (entryId: string, setId: string, which: Field, v: number) =>
    s.updateSet(
      entryId,
      setId,
      which === "reps"
        ? { reps: v }
        : which === "seconds"
          ? { seconds: v }
          : { weight: v },
    );

  function bump(which: Field, d: number) {
    if (!f || !fSet) return;
    write(
      f.entryId,
      f.setId,
      which,
      Math.max(0, Math.round(((fSet[which] || 0) + d) * 100) / 100),
    );
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

  /** Logs the set the dock is on and moves the dock to the next one. */
  function logFocused() {
    if (!f || !fEntry || !fSet || fSet.done) return;
    s.updateSet(f.entryId, f.setId, { done: true, skipped: false });
    const i = fEntry.sets.indexOf(fSet);
    const nx = fEntry.sets.find((y, k) => k > i && !settled(y));
    if (nx) {
      setOpenId(fEntry.id);
      setFocus({ entryId: fEntry.id, setId: nx.id });
    } else {
      // That was the last of this exercise: open the next one with work left.
      const ne = session.entries.find(
        (e) => e.id !== fEntry.id && e.sets.some((y) => !settled(y)),
      );
      setOpenId(ne ? ne.id : fEntry.id);
      setFocus(null);
    }
  }

  /** Takes an exercise out, with Undo. The caller has already asked, if it should. */
  function remove(entryId: string) {
    const snap = session.entries;
    const name = nameOf(snap.find((e) => e.id === entryId)?.exerciseId ?? "");
    s.removeEntry(entryId);
    if (entryId === openId) setOpenId(session.entries.find((e) => e.id !== entryId && e.sets.some((x) => !settled(x)))?.id ?? "");
    setFocus(null);
    showToast(`${name} removed`, () => {
      s.restoreEntries(snap);
      setToast(null);
    });
  }

  /** Logged sets are the one thing here nothing can give back, so they ask. */
  function askRemove(entryId: string) {
    const e = session.entries.find((x) => x.id === entryId);
    const d = e?.sets.filter((x) => x.done).length ?? 0;
    if (!e || !d) return Promise.resolve(true);
    return ask({
      title: `Remove ${nameOf(e.exerciseId)}?`,
      body: `${d} logged ${plural(d, "set goes", "sets go")} with it, and cannot be recovered.`,
      confirmLabel: "Remove",
      cancelLabel: "Keep it",
      danger: true,
    });
  }

  async function replace(entryId: string, x: Exercise) {
    const e = session.entries.find((y) => y.id === entryId);
    if (!e) return;
    const old = nameOf(e.exerciseId);
    const d = e.sets.filter((y) => y.done).length;
    if (
      d &&
      !(await ask({
        title: `Replace ${old}?`,
        body: `${d} logged ${plural(d, "set goes", "sets go")} with it. ${x.name} starts fresh from your last session.`,
        confirmLabel: "Replace",
        cancelLabel: "Keep it",
        danger: true,
      }))
    )
      return;
    const snap = session.entries;
    s.replaceEntry(entryId, x.id);
    setSheet(null);
    setOpenId(entryId);
    setFocus(null);
    showToast(`${old} → ${x.name}`, () => {
      s.restoreEntries(snap);
      setToast(null);
    });
  }

  function add(ids: string[]) {
    if (!ids.length) return;
    const snap = session.entries;
    s.addEntries(ids);
    setSheet(null);
    setOpenAt(snap.length);
    setFocus(null);
    showToast(`${ids.length} added to ${session.name}`, () => {
      s.restoreEntries(snap);
      setToast(null);
    });
  }

  /** Nothing matched, so the search becomes a new exercise of your own. */
  async function create(raw: string) {
    const name = raw.replace(/^./, (c) => c.toUpperCase());
    const ex: Exercise = { id: uid(), name, muscle: "Other", createdAt: Date.now() };
    await s.saveExercise(ex);
    if (shownSheet?.kind === "replace") await replace(shownSheet.entryId, ex);
    else add([ex.id]);
  }

  const header = (
    <Header
      onBack={onBack}
      name={session.name}
      onRename={(v) => s.renameSession(v)}
      session={session}
      onFinish={() => setConfirmFinish(true)}
    />
  );

  const summary = `${setsDone} sets · ${num(volume, 0)} ${unit} · ${fmtDuration(elapsed)}`;
  const finishSheet = (
    <FinishSheet
      open={confirmFinish}
      onClose={() => setConfirmFinish(false)}
      line={summary}
      saving={completionSaving}
      error={completionError}
      // Ending early records the completion and hands over to the same card
      // the last set of a full workout raises. Saving used to close the logger
      // outright, which left the one thing you finish for — the streak — with
      // nowhere to be read: you were returned to the routine list as though
      // nothing had happened. The card closes the workout from here.
      onSave={() => {
        setCompletionSaving(true);
        setCompletionError(null);
        void s
          .markSessionComplete()
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

  const replacingEntry =
    shownSheet?.kind === "replace"
      ? session.entries.find((e) => e.id === shownSheet.entryId)
      : undefined;
  const replacingEx = replacingEntry
    ? s.exerciseById.get(replacingEntry.exerciseId)
    : undefined;
  const addSheet = (
    <AddExerciseSheet
      open={!!sheet}
      mode={replacingEx ? { kind: "replace", exercise: replacingEx } : { kind: "add" }}
      inSession={new Set(session.entries.map((e) => e.exerciseId))}
      onClose={() => setSheet(null)}
      onAdd={add}
      onReplace={(x) => {
        if (shownSheet?.kind === "replace") void replace(shownSheet.entryId, x);
      }}
      onCreate={(name) => void create(name)}
    />
  );

  if (!session.entries.length) {
    return (
      <div className="min-h-full bg-ink">
        {header}
        <div className="px-5">
          <Empty
            eyebrow="Empty workout"
            title="The clock is running. Add your first exercise."
            action={
              <div className="flex flex-col gap-3.5">
                <Button onClick={() => setSheet({ kind: "add" })}>Add exercise</Button>
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
        {toast && <UndoToast toast={toast} />}
        {addSheet}
        {finishSheet}
      </div>
    );
  }

  const menuEntry = menu ? session.entries.find((e) => e.id === menu) : undefined;
  const bwLabel = (exerciseId: string) =>
    s.exerciseById.get(exerciseId)?.bodyweight ? `+${unit}` : unit;
  const step =
    dockField === "weight"
      ? weightStep(unitKey, fSet?.weight ?? 0)
      : dockField === "seconds"
        ? HOLD_STEP
        : 1;
  // One back, one on, two on: the usual correction is a step, and the usual
  // progression is one or two.
  const dockSteps = [-step, step, step * 2];
  const dockLabel = fEntry
    ? `${dockField === "weight" ? bwLabel(fEntry.exerciseId) : dockField === "seconds" ? "time" : "reps"} · set ${fEntry.sets.findIndex((x) => x.id === f?.setId) + 1}`
    : "";
  const dockValue = fSet
    ? dockField === "weight"
      ? num(fSet.weight)
      : dockField === "seconds"
        ? fmtClock(fSet.seconds ?? 0)
        : String(fSet.reps)
    : "";
  const openPad = (entryId: string, setId: string, which: Field) =>
    setPad({ entryId, setId, field: which, buf: null });

  return (
    <div className="flex min-h-full flex-col bg-ink">
      <div className="sticky top-0 z-20 bg-ink/95 backdrop-blur-xl">
        {header}
        {/* The session in three figures. */}
        <div className="grid grid-cols-3 border-y border-rule">
          {[
            { v: `${setsDone}/${allSets.length}`, l: "Sets", pad: "px-5" },
            { v: num(volume, 0), l: `${unit} moved`, pad: "px-3.5" },
            { v: String(prCount), l: prCount === 1 ? "PR" : "PRs", pad: "px-3.5" },
          ].map((c, i) => (
            <div
              key={c.l}
              className={`flex flex-col gap-1 py-2.5 ${c.pad} ${i < 2 ? "border-r border-rule" : ""}`}
            >
              <span className="whitespace-nowrap font-mono text-[0.9375rem] font-medium">
                {c.v}
              </span>
              <span className="whitespace-nowrap font-mono text-label font-semibold uppercase tracking-[0.18em] text-muted">
                {c.l}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-3 pb-4 pt-3">
        {session.entries.map((e, i) => {
          const ex = s.exerciseById.get(e.exerciseId);
          const name = ex?.name ?? "Exercise";
          const timed = ex?.tracks === "time";
          const d = e.sets.filter((x) => x.done).length;
          const all = e.sets.length > 0 && e.sets.every(settled);
          const exp = e.id === openEntry?.id;
          const prev = lastPerformance(s.sessions, e.exerciseId, session.id);
          // The header says one thing beside the name: that this exercise
          // has beaten your best today. Progress is already in the table and
          // in the mark on the left.
          const pr = e.sets.some((x) => isPR(e.exerciseId, x));
          return (
            <SwipeRow
              key={e.id}
              grip
              top
              className="shrink-0 rounded-2xl"
              surface=""
              onRemove={() => {
                retireHint();
                remove(e.id);
              }}
              confirm={d ? () => askRemove(e.id) : undefined}
              onReplace={() => {
                retireHint();
                setSheet({ kind: "replace", entryId: e.id });
              }}
            >
              <section
                className="rounded-2xl border bg-card"
                style={{ borderColor: exp ? "#3a3a3a" : "var(--color-cardrule)" }}
              >
                <div data-swipe-grip className="flex select-none items-center">
                  <button
                    onClick={() => {
                      setOpenId(exp ? "" : e.id);
                      setFocus(null);
                    }}
                    aria-expanded={exp}
                    className="press flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-4 pr-1 text-left"
                  >
                    <span
                      className="grid size-5 shrink-0 place-items-center rounded-full border font-mono text-label font-medium leading-none"
                      style={{
                        borderColor: all || exp ? "var(--color-fg)" : "var(--color-cardrule)",
                        background: all ? "var(--color-fg)" : "transparent",
                        color: all ? "#000" : exp ? "var(--color-fg)" : DIM,
                      }}
                    >
                      {all ? <Check size={11} /> : i + 1}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-[1rem] font-medium tracking-[-0.015em]"
                      style={{ color: all && !exp ? DIM : undefined }}
                    >
                      {name}
                    </span>
                    {pr && (
                      <span className="whitespace-nowrap rounded-full border border-faint px-1.5 py-0.5 font-mono text-[0.5625rem] font-semibold tracking-[0.14em] text-fg">
                        PR
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setMenu(e.id)}
                    aria-label={`Options for ${name}`}
                    className="grid h-12 w-11 shrink-0 place-items-center text-[0.8125rem] text-dim active:text-fg"
                  >
                    ⋯
                  </button>
                </div>

                {exp && (
                  <div className="px-2 pb-2">
                    <div className="grid grid-cols-[32px_1fr_64px_52px_44px] items-center gap-1.5 whitespace-nowrap px-2 pb-1.5 pt-1 font-mono text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-dim">
                      <span>Set</span>
                      <span>Prev</span>
                      <span className="text-center">{bwLabel(e.exerciseId)}</span>
                      <span className="text-center">{timed ? "Time" : "Reps"}</span>
                      <span />
                    </div>
                    {e.sets.map((x, j) => {
                      const on = f?.entryId === e.id && f.setId === x.id;
                      const p = prev?.sets[j];
                      const tone = settled(x) ? DIM : "var(--color-fg)";
                      const strike = x.skipped ? "line-through" : undefined;
                      const cell = (which: Field, text: string) => {
                        const lit = on && dockField === which;
                        const focus = () => {
                          setFocus({ entryId: e.id, setId: x.id });
                          setField(which === "weight" ? "value" : "reps");
                        };
                        return (
                          <ScrubCell
                            value={x[which] ?? 0}
                            step={
                              which === "weight"
                                ? unitKey === "lb" ? 1 : 0.5
                                : which === "seconds"
                                  ? HOLD_STEP
                                  : 1
                            }
                            onScrub={(v) => write(e.id, x.id, which, v)}
                            onScrubStart={focus}
                            onTap={() => {
                              // A second tap on the number already in the dock
                              // opens the keypad, for typing it outright.
                              if (lit) openPad(e.id, x.id, which);
                              focus();
                            }}
                            label={`Set ${j + 1} ${which === "weight" ? bwLabel(e.exerciseId) : which}`}
                            lit={lit}
                            color={tone}
                            strike={strike}
                          >
                            {text}
                          </ScrubCell>
                        );
                      };
                      return (
                        <div
                          key={x.id}
                          className="grid grid-cols-[32px_1fr_64px_52px_44px] items-center gap-1.5 rounded-[10px] px-2 py-1"
                          style={{ background: on ? ROW_ON : "transparent" }}
                        >
                          <span className="whitespace-nowrap font-mono text-[0.8125rem] font-medium text-muted">
                            {j + 1}
                          </span>
                          {p ? (
                            // Last time's set, and a tap copies it into this
                            // one — the quickest way to repeat what you did.
                            <button
                              onClick={() => {
                                s.updateSet(
                                  e.id,
                                  x.id,
                                  timed
                                    ? { weight: p.weight, seconds: p.seconds ?? 0 }
                                    : { weight: p.weight, reps: p.reps },
                                );
                                setFocus({ entryId: e.id, setId: x.id });
                              }}
                              aria-label={`Copy last time's ${
                                timed ? fmtClock(p.seconds ?? 0) : `${num(p.weight)} × ${p.reps}`
                              } into set ${j + 1}`}
                              className="press -my-2 h-10 truncate whitespace-nowrap text-left font-mono text-[0.8125rem] text-dim active:text-fg"
                            >
                              {timed ? fmtClock(p.seconds ?? 0) : `${num(p.weight)} × ${p.reps}`}
                            </button>
                          ) : (
                            <span className="font-mono text-[0.8125rem] text-dim">—</span>
                          )}
                          {cell("weight", num(x.weight))}
                          {timed
                            ? cell("seconds", fmtClock(x.seconds ?? 0))
                            : cell("reps", String(x.reps))}
                          <button
                            onClick={() => {
                              if (x.done) {
                                s.updateSet(e.id, x.id, { done: false, skipped: false });
                                return;
                              }
                              s.updateSet(e.id, x.id, { done: true, skipped: false });
                              const nx = e.sets.find((y, k) => k > j && !settled(y));
                              setFocus(nx ? { entryId: e.id, setId: nx.id } : null);
                            }}
                            aria-label={x.done ? `Unlog set ${j + 1}` : `Log set ${j + 1}`}
                            aria-pressed={x.done}
                            className="press grid size-10 place-items-center justify-self-end rounded-full border"
                            style={{
                              borderColor: x.done ? "var(--color-fg)" : "var(--color-faint)",
                              background: x.done ? "var(--color-fg)" : "transparent",
                              color: x.done ? "#000" : "var(--color-faint)",
                            }}
                          >
                            <Check size={16} />
                          </button>
                        </div>
                      );
                    })}
                    <div className="flex justify-between px-2 pt-1">
                      <button
                        onClick={() => s.addSet(e.id)}
                        className="press flex h-10 items-center gap-1.5 whitespace-nowrap font-mono text-label font-medium text-muted active:text-fg"
                      >
                        <Plus size={14} />
                        Add set
                      </button>
                      <button
                        onClick={() => {
                          const lastSet = e.sets[e.sets.length - 1];
                          if (lastSet && e.sets.length > 1) s.removeSet(e.id, lastSet.id);
                        }}
                        disabled={e.sets.length < 2}
                        className="press flex h-10 items-center whitespace-nowrap font-mono text-label font-medium text-dim active:text-muted disabled:opacity-40"
                      >
                        Remove last
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </SwipeRow>
          );
        })}

        {hint && (
          <p className="mx-2 mt-0.5 shrink-0 text-[0.75rem] leading-normal text-dim">
            Swipe an exercise left to remove it, right to replace it.
          </p>
        )}

        <button
          onClick={() => setSheet({ kind: "add" })}
          className="press group mt-1 flex shrink-0 items-center gap-2.5 rounded-2xl border border-dashed border-faint px-4 py-[18px] text-left"
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-full border border-faint text-fg transition-colors group-active:border-fg">
            <Plus size={13} />
          </span>
          <span className="whitespace-nowrap font-mono text-label font-semibold uppercase tracking-[0.16em] text-fg">
            Add exercise
          </span>
        </button>
      </div>

      {/*
        The dock. The set in hand, large, with its steps and the button that
        logs it, and the way out once everything is done.
      */}
      <div className="sticky bottom-0 z-20 shrink-0 border-t border-rule bg-[#0a0a0a] px-4 pb-[max(16px,calc(env(safe-area-inset-bottom)-4px))] pt-3">
        {fSet && f ? (
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5">
            <button
              onClick={() => openPad(f.entryId, f.setId, dockField)}
              aria-label={`${dockLabel}, ${dockValue}. Tap to type`}
              className="press flex min-w-24 flex-col gap-1 whitespace-nowrap text-left"
            >
              <span className="whitespace-nowrap font-mono text-label font-semibold uppercase tracking-[0.16em] text-muted">
                {dockLabel}
              </span>
              <span className="whitespace-nowrap font-mono text-[1.625rem] font-medium leading-none tracking-[-0.03em]">
                {dockValue}
              </span>
            </button>
            <div className="flex justify-end gap-1.5">
              {dockSteps.map((d) => (
                <button
                  key={d}
                  onClick={() => bump(dockField, d)}
                  className="press h-11 min-w-12 whitespace-nowrap rounded-xl border border-cardrule bg-card px-2 font-mono text-[0.8125rem] font-medium"
                >
                  {(d > 0 ? "+" : "−") + num(Math.abs(d))}
                  {dockField === "seconds" ? "s" : ""}
                </button>
              ))}
            </div>
            <button
              onClick={logFocused}
              aria-label="Log set"
              className="press grid size-14 place-items-center rounded-full bg-fg text-black"
            >
              <Check size={22} />
            </button>
          </div>
        ) : workoutDone ? (
          <button
            onClick={() => setConfirmFinish(true)}
            className="press h-14 w-full whitespace-nowrap rounded-full bg-fg font-mono text-[0.8125rem] font-semibold uppercase tracking-[0.14em] text-black"
          >
            Finish workout
          </button>
        ) : null}
      </div>

      {toast && <UndoToast toast={toast} />}

      {workoutShare && (
        <WorkoutSharePreview
          data={workoutShare}
          onClose={() => setWorkoutShare(null)}
          onUnlock={() => {
            setWorkoutShare(null);
            onUnlock("premium-share");
          }}
        />
      )}
      {streak && (
        <Celebration
          streak={streak}
          busy={completionSaving}
          error={completionError}
          onShare={() => setWorkoutShare(workoutCard(session, s.exerciseById, Date.now(),
            unit, s.sessions, s.settings.gender))}
          canShare={!!session.endedAt}
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
            shownPad.field === "weight"
              ? `Weight · ${unit}`
              : shownPad.field === "seconds"
                ? "Seconds"
                : "Reps"
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

      {addSheet}

      <Sheet
        open={!!menu}
        onClose={() => setMenu(null)}
        title={menuEntry ? nameOf(menuEntry.exerciseId) : "Exercise"}
      >
        <div className="-mt-2 pb-[calc(env(safe-area-inset-bottom)+22px)]">
          {/*
            The tap route to what the two swipes do. The gestures are faster
            once you know they are there — but a swipe cannot be performed at
            all with VoiceOver on, which claims that direction for itself.
          */}
          <button
            onClick={() => {
              if (menu) setSheet({ kind: "replace", entryId: menu });
              setMenu(null);
            }}
            className="press flex h-14 w-full items-center gap-3.5 border-b border-subrule text-left text-[1rem]"
          >
            <Swap size={18} />
            Replace exercise
          </button>
          <button
            onClick={async () => {
              const id = menu;
              setMenu(null);
              if (id && (await askRemove(id))) remove(id);
            }}
            className="press flex h-14 w-full items-center gap-3.5 text-left text-[1rem] text-danger"
          >
            <Trash size={18} />
            Remove exercise
          </button>
        </div>
      </Sheet>

      {finishSheet}
    </div>
  );
}

/** Sideways travel, in pixels, for each step a dragged number moves. */
const SCRUB_PX = 10;
/** Movement before a press declares itself a drag, or a scroll. */
const SCRUB_SLOP = 6;

/**
 * A number in the set table that can be tapped or dragged.
 *
 * A tap points the dock at it, as before. Held and pulled sideways it counts —
 * left for more, right for less, one step per ten pixels — so the small
 * corrections mid-set are a flick of the thumb rather than a trip to the dock.
 * Vertical movement is left to the page: whichever way the finger first goes
 * decides, and a scroll that starts on a cell is still a scroll.
 */
function ScrubCell({
  value,
  step,
  onScrub,
  onScrubStart,
  onTap,
  label,
  lit,
  color,
  strike,
  children,
}: {
  value: number;
  step: number;
  onScrub: (v: number) => void;
  onScrubStart: () => void;
  onTap: () => void;
  label: string;
  lit: boolean;
  color: string;
  strike?: string;
  children: ReactNode;
}) {
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    from: number;
    last: number;
    live: boolean | null;
  } | null>(null);
  // The browser raises a click at the end of a drag; this is what drops it.
  const scrubbed = useRef(false);
  const [active, setActive] = useState(false);

  function end(e: React.PointerEvent<HTMLButtonElement>) {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setActive(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  return (
    <button
      onPointerDown={(e) => {
        drag.current = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          from: value,
          last: value,
          live: null,
        };
        scrubbed.current = false;
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId || d.live === false) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (d.live === null) {
          if (Math.abs(dx) < SCRUB_SLOP && Math.abs(dy) < SCRUB_SLOP) return;
          if (Math.abs(dy) > Math.abs(dx)) {
            d.live = false;
            return;
          }
          d.live = true;
          scrubbed.current = true;
          setActive(true);
          onScrubStart();
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* the pointer is already gone */
          }
        }
        // Leftward adds, rightward takes away.
        const steps = Math.trunc(-dx / SCRUB_PX);
        const next = Math.max(0, Math.round((d.from + steps * step) * 100) / 100);
        if (next !== d.last) {
          d.last = next;
          onScrub(next);
        }
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onClick={() => {
        if (scrubbed.current) {
          scrubbed.current = false;
          return;
        }
        onTap();
      }}
      aria-label={label}
      className="press h-10 cursor-ew-resize select-none whitespace-nowrap rounded-[10px] border bg-ink font-mono text-[1.0625rem] font-medium"
      style={{
        // Sideways is ours, up and down still scrolls the workout.
        touchAction: "pan-y",
        borderColor: lit || active ? "var(--color-fg)" : "var(--color-cardrule)",
        color,
        textDecoration: strike,
      }}
    >
      {children}
    </button>
  );
}

/** What was just done, and the one tap that takes it back. */
function UndoToast({ toast }: { toast: Toast }) {
  return (
    <div
      role="status"
      className="animate-rise fixed inset-x-4 bottom-[calc(max(16px,calc(env(safe-area-inset-bottom)-4px))+100px)] z-30 mx-auto flex h-13 max-w-md items-center justify-between gap-3 rounded-[14px] border border-cardrule bg-rule pl-4 pr-2"
    >
      <span className="min-w-0 truncate text-[0.875rem]">{toast.text}</span>
      <button
        onClick={toast.undo}
        className="press h-11 whitespace-nowrap px-3 font-mono text-label font-semibold uppercase tracking-[0.16em] underline underline-offset-[5px]"
      >
        Undo
      </button>
    </div>
  );
}

/** The name of the workout, the clock, and the way out of it. */
function Header({
  onBack,
  name,
  onRename,
  session,
  onFinish,
}: {
  onBack: () => void;
  name: string;
  onRename: (v: string) => void;
  session: Session;
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
          <Elapsed session={session} />
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
              aria-label="Share workout"
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
