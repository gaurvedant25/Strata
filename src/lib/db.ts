import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { BodyWeight, Exercise, Routine, Session, Settings, Split } from "../types";
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
    dbp = openDB<GymDB>("gymlog", 2, {
      // Each step is guarded by oldVersion so an existing database only runs
      // the steps it has not seen. Routines created before v2 have no splitId;
      // they are adopted into a split on load rather than here, since that
      // needs to look at them as a set.
      upgrade(d, oldVersion) {
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
      },
    });
  }
  return dbp;
}

export async function loadAll() {
  const d = await db();
  const [exercises, routines, splits, sessions, bodyweight, settings, activeId, splitId] =
    await Promise.all([
      d.getAll("exercises"),
      d.getAll("routines"),
      d.getAll("splits"),
      d.getAll("sessions"),
      d.getAll("bodyweight"),
      d.get("meta", "settings") as Promise<Settings | undefined>,
      d.get("meta", "activeSessionId") as Promise<string | undefined>,
      d.get("meta", "activeSplitId") as Promise<string | undefined>,
    ]);
  return {
    exercises,
    // days keep the order they were created in, which is the order of the split
    routines: routines.sort((a, b) => a.createdAt - b.createdAt),
    splits: splits.sort((a, b) => a.createdAt - b.createdAt),
    sessions: sessions.sort((a, b) => b.startedAt - a.startedAt),
    bodyweight: bodyweight.sort((a, b) => a.date.localeCompare(b.date)),
    settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) } as Settings,
    activeSessionId: activeId ?? null,
    activeSplitId: splitId ?? null,
  };
}

export const put = {
  exercise: async (v: Exercise) => (await db()).put("exercises", v),
  routine: async (v: Routine) => (await db()).put("routines", v),
  split: async (v: Split) => (await db()).put("splits", v),
  session: async (v: Session) => (await db()).put("sessions", v),
  bodyweight: async (v: BodyWeight) => (await db()).put("bodyweight", v),
  settings: async (v: Settings) => (await db()).put("meta", v, "settings"),
  activeSessionId: async (v: string | null) => (await db()).put("meta", v, "activeSessionId"),
  activeSplitId: async (v: string | null) => (await db()).put("meta", v, "activeSplitId"),
};

export const del = {
  exercise: async (id: string) => (await db()).delete("exercises", id),
  routine: async (id: string) => (await db()).delete("routines", id),
  split: async (id: string) => (await db()).delete("splits", id),
  session: async (id: string) => (await db()).delete("sessions", id),
  bodyweight: async (date: string) => (await db()).delete("bodyweight", date),
};

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
  if (!b || b.format !== "gymlog") throw new Error("Not a Gym Log backup file.");
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
