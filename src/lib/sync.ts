import { db } from "./db";
import { supabase } from "./supabase";
import type { Settings } from "../types";

/**
 * Two-way sync between this device's IndexedDB and the account's rows.
 *
 * The device stays the source of truth for reading: every screen reads
 * IndexedDB and never waits on the network, which is what keeps the app usable
 * in a gym with no signal. Sync is a background reconciliation on top of that,
 * not a data layer the UI sits on.
 *
 * Conflicts are resolved last-write-wins on `updatedAt`. That is the right
 * trade for a single-person training log — the realistic conflict is the same
 * person on a phone and a laptop, where the later edit is the one they meant —
 * and it is worth being explicit that it can still lose an edit: two devices
 * changing the same routine while both offline will keep only the later one.
 * It relies on device clocks agreeing to within a sensible margin.
 */

/** The stores that travel. `meta` holds device-local state and does not. */
const KINDS = [
  "exercises",
  "routines",
  "splits",
  "sessions",
  "bodyweight",
] as const;
type Kind = (typeof KINDS)[number];

/** Which field is the primary key in each store. */
const KEY: Record<Kind, string> = {
  exercises: "id",
  routines: "id",
  splits: "id",
  sessions: "id",
  bodyweight: "date",
};

type Row = {
  kind: string;
  id: string;
  updated_at: number;
  deleted: boolean;
  data: Record<string, unknown>;
};

export type SyncState = "off" | "idle" | "syncing" | "error";

/** Rows the server has not seen since we last pushed. */
async function localChanges(since: number) {
  const d = await db();
  const out: Row[] = [];
  for (const kind of KINDS) {
    const rows = (await d.getAll(kind)) as Record<string, unknown>[];
    for (const r of rows) {
      // A row with no timestamp at all has demonstrably never been through a
      // sync, so it is always a candidate to push. Comparing its missing value
      // as zero would instead bury it: nothing is newer than nothing, so it
      // would sit in the database looking fine and never leave the device.
      const stamped = r.updatedAt != null;
      const updatedAt = stamped ? Number(r.updatedAt) : Date.now();
      if (stamped && updatedAt <= since) continue;
      if (!stamped) {
        // Give it the timestamp it is being pushed with, so the next pass sees
        // a normal row rather than rediscovering this one every time.
        await (d.put as (s: string, v: unknown) => Promise<unknown>)(kind, {
          ...r,
          updatedAt,
        });
      }
      out.push({
        kind,
        id: String(r[KEY[kind]]),
        updated_at: updatedAt,
        deleted: Boolean(r.deleted),
        data: { ...r, updatedAt },
      });
    }
  }
  // Settings is a single row rather than a store, so it is carried by hand.
  const settings = (await d.get("meta", "settings")) as
    (Settings & { updatedAt?: number }) | undefined;
  if (settings && Number(settings.updatedAt ?? 0) > since) {
    out.push({
      kind: "settings",
      id: "settings",
      updated_at: Number(settings.updatedAt),
      deleted: false,
      data: settings as unknown as Record<string, unknown>,
    });
  }
  return out;
}

/** Applies a server row locally, unless what we have is newer. */
async function applyRemote(rows: Row[]) {
  const d = await db();
  for (const row of rows) {
    if (row.kind === "settings") {
      const cur = (await d.get("meta", "settings")) as
        { updatedAt?: number } | undefined;
      if (Number(cur?.updatedAt ?? 0) < row.updated_at) {
        await d.put(
          "meta",
          { ...row.data, updatedAt: row.updated_at },
          "settings",
        );
      }
      continue;
    }
    const kind = row.kind as Kind;
    if (!KINDS.includes(kind)) continue;
    const cur = (await d.get(kind, row.id)) as
      { updatedAt?: number } | undefined;
    // A tie goes to what is already here, so a re-pull of unchanged rows is a
    // no-op rather than a churn of identical writes.
    if (Number(cur?.updatedAt ?? 0) >= row.updated_at) continue;
    // The server round-trips whole records, so the shape is whatever this app
    // wrote; the store is keyed by the same field it was pushed under.
    const value = {
      ...row.data,
      updatedAt: row.updated_at,
      deleted: row.deleted,
    };
    await (d.put as (s: string, v: unknown) => Promise<unknown>)(kind, value);
  }
}

async function meta<T>(key: string): Promise<T | undefined> {
  return (await db()).get("meta", key) as Promise<T | undefined>;
}
async function setMeta(key: string, value: unknown) {
  await (await db()).put("meta", value, key);
}

/**
 * Clears every synced store.
 *
 * Signing in as somebody else on a shared device must not merge two people's
 * training into one account, so the local copy is dropped and repulled rather
 * than pushed.
 */
export async function clearLocalForAccountSwitch() {
  const d = await db();
  const tx = d.transaction([...KINDS, "meta"], "readwrite");
  await Promise.all([
    ...KINDS.map((k) => tx.objectStore(k).clear()),
    tx.objectStore("meta").delete("settings"),
    tx.objectStore("meta").delete("activeSessionId"),
    tx.objectStore("meta").delete("pendingCompletionId"),
    tx.objectStore("meta").delete("activeSplitId"),
    tx.objectStore("meta").delete("lastSyncedAt"),
    tx.done,
  ]);
}

/**
 * One full reconciliation: pull what changed on the server, push what changed
 * here, then remember the high-water mark.
 *
 * Pull runs first so that a local row which lost a conflict is overwritten
 * before it can be pushed back out.
 */
export async function syncNow(
  userId: string,
): Promise<{ pulled: number; pushed: number }> {
  if (!supabase) return { pulled: 0, pushed: 0 };

  const owner = await meta<string>("accountId");
  if (owner && owner !== userId) {
    await clearLocalForAccountSwitch();
  }
  await setMeta("accountId", userId);

  const since =
    owner === userId ? ((await meta<number>("lastSyncedAt")) ?? 0) : 0;

  const { data: remote, error: pullErr } = await supabase
    .from("gym_records")
    .select("kind,id,updated_at,deleted,data")
    .gt("updated_at", since);
  if (pullErr) throw pullErr;

  await applyRemote((remote ?? []) as Row[]);

  const mine = await localChanges(since);
  if (mine.length) {
    const { error: pushErr } = await supabase.from("gym_records").upsert(
      mine.map((r) => ({ ...r, user_id: userId })),
      { onConflict: "user_id,kind,id" },
    );
    if (pushErr) throw pushErr;
  }

  // The mark is taken from the data actually exchanged, never from this
  // device's clock: a device running fast would otherwise set a mark in the
  // future and skip everything written before it caught up.
  const seen = [
    ...(remote ?? []).map((r) => Number((r as Row).updated_at)),
    ...mine.map((r) => r.updated_at),
    since,
  ];
  await setMeta("lastSyncedAt", Math.max(...seen));

  return { pulled: (remote ?? []).length, pushed: mine.length };
}
