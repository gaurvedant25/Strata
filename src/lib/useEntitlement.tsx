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
import { useAuth } from "../auth";
import { supabase } from "./supabase";
import {
  FREE,
  can as canDo,
  canWrite,
  fromRow,
  resolve,
  type Entitlement,
  type ProFeature,
  type ProRecord,
} from "./entitlement";

/**
 * The Pro preview, fetched, cached and kept honest about time.
 *
 * The server row is the only source of truth. What is kept on the device is a
 * cache with two jobs: keep a preview working on a train, and keep the app from
 * flashing "free" for a moment on every cold start. It is never allowed to
 * *create* a preview or to extend one — the only thing that can do either is
 * `start_pro_preview()`, and it needs a network.
 *
 * Time is the other half. `get_entitlement()` hands back the database's own
 * clock alongside the row, so remaining time is measured against that and not
 * against the phone. The offset is cached with the row, and a high-water mark
 * stops the clock being wound backwards while offline. Between them, moving the
 * device clock in either direction changes what the app shows by nothing.
 */

const CACHE = (uid: string) => `strata.pro.${uid}`;
const NOTICE = (uid: string) => `strata.pro.notice.${uid}`;
/** Shared with nothing else: the furthest forward this app has ever seen time. */
const CLOCK_SEEN = "strata.clockSeen";

/**
 * How long to wait before retrying a preview start that did not land, and how
 * far that wait is allowed to grow.
 *
 * A server that is refusing — the migration has not been run, the project is
 * down — should be asked again, but not once a minute forever. The wait doubles
 * on each failure up to a quarter of an hour, and resets the moment one
 * succeeds.
 */
const RETRY_MS = 30_000;
const RETRY_MAX_MS = 900_000;

/** The floor between two reads of the entitlement, whatever asks for one. */
const REFRESH_MS = 15_000;

/**
 * A verified reading from the server, which outranks whatever the device
 * believed about the time.
 *
 * The high-water mark in `serverNow` exists to stop a phone being wound
 * backwards out of an expiry. Only raising it made one wind *forwards*
 * permanent: a date set to next year wrote next year into the mark, and
 * correcting the clock afterwards could not bring it down again — the offset
 * recovered, the mark did not, and the preview read as expired for good. The
 * database's own clock is the one thing entitled to settle the question, so a
 * fresh reading replaces the mark rather than competing with it.
 */
function settleClock(serverMs: number) {
  try {
    localStorage.setItem(CLOCK_SEEN, String(serverMs));
  } catch {
    // Nothing to settle if there is nowhere to write it down.
  }
}

type Cached = { record: ProRecord | null; offset: number; at: number };

/** Which of the three one-time messages this account has already been shown. */
type Notices = {
  unlockShown: boolean;
  finalDismissed: boolean;
  expiryDismissed: boolean;
};

const NO_NOTICES: Notices = {
  unlockShown: false,
  finalDismissed: false,
  expiryDismissed: false,
};

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // Private mode, blocked storage, or something else's JSON under our key.
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A cache that cannot be written just means a round trip next launch.
  }
}

/**
 * Now, corrected to the server and not allowed to go backwards.
 *
 * `offset` is what the server's clock read minus what this device's read, at
 * the moment they were compared. `base` is this device's reading, passed in
 * rather than taken here so that the entitlement is a pure function of its
 * inputs and recomputes exactly when they change.
 *
 * The high-water mark is the floor: winding the device clock back while offline
 * moves `Date.now()` back, and this refuses to follow it.
 */
function serverNow(offset: number, base: number): number {
  const t = base + offset;
  let seen = 0;
  try {
    seen = Number(localStorage.getItem(CLOCK_SEEN) ?? 0) || 0;
  } catch {
    /* see readJson */
  }
  const v = Math.max(t, seen);
  if (v !== seen)
    try {
      localStorage.setItem(CLOCK_SEEN, String(v));
    } catch {
      /* see writeJson */
    }
  return v;
}

type Ctx = {
  ent: Entitlement;
  /** True until the first answer — server or cache — has landed. */
  loading: boolean;
  /** True when running on the cache because the server could not be reached. */
  offline: boolean;
  /** False when signed out, where there is no account to hold a preview. */
  signedIn: boolean;
  notices: Notices;
  can: (f: ProFeature) => boolean;
  /** Start the one preview this account gets. Safe to call repeatedly. */
  startPreview: () => Promise<void>;
  /**
   * Offer a value to the server as an unlock code.
   *
   * Returns true when it was one, which is the caller's signal to swallow
   * whatever the user was typing rather than acting on it. The client never
   * learns what the code is — it hands over what was typed and is told yes or
   * no — so nothing about it can be read out of the bundle.
   */
  redeem: (code: string) => Promise<boolean>;
  /** Re-read the row. `force` skips the rate limit, for after a purchase. */
  /**
   * Re-read the entitlement, and hand back what it resolved to.
   *
   * The return value is the point. A caller that awaits a refresh and then
   * reads `ent` is reading the render it was called from, which by definition
   * predates the answer — so "check again" could fetch a live subscription and
   * still see `pro: false`. Null means nothing was read: no account, no
   * backend, a throttled call, or a request that did not land.
   */
  refresh: (force?: boolean) => Promise<Entitlement | null>;
  markNotice: (k: keyof Notices) => void;
};

const C = createContext<Ctx | null>(null);

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const uid = auth.session?.user.id ?? null;

  const [record, setRecord] = useState<ProRecord | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [notices, setNotices] = useState<Notices>(NO_NOTICES);
  // The device clock, re-read on a timer so the countdown in Settings and the
  // final-day notice arrive without the user having to navigate. A minute is
  // finer than anything on screen needs and cheap enough not to matter.
  const [clock, setClock] = useState(() => Date.now());
  const starting = useRef(false);
  const lastTry = useRef(0);
  const backoff = useRef(RETRY_MS);
  const lastFetch = useRef(0);

  /** Load whatever is cached for this account, before any network happens. */
  useEffect(() => {
    if (!uid) {
      setRecord(null);
      setOffset(0);
      setNotices(NO_NOTICES);
      setLoading(false);
      setOffline(false);
      return;
    }
    /*
     * Whose account this is decides everything below, so nothing survives the
     * change of it.
     *
     * The record is cleared rather than merely overwritten when there is a
     * cache: an account with none used to inherit whatever was in state, which
     * on a shared phone meant the second person to sign in was shown the first
     * one's plan until a fetch landed. And the fetch floor is a ref, so it
     * outlives the account it was armed by — left alone, signing into a second
     * account within fifteen seconds skipped its one read on sign-in.
     */
    const cached = readJson<Cached>(CACHE(uid));
    setRecord(cached?.record ?? null);
    setOffset(cached?.offset ?? 0);
    lastFetch.current = 0;
    setNotices(readJson<Notices>(NOTICE(uid)) ?? NO_NOTICES);
    setLoading(!cached);
  }, [uid]);

  const refresh = useCallback(async (force = false): Promise<Entitlement | null> => {
    if (!uid || !supabase) return null;
    // Several things can ask at once — mount, coming back to the foreground,
    // a finished purchase. One answer a quarter of a minute is plenty for a
    // fact that changes once a week.
    if (!force && Date.now() - lastFetch.current < REFRESH_MS) return null;
    const previous = lastFetch.current;
    lastFetch.current = Date.now();
    try {
      const { data, error } = await supabase.rpc("get_entitlement");
      if (error) throw error;
      const payload = data as {
        server_now: string;
        entitlement: Record<string, unknown> | null;
      };
      const next = fromRow(payload.entitlement);
      const serverMs = Date.parse(payload.server_now);
      const dated = Number.isFinite(serverMs);
      const drift = dated ? serverMs - Date.now() : 0;
      // Before anything is resolved against it: the mark and the offset have
      // to agree, or the reading below is taken against the old one.
      if (dated) settleClock(serverMs);
      setRecord(next);
      setOffset(drift);
      setOffline(false);
      writeJson(CACHE(uid), {
        record: next,
        offset: drift,
        at: Date.now(),
      } satisfies Cached);
      return resolve(next, serverNow(drift, Date.now()));
    } catch {
      /*
       * A failed read is not a read.
       *
       * The floor above exists to space out *answers*, and counting an attempt
       * that never landed as one is what made the retry pointless: a request
       * that failed offline armed the throttle, so the `online` listener
       * firing three seconds later was turned away and the app sat in its
       * offline state until something else happened to ask. Putting the clock
       * back is what lets that listener do its job.
       *
       * The cache carries on meanwhile. An unreachable server must never look
       * like an expiry, and must never look like a fresh preview either.
       */
      lastFetch.current = previous;
      setOffline(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Coming back to a backgrounded app is when a phone left overnight finds out
  // the preview ended, and when a device that was offline gets its answer.
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState !== "visible") return;
      // Coming back may be hours later, so the clock is re-read here too rather
      // than waiting up to a minute for the next tick.
      setClock(Date.now());
      void refresh();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("online", onShow);
    const id = setInterval(() => setClock(Date.now()), 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("online", onShow);
      clearInterval(id);
    };
  }, [refresh]);

  /**
   * Ask the server to start the preview.
   *
   * Nothing is written locally on the way in, so a call that fails leaves the
   * account exactly as it was: still eligible, still un-consumed, and it will
   * be tried again on the next launch or the next completed workout. The guards
   * are only there to stop a burst of calls, never to record a result.
   */
  const startPreview = useCallback(async () => {
    if (!uid || !supabase || starting.current) return;
    if (Date.now() - lastTry.current < backoff.current) return;
    starting.current = true;
    lastTry.current = Date.now();
    try {
      const { data, error } = await supabase.rpc("start_pro_preview");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const next = fromRow(row as Record<string, unknown> | null);
      if (next) {
        backoff.current = RETRY_MS;
        setRecord(next);
        setOffline(false);
        writeJson(CACHE(uid), { record: next, offset, at: Date.now() });
      } else {
        // The call came back with nothing useful; re-read rather than guess.
        await refresh(true);
      }
    } catch {
      // Nothing was written locally on the way in, so the account is still
      // eligible and still un-consumed — this only decides how long to wait.
      backoff.current = Math.min(backoff.current * 2, RETRY_MAX_MS);
      setOffline(true);
    } finally {
      starting.current = false;
    }
  }, [uid, offset, refresh]);

  const redeem = useCallback(
    async (code: string) => {
      if (!uid || !supabase) return false;
      try {
        const { data, error } = await supabase.rpc("redeem_unlock", { code });
        if (error) throw error;
        if (data !== true) return false;
        await refresh(true);
        return true;
      } catch {
        // A refused or unreachable server means "not a code", which is also
        // what a wrong code means. The caller carries on with the ordinary
        // path, so nothing is lost by the network being down.
        return false;
      }
    },
    [uid, refresh],
  );

  const markNotice = useCallback(
    (k: keyof Notices) => {
      setNotices((prev) => {
        if (prev[k]) return prev;
        const next = { ...prev, [k]: true };
        if (uid) writeJson(NOTICE(uid), next);
        return next;
      });
    },
    [uid],
  );

  const ent = useMemo(
    () => (uid ? resolve(record, serverNow(offset, clock)) : FREE),
    [uid, record, offset, clock],
  );

  const value = useMemo<Ctx>(
    () => ({
      ent,
      loading,
      offline,
      signedIn: !!uid,
      notices,
      can: (f) => canDo(ent, f),
      startPreview,
      redeem,
      refresh,
      markNotice,
    }),
    [ent, loading, offline, uid, notices, startPreview, redeem, refresh, markNotice],
  );

  return <C.Provider value={value}>{children}</C.Provider>;
}

/**
 * Wrap an action so it asks for Pro instead of happening.
 *
 * One line per call site — `onClick={guard(() => s.logBodyWeight(...))}` — so
 * that gating a new action is a change at the action rather than a new
 * conditional wrapped around the control. Every screen then behaves the same
 * way: the control stays visible and pressable, and pressing it gives an
 * answer rather than doing nothing.
 *
 * Deliberately returns the original function untouched when writing is allowed,
 * so the free path costs nothing and reads identically.
 */
export function useWriteGate(onLocked: () => void) {
  const { ent } = useEntitlement();
  const allowed = canWrite(ent);
  return {
    canWrite: allowed,
    guard<A extends unknown[]>(fn: (...args: A) => void) {
      return allowed
        ? fn
        : (() => {
            onLocked();
          }) as (...args: A) => void;
    },
  };
}

export function useEntitlement() {
  const v = useContext(C);
  if (!v) throw new Error("useEntitlement must be used inside <EntitlementProvider>");
  return v;
}
