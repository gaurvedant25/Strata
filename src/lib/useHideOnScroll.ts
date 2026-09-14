import { useCallback, useEffect, useRef, useState } from "react";

/** How far down the page you must be before the bar is willing to leave. */
const HIDE_BELOW = 64;
/** Upward movement that brings it back. Small, so reaching for it always works. */
const REVEAL_BY = 6;
/** Downward movement before it goes, so a jittery finger does not flicker it. */
const HIDE_BY = 10;

const reduced = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Gives the bottom bar back to the content while you are reading.
 *
 * Direction rather than position decides: scrolling down past the top of the
 * page sends it away, and any upward movement at all brings it straight back —
 * asymmetric on purpose. Going down you have chosen to read, and the chrome is
 * in the way; going up is very often someone reaching for the bar itself, and
 * making them earn it by scrolling a set distance is how this pattern gets
 * annoying. It also never hides near the top, where there is nothing to gain.
 *
 * The transform is written straight to the element. A scroll handler that set
 * state would re-render the whole app on every frame of every scroll, which is
 * the most expensive thing this app could possibly do with a finger down.
 *
 * What it hands back is a callback ref rather than a ref object, because the
 * bar is not on screen for the whole life of the app: the logger, onboarding
 * and sign-in each replace it outright. A ref object read once inside an effect
 * is whatever it was at that moment — null, for any of those — and the effect
 * has no reason to run again when the bar comes back, so the listener would
 * never be attached. Storing the node in state means mounting the bar is itself
 * the thing that starts the listening.
 *
 * Under reduced motion the bar simply stays put: hiding it is a position change
 * and nothing else, so there is no gentler version to fall back to — only the
 * choice not to move it.
 */
export function useHideOnScroll(enabled = true) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const hidden = useRef(false);

  useEffect(() => {
    if (!node || !enabled || reduced()) return;

    let lastY = window.scrollY;
    let queued = false;

    const apply = () => {
      queued = false;
      const y = window.scrollY;
      const dy = y - lastY;

      if (y <= HIDE_BELOW) {
        // Near the top there is nothing to reclaim, and a bar that flickers as
        // you settle at the top of a screen reads as a bug.
        if (hidden.current) show();
        lastY = y;
        return;
      }
      if (dy > HIDE_BY && !hidden.current) hide();
      else if (dy < -REVEAL_BY && hidden.current) show();
      // Only move the reference when it actually moved, or a slow drift never
      // accumulates enough to cross either threshold.
      if (Math.abs(dy) > REVEAL_BY) lastY = y;
    };

    const show = () => {
      hidden.current = false;
      node.style.transform = "translateY(0)";
    };
    const hide = () => {
      hidden.current = true;
      // Its own height, whatever that is — the pill above the bar comes and
      // goes with the workout, so this is never a number we could hardcode.
      node.style.transform = "translateY(100%)";
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(apply);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      node.style.transform = "translateY(0)";
      hidden.current = false;
    };
  }, [node, enabled]);

  return useCallback((next: HTMLDivElement | null) => setNode(next), []);
}
