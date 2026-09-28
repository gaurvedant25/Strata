import { animate, motionValue } from "motion";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type PointerEvent,
} from "react";
import { rubberband } from "../lib/gesture";

type TabIcon = ComponentType<{
  className?: string;
  size?: number;
  filled?: boolean;
}>;

export type TabItem<T extends string> = { id: T; label: string; Icon: TabIcon };

/** The bar's inner padding, which is also where the highlight's travel starts. */
const PAD = 7;

/**
 * How the highlight moves, after the App Store's tab bar.
 *
 * Springs rather than a curve, because it is interrupted constantly — a second
 * tap mid-flight, a finger landing on it while it is still settling — and a
 * spring retargets carrying the speed it already had, where a curve starts
 * over from rest and lurches.
 *
 * Stiffness and damping rather than Motion's duration-and-bounce form, which
 * looks the same from rest but drops most of its speed when it is retargeted
 * mid-flight — measured here, a glide handed over at the moment of release
 * stalled for three frames before setting off again. The physical form carries
 * the velocity through untouched.
 *
 * `travel` overshoots by a few percent and comes back: enough to read as a
 * thing with weight arriving, not enough to wobble. `follow` is the finger's:
 * critically damped, so it trails a drag by a frame or two and feels held
 * rather than glued. `rise` is the lens swelling under a press, quick and with
 * some give; `settle` is it putting itself back down.
 */
const TRAVEL = { type: "spring", stiffness: 400, damping: 30 } as const;
const FOLLOW = { type: "spring", stiffness: 900, damping: 60 } as const;
const RISE = { type: "spring", stiffness: 600, damping: 26 } as const;
const SETTLE = { type: "spring", stiffness: 420, damping: 28 } as const;

/** How much bigger the highlight gets while a finger is on it. */
const LENS = 0.14;
/** Speed, in px/s, at which the highlight is stretched as far as it goes. */
const FULL_STRETCH_AT = 2800;
/** How far that is: 30% longer and 12% shorter, like something liquid in flight. */
const STRETCH_X = 0.3;
const SQUASH_Y = 0.12;
/** Horizontal travel before a press becomes a drag across the bar. */
const SLOP = 6;

const still = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The floating tab bar.
 *
 * What it borrows from the App Store is the highlight, which behaves like an
 * object rather than a state. Touch a tab and it swells into a lens under your
 * finger and heads for it; let go and it sets itself down there with a small
 * overshoot. Keep the finger down and drag, and it comes with you — the icon
 * under it lighting as it passes — and lands on whichever tab you let go of.
 * In flight it stretches along the way it is going and flattens a little, in
 * proportion to its speed, so a long jump reads as fast and a short one does
 * not, and it rounds back up as it slows.
 *
 * Everything that moves per frame is written straight to the element from two
 * motion values, the position and the lift. Setting React state sixty times a
 * second to move one pill would re-render the bar, the icons and their SVG on
 * every frame; the only state here is which icon is lit, and that changes once
 * per tab crossed.
 *
 * `current` is null while a screen that is not a tab is open (Settings): the
 * highlight fades where it stands, and the next press brings it back under the
 * finger rather than sliding in from wherever it was left.
 */
export function TabBar<T extends string>({
  tabs,
  current,
  onSelect,
}: {
  tabs: TabItem<T>[];
  current: T | null;
  onSelect: (id: T) => void;
}) {
  const navRef = useRef<HTMLElement>(null);
  const blobRef = useRef<HTMLSpanElement>(null);
  const [x] = useState(() => motionValue(0));
  const [lift] = useState(() => motionValue(0));
  /** The tab under a finger that is down, which is lit ahead of the tab itself. */
  const [pointing, setPointing] = useState<number | null>(null);
  const press = useRef<{
    id: number;
    startX: number;
    moved: boolean;
    index: number;
  } | null>(null);
  /** The slot the highlight is at or heading for; null while it is hidden. */
  const slotOf = useRef<number | null>(null);
  /** Off for the first render, so the tab you launch on does not bounce. */
  const [settled, setSettled] = useState(false);

  const n = tabs.length;
  const currentIdx = current == null ? -1 : tabs.findIndex((t) => t.id === current);

  const slot = () => ((navRef.current?.clientWidth ?? 0) - PAD * 2) / n;

  function paint() {
    const el = blobRef.current;
    const nav = navRef.current;
    if (!el || !nav) return;
    const w = slot();
    const l = lift.get();
    const s = Math.min(Math.abs(x.getVelocity()) / FULL_STRETCH_AT, 1);
    const width = w * (1 + s * STRETCH_X);
    const scale = 1 + l * LENS;
    el.style.width = `${width}px`;
    // Stretched about its middle, so it grows both ways from where it is
    // rather than only forward from its left edge.
    el.style.transform = `translateX(${x.get() - (width - w) / 2}px) scale(${scale}, ${scale * (1 - s * SQUASH_Y)})`;
    el.style.backgroundColor = `rgb(255 255 255 / ${0.11 + l * 0.06})`;
    el.style.boxShadow = `inset 0 1px 0 rgb(255 255 255 / ${0.12 + l * 0.08}), 0 ${l * 6}px ${l * 18}px rgb(0 0 0 / ${l * 0.35})`;
    // The lit icon rides the lens, so it is magnified with it.
    nav.style.setProperty("--lift", String(l));
  }

  function show(visible: boolean) {
    if (blobRef.current) blobRef.current.style.opacity = visible ? "1" : "0";
  }

  function glideTo(i: number) {
    slotOf.current = i;
    if (still()) x.jump(i * slot());
    else void animate(x, i * slot(), TRAVEL);
  }

  function liftTo(v: 0 | 1) {
    // Under reduced motion the lens does not swell; the icon lighting under
    // the finger is still there to say what a press is about to pick.
    if (still()) return;
    void animate(lift, v, v ? RISE : SETTLE);
  }

  // The motion values drive the paint; nothing else does. Subscribed once for
  // the life of the bar — `paint` reads only refs and the values themselves.
  useEffect(() => {
    const offX = x.on("change", paint);
    const offLift = lift.on("change", paint);
    setSettled(true);
    return () => {
      offX();
      offLift();
      x.stop();
      lift.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Following the current tab when it changes from outside the bar — a sheet
  // sending you to Routines, Settings closing — and on first paint.
  useLayoutEffect(() => {
    if (press.current) return; // the finger is in charge until it lets go
    if (currentIdx < 0) {
      show(false);
      slotOf.current = null;
      return;
    }
    if (slotOf.current === currentIdx) {
      show(true);
      return;
    }
    if (slotOf.current === null) {
      // Arriving from hidden, or on first paint: appear in place.
      slotOf.current = currentIdx;
      x.jump(currentIdx * slot());
      paint();
      show(true);
      return;
    }
    glideTo(currentIdx);
    show(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx]);

  // A slot is a quarter of the bar, and the bar is as wide as the screen, so
  // rotating the phone moves every slot. At rest, snap to the new one. In
  // flight, retarget instead — switching tabs can itself resize the bar (a
  // screen long enough to scroll brings a desktop scrollbar with it), and a
  // snap there would cut the glide off halfway.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (press.current || slotOf.current === null) return paint();
      if (x.isAnimating()) glideTo(slotOf.current);
      else x.jump(slotOf.current * slot());
      paint();
    });
    ro.observe(nav);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function innerX(clientX: number) {
    const nav = navRef.current!;
    return clientX - nav.getBoundingClientRect().left - nav.clientLeft - PAD;
  }

  function indexAt(clientX: number) {
    return Math.max(0, Math.min(n - 1, Math.floor(innerX(clientX) / slot())));
  }

  function onPointerDown(e: PointerEvent<HTMLElement>) {
    if (e.button !== 0 || press.current) return;
    // Captured so a drag that wanders above the bar keeps reporting to it. A
    // pointer that cannot be captured still works as a tap, so a refusal here
    // is not worth losing the press over.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* tap only */
    }
    const i = indexAt(e.clientX);
    press.current = { id: e.pointerId, startX: e.clientX, moved: false, index: i };
    setPointing(i);
    if (slotOf.current === null) {
      slotOf.current = i;
      x.jump(i * slot());
      paint();
    } else {
      glideTo(i);
    }
    show(true);
    liftTo(1);
  }

  function onPointerMove(e: PointerEvent<HTMLElement>) {
    const p = press.current;
    if (!p || e.pointerId !== p.id) return;
    if (!p.moved && Math.abs(e.clientX - p.startX) < SLOP) return;
    p.moved = true;
    const w = slot();
    const max = (n - 1) * w;
    // Centred under the finger, and past either end it resists rather than
    // stopping dead — the bar's edge pushes back the way a scroll view's does.
    const want = innerX(e.clientX) - w / 2;
    const left =
      want < 0 ? rubberband(want, w) : want > max ? max + rubberband(want - max, w) : want;
    if (still()) x.jump(left);
    else void animate(x, left, FOLLOW);
    p.index = indexAt(e.clientX);
    setPointing(p.index);
  }

  function onPointerUp(e: PointerEvent<HTMLElement>) {
    const p = press.current;
    if (!p || e.pointerId !== p.id) return;
    press.current = null;
    liftTo(0);
    glideTo(p.index);
    setPointing(null);
    onSelect(tabs[p.index].id);
  }

  /** The system took the touch (a scroll, a gesture): go back to where we were. */
  function onPointerCancel(e: PointerEvent<HTMLElement>) {
    const p = press.current;
    if (!p || e.pointerId !== p.id) return;
    press.current = null;
    liftTo(0);
    setPointing(null);
    if (currentIdx < 0) {
      show(false);
      slotOf.current = null;
    } else {
      glideTo(currentIdx);
    }
  }

  return (
    // A fixed height in pixels, where the rest of the app scales with the
    // reader's text size: 66 less the 7 of padding at each end leaves 52px
    // targets, and a thumb does not get bigger when you turn the text up.
    //
    // `touch-none` because a drag along the bar is now a gesture of its own,
    // and the page must not take it for a scroll.
    <nav
      ref={navRef}
      aria-label="Sections"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className="glass pointer-events-auto relative flex h-[66px] touch-none select-none rounded-full p-[7px]"
    >
      <span
        ref={blobRef}
        aria-hidden="true"
        className="absolute inset-y-[7px] left-[7px] rounded-full border border-white/[0.12] opacity-0 transition-opacity duration-200 will-change-transform"
      />
      {tabs.map(({ id, label, Icon }, i) => {
        const lit = pointing !== null ? pointing === i : currentIdx === i;
        return (
          <button
            key={id}
            // Pointer presses are handled by the bar above, which is what lets
            // a press become a drag across it. This is the keyboard's and the
            // screen reader's way in: their activations arrive as a click with
            // no count, where a finger's always has one.
            onClick={(e) => {
              if (e.detail === 0) onSelect(id);
            }}
            aria-label={label}
            aria-current={currentIdx === i ? "page" : undefined}
            className={`relative z-[1] grid min-w-0 flex-1 place-items-center rounded-full transition-colors duration-150 ${
              lit ? "text-fg" : "text-dim"
            }`}
          >
            <span
              className="grid place-items-center"
              style={
                lit ? { transform: "scale(calc(1 + var(--lift, 0) * 0.14))" } : undefined
              }
            >
              {/* Keyed on being lit, so lighting up mounts the filled mark
                  fresh and its bounce plays — once per tab you land on. */}
              <Icon
                key={lit ? "on" : "off"}
                size={24}
                filled={lit}
                className={lit && settled ? "tab-pop" : undefined}
              />
            </span>
          </button>
        );
      })}
    </nav>
  );
}
