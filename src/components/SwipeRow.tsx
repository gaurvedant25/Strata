import { animate } from "motion";
import { useRef, type ReactNode } from "react";
import { cls } from "../lib/util";
import { FLICK, rubberband, velocityOf } from "../lib/gesture";
import { Swap, Trash } from "./icons";

const reduced = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * How far the row has to be pulled before letting go acts on it.
 *
 * A fraction of the row rather than a fixed distance, so the gesture asks for
 * the same share of the screen on every phone — but floored, because on a
 * narrow device a third of the row is short enough to reach by accident while
 * dragging a thumb down the list.
 */
const COMMIT = (width: number) => Math.max(112, width * 0.34);

/**
 * Before this much movement the drag has not declared itself, and the finger is
 * still free to be scrolling the page instead.
 */
const SLOP = 8;

/**
 * Pointer capture, which is what keeps a fast drag attached to the row after
 * the finger has outrun it — wrapped because both halves throw if the pointer
 * is no longer one the browser is tracking, and a drag that ends with an
 * exception leaves the row stranded mid-swipe.
 */
function capture(el: Element, id: number, on: boolean) {
  try {
    if (on) el.setPointerCapture(id);
    else el.releasePointerCapture(id);
  } catch {
    /* The pointer is already gone; there is nothing to hold or hand back. */
  }
}

/**
 * A row with an action on each side of it.
 *
 * Pull it left and a red panel opens behind it; let go past the commit point —
 * or flick, which counts on its own — and the row carries on off the edge and
 * the list closes the gap behind it. Pull it right and a white panel opens
 * instead, and committing hands the row to `onReplace` and springs it back,
 * because that action opens a sheet rather than destroying anything: the row is
 * still there, waiting to be told what it should be. Anything short of a commit
 * springs back carrying the speed the finger had at release, so an abandoned
 * swipe reads as the row returning rather than as the interface resetting.
 *
 * The two colours are the whole explanation of which side does what. Red is
 * the only destructive colour in the app and white is the colour of every
 * button that proceeds — the same pair as the Log set button and the Remove
 * confirmation — so the sides do not need to be learned so much as recognised.
 * Each panel arrives gradually and is at full strength exactly at the commit
 * point, which makes the colour the progress indicator: when it is solid,
 * letting go acts.
 *
 * The panels are drawn, never tapped. The gesture is an enhancement, never the
 * only route — which is why nothing here announces itself to assistive
 * technology: VoiceOver claims horizontal swipes for its own navigation, so
 * advertising one would be advertising something that cannot be performed.
 * `touch-action: pan-y` leaves vertical scrolling to the browser untouched, a
 * tap still opens the row, and the exercise's own menu carries both the Remove
 * and the Replace item these gestures lead to.
 */
export function SwipeRow({
  onRemove,
  confirm,
  onReplace,
  children,
  grip = false,
  top = false,
  className,
  surface = "bg-card",
}: {
  /** Called once the row has left the screen and the gap has closed. */
  onRemove: () => void;
  /**
   * An optional question to put before the row is allowed to leave, for rows
   * that are carrying something worth losing. The row holds itself open at the
   * commit point while it is asked — so the gesture is visibly still in
   * progress rather than having been undone by the dialog — and either carries
   * on off the edge or springs back on the answer.
   */
  confirm?: () => Promise<boolean>;
  /**
   * The rightward action. Absent, that direction has nothing behind it and
   * resists from the first pixel, which is how the row says so.
   */
  onReplace?: () => void;
  children: ReactNode;
  /**
   * Only a drag that starts on an element marked `data-swipe-grip` moves the
   * row. For a row with controls of its own inside it — a card of set inputs —
   * where a sideways brush across a number must not start taking the whole
   * exercise off the screen.
   */
  grip?: boolean;
  /**
   * Hangs the Remove and Replace labels from the top edge rather than centring
   * them, for a row tall enough that the middle is off the part being pulled.
   */
  top?: boolean;
  /** Classes for the outer clip — a radius, for a row drawn as a card. */
  className?: string;
  /** The sliding surface's own classes, which is what hides the panels at rest. */
  surface?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const slider = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLSpanElement>(null);
  const swapPanel = useRef<HTMLDivElement>(null);
  const swapMark = useRef<HTMLSpanElement>(null);

  const pointer = useRef<number | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const trail = useRef<{ x: number; t: number }[]>([]);
  /** Null until the drag has declared itself horizontal; false means abandoned. */
  const live = useRef<boolean | null>(null);
  const x = useRef(0);
  /** Past the commit point, on whichever side the row is currently pulled to. */
  const armed = useRef(false);
  /** Set the moment the row moves, so the click the browser raises is dropped. */
  const dragged = useRef(false);
  const leaving = useRef(false);
  const settling = useRef<{ stop: () => void } | null>(null);

  const width = () => wrap.current?.offsetWidth ?? 320;

  /**
   * Put a position on screen.
   *
   * Written straight to style rather than held in state: this runs on every
   * pointer event, and a React render per frame is the difference between the
   * row tracking the finger and lagging behind it.
   */
  function paint(next: number) {
    x.current = next;
    const c = COMMIT(width());
    const left = Math.min(1, Math.max(0, -next) / c);
    const right = Math.min(1, Math.max(0, next) / c);
    if (slider.current)
      slider.current.style.transform = `translate3d(${next}px,0,0)`;
    if (panel.current) panel.current.style.opacity = String(left);
    if (swapPanel.current) swapPanel.current.style.opacity = String(right);
    /*
     * The one instant of feedback in the gesture. The colour has been building
     * the whole way, but a ramp has no moment in it — so at the commit point
     * the mark takes a step up in size and settles, which is what says the
     * threshold was crossed rather than merely approached.
     */
    const nowArmed = Math.max(left, right) >= 1;
    if (nowArmed !== armed.current) {
      const scale = nowArmed ? "scale(1.16)" : "scale(1)";
      if (mark.current) mark.current.style.transform = scale;
      if (swapMark.current) swapMark.current.style.transform = scale;
    }
    armed.current = nowArmed;
  }

  function down(e: React.PointerEvent) {
    if (leaving.current || pointer.current !== null) return;
    if (grip && !(e.target as Element).closest?.("[data-swipe-grip]")) return;
    // Grabbing a row still settling stops it where it is, so the drag picks up
    // from what the eye can see rather than from where it was headed.
    settling.current?.stop();
    settling.current = null;
    pointer.current = e.pointerId;
    start.current = { x: e.clientX, y: e.clientY };
    trail.current = [{ x: e.clientX, t: performance.now() }];
    live.current = null;
  }

  function move(e: React.PointerEvent) {
    if (e.pointerId !== pointer.current || live.current === false) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;

    /*
     * Which gesture this is gets decided once, on the first movement worth
     * reading, and is not revisited. Deciding per event lets a diagonal drag
     * flicker between scrolling the page and dragging the row.
     */
    if (live.current === null) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        live.current = false;
        return;
      }
      live.current = true;
      dragged.current = true;
      capture(e.currentTarget, e.pointerId, true);
    }

    trail.current.push({ x: e.clientX, t: performance.now() });
    if (trail.current.length > 8) trail.current.shift();

    const w = width();
    /*
     * A side with an action behind it follows the finger exactly until the row
     * has cleared the card, then resists — there is nothing further to reveal.
     * A side with nothing behind it resists from the first pixel: it gives a
     * little so the row still feels held, and no more.
     */
    const track = (d: number) => (d < w ? d : w + rubberband(d - w, w));
    paint(
      dx > 0
        ? onReplace
          ? track(dx)
          : rubberband(dx, w, 0.06)
        : -track(-dx),
    );
  }

  function up(e: React.PointerEvent) {
    if (e.pointerId !== pointer.current) return;
    pointer.current = null;
    capture(e.currentTarget, e.pointerId, false);
    if (live.current !== true) {
      live.current = null;
      return;
    }
    live.current = null;

    /*
     * A cancelled pointer is not a finished gesture.
     *
     * `pointercancel` is the system taking the touch away — the notification
     * shade coming down, a call arriving, the browser claiming the screen edge
     * for its own back gesture. The finger never came up, so nothing was
     * decided, and a row sitting past the commit point when it happens has to
     * go back rather than be acted on: the alternative is an exercise deleted
     * by a phone call. The velocity goes with it, since there is no throw left
     * to carry through.
     */
    if (e.type === "pointercancel") {
      cancel(0);
      return;
    }

    const v = velocityOf(trail.current); // px/ms, negative is leftward
    const right = x.current > 0;
    // A flick counts on its own. Requiring it to also cross the threshold is
    // what makes a swipe feel heavy: you throw the row, nothing happens, and
    // you learn to drag it instead.
    const flicked = right
      ? v > FLICK && x.current > SLOP
      : v < -FLICK && x.current < -SLOP;
    // A rightward flick on a row with no replace action still lands here, and
    // must not be read as a commit to an action that does not exist.
    if (!(armed.current || flicked) || (right && !onReplace)) cancel(v);
    else if (right) swap(v);
    else commit(v);
  }

  /** Back to rest, carrying the speed the finger had, so there is no seam. */
  function cancel(v: number) {
    if (reduced()) {
      paint(0);
      return;
    }
    const controls = animate(x.current, 0, {
      type: "spring",
      duration: 0.42,
      // Enough rebound to read as elastic, not enough to read as a wobble: the
      // row is being let go, not refused.
      bounce: 0.18,
      velocity: v * 1000,
      onUpdate: paint,
    });
    settling.current = { stop: () => controls.stop() };
    void controls.finished.then(() => {
      settling.current = null;
    });
  }

  /**
   * The rightward gesture was meant.
   *
   * The row goes back where it was and the sheet is asked for in the same
   * breath, so the two movements overlap: the sheet rises while the row is
   * still settling, and the gesture reads as having handed the question over
   * rather than as having been undone before the question arrived.
   */
  function swap(v: number) {
    cancel(v);
    onReplace?.();
  }

  /** The gesture was meant. Either ask first, or let the row go. */
  function commit(v: number) {
    leaving.current = true;
    if (confirm) void asked(v);
    else fly(v);
  }

  /** Hold the row open at the commit point, put the question, then act on it. */
  async function asked(v: number) {
    const rest = -COMMIT(width());
    if (reduced()) paint(rest);
    else {
      const open = animate(x.current, rest, {
        type: "spring",
        duration: 0.3,
        bounce: 0,
        velocity: v * 1000,
        onUpdate: paint,
      });
      settling.current = { stop: () => open.stop() };
      await open.finished.catch(() => {});
      settling.current = null;
    }
    if (await confirm!()) fly(0);
    else {
      // The row is the user's again: it comes back, and it can be grabbed.
      leaving.current = false;
      cancel(0);
    }
  }

  /**
   * Off the edge, then the gap closes.
   *
   * Two moves rather than one, because they say different things: the row
   * leaving is the answer to the gesture, and the list closing up is the list
   * agreeing. Collapsing the height while the row is still on screen would look
   * like it was being crushed rather than thrown.
   */
  function fly(v: number) {
    if (reduced()) {
      onRemove();
      return;
    }
    const w = width();
    const h = wrap.current?.offsetHeight ?? 0;
    const flight = animate(x.current, -w - 16, {
      type: "spring",
      duration: 0.3,
      bounce: 0,
      velocity: v * 1000,
      onUpdate: paint,
    });
    settling.current = { stop: () => flight.stop() };
    void flight.finished.then(() => {
      if (wrap.current) wrap.current.style.height = `${h}px`;
      const close = animate(1, 0, {
        duration: 0.22,
        ease: [0.22, 0.9, 0.3, 1],
        onUpdate: (t) => {
          if (wrap.current) wrap.current.style.height = `${h * t}px`;
          // The row is long gone by now, so the red is the only thing left in
          // the closing gap. It leaves with it rather than switching off.
          if (panel.current) panel.current.style.opacity = String(t);
        },
      });
      settling.current = { stop: () => close.stop() };
      void close.finished.then(onRemove);
    });
  }

  return (
    <div
      ref={wrap}
      className={cls("relative overflow-hidden", className)}
      // Vertical belongs to the browser; horizontal is ours. Without this the
      // list cannot be scrolled with a thumb that lands on a row.
      style={{ touchAction: "pan-y" }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      /*
       * A drag ends in a click as far as the browser is concerned, and this row
       * opens an exercise when clicked. Caught on the way down, so it never
       * reaches the button underneath.
       */
      onClickCapture={(e) => {
        if (!dragged.current) return;
        dragged.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {onReplace && (
        <div
          ref={swapPanel}
          aria-hidden="true"
          // Held against the edge the row uncovers, so the label appears out of
          // the side the finger is pulling from rather than sliding in to meet
          // it. The red panel does the same on its own side.
          className={cls(
            "absolute inset-0 flex gap-2 pl-5",
            top ? "items-start pt-[17px]" : "items-center",
          )}
          style={{ background: "var(--color-fg)", opacity: 0 }}
        >
          <span
            ref={swapMark}
            className="grid place-items-center text-black"
            style={{
              transform: "scale(1)",
              transition: "transform 160ms var(--ease-settle)",
            }}
          >
            <Swap size={17} />
          </span>
          <span className="font-mono text-label font-semibold uppercase tracking-[0.16em] text-black">
            Replace
          </span>
        </div>
      )}
      <div
        ref={panel}
        aria-hidden="true"
        className={cls(
          "absolute inset-0 flex justify-end gap-2 pr-5",
          top ? "items-start pt-[17px]" : "items-center",
        )}
        style={{ background: "var(--color-danger)", opacity: 0 }}
      >
        <span
          ref={mark}
          className="grid place-items-center text-black"
          style={{
            transform: "scale(1)",
            transition: "transform 160ms var(--ease-settle)",
          }}
        >
          <Trash size={17} />
        </span>
        <span className="font-mono text-label font-semibold uppercase tracking-[0.16em] text-black">
          Remove
        </span>
      </div>
      <div
        ref={slider}
        // Opaque, or the panels read through the row that is meant to be
        // covering them. The list's own surface, so nothing changes at rest.
        className={cls("relative", surface)}
        style={{ transform: "translate3d(0,0,0)" }}
      >
        {children}
      </div>
    </div>
  );
}
