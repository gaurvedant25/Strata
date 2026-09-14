import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  BodyWeight,
  Exercise,
  Routine,
  Session,
  Settings,
  Split,
} from "../types";
import { DEFAULT_SETTINGS } from "../types";

interface GymDB extends DBSchema {
  exercises: { key: string; value: Exercise };
  routines: { key: string; value: Routine };
  splits: { key: string; value: Split };
  sessions: { key: string; value: Session; indexes: { by_date: string } };
  bodyweight: { key: string; value: BodyWeight };
  meta: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<GymDB>> | null = null;

export function db() {
  if (!dbp) {
    dbp = openDB<GymDB>("gymlog", 3, {
      // Each step is guarded by oldVersion so an existing database only runs
      // the steps it has not seen. Routines created before v2 have no splitId;
      // they are adopted into a split on load rather than here, since that
      // needs to look at them as a set.
      upgrade(d, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          d.createObjectStore("exercises", { keyPath: "id" });
          d.createObjectStore("routines", { keyPath: "id" });
          const s = d.createObjectStore("sessions", { keyPath: "id" });
          s.createIndex("by_date", "date");
          d.createObjectStore("bodyweight", { keyPath: "date" });
          d.createObjectStore("meta");
        }
        if (oldVersion < 2) {
          d.createObjectStore("splits", { keyPath: "id" });
        }
        if (oldVersion < 3) {
          // Records written before accounts existed carry no updatedAt, and
          // sync only pushes rows newer than the last mark — which for a first
          // sync is zero. Left alone, everything logged before signing in would
          // be judged "not newer than nothing" and silently never upload.
          // Backfilling from whatever timestamp each record already has keeps
          // their relative order rather than flattening them all to now.
          for (const name of [
            "exercises",
            "routines",
            "splits",
            "sessions",
            "bodyweight",
          ] as const) {
            const store = tx.objectStore(name) as unknown as {
              openCursor(): Promise<{
                value: Record<string, unknown>;
                update(v: unknown): Promise<unknown>;
                continue(): Promise<unknown>;
              } | null>;
            };
            void store.openCursor().then(function walk(cursor): unknown {
              if (!cursor) return;
              const v = cursor.value;
              if (v.updatedAt == null) {
                const born = v.startedAt ?? v.createdAt ?? v.at ?? Date.now();
                void cursor.update({ ...v, updatedAt: Number(born) });
              }
              return (cursor.continue() as Promise<unknown>).then(
                walk as never,
              );
            });
          }
        }
      },
    });
  }
  return dbp;
}

export async function loadAll() {
  const d = await db();
  const [
    exercises,
    routines,
    splits,
    sessions,
    bodyweight,
    settings,
    activeId,
    splitId,
    pendingCompletionId,
  ] = await Promise.all([
    d.getAll("exercises"),
    d.getAll("routines"),
    d.getAll("splits"),
    d.getAll("sessions"),
    d.getAll("bodyweight"),
    d.get("meta", "settings") as Promise<Settings | undefined>,
    d.get("meta", "activeSessionId") as Promise<string | undefined>,
    d.get("meta", "activeSplitId") as Promise<string | undefined>,
    d.get("meta", "pendingCompletionId") as Promise<string | undefined>,
  ]);
  return {
    exercises: live(exercises),
    // days keep the order they were created in, which is the order of the split
    routines: live(routines).sort((a, b) => a.createdAt - b.createdAt),
    splits: live(splits).sort((a, b) => a.createdAt - b.createdAt),
    sessions: live(sessions).sort((a, b) => b.startedAt - a.startedAt),
    bodyweight: live(bodyweight).sort((a, b) => a.date.localeCompare(b.date)),
    settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) } as Settings,
    activeSessionId: activeId ?? null,
    activeSplitId: splitId ?? null,
    pendingCompletionId: pendingCompletionId ?? null,
  };
}

/**
 * Every exercise id in the store, tombstones included.
 *
 * `loadAll` hides buried rows, which is right for everything that reads the
 * library but wrong for deciding what to add to it: an exercise somebody
 * deleted would look absent and be written back on the next launch. This is the
 * question "has this row ever existed here", which is the one topping the
 * library up actually needs to ask.
 */
export async function allExerciseIds(): Promise<string[]> {
  return (await (await db()).getAllKeys("exercises")) as string[];
}

/**
 * Every exercise row, tombstones included.
 *
 * Repointing an old reference needs the buried rows as well as the living
 * ones: a routine written against a copy that was deleted long ago still holds
 * that id, and the only way left to work out what it meant is to read the name
 * off the tombstone.
 */
export async function allExercises(): Promise<Exercise[]> {
  return (await db()).getAll("exercises");
}

/**
 * Every write is stamped, so a record always knows when it last changed and
 * sync has something to compare. Doing it here rather than at each call site
 * means no screen can forget to.
 */
const stamp = <T extends object>(v: T): T & { updatedAt: number } => ({
  ...v,
  updatedAt: Date.now(),
});

/**
 * Marks an active session complete without closing it, so the celebration can
 * survive a reload. The pending id distinguishes this from reopening an old
 * historical workout for editing.
 */
export async function markSessionComplete(session: Session) {
  const d = await db();
  const tx = d.transaction(["sessions", "meta"], "readwrite");
  await Promise.all([
    tx.objectStore("sessions").put(stamp(session)),
    tx.objectStore("meta").put(session.id, "pendingCompletionId"),
    tx.done,
  ]);
}

/** Close a workout and its pending celebration as one durable operation. */
export async function commitFinishedSession(session: Session) {
  const d = await db();
  const tx = d.transaction(["sessions", "meta"], "readwrite");
  await Promise.all([
    tx.objectStore("sessions").put(stamp(session)),
    tx.objectStore("meta").put(null, "activeSessionId"),
    tx.objectStore("meta").put(null, "pendingCompletionId"),
    tx.done,
  ]);
}

/** Undo only an automatic completion; the active workout stays open. */
export async function reopenPendingSession(session: Session) {
  const d = await db();
  const tx = d.transaction(["sessions", "meta"], "readwrite");
  await Promise.all([
    tx.objectStore("sessions").put(stamp(session)),
    tx.objectStore("meta").put(null, "pendingCompletionId"),
    tx.done,
  ]);
}

export const put = {
  exercise: async (v: Exercise) => (await db()).put("exercises", stamp(v)),
  routine: async (v: Routine) => (await db()).put("routines", stamp(v)),
  split: async (v: Split) => (await db()).put("splits", stamp(v)),
  session: async (v: Session) => (await db()).put("sessions", stamp(v)),
  bodyweight: async (v: BodyWeight) => (await db()).put("bodyweight", stamp(v)),
  settings: async (v: Settings) =>
    (await db()).put("meta", stamp(v), "settings"),
  activeSessionId: async (v: string | null) =>
    (await db()).put("meta", v, "activeSessionId"),
  activeSplitId: async (v: string | null) =>
    (await db()).put("meta", v, "activeSplitId"),
  pendingCompletionId: async (v: string | null) =>
    (await db()).put("meta", v, "pendingCompletionId"),
};

/**
 * Deletes leave a tombstone instead of removing the row.
 *
 * A row that simply disappears locally looks identical to one the server has
 * not seen yet, so the next pull would hand it straight back. Keeping a marker
 * with a newer timestamp is what lets a deletion win the same comparison an
 * edit would. Tombstones are filtered out of everything the app reads.
 */
const bury = async (
  store: "exercises" | "routines" | "splits" | "sessions",
  id: string,
) => {
  const d = await db();
  const prev = await d.get(store, id);
  if (!prev) return;
  await d.put(store, { ...prev, deleted: true, updatedAt: Date.now() });
};

export const del = {
  exercise: (id: string) => bury("exercises", id),
  routine: (id: string) => bury("routines", id),
  split: (id: string) => bury("splits", id),
  session: (id: string) => bury("sessions", id),
  bodyweight: async (date: string) => {
    const d = await db();
    const prev = await d.get("bodyweight", date);
    if (!prev) return;
    await d.put("bodyweight", {
      ...prev,
      deleted: true,
      updatedAt: Date.now(),
    });
  },
};

/** Rows the app should act as if it never had. */
const live = <T extends { deleted?: boolean }>(rows: T[]) =>
  rows.filter((r) => !r.deleted);

export type Backup = {
  format: "gymlog";
  version: 2;
  exportedAt: string;
  exercises: Exercise[];
  routines: Routine[];
  splits: Split[];
  sessions: Session[];
  bodyweight: BodyWeight[];
  settings: Settings;
};

export async function exportBackup(): Promise<Backup> {
  const all = await loadAll();
  return {
    format: "gymlog",
    version: 2,
    exportedAt: new Date().toISOString(),
    exercises: all.exercises,
    routines: all.routines,
    splits: all.splits,
    sessions: all.sessions,
    bodyweight: all.bodyweight,
    settings: all.settings,
  };
}

/** Merge-import: existing ids are overwritten, unknown ids added. Nothing is deleted. */
export async function importBackup(raw: unknown) {
  const b = raw as Partial<Backup>;
  if (!b || b.format !== "gymlog")
    throw new Error("Not a Gym Log backup file.");
  const d = await db();
  const tx = d.transaction(
    ["exercises", "routines", "splits", "sessions", "bodyweight", "meta"],
    "readwrite",
  );
  for (const e of b.exercises ?? []) tx.objectStore("exercises").put(e);
  for (const r of b.routines ?? []) tx.objectStore("routines").put(r);
  // absent in version 1 backups, whose routines get adopted into a split on load
  for (const sp of b.splits ?? []) tx.objectStore("splits").put(sp);
  for (const s of b.sessions ?? []) tx.objectStore("sessions").put(s);
  for (const w of b.bodyweight ?? []) tx.objectStore("bodyweight").put(w);
  if (b.settings) tx.objectStore("meta").put(b.settings, "settings");
  await tx.done;
}

export async function wipe() {
  const d = await db();
  const tx = d.transaction(
    ["exercises", "routines", "splits", "sessions", "bodyweight", "meta"],
    "readwrite",
  );
  await Promise.all([
    tx.objectStore("exercises").clear(),
    tx.objectStore("routines").clear(),
    tx.objectStore("splits").clear(),
    tx.objectStore("sessions").clear(),
    tx.objectStore("bodyweight").clear(),
    tx.objectStore("meta").clear(),
    tx.done,
  ]);
}
