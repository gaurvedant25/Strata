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
import { seedExercises } from "./lib/seed";
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
};

type Ctx = ReturnType<typeof useProvideStore>;
const StoreCtx = createContext<Ctx | null>(null);

/** Module-level so StrictMode's double-invoked effect can't seed the library twice. */
let bootstrap: Promise<Awaited<ReturnType<typeof store.loadAll>>> | null = null;

type Loaded = Awaited<ReturnType<typeof store.loadAll>>;

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

  const muscle: Record<string, string> = {
    "Barbell Shrug": "Back",
    "Cable Woodchop": "Core",
  };
  const now = Date.now();
  await Promise.all(
    missing.map((name, i) =>
      store.put.exercise({
        id: uid(),
        name,
        muscle: muscle[name] ?? "Other",
        bodyweight: false,
        createdAt: now + i,
      }),
    ),
  );
  return store.loadAll();
}

function boot() {
  bootstrap ??= (async () => {
    const data = await store.loadAll();
    // The exercise library is seeded, but routines are not: a fresh install is
    // meant to reach the Routines screen with nothing chosen, and be asked.
    if (data.exercises.length || data.sessions.length) {
      return ensureBenchmarkLifts(await adoptLooseRoutines(data));
    }
    await Promise.all(seedExercises().map(store.put.exercise));
    return store.loadAll();
  })();
  return bootstrap;
}

function useProvideStore() {
  const [s, setS] = useState<State>(empty);
  const [now, setNow] = useState(Date.now());

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

  const api = {
    ...s,
    now,
    active,
    activeSplit,
    splitRoutines,
    exerciseById,
    reload,

    async startSession(routine?: Routine) {
      const id = uid();
      const session: Session = {
        id,
        name: routine?.name ?? "Workout",
        routineId: routine?.id,
        date: todayKey(),
        startedAt: Date.now(),
        entries:
          routine?.items.map((it) => ({
            id: uid(),
            exerciseId: it.exerciseId,
            sets: Array.from({ length: it.sets }, () => ({
              id: uid(),
              reps: it.reps,
              weight: 0,
              done: false,
            })),
          })) ?? [],
      };
      await store.put.session(session);
      await store.put.activeSessionId(id);
      setS((p) => ({
        ...p,
        sessions: [session, ...p.sessions],
        activeSessionId: id,
      }));
      return id;
    },

    async finishSession() {
      const cur = active;
      if (!cur) return;
      // drop sets never ticked off, and entries left completely empty
      const entries = cur.entries
        .map((e) => ({ ...e, sets: e.sets.filter((x) => x.done) }))
        .filter((e) => e.sets.length);
      const next: Session = { ...cur, entries, endedAt: Date.now() };
      await writeSession(next);
      await store.put.activeSessionId(null);
      setS((p) => ({ ...p, activeSessionId: null }));
    },

    async discardSession() {
      const cur = active;
      if (!cur) return;
      await store.del.session(cur.id);
      await store.put.activeSessionId(null);
      setS((p) => ({
        ...p,
        sessions: p.sessions.filter((x) => x.id !== cur.id),
        activeSessionId: null,
      }));
    },

    async resumeSession(id: string) {
      await store.put.activeSessionId(id);
      setS((p) => ({ ...p, activeSessionId: id }));
    },

    renameSession(name: string) {
      patchActive((d) => ({ ...d, name }));
    },
    setSessionNote(note: string) {
      patchActive((d) => ({ ...d, note }));
    },

    addEntry(exerciseId: string) {
      patchActive((d) => {
        d.entries.push({
          id: uid(),
          exerciseId,
          sets: [{ id: uid(), reps: 8, weight: 0, done: false }],
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
        e.sets.push({
          id: uid(),
          reps: last?.reps ?? 8,
          weight: last?.weight ?? 0,
          done: false,
        });
        return d;
      });
    },
    updateSet(entryId: string, setId: string, patch: Partial<SetLog>) {
      patchActive((d) => {
        const e = d.entries.find((x) => x.id === entryId);
        const st = e?.sets.find((x) => x.id === setId);
        if (st) Object.assign(st, patch);
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
