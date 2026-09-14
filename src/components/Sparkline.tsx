import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { chartGeom } from "../lib/chart";

/**
 * The only chart in the app: a hairline through the points, a rule at the
 * floor, a marker on each session and a dot on the latest value.
 *
 * It replaced a Recharts line chart with axes, a grid and a tooltip. On a
 * screen whose whole argument is that structure comes from rules and type, a
 * charting library's furniture was the loudest thing on it — but a tooltip was
 * doing real work, so reading a single session back is handled here instead:
 * drag across the plot and the caller is told which point is under the finger.
 */

/** How long a change of series takes to settle. */
const MORPH_MS = 263;
/** Samples the morphing line is drawn through, independent of either series. */
const PATH_STEPS = 64;
/** Point in the morph where the old markers start leaving and the new arrive. */
const HANDOVER = 0.55;
/** How long the line takes to draw itself the first time the chart is seen. */
const ENTER_MS = 620;
/** Share of the draw a single marker spends landing, once the line reaches it. */
const POP = 0.09;

/**
 * Both curves decelerate into their end, quartic rather than cubic.
 *
 * A curve settling on its value is the moment worth stretching, so the line
 * spends longer easing into place than it used to: the last tenth of the travel
 * now takes about 44% of the duration, against 46%... measured the other way,
 * it reaches nine tenths of the way at t=0.44 rather than t=0.54, and crawls
 * the rest.
 *
 * Quintic was tried and is too much. It reaches 97% of the way by the halfway
 * point, so the whole back half covers three percent of the distance and reads
 * as having stopped early rather than as settling. The exponent is the only
 * thing to change if this still wants more.
 */
const POWER = 4;
const easeOut = (t: number) => 1 - Math.pow(1 - t, POWER);
/** Used for the draw: leaves gently, brisk through the middle, settles long. */
const easeInOut = (t: number) =>
  t < 0.5
    ? Math.pow(2, POWER - 1) * Math.pow(t, POWER)
    : 1 - Math.pow(-2 * t + 2, POWER) / 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * When in the draw a given fraction of it has been covered — `easeInOut` run
 * backwards.
 *
 * The markers land as the line reaches them, and "reaches" is a position along
 * the curve, not a moment in time. Handing the browser a delay therefore means
 * asking the inverse question: at what time is the draw *this* far along? Both
 * halves of the quartic invert in closed form, so this is exact rather than a
 * search, and it stays correct if POWER changes.
 */
const unEaseInOut = (y: number) =>
  y < 0.5
    ? Math.pow(y / Math.pow(2, POWER - 1), 1 / POWER)
    : 1 - Math.pow(2 * (1 - y), 1 / POWER) / 2;

/**
 * One of our own easing functions, written as something CSS understands.
 *
 * Sampled into `linear()` rather than fitted to a cubic-bezier: the curve above
 * is argued to two decimal places, and the nearest bezier moves the point where
 * it reaches nine tenths by several percent. Sampling keeps one source of truth
 * — the function — and hands the browser a declarative easing it can run off
 * the main thread.
 */
const cssEasing = (f: (t: number) => number, stops: number) =>
  `linear(${Array.from({ length: stops + 1 }, (_, i) => +f(i / stops).toFixed(4)).join(",")})`;

/**
 * `linear()` easing is Chrome 113+, and this ships to Android 7 and up, where
 * a device with a frozen WebView is possible. An easing string the engine
 * cannot parse does not degrade — `element.animate()` throws synchronously, so
 * an unguarded one would blank the screen rather than animate badly. The
 * fallbacks are the standard quartic beziers.
 */
const LINEAR_OK =
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("transition-timing-function", "linear(0, 1)");

const EASE_IN_OUT_CSS = LINEAR_OK
  ? cssEasing(easeInOut, 20)
  : "cubic-bezier(0.77, 0, 0.175, 1)";


const reduced = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * How long a press has to stay put to count as a hold.
 *
 * Long enough not to fire under a slow tap, short enough that nobody wonders
 * whether it is working — the same half-second the platforms use for their own
 * press-and-hold menus.
 */
const HOLD_MS = 500;

export function Sparkline({
  values,
  labels,
  className,
  selected = null,
  onSelect,
  onHold,
  width = 350,
  height = 168,
  padT = 8,
  padB = 26,
  stroke = "#f5f5f5",
  strokeWidth = 1.6,
  showBaseline = true,
  showPoints = true,
  animateIn = true,
  enterDelay = 0,
}: {
  values: number[];
  /** First and last captions, drawn on the baseline. */
  labels?: [string, string];
  /** For a caller that positions the chart itself, e.g. inside a flexing slot. */
  className?: string;
  /** Index of the point being inspected, or null for none. */
  selected?: number | null;
  /**
   * Omit to make the chart non-interactive. `via` says which gesture produced
   * the selection: a tap lands on one session, a drag sweeps across many.
   */
  onSelect?: (i: number, via: "tap" | "drag") => void;
  /**
   * Held down on one point without moving. Omit and a press is only ever a tap.
   *
   * The gesture a chart can afford to spend on editing: tapping already reads a
   * point and dragging already sweeps the series, so neither was free, and a
   * point is too small a target to grow an edit button of its own.
   */
  onHold?: (i: number) => void;
  width?: number;
  height?: number;
  padT?: number;
  padB?: number;
  stroke?: string;
  strokeWidth?: number;
  showBaseline?: boolean;
  showPoints?: boolean;
  /** Whether the curve draws itself when the chart is first shown. */
  animateIn?: boolean;
  /** Held back this long, so stacked charts enter one after the other. */
  enterDelay?: number;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const down = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  /** Set once the pointer has travelled far enough to be a drag, not a tap. */
  const moved = useRef(false);
  /** Last index reported to the parent, so a sweep does not repeat itself. */
  const picked = useRef(-1);
  /** The pending long press, cancelled by any movement or by letting go. */
  const holding = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Set when a hold has fired, so the release that follows it is not also
   * reported as a tap — the point is already selected and the sheet is open,
   * and a second report would re-select underneath it.
   */
  const held = useRef(false);
  /** Removes the window listeners for the gesture in flight, if there is one. */
  const drag = useRef<(() => void) | null>(null);

  /**
   * The series being travelled away from, and how far along we are.
   *
   * Two series rarely have the same number of sessions, so they cannot move
   * one-to-one. Instead each old marker is given a destination *on* the new
   * curve at its own position along it, travels there, and then fades out as
   * the real new markers fade in — which is why the line can reshape between
   * counts without any marker jumping.
   */
  const from = useRef<number[] | null>(null);
  const shownKey = useRef<string>("");
  /**
   * Whether a series is being morphed into another. A boolean for the same
   * reason the draw's is: the progress itself now lives in `paintMorph`, which
   * writes it to the DOM without going through render.
   */
  const [morphing, setMorphing] = useState(false);
  /** Set below, once the geometry it needs exists. Held so the loop can call it. */
  const paintMorph = useRef<(t: number) => void>(() => {});
  const raf = useRef(0);

  /**
   * Whether the curve is still drawing itself in, the first time the chart is
   * shown. The screen unmounts when you leave the tab, so this runs again on
   * every visit — but never on a change of series, which morphs instead.
   *
   * A boolean, where it used to be the progress itself. The draw animates only
   * `stroke-dashoffset` and a fade-and-grow per marker, all of which the
   * browser can run on its own, so progress no longer has to exist in React at
   * all — it drove a re-render of this whole component sixty times a second to
   * move numbers that CSS was willing to move for free. What is left is the one
   * thing render genuinely needs to know: whether the draw is still going, so
   * that a session cannot be selected out from under it.
   */
  const [entering, setEntering] = useState(
    () => animateIn && values.length > 0 && !reduced(),
  );
  /** Everything the draw started, so it can all be finished or cancelled. */
  const enterAnims = useRef<Animation[]>([]);
  const pathEl = useRef<SVGPathElement>(null);
  /** Wraps the markers, so their DOM order can be read back for animating. */
  const markerG = useRef<SVGGElement>(null);
  const headEl = useRef<SVGCircleElement>(null);
  const labelG = useRef<SVGGElement>(null);
  /** Wraps the markers of the series being left behind. */
  const leavingG = useRef<SVGGElement>(null);

  const key = values.join(",");
  if (shownKey.current !== key) {
    // Anything but the very first render has a series to travel away from.
    from.current =
      shownKey.current === "" ? null : parseKeyed(shownKey.current);
    shownKey.current = key;
  }

  const hasValues = values.length > 0;

  // The draw. Deliberately keyed off nothing but the arrival of a series: a
  // later change of exercise, metric or range leaves these deps alone, so it
  // morphs rather than entering a second time. No ref guards the one run —
  // StrictMode's second pass has to be allowed through, since its cleanup
  // already cancelled the frame the first pass scheduled.
  useLayoutEffect(() => {
    if (!hasValues || !animateIn || reduced()) {
      setEntering(false);
      return;
    }
    const path = pathEl.current;
    if (!path) return;
    setEntering(true);

    /*
     * Everything below runs to the same clock but none of it is ticked from
     * here: each is handed to the browser once, with a start time and a curve,
     * and never touched again until it is finished or cancelled.
     *
     * `fill: "backwards"` on every one of them, never "forwards". Backwards
     * holds the opening frame through the delay, which is what keeps a marker
     * hidden until its cue; forwards would freeze the closing frame on top of
     * whatever React renders afterwards, and the selection dimming would never
     * be able to move again.
     */
    const made: Animation[] = [];
    const add = (a: Animation | undefined) => a && made.push(a);

    // The line. `pathLength` normalises the dash to the whole curve whatever
    // `d` currently is, so the morph rewriting the path cannot leave a gap.
    add(
      path.animate([{ strokeDashoffset: "1" }, { strokeDashoffset: "0" }], {
        duration: ENTER_MS,
        delay: enterDelay,
        easing: EASE_IN_OUT_CSS,
        fill: "backwards",
      }),
    );

    // Markers, each cued as the line reaches it. `{}` as the closing frame
    // means "whatever this element is rendered as", so the animation hands the
    // marker back to React rather than pinning it.
    const marks = markerG.current ? [...markerG.current.children] : [];
    marks.forEach((el, i) => {
      const { delay, duration } = cueOf(i);
      add(
        el.animate([{ opacity: 0, transform: "scale(0.5)" }, {}], {
          delay,
          duration,
          easing: "linear",
          fill: "backwards",
        }),
      );
    });

    // The head dot and the two date labels all belong to the end of the line.
    const tail = cueOf(to.pts.length - 1);
    for (const el of [headEl.current, ...(labelG.current?.children ?? [])]) {
      add(
        el?.animate([{ opacity: 0 }, {}], {
          delay: tail.delay,
          duration: tail.duration,
          easing: "linear",
          fill: "backwards",
        }),
      );
    }

    enterAnims.current = made;
    // `onfinish` rather than the `finished` promise: cancelling rejects the
    // promise, and nothing here wants to handle an AbortError.
    made[0].onfinish = () => setEntering(false);

    return () => {
      for (const a of made) a.cancel();
      enterAnims.current = [];
    };
    // Keyed off the arrival of a series only: a later change of exercise,
    // metric or range morphs rather than entering a second time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValues, animateIn, enterDelay]);

  /** Puts the curve straight into its finished state, wherever the draw got to. */
  const settle = () => {
    for (const a of enterAnims.current) a.finish();
    enterAnims.current = [];
    setEntering(false);
  };

  useLayoutEffect(() => {
    if (!from.current || reduced() || !values.length) {
      setMorphing(false);
      return;
    }
    // A series changed while the chart was still drawing itself: the morph is
    // the more informative motion, so hand over to it.
    settle();
    setMorphing(true);

    /*
     * The one animation in this file still ticked from script.
     *
     * Interpolating between two curves means rewriting `d` — a string the
     * browser has no way to interpolate for us, unlike the dash offset the
     * entrance rides on. So this keeps a frame loop, but it writes the
     * attribute straight to the path and the opacities straight to the
     * markers. React is told twice: morph started, morph ended.
     */
    const t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / MORPH_MS);
      paintMorph.current(t);
      if (t < 1) {
        raf.current = requestAnimationFrame(step);
      } else {
        setMorphing(false);
      }
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // the joined key is what actually identifies a series change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  /*
   * A press still counting down when the chart goes away must not land on a
   * screen that has moved on.
   *
   * Above the guard below rather than beside the handler it belongs to: this
   * component returns early for an empty series, and a hook after that point
   * runs on some renders and not others.
   */
  useEffect(
    () => () => {
      if (holding.current) clearTimeout(holding.current);
      drag.current?.();
    },
    [],
  );

  if (!values.length) return null;

  const inner = height - padT - padB;
  const geom = (vals: number[]) => chartGeom(vals, { width, padT, inner });

  const to = geom(values);
  const old =
    morphing && from.current && from.current.length > 0
      ? geom(from.current)
      : null;

  // The line is sampled at a fixed resolution so it can morph between any two
  // point counts without either series dictating the other's shape.
  const path = to.pts.map((q, i) => `${i ? "L" : "M"}${q.x} ${q.y}`).join("");

  /*
   * One frame of a morph, written straight to the DOM.
   *
   * Rebuilt every render but only ever called from the frame loop, so it always
   * closes over the current geometry. The samples either side are taken once
   * here rather than 128 times a frame inside the loop.
   *
   * The closing frame writes the resting path rather than the interpolation at
   * t=1: sixty-four samples of `to.at()` are not the same string as the series'
   * own corners, and since React's `d` prop never changes during a morph it
   * would never correct the difference.
   */
  const morphFrom = old;
  paintMorph.current = (t: number) => {
    const el = pathEl.current;
    if (!el) return;
    if (!morphFrom || t >= 1) {
      el.setAttribute("d", path);
    } else {
      const k = easeOut(t);
      let d = "";
      for (let i = 0; i < PATH_STEPS; i++) {
        const f = i / (PATH_STEPS - 1);
        const a = morphFrom.at(f);
        const b = to.at(f);
        d += `${i ? "L" : "M"}${lerp(a.x, b.x, k).toFixed(1)} ${lerp(a.y, b.y, k).toFixed(1)}`;
      }
      el.setAttribute("d", d);
    }
    // Old markers hand over to new ones across the tail of the morph.
    const hand = Math.max(0, (t - HANDOVER) / (1 - HANDOVER));
    const goneBy = t >= 1 ? 1 : hand;
    for (const g of [markerG.current, labelG.current]) {
      for (const c of g?.children ?? [])
        (c as SVGElement).style.opacity = String(goneBy);
    }
    if (headEl.current) headEl.current.style.opacity = String(goneBy);
    for (const c of leavingG.current?.children ?? []) {
      const l = c as SVGElement;
      l.style.opacity = String(1 - hand);
      const a = l.dataset;
      const k = easeOut(t);
      l.setAttribute("cx", String(lerp(+a.ax!, +a.bx!, k)));
      l.setAttribute("cy", String(lerp(+a.ay!, +a.by!, k)));
    }
  };

  // Distance along the polyline to each point, which is both how much stroke
  // to hide and when each marker is due to land. A polyline's length is exact
  // from its own corners, so nothing has to be measured out of the DOM.
  const { cum, total } = (() => {
    const acc = [0];
    let run = 0;
    for (let i = 1; i < to.pts.length; i++) {
      run += Math.hypot(
        to.pts[i].x - to.pts[i - 1].x,
        to.pts[i].y - to.pts[i - 1].y,
      );
      acc.push(run);
    }
    return { cum: acc, total: run };
  })();

  const drawing = entering && !morphing;
  /**
   * When a marker is due, and how long it takes to land.
   *
   * Each point's cue is pulled back by the width of its own landing, so the
   * last one finishes with the line rather than appearing all at once after it.
   * The cue is a position along the curve, not a moment — so the time it
   * corresponds to is the draw's easing run backwards, which is what
   * `unEaseInOut` is for. Reading it as a plain fraction of the duration would
   * put the first marker in at 56ms instead of 202 and push the last one off
   * the end of the draw entirely.
   */
  const cueOf = (i: number) => {
    const at = (total ? cum[i] / total : 0) * (1 - POP);
    const t0 = unEaseInOut(at);
    const t1 = unEaseInOut(Math.min(1, at + POP));
    return {
      delay: enterDelay + t0 * ENTER_MS,
      duration: Math.max(1, (t1 - t0) * ENTER_MS),
    };
  };

  const last = to.pts[to.pts.length - 1];
  const baseline = padT + inner;
  const sel =
    !morphing && !drawing && selected != null && to.pts[selected]
      ? to.pts[selected]
      : null;

  // Old markers leave and new ones arrive over the tail of the morph.
  // Rendered at rest; the handover between old and new markers is written by
  // `paintMorph` while a morph is running.
  const arriving = morphing ? 0 : 1;

  /** Maps a pointer position onto the nearest session. */
  function pick(clientX: number, via: "tap" | "drag") {
    if (!onSelect) return;
    const i = indexAt(clientX);
    if (i == null) return;
    // A sweep produces a move event every few pixels but crosses a session only
    // every few dozen, and each report re-renders the whole Progress screen —
    // including the exercise sheet's list, which is mounted whether or not it
    // is open. Only changes are worth telling anyone about.
    if (i === picked.current) return;
    picked.current = i;
    onSelect(i, via);
  }

  /** Where a press lands, for a gesture that has not moved off its start. */
  function indexAt(clientX: number) {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const ratio = (clientX - rect.left) / rect.width;
    const raw = Math.round(ratio * (values.length - 1));
    return Math.max(0, Math.min(values.length - 1, raw));
  }

  function cancelHold() {
    if (holding.current) clearTimeout(holding.current);
    holding.current = null;
  }

  /** Tears down whatever gesture is in flight. Safe to call when there is none. */
  function endDrag() {
    drag.current?.();
  }

  // Points crowd together on a long history, so they thin out rather than
  // merging into a dotted rule.
  const markers = showPoints && values.length <= 60;

  return (
    <svg
      ref={svg}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      style={{
        display: "block",
        overflow: "visible",
        /*
         * The gesture is ours, not the scroller's.
         *
         * This said `pan-y`, which hands every vertical component of a touch to
         * the page — and a finger sweeping a curve sideways always has one. iOS
         * would take the gesture over mid-sweep, fire `pointercancel`, and the
         * scrub would die halfway across the chart while the page jumped
         * instead. `none` claims the touch outright, which is what a chart you
         * drag along has to do. The Progress screen is a single fixed page now,
         * so there is no scrolling here to give up.
         */
        touchAction: onSelect ? "none" : undefined,
        cursor: onSelect ? "crosshair" : undefined,
        /*
         * iOS hands a long press to text selection unless told not to.
         *
         * The captions on this chart are real SVG <text> nodes, so pressing
         * and holding anywhere near one is, as far as Safari is concerned, the
         * start of a selection: it raises the grab handles and the copy /
         * look-up bubble, and — the part that actually broke the gesture —
         * fires `pointercancel` as it takes the touch over, which cancelled the
         * hold before it could ever land. Suppressing selection and the callout
         * leaves the press with us.
         *
         * Unconditional rather than tied to `onHold`. Nobody has ever wanted to
         * select the word "Aug 14" off a chart, and a chart that highlights
         * blue under a finger looks broken on every platform, not just this one.
         */
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
      // Newer iOS raises a context menu on long press in its own right, which
      // the CSS above does not cover.
      onContextMenu={(ev) => ev.preventDefault()}
      onPointerDown={(ev) => {
        if (!onSelect) return;
        // Reaching for a session outranks watching the line arrive.
        if (entering) settle();
        endDrag();
        down.current = true;
        moved.current = false;
        // Cleared so tapping the session already selected still reports it —
        // the dedupe above is about a sweep, not about a deliberate new press.
        picked.current = -1;
        startX.current = ev.clientX;
        startY.current = ev.clientY;
        held.current = false;
        cancelHold();
        /*
         * The hold is armed before anything else can go wrong.
         *
         * It used to be armed after `setPointerCapture`, which throws on iOS
         * Safari when the element is an <svg> — and a throw in a pointerdown
         * handler abandons the rest of it, so the hold was the one thing that
         * silently never existed on the phone.
         */
        if (onHold) {
          const x = ev.clientX;
          holding.current = setTimeout(() => {
            holding.current = null;
            const i = indexAt(x);
            if (i == null) return;
            held.current = true;
            // Selected as well as handed over, so the point the sheet is about
            // is the one lit under the finger.
            picked.current = i;
            onSelect(i, "tap");
            onHold(i);
          }, HOLD_MS);
        }

        /*
         * The rest of the gesture is followed on `window`, not on this element.
         *
         * The usual way to keep a drag once the finger leaves the element is
         * `setPointerCapture`. That is exactly the call iOS Safari refuses on an
         * <svg>, so on the phone there was no capture and no fallback: these
         * charts are between 88 and 275px tall, a finger sweeping sideways
         * wanders out of that band almost immediately, and the moment it did
         * `pointermove` stopped arriving and the scrub froze under the finger.
         *
         * Listening on the window needs no permission from anybody and behaves
         * the same in every browser. The pointer id is checked so a second
         * finger elsewhere on the screen cannot drive this chart.
         */
        const id = ev.pointerId;
        const onMove = (e: globalThis.PointerEvent) => {
          if (!down.current || e.pointerId !== id) return;
          if (!moved.current && Math.abs(e.clientX - startX.current) > 4)
            moved.current = true;
          /*
           * The hold ends on travel in any direction, not just across the
           * chart. `moved` is deliberately horizontal — it separates a tap from
           * a sweep — but a finger starting to scroll moves *down*, which no
           * amount of horizontal tolerance would notice. 10px rather than 4,
           * because a finger resting on glass drifts and a mouse-tight
           * threshold cancels every real hold on a phone.
           */
          const dx = e.clientX - startX.current;
          const dy = e.clientY - startY.current;
          if (holding.current && Math.hypot(dx, dy) > 10) cancelHold();
          if (moved.current) {
            cancelHold();
            pick(e.clientX, "drag");
          }
        };
        const onUp = (e: globalThis.PointerEvent) => {
          if (e.pointerId !== id) return;
          const wasDown = down.current;
          const wasMoved = moved.current;
          const wasHeld = held.current;
          endDrag();
          if (e.type === "pointercancel") return;
          if (wasDown && !wasMoved && !wasHeld) pick(e.clientX, "tap");
        };
        drag.current = () => {
          down.current = false;
          held.current = false;
          cancelHold();
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);
          drag.current = null;
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      }}
    >
      {showBaseline && (
        <line
          x1="0"
          x2={width}
          y1={baseline}
          y2={baseline}
          stroke="#1a1a1a"
          strokeWidth="1"
        />
      )}

      {/* the inspected session, called out with a full-height rule */}
      {sel && (
        <line
          x1={sel.x}
          x2={sel.x}
          y1={padT - 4}
          y2={baseline}
          /* The mark saying which session your finger is on, so it has to be
             visible to be worth drawing. Was #3a3a3a at 1.9:1, under the 3:1
             a meaningful non-text graphic needs. */
          stroke="var(--color-dim)"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
      )}

      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        /*
         * The tail of the stroke is held back rather than clipped, so the line
         * arrives along its own path instead of out of a moving edge.
         *
         * `pathLength` restates the curve as one unit long, so the dash covers
         * exactly the whole of it whatever `d` happens to be — which matters
         * because the morph rewrites `d` to a different arc length, and a dash
         * measured in real units would leave a gap partway through. The offset
         * itself is written by the entrance animation, not from here.
         */
        ref={pathEl}
        pathLength={values.length > 1 ? 1 : undefined}
        strokeDasharray={values.length > 1 ? 1 : undefined}
      />

      {/* markers of the series being left, travelling to where they belong on
          the new curve before they go */}
      {/* Their travel and fade are written by `paintMorph`; the endpoints ride
          along as data attributes so the loop needs no geometry of its own. */}
      <g ref={leavingG}>
        {markers &&
          morphing &&
          old &&
          old.pts.map((a, i) => {
            const b = to.at(
              old.pts.length === 1 ? 1 : i / (old.pts.length - 1),
            );
            return (
              <circle
                key={`leave-${i}`}
                cx={a.x}
                cy={a.y}
                data-ax={a.x}
                data-ay={a.y}
                data-bx={b.x}
                data-by={b.y}
                r={1.9}
                fill="#000"
                stroke={stroke}
                strokeWidth="1"
                opacity={1}
              />
            );
          })}
      </g>

      {/* Rendered at rest; the fade-and-grow as the line reaches each one is
          the entrance animation's, cued off `cueOf`. The group is what lets
          those animations find the markers in order without a ref apiece. */}
      <g ref={markerG}>
        {markers &&
          to.pts.map((q, i) => (
            <circle
              key={i}
              cx={q.x}
              cy={q.y}
              r={1.9}
              fill="#000"
              stroke={stroke}
              strokeWidth="1"
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
              opacity={(sel && i !== selected ? 0.45 : 1) * arriving}
            />
          ))}
      </g>

      <circle
        ref={headEl}
        cx={sel ? sel.x : last.x}
        cy={sel ? sel.y : last.y}
        r={strokeWidth > 1.5 ? 3.5 : 3}
        fill="#f5f5f5"
        opacity={arriving}
      />

      {labels && !sel && (
        /*
         * Deaf to the pointer, so a press that lands on a caption is a press on
         * the chart.
         *
         * Belt and braces alongside the `user-select` on the root: older Safari
         * does not always inherit that into <text>, and a node the touch cannot
         * reach cannot start a selection in the first place. Nothing is lost —
         * every pointer gesture here is handled on the <svg> itself.
         */
        <g ref={labelG} style={{ pointerEvents: "none" }}>
          <text
            x="0"
            y={height - 4}
            fill="var(--color-muted)"
            fontSize="11"
            fontFamily="IBM Plex Mono, monospace"
            letterSpacing="1"
            opacity={arriving}
          >
            {labels[0]}
          </text>
          <text
            x={width}
            y={height - 4}
            textAnchor="end"
            fill="var(--color-muted)"
            fontSize="11"
            fontFamily="IBM Plex Mono, monospace"
            letterSpacing="1"
            opacity={arriving}
          >
            {labels[1]}
          </text>
        </g>
      )}
    </svg>
  );
}

function parseKeyed(key: string) {
  return key.split(",").map(Number);
}
