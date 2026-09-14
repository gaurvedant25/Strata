import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as store from "./lib/db";
import { buildPreset, type Preset } from "./lib/presets";
import { seedExercises, seedId, seedNames } from "./lib/seed";
import { lastBestSet } from "./lib/stats";
import { CANONICAL_LIFT } from "./lib/strength";
import { todayKey, uid } from "./lib/util";
import {
  DEFAULT_SETTINGS,
  type BodyWeight,
  type Exercise,
  type Routine,
  type Session,
  type SetLog,
  type Settings,
  type Split,
} from "./types";

type State = {
  ready: boolean;
  exercises: Exercise[];
  routines: Routine[];
  splits: Split[];
  sessions: Session[];
  bodyweight: BodyWeight[];
  settings: Settings;
  activeSessionId: string | null;
  activeSplitId: string | null;
  pendingCompletionId: string | null;
};

const empty: State = {
  ready: false,
  exercises: [],
  routines: [],
  splits: [],
  sessions: [],
  bodyweight: [],
  settings: DEFAULT_SETTINGS,
  activeSessionId: null,
  activeSplitId: null,
  pendingCompletionId: null,
};

type Ctx = ReturnType<typeof useProvideStore>;
const StoreCtx = createContext<Ctx | null>(null);

/** Module-level so StrictMode's double-invoked effect can't seed the library twice. */
let bootstrap: Promise<Awaited<ReturnType<typeof store.loadAll>>> | null = null;

type Loaded = Awaited<ReturnType<typeof store.loadAll>>;

/**
 * Which day is up next, per split.
 *
 * A preference, not data: it is how you intend to use the split this week, not
 * a fact about the split, so it stays on the device rather than going through
 * sync. Keyed by split, because the answer is different for each.
 */
const NEXT_UP_PREFIX = "gymlog.nextUp.";

function readNextUp(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(NEXT_UP_PREFIX)) continue;
      const value = localStorage.getItem(key);
      if (value) out[key.slice(NEXT_UP_PREFIX.length)] = value;
    }
  } catch {
    // private-mode storage: the pointer is a nicety, the screen still works
  }
  return out;
}

/**
 * The lift the Progress screen opens on.
 *
 * A preference in the same sense as next-up: which lift you are chasing at the
 * moment is how you are using the app, not a fact about the lift, so it stays
 * on the device rather than going through sync. Unset, the screen opens on
 * whichever lift moved most recently.
 */
const PINNED_LIFT_KEY = "gymlog.pinnedLift";

function readPinnedLift(): string | null {
  try {
    return localStorage.getItem(PINNED_LIFT_KEY);
  } catch {
    // private-mode storage: the screen still opens, just on the recent lift
    return null;
  }
}

/**
 * Routines predate splits, and a version 1 backup can import more of them at
 * any time, so any routine that does not belong to a split is adopted into one
 * on load. Without this they would exist in the database but appear nowhere,
 * since the Routines screen only ever shows the active split's days.
 */
async function adoptLooseRoutines(data: Loaded): Promise<Loaded> {
  const loose = data.routines.filter((r) => !r.splitId);
  if (!loose.length) return data;

  const split: Split = {
    id: uid(),
    name: "My Split",
    blurb: "Your own routines.",
    createdAt: loose[0].createdAt,
  };
  await store.put.split(split);
  await Promise.all(
    loose.map((r) => store.put.routine({ ...r, splitId: split.id })),
  );
  // an existing user lands back where they were, rather than on the chooser
  if (!data.activeSplitId) await store.put.activeSplitId(split.id);
  return store.loadAll();
}

/**
 * Adds any benchmark lift the library is missing.
 *
 * A region is scored by exactly one lift, so a library without that lift leaves
 * the region permanently blank with no way to fill it from inside the app. This
 * only ever adds the fourteen benchmarks — it will not resurrect anything else
 * that was deleted — and it is what lets the regions be split without stranding
 * anyone whose library predates the new ones.
 */
async function ensureBenchmarkLifts(data: Loaded): Promise<Loaded> {
  const have = new Set(data.exercises.map((e) => e.name));
  const missing = Object.values(CANONICAL_LIFT).filter((n) => !have.has(n));
  if (!missing.length) return data;

  // Taken from the library's own definition rather than described again here:
  // a hand-written table went stale the moment a benchmark changed, and it had
  // no way to know that a hanging leg raise is a bodyweight movement — filed
  // under "Other" and marked loaded, a restored benchmark would have ranked
  // its region off the wrong number entirely.
  const seeded = new Map(seedExercises().map((e) => [e.name, e]));
  const now = Date.now();
  await Promise.all(
    missing.map((name, i) => {
      const def = seeded.get(name);
      return store.put.exercise({
        // Same derived id the library itself would use, so topping a benchmark
        // up here and seeding it later are the same row rather than two.
        ...def,
        id: seedId(name),
        name,
        muscle: def?.muscle ?? "Other",
        bodyweight: def?.bodyweight ?? false,
        createdAt: now + i,
      });
    }),
  );
  return store.loadAll();
}

/**
 * Folds duplicate exercises back into one row each.
 *
 * Seeding used to mint random ids every time it ran, and it runs whenever the
 * library is found empty — which signing into another account makes happen for
 * real, since the local copy is dropped before being repulled. Each pass wrote
 * a fresh set of rows, sync pushed them up as new records, and the account
 * accumulated another complete copy of the library. Libraries reached twenty
 * generations deep, which is what put twenty-one identical Barbell Curls in the
 * picker.
 *
 * `seedId` stops new ones being made. This clears out the ones already there:
 * everything sharing a name collapses onto a single survivor, references in
 * routines and sessions are repointed at it, and the losers are buried rather
 * than dropped so the deletion reaches the server instead of being pulled back
 * on the next sync.
 *
 * Survivors are chosen so the result is stable: a library name always collapses
 * onto its derived id, so a device that has already run this and one that has
 * not still agree on which row is the real one.
 */
async function dedupeExercises(data: Loaded): Promise<Loaded> {
  // Buried rows count here. Generations of duplicates were deleted before this
  // migration existed, and routines and sessions still point at them; reading
  // the name off a tombstone is the only way to work out which live row a
  // reference like that was always meant to mean.
  const all = await store.allExercises();
  const byName = new Map<string, Exercise[]>();
  for (const e of all) {
    byName.set(e.name, [...(byName.get(e.name) ?? []), e]);
  }

  const library = new Set(seedNames());
  /** Every id being retired, pointed at the row that replaces it. */
  const remap = new Map<string, string>();
  let collapsed = false;

  for (const group of byName.values()) {
    const oldest = [...group].sort((a, b) => a.createdAt - b.createdAt);
    const name = oldest[0].name;
    const canonical = library.has(name) ? seedId(name) : oldest[0].id;
    const survivor = group.find((e) => e.id === canonical);
    // Prefer a living row's details; fall back to the earliest tombstone, which
    // is all that is left when every copy of a name was deleted.
    const source = oldest.find((e) => !e.deleted) ?? oldest[0];
    if (!survivor || survivor.deleted) {
      if (source.deleted) continue; // deliberately deleted; leave it deleted
      await store.put.exercise({ ...source, id: canonical, deleted: false });
      collapsed = true;
    }
    for (const e of group) {
      if (e.id === canonical) continue;
      remap.set(e.id, canonical);
      if (!e.deleted) {
        await store.del.exercise(e.id);
        collapsed = true;
      }
    }
  }
  if (!remap.size) return collapsed ? store.loadAll() : data;

  const to = (id: string) => remap.get(id) ?? id;

  // Retired ids stay in the map for the life of the account — the tombstones
  // they name are never removed — so every launch after the first finds nothing
  // to rewrite here and writes nothing.
  const routines = data.routines.filter((r) =>
    r.items.some((it) => remap.has(it.exerciseId)),
  );
  const sessions = data.sessions.filter((s) =>
    s.entries.some((e) => remap.has(e.exerciseId)),
  );

  await Promise.all(
    routines.map((r) =>
      store.put.routine({
        ...r,
        items: r.items.map((it) => ({ ...it, exerciseId: to(it.exerciseId) })),
      }),
    ),
  );
  await Promise.all(
    sessions.map((s) =>
      store.put.session({
        ...s,
        entries: s.entries.map((e) => ({
          ...e,
          exerciseId: to(e.exerciseId),
        })),
      }),
    ),
  );
  if (routines.length || sessions.length) collapsed = true;

  // The pinned lift is device-local, so it is repointed here rather than synced.
  const pinned = readPinnedLift();
  if (pinned && remap.has(pinned)) {
    try {
      localStorage.setItem(PINNED_LIFT_KEY, to(pinned));
    } catch {
      /* private mode; the pin is a convenience, not data */
    }
  }

  return collapsed ? store.loadAll() : data;
}

/** Where a held set starts, in seconds. About a plank somebody can finish. */
const DEFAULT_HOLD = 45;

/**
 * A blank set for an exercise, counted the way that exercise is counted.
 *
 * A timed set carries its duration and leaves `reps` at zero, which is what
 * keeps it out of volume and estimated-1RM maths without those having to know
 * anything about time.
 */
function blankSet(
  ex: Exercise | undefined,
  from: { reps?: number; weight?: number; seconds?: number } = {},
): SetLog {
  const timed = ex?.tracks === "time";
  return {
    id: uid(),
    reps: timed ? 0 : (from.reps ?? 8),
    ...(timed ? { seconds: from.seconds ?? DEFAULT_HOLD } : {}),
    weight: from.weight ?? 0,
    done: false,
  };
}

/**
 * Adds any library exercise the account has never seen.
 *
 * Distinct from seeding, which only fires into an empty library: this is what
 * carries a later, longer list to somebody who installed when it was shorter.
 * It adds by derived id, so it cannot introduce a second copy of a row that is
 * already there, and it skips anything deliberately deleted — a buried row is
 * still in the store, and resurrecting it every launch would make deleting an
 * exercise impossible.
 */
async function ensureLibrary(data: Loaded): Promise<Loaded> {
  const known = new Set(await store.allExerciseIds());
  const library = seedExercises();
  const fresh = library.filter((e) => !known.has(e.id));

  // Whether a lift is counted in reps or held for a duration is a property of
  // the movement, not a preference, and it arrived after these rows were first
  // written — so a library exercise already in the store is brought up to date
  // rather than left asking for reps of plank. Only this one field is touched:
  // name and muscle may have been edited by hand, and this is not the place to
  // overrule that.
  const byId = new Map(data.exercises.map((e) => [e.id, e]));
  const restated = library.flatMap((e) => {
    const cur = byId.get(e.id);
    return cur && (cur.tracks ?? "reps") !== e.tracks
      ? [{ ...cur, tracks: e.tracks }]
      : [];
  });

  if (!fresh.length && !restated.length) return data;
  await Promise.all([...fresh, ...restated].map(store.put.exercise));
  return store.loadAll();
}

function boot() {
  bootstrap ??= (async () => {
    const data = await store.loadAll();
    // The exercise library is seeded, but routines are not: a fresh install is
    // meant to reach the Routines screen with nothing chosen, and be asked.
    if (data.exercises.length || data.sessions.length) {
      // Order matters. Collapsing duplicates first means the library top-up
      // that follows is comparing against one row per name rather than
      // twenty, and the benchmark check last sees the finished library.
      const deduped = await dedupeExercises(data);
      const stocked = await ensureLibrary(await adoptLooseRoutines(deduped));
      return ensureBenchmarkLifts(stocked);
    }
    await Promise.all(seedExercises().map(store.put.exercise));
    return store.loadAll();
  })();
  return bootstrap;
}

function useProvideStore() {
  const [s, setS] = useState<State>(empty);
  const [now, setNow] = useState(Date.now());
  const [nextUpBySplit, setNextUpBySplit] = useState(readNextUp);
  const [pinnedLiftId, setPinnedLiftId] = useState(readPinnedLift);

  useEffect(() => {
    void boot().then((data) => setS({ ...data, ready: true }));
  }, []);

  // drives live session duration and relative timestamps across the app
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const reload = useCallback(async () => {
    const data = await adoptLooseRoutines(await store.loadAll());
    setS({ ...data, ready: true });
  }, []);

  const active = useMemo(
    () => s.sessions.find((x) => x.id === s.activeSessionId) ?? null,
    [s.sessions, s.activeSessionId],
  );

  const activeSplit = useMemo(
    () => s.splits.find((x) => x.id === s.activeSplitId) ?? null,
    [s.splits, s.activeSplitId],
  );

  /** The days of the active split, in order. Empty when no split is chosen. */
  const splitRoutines = useMemo(
    () =>
      s.activeSplitId
        ? s.routines.filter((r) => r.splitId === s.activeSplitId)
        : [],
    [s.routines, s.activeSplitId],
  );

  /** The day the Routines screen leads with, or null when the split has none. */
  const nextUpId = s.activeSplitId
    ? (nextUpBySplit[s.activeSplitId] ?? null)
    : null;

  const setNextUp = useCallback((splitId: string, routineId: string) => {
    try {
      localStorage.setItem(NEXT_UP_PREFIX + splitId, routineId);
    } catch {
      // see readNextUp
    }
    setNextUpBySplit((p) => ({ ...p, [splitId]: routineId }));
  }, []);

  const exerciseById = useMemo(() => {
    const m = new Map<string, Exercise>();
    for (const e of s.exercises) m.set(e.id, e);
    return m;
  }, [s.exercises]);

  const writeSession = useCallback(async (next: Session) => {
    setS((p) => ({
      ...p,
      sessions: p.sessions.some((x) => x.id === next.id)
        ? p.sessions.map((x) => (x.id === next.id ? next : x))
        : [next, ...p.sessions],
    }));
    await store.put.session(next);
  }, []);

  const patchActive = useCallback((fn: (draft: Session) => Session) => {
    setS((p) => {
      const cur = p.sessions.find((x) => x.id === p.activeSessionId);
      if (!cur) return p;
      const next = fn(structuredClone(cur));
      void store.put.session(next);
      return {
        ...p,
        sessions: p.sessions.map((x) => (x.id === next.id ? next : x)),
      };
    });
  }, []);

  /**
   * Finishing a day hands next up to the day after it, so the card on the
   * Routines screen is the workout you have not done rather than the one you
   * just did. Wraps at the end of the split, ignores a session that did not
   * come from a day of the split you are on, and is still overridable by hand.
   */
  const advanceNextUp = useCallback(
    (routineId: string | undefined) => {
      const splitId = s.activeSplitId;
      if (!splitId || !routineId || splitRoutines.length === 0) return;
      const i = splitRoutines.findIndex((r) => r.id === routineId);
      if (i < 0) return;
      setNextUp(splitId, splitRoutines[(i + 1) % splitRoutines.length].id);
    },
    [s.activeSplitId, splitRoutines, setNextUp],
  );

  const api = {
    ...s,
    now,
    active,
    activeSplit,
    splitRoutines,
    nextUpId,
    exerciseById,
    reload,

    /** Pin a day as next up by hand, from the Routines screen. */
    makeNextUp(routineId: string) {
      if (s.activeSplitId) setNextUp(s.activeSplitId, routineId);
    },

    pinnedLiftId,

    /** Pin the lift Progress opens on, or pass null to let it choose again. */
    pinLift(exerciseId: string | null) {
      try {
        if (exerciseId) localStorage.setItem(PINNED_LIFT_KEY, exerciseId);
        else localStorage.removeItem(PINNED_LIFT_KEY);
      } catch {
        // see readPinnedLift
      }
      setPinnedLiftId(exerciseId);
    },

    async startSession(routine?: Routine) {
      // Starting on top of a running workout used to overwrite the active id
      // and leave the old session behind: still in the log, never ended, and
      // no longer reachable to finish or discard. There is only ever one
      // workout, so asking for another hands back the one already going.
      if (s.activeSessionId) return s.activeSessionId;
      const id = uid();
      const session: Session = {
        id,
        name: routine?.name ?? "Workout",
        routineId: routine?.id,
        date: todayKey(),
        startedAt: Date.now(),
        entries:
          routine?.items.map((it) => {
            /*
             * Every set opens on the weight from the best set of the last
             * session that trained this lift, so the first thing you see is the
             * bar you were actually using rather than a dash.
             *
             * The *reps* stay the routine's, because the routine planned them:
             * five by five is a decision, and quietly replacing it with the six
             * that happened last week would be the app editing the plan. A lift
             * with no history at all still opens blank, which is honest — there
             * is nothing to suggest.
             */
            const was = lastBestSet(s.sessions, it.exerciseId, id);
            return {
              id: uid(),
              exerciseId: it.exerciseId,
              // A routine plans one number per set, read according to the
              // exercise: reps for a counted lift, seconds for a held one.
              sets: Array.from({ length: it.sets }, () =>
                blankSet(s.exercises.find((x) => x.id === it.exerciseId), {
                  reps: it.reps,
                  seconds: it.reps,
                  weight: was?.weight,
                }),
              ),
            };
          }) ?? [],
      };
      await store.put.session(session);
      await store.put.activeSessionId(id);
      await store.put.pendingCompletionId(null);
      setS((p) => ({
        ...p,
        sessions: [session, ...p.sessions],
        activeSessionId: id,
        pendingCompletionId: null,
      }));
      return id;
    },

    /** Persist the automatic completion while leaving its celebration open. */
    async markSessionComplete(at = Date.now()) {
      const cur = active;
      if (!cur) return null;
      if (cur.endedAt) return cur;
      const next: Session = { ...cur, endedAt: at };
      await store.markSessionComplete(next);
      setS((p) => ({
        ...p,
        sessions: p.sessions.map((x) => (x.id === next.id ? next : x)),
        pendingCompletionId: next.id,
      }));
      return next;
    },

    /** “Keep going” reverses an automatic completion, not a historical edit. */
    async reopenPendingCompletion() {
      const cur = active;
      if (!cur || s.pendingCompletionId !== cur.id) return;
      const { endedAt: _endedAt, ...rest } = cur;
      const next: Session = rest;
      await store.reopenPendingSession(next);
      setS((p) => ({
        ...p,
        sessions: p.sessions.map((x) => (x.id === next.id ? next : x)),
        pendingCompletionId: null,
      }));
    },

    async finishSession() {
      const cur = active;
      if (!cur) return null;
      // drop sets never ticked off, and entries left completely empty
      const entries = cur.entries
        .map((e) => ({ ...e, sets: e.sets.filter((x) => x.done) }))
        .filter((e) => e.sets.length);
      // `endedAt ??` rather than a fresh stamp: finishing an edit of a workout
      // that already ended must not move its end. The first finish is the one
      // that sets the length.
      const next: Session = {
        ...cur,
        entries,
        endedAt: cur.endedAt ?? Date.now(),
      };
      await store.commitFinishedSession(next);
      setS((p) => ({
        ...p,
        sessions: p.sessions.map((x) => (x.id === next.id ? next : x)),
        activeSessionId: null,
        pendingCompletionId: null,
      }));
      advanceNextUp(cur.routineId);
      return next;
    },

    async discardSession() {
      const cur = active;
      if (!cur) return;
      await store.del.session(cur.id);
      await store.put.activeSessionId(null);
      await store.put.pendingCompletionId(null);
      setS((p) => ({
        ...p,
        sessions: p.sessions.filter((x) => x.id !== cur.id),
        activeSessionId: null,
        pendingCompletionId: null,
      }));
    },

    async resumeSession(id: string) {
      await store.put.activeSessionId(id);
      await store.put.pendingCompletionId(null);
      setS((p) => ({
        ...p,
        activeSessionId: id,
        pendingCompletionId: null,
      }));
    },

    renameSession(name: string) {
      patchActive((d) => ({ ...d, name }));
    },
    setSessionNote(note: string) {
      patchActive((d) => ({ ...d, note }));
    },

    addEntry(exerciseId: string) {
      patchActive((d) => {
        // Opened on the best set from the last time this lift was trained, so
        // an exercise added mid-session starts where it left off rather than at
        // zero. Reps come with it: nothing here planned a different number.
        const was = lastBestSet(s.sessions, exerciseId, d.id);
        d.entries.push({
          id: uid(),
          exerciseId,
          sets: [
            blankSet(s.exercises.find((x) => x.id === exerciseId), {
              weight: was?.weight,
              reps: was?.reps,
              seconds: was?.seconds,
            }),
          ],
        });
        return d;
      });
    },
    removeEntry(entryId: string) {
      patchActive((d) => ({
        ...d,
        entries: d.entries.filter((e) => e.id !== entryId),
      }));
    },
    moveEntry(entryId: string, dir: -1 | 1) {
      patchActive((d) => {
        const i = d.entries.findIndex((e) => e.id === entryId);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= d.entries.length) return d;
        [d.entries[i], d.entries[j]] = [d.entries[j], d.entries[i]];
        return d;
      });
    },
    addSet(entryId: string) {
      patchActive((d) => {
        const e = d.entries.find((x) => x.id === entryId);
        if (!e) return d;
        const last = e.sets[e.sets.length - 1];
        e.sets.push(
          blankSet(
            s.exercises.find((x) => x.id === e.exerciseId),
            { reps: last?.reps, weight: last?.weight, seconds: last?.seconds },
          ),
        );
        return d;
      });
    },
    updateSet(entryId: string, setId: string, patch: Partial<SetLog>) {
      patchActive((d) => {
        const e = d.entries.find((x) => x.id === entryId);
        const st = e?.sets.find((x) => x.id === setId);
        if (st) Object.assign(st, patch);
        /*
         * Logging a set opens the ones behind it on the same numbers.
         *
         * You rarely change the bar between sets, so what you just did is the
         * best guess for what you are about to do — and it beats the previous
         * behaviour, where every set after the first opened blank and had to be
         * dialled from zero even though the plates had not moved.
         *
         * Only sets still ahead and still untouched are moved: anything already
         * logged is history, and anything skipped has been decided. Reps come
         * along too, so a drop set or an added rep carries rather than being
         * typed out again.
         */
        if (st && patch.done && e) {
          for (const ahead of e.sets.slice(e.sets.indexOf(st) + 1)) {
            if (ahead.done || ahead.skipped) continue;
            ahead.weight = st.weight;
            ahead.reps = st.reps;
            if (st.seconds != null) ahead.seconds = st.seconds;
          }
        }
        return d;
      });
    },
    removeSet(entryId: string, setId: string) {
      patchActive((d) => {
        const e = d.entries.find((x) => x.id === entryId);
        if (e) e.sets = e.sets.filter((x) => x.id !== setId);
        return d;
      });
    },

    async saveSession(next: Session) {
      await writeSession(next);
    },
    async deleteSession(id: string) {
      await store.del.session(id);
      setS((p) => ({ ...p, sessions: p.sessions.filter((x) => x.id !== id) }));
    },

    async saveExercise(e: Exercise) {
      await store.put.exercise(e);
      setS((p) => ({
        ...p,
        exercises: p.exercises.some((x) => x.id === e.id)
          ? p.exercises.map((x) => (x.id === e.id ? e : x))
          : [...p.exercises, e],
      }));
    },
    async deleteExercise(id: string) {
      await store.del.exercise(id);
      setS((p) => ({
        ...p,
        exercises: p.exercises.filter((x) => x.id !== id),
      }));
    },

    /**
     * Starts a split. A preset already in use is switched back to rather than
     * built again, so choosing it twice does not duplicate its days.
     */
    async useSplit(preset: Preset) {
      const existing = s.splits.find((x) => x.preset === preset.key);
      if (existing) {
        await store.put.activeSplitId(existing.id);
        setS((p) => ({ ...p, activeSplitId: existing.id }));
        return;
      }
      const { split, routines } = buildPreset(preset, s.exercises);
      await store.put.split(split);
      await Promise.all(routines.map(store.put.routine));
      await store.put.activeSplitId(split.id);
      setS((p) => ({
        ...p,
        splits: [...p.splits, split],
        routines: [...p.routines, ...routines],
        activeSplitId: split.id,
      }));
    },

    /** Starts an empty split of your own, ready for days to be added. */
    async createSplit(name: string) {
      const split: Split = {
        id: uid(),
        name: name.trim() || "My Split",
        blurb: "Your own split.",
        createdAt: Date.now(),
      };
      await store.put.split(split);
      await store.put.activeSplitId(split.id);
      setS((p) => ({
        ...p,
        splits: [...p.splits, split],
        activeSplitId: split.id,
      }));
    },

    async setActiveSplit(id: string | null) {
      await store.put.activeSplitId(id);
      setS((p) => ({ ...p, activeSplitId: id }));
    },

    async saveSplit(next: Split) {
      await store.put.split(next);
      setS((p) => ({
        ...p,
        splits: p.splits.map((x) => (x.id === next.id ? next : x)),
      }));
    },

    /** Removes a split and its days. Logged workouts are untouched. */
    async deleteSplit(id: string) {
      const days = s.routines.filter((r) => r.splitId === id);
      await Promise.all(days.map((r) => store.del.routine(r.id)));
      await store.del.split(id);
      if (s.activeSplitId === id) await store.put.activeSplitId(null);
      setS((p) => ({
        ...p,
        splits: p.splits.filter((x) => x.id !== id),
        routines: p.routines.filter((r) => r.splitId !== id),
        activeSplitId: p.activeSplitId === id ? null : p.activeSplitId,
      }));
    },

    async saveRoutine(r: Routine) {
      await store.put.routine(r);
      setS((p) => ({
        ...p,
        routines: p.routines.some((x) => x.id === r.id)
          ? p.routines.map((x) => (x.id === r.id ? r : x))
          : [...p.routines, r],
      }));
    },
    async deleteRoutine(id: string) {
      await store.del.routine(id);
      setS((p) => ({ ...p, routines: p.routines.filter((x) => x.id !== id) }));
    },

    async logBodyWeight(date: string, weight: number) {
      const rec: BodyWeight = { date, weight, at: Date.now() };
      await store.put.bodyweight(rec);
      setS((p) => ({
        ...p,
        bodyweight: [...p.bodyweight.filter((x) => x.date !== date), rec].sort(
          (a, b) => a.date.localeCompare(b.date),
        ),
      }));
    },
    async deleteBodyWeight(date: string) {
      await store.del.bodyweight(date);
      setS((p) => ({
        ...p,
        bodyweight: p.bodyweight.filter((x) => x.date !== date),
      }));
    },

    async saveSettings(patch: Partial<Settings>) {
      const next = { ...s.settings, ...patch };
      await store.put.settings(next);
      setS((p) => ({ ...p, settings: next }));
    },
  };

  return api;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const value = useProvideStore();
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const v = useContext(StoreCtx);
  if (!v) throw new Error("useStore must be used inside <StoreProvider>");
  return v;
}
