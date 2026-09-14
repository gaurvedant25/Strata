import { useEffect, useRef, useState } from "react";

/** Every dialog currently open, outermost first. */
const dialogStack: symbol[] = [];

/**
 * What makes an overlay in this app an actual dialog.
 *
 * The sheets, the number pad and the confirmation were all a stack of divs: no
 * role, nothing tying them to a name, no way to leave them from a keyboard, and
 * focus left sitting on whatever was behind them — so a screen reader announced
 * the page underneath and Escape did nothing. Each one now:
 *
 *  - locks the page behind it from scrolling,
 *  - takes focus when it opens and hands it back to whatever opened it,
 *  - keeps keyboard focus inside the topmost dialog,
 *  - closes on Escape.
 *
 * `onClose` is held in a ref rather than listed as a dependency, because every
 * call site passes an inline arrow — as a dependency it would be a new function
 * each render, tearing the listener down and stealing focus back on every tick
 * of the workout clock.
 */
export function useDialog(open: boolean, onClose: () => void) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  // Refreshed in an effect rather than assigned during render, which would be
  // a write to a ref mid-render.
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const restore = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();

    // Dialogs stack: the discard confirmation opens on top of the finish
    // sheet. Only the one on top may act on Escape — every open dialog
    // listens on `document`, and stopping propagation there does not stop a
    // sibling listener on the same node, so pressing Escape once tore down
    // the whole stack and dropped you out of both at a stroke. Escape should
    // hand the confirmation back to the sheet that raised it.
    const me = Symbol("dialog");
    dialogStack.push(me);

    const onKey = (e: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== me) return;
      if (e.key === "Escape") {
        close.current();
        return;
      }
      if (e.key !== "Tab") return;

      const root = panel.current;
      if (!root) return;
      const focusable = [...root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((element) =>
        element.getClientRects().length > 0 &&
        element.getAttribute("aria-hidden") !== "true",
      );
      if (!focusable.length) {
        e.preventDefault();
        root.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = dialogStack.lastIndexOf(me);
      if (i !== -1) dialogStack.splice(i, 1);
      // Only the last one out unlocks the page: an inner dialog closing must
      // not hand scrolling back to a page still covered by an outer one.
      if (!dialogStack.length) document.body.style.overflow = prev;
      restore?.focus?.();
    };
  }, [open]);

  return panel;
}

/**
 * How long a dialog is given to animate out. Deliberately shorter than the
 * 135ms it takes to arrive: a dialog opening is the system presenting
 * something and can afford to be unhurried, a dialog closing is the system
 * getting out of the way and should be brisk.
 */
export const EXIT_MS = 110;

/**
 * Keeps a dialog mounted long enough to animate out.
 *
 * Every overlay in the app used to arrive over 135ms and then vanish between
 * two frames — the sheet, its scrim and the blur behind it all cut out at
 * once, which reads as the screen flashing rather than as the sheet leaving.
 * `present` stays true through the exit so the closing styles have something
 * to run on, and `closing` is what selects them.
 *
 * Returns `present` immediately on open, so nothing is delayed on the way in.
 */
export function usePresence(open: boolean, exitMs = EXIT_MS) {
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  // Derived during render rather than in an effect.
  //
  // The render in which `open` flips to false is the one that decides whether
  // the dialog stays mounted, and an effect does not run until after that
  // render has committed — by which point the panel has already been torn out
  // of the document and there is nothing left to animate. Adjusting state
  // during render is React's own answer to this: the condition below stops
  // being true as soon as it has run once.
  if (wasOpen !== open) {
    setWasOpen(open);
    setClosing(!open);
  }

  // Ends the exit. Guarded on `closing` so clearing it cannot reschedule
  // itself, and cleaned up on the way out so reopening mid-exit cancels the
  // pending unmount instead of letting it fire underneath the new dialog.
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => setClosing(false), exitMs);
    return () => clearTimeout(t);
  }, [closing, exitMs]);

  return { present: open || closing, closing };
}
