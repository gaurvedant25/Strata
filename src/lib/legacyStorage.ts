/**
 * Moves what this device remembers from the app's old name to its new one.
 *
 * Before it was Strata the app was called Gym Log, and every preference it
 * kept in `localStorage` was filed under a `gymlog.` prefix — whether you had
 * finished onboarding, which lift Progress opens on, the cached Pro state, the
 * split's next day. The keys are `strata.` now, and this runs once at start-up,
 * before anything reads them, so an existing install keeps every one of those
 * answers instead of starting over.
 *
 * A key that already exists under the new name wins: that is the newer answer.
 * The old key is removed either way, so this is a no-op from the second launch
 * on. The database moves separately, in `db.ts`.
 *
 * Imported for its side effect as the first line of `main.tsx`.
 */

const OLD_PREFIX = "gymlog.";
const NEW_PREFIX = "strata.";
/** Keys from before the rename that did not use the old prefix. */
const MOVED: Record<string, string> = {
  "gym:swipe-hint-seen": "strata.swipeHintSeen",
};

function adoptLegacyKeys() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    for (const k of keys) {
      const to = k.startsWith(OLD_PREFIX)
        ? NEW_PREFIX + k.slice(OLD_PREFIX.length)
        : MOVED[k];
      if (!to) continue;
      const v = localStorage.getItem(k);
      if (v != null && localStorage.getItem(to) == null) localStorage.setItem(to, v);
      localStorage.removeItem(k);
    }
  } catch {
    /* Storage is off or full. Nothing was moved, and nothing was lost. */
  }
}

adoptLegacyKeys();
