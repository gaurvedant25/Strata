import { useSyncExternalStore } from "react";

/**
 * The time, for the few things on screen that show it moving.
 *
 * It used to live in the store and tick every second, which meant the whole
 * app — every screen, the body chart, the charts, the tab bar — rendered once
 * a second for the sake of one running clock in the workout pill. Measured in
 * development that was 10 to 70ms of main thread every second whether or not
 * anything was happening, and on a phone it landed as a regular hitch in
 * whatever you were scrolling or tapping.
 *
 * Now each thing that needs the time asks for it here, at the rate it actually
 * changes: a running timer every second, a streak or a "3 days ago" once a
 * minute. Only the component that asked renders when its clock ticks.
 *
 * One interval per rate, shared by everyone on it, and stopped when the last
 * of them unmounts.
 */
type Clock = {
  subscribe: (notify: () => void) => () => void;
  read: () => number;
};

const clocks = new Map<number, Clock>();

function makeClock(every: number): Clock {
  let now = Date.now();
  let id: number | undefined;
  const subs = new Set<() => void>();
  return {
    subscribe(notify) {
      subs.add(notify);
      if (id === undefined) {
        // A clock nobody was listening to has stopped; bring it up to date
        // before it starts again, so the first reading is not stale.
        now = Date.now();
        id = window.setInterval(() => {
          now = Date.now();
          for (const f of subs) f();
        }, every);
      }
      return () => {
        subs.delete(notify);
        if (!subs.size && id !== undefined) {
          window.clearInterval(id);
          id = undefined;
        }
      };
    },
    read: () => now,
  };
}

function clockFor(every: number): Clock {
  let c = clocks.get(every);
  if (!c) clocks.set(every, (c = makeClock(every)));
  return c;
}

export function useNow(every: number): number {
  const { subscribe, read } = clockFor(every);
  return useSyncExternalStore(subscribe, read);
}
