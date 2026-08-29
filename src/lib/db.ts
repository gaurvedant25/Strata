import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { BodyWeight, Exercise, Routine, Session, Settings } from "../types";
import { DEFAULT_SETTINGS } from "../types";

interface GymDB extends DBSchema {
  exercises: { key: string; value: Exercise };
  routines: { key: string; value: Routine };
  sessions: { key: string; value: Session; indexes: { by_date: string } };
  bodyweight: { key: string; value: BodyWeight };
  meta: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<GymDB>> | null = null;

export function db() {
  if (!dbp) {
    dbp = openDB<GymDB>("gymlog", 1, {
      upgrade(d) {
        d.createObjectStore("exercises", { keyPath: "id" });
        d.createObjectStore("routines", { keyPath: "id" });
        const s = d.createObjectStore("sessions", { keyPath: "id" });
        s.createIndex("by_date", "date");
        d.createObjectStore("bodyweight", { keyPath: "date" });
        d.createObjectStore("meta");
      },
    });
  }
  return dbp;
}

export async function loadAll() {
  const d = await db();
  const [exercises, routines, sessions, bodyweight, settings, activeId] = await Promise.all([
    d.getAll("exercises"),
    d.getAll("routines"),
    d.getAll("sessions"),
    d.getAll("bodyweight"),
    d.get("meta", "settings") as Promise<Settings | undefined>,
    d.get("meta", "activeSessionId") as Promise<string | undefined>,
  ]);
  return {
    exercises,
    routines,
    sessions: sessions.sort((a, b) => b.startedAt - a.startedAt),
    bodyweight: bodyweight.sort((a, b) => a.date.localeCompare(b.date)),
    settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) } as Settings,
    activeSessionId: activeId ?? null,
  };
}

export const put = {
  exercise: async (v: Exercise) => (await db()).put("exercises", v),
  routine: async (v: Routine) => (await db()).put("routines", v),
  session: async (v: Session) => (await db()).put("sessions", v),
  bodyweight: async (v: BodyWeight) => (await db()).put("bodyweight", v),
  settings: async (v: Settings) => (await db()).put("meta", v, "settings"),
  activeSessionId: async (v: string | null) => (await db()).put("meta", v, "activeSessionId"),
};

export const del = {
  exercise: async (id: string) => (await db()).delete("exercises", id),
  routine: async (id: string) => (await db()).delete("routines", id),
  session: async (id: string) => (await db()).delete("sessions", id),
  bodyweight: async (date: string) => (await db()).delete("bodyweight", date),
};

export type Backup = {
  format: "gymlog";
  version: 1;
  exportedAt: string;
  exercises: Exercise[];
  routines: Routine[];
  sessions: Session[];
  bodyweight: BodyWeight[];
  settings: Settings;
};

export async function exportBackup(): Promise<Backup> {
  const all = await loadAll();
  return {
    format: "gymlog",
    version: 1,
    exportedAt: new Date().toISOString(),
    exercises: all.exercises,
    routines: all.routines,
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
  const tx = d.transaction(["exercises", "routines", "sessions", "bodyweight", "meta"], "readwrite");
  for (const e of b.exercises ?? []) tx.objectStore("exercises").put(e);
  for (const r of b.routines ?? []) tx.objectStore("routines").put(r);
  for (const s of b.sessions ?? []) tx.objectStore("sessions").put(s);
  for (const w of b.bodyweight ?? []) tx.objectStore("bodyweight").put(w);
  if (b.settings) tx.objectStore("meta").put(b.settings, "settings");
  await tx.done;
}

export async function wipe() {
  const d = await db();
  const tx = d.transaction(["exercises", "routines", "sessions", "bodyweight", "meta"], "readwrite");
  await Promise.all([
    tx.objectStore("exercises").clear(),
    tx.objectStore("routines").clear(),
    tx.objectStore("sessions").clear(),
    tx.objectStore("bodyweight").clear(),
    tx.objectStore("meta").clear(),
    tx.done,
  ]);
}
