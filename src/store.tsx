import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as store from "./lib/db";
import { seedExercises, seedRoutines } from "./lib/seed";
import { todayKey, uid } from "./lib/util";
import {
  DEFAULT_SETTINGS,
  type BodyWeight,
  type Exercise,
  type Routine,
  type Session,
  type SetLog,
  type Settings,
} from "./types";

type State = {
  ready: boolean;
  exercises: Exercise[];
  routines: Routine[];
  sessions: Session[];
  bodyweight: BodyWeight[];
  settings: Settings;
  activeSessionId: string | null;
};

const empty: State = {
  ready: false,
  exercises: [],
  routines: [],
  sessions: [],
  bodyweight: [],
  settings: DEFAULT_SETTINGS,
  activeSessionId: null,
};

type Ctx = ReturnType<typeof useProvideStore>;
const StoreCtx = createContext<Ctx | null>(null);

/** Module-level so StrictMode's double-invoked effect can't seed the library twice. */
let bootstrap: Promise<Awaited<ReturnType<typeof store.loadAll>>> | null = null;

function boot() {
  bootstrap ??= (async () => {
    const data = await store.loadAll();
    if (data.exercises.length || data.sessions.length) return data;
    const ex = seedExercises();
    const rt = seedRoutines(ex);
    await Promise.all([...ex.map(store.put.exercise), ...rt.map(store.put.routine)]);
    return store.loadAll();
  })();
  return bootstrap;
}

function beep() {
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.65);
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* audio is a nicety, never fatal */
  }
}

function useProvideStore() {
  const [s, setS] = useState<State>(empty);
  const [restUntil, setRestUntil] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(0);
  const [now, setNow] = useState(Date.now());
  const fired = useRef(false);

  useEffect(() => {
    void boot().then((data) => setS({ ...data, ready: true }));
  }, []);

  // one ticker for the whole app: rest countdown + live session duration
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (restUntil == null) return;
    if (now < restUntil) {
      fired.current = false;
      return;
    }
    if (fired.current) return;
    fired.current = true;
    if (s.settings.vibrate) navigator.vibrate?.([200, 100, 200]);
    if (s.settings.sound) beep();
  }, [now, restUntil, s.settings.vibrate, s.settings.sound]);

  const reload = useCallback(async () => {
    const data = await store.loadAll();
    setS({ ...data, ready: true });
  }, []);

  const active = useMemo(
    () => s.sessions.find((x) => x.id === s.activeSessionId) ?? null,
    [s.sessions, s.activeSessionId],
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
      return { ...p, sessions: p.sessions.map((x) => (x.id === next.id ? next : x)) };
    });
  }, []);

  const api = {
    ...s,
    now,
    active,
    exerciseById,
    restUntil,
    restTotal,
    restLeft: restUntil == null ? 0 : Math.max(0, (restUntil - now) / 1000),
    reload,

    startRest(seconds?: number) {
      const secs = seconds ?? s.settings.restSeconds;
      setRestTotal(secs);
      setRestUntil(Date.now() + secs * 1000);
      fired.current = false;
    },
    addRest(seconds: number) {
      setRestUntil((u) => (u == null ? Date.now() + seconds * 1000 : u + seconds * 1000));
      setRestTotal((t) => Math.max(0, t + seconds));
      fired.current = false;
    },
    stopRest() {
      setRestUntil(null);
    },

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
      setS((p) => ({ ...p, sessions: [session, ...p.sessions], activeSessionId: id }));
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
      setRestUntil(null);
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
      setRestUntil(null);
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
      patchActive((d) => ({ ...d, entries: d.entries.filter((e) => e.id !== entryId) }));
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
          warmup: false,
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
      setS((p) => ({ ...p, exercises: p.exercises.filter((x) => x.id !== id) }));
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
        bodyweight: [...p.bodyweight.filter((x) => x.date !== date), rec].sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
      }));
    },
    async deleteBodyWeight(date: string) {
      await store.del.bodyweight(date);
      setS((p) => ({ ...p, bodyweight: p.bodyweight.filter((x) => x.date !== date) }));
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
