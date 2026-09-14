import { useRef } from "react";
import { animate } from "motion";
import { velocityOf } from "../lib/gesture";

/*
 * Track geometry, from the canvas.
 *
 * `INSET` is derived rather than written down, because absolute offsets inside
 * the track are measured from its padding edge while its height is a
 * border-box figure — so the hairline border has to come out of the sum or the
 * thumb sits a pixel low, which is exactly what it did.
 */
const TRACK_H = 66;
const THUMB = 56;
const BORDER = 1;
const INSET = (TRACK_H - BORDER * 2 - THUMB) / 2;
/** How close to the end counts as arrived, so the last few pixels are forgiving. */
const SLOP = 4;
/** Movement under this is a tap that wobbled, not a slide. */
const TAP_SLOP = 3;

/** Dark green at rest, Apple's system green at the end of the travel. */
const FROM = [20, 50, 34];
const TO = [48, 209, 88];

const reduced = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Starting a workout, by pushing it.
 *
 * A workout is the one thing in this app you cannot undo by tapping again — it
 * begins a session, starts a clock, and the way out is a confirmation. A
 * deliberate gesture is the right weight for that, where a plain button invites
 * the accidental press.
 *
 * The thumb is a real button, not a div with a pointer handler. Dragging is the
 * gesture the design is built around, but it cannot be the only way in: a
 * gesture is exactly the interaction someone with limited dexterity, a switch
 * control or a keyboard cannot perform, and this is core functionality. So the
 * same control starts the workout on Enter, on Space, and on a plain tap — the
 * drag is the flourish on top, not the mechanism.
 *
 * Nothing here is React state. The thumb, the fill and the label are written
 * straight to the DOM while a finger is down, for the same reason the body map
 * is: a value that changes every frame has no business causing a render.
 */
export function SlideToStart({
  label,
  onStart,
  disabled,
  verb = "Start",
}: {
  /** Names what is being started or resumed, for the accessible name. */
  label: string;
  onStart: () => void;
  disabled?: boolean;
  /**
   * What the slide will actually do. A workout already running is not started
   * again by this control, it is returned to — and a track that still said
   * "start" would be describing something that cannot happen.
   */
  verb?: "Start" | "Resume";
}) {
  const track = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLButtonElement>(null);
  const hint = useRef<HTMLSpanElement>(null);
  const pointer = useRef<number | null>(null);
  const armed = useRef(false);
  /** Recent positions, for measuring the speed of the release. */
  const trail = useRef<{ x: number; t: number }[]>([]);
  /**
   * Whether the press turned into a drag.
   *
   * A pointer that goes down and up on the same element produces a `click`
   * afterwards, drag or no drag — so without this the tap route below fired at
   * the end of every slide, and letting go halfway started the workout anyway.
   * Checking that the pointer had been released was no guard at all: releasing
   * it is precisely what precedes the click.
   */
  const dragged = useRef(false);
  /** The spring currently carrying the thumb home, so a new grab can cut it off. */
  const settling = useRef<{ stop: () => void } | null>(null);

  /** Paints one position of the travel. Nothing here goes through React. */
  const paint = (x: number, max: number) => {
    /*
     * The thumb bounces off its own rest position rather than travelling past
     * it.
     *
     * Rest is where the thumb is already seated against the end of the slot, so
     * there is nowhere left of it to go — four pixels, and the spring wants
     * forty. Every attempt to fit that swing into those pixels, a clamp and
     * then a `tanh`, produced the same thing: the figure saturates almost
     * immediately and the thumb sits motionless at the wall for the half second
     * the spring spends out there. Squeezing was the wrong idea; any map from
     * forty pixels onto four has to spend most of its time at the bottom.
     *
     * Reflecting instead is both cheaper and truer. A thing that runs into the
     * end of its slot does not compress into the wall, it comes back off it —
     * so the sign is folded and the whole rebound plays out to the right, where
     * there is a full track of room for it. What the eye gets is a ball
     * dropped on a floor: down, up twenty-six, down, up five, down, up one,
     * still. Nothing is ever clamped, so nothing can ever stick.
     */
    const shown = Math.abs(x);
    const t = max > 0 ? Math.max(0, Math.min(1, shown / max)) : 0;
    const mix = (i: number) => Math.round(FROM[i] + (TO[i] - FROM[i]) * t);
    if (thumb.current) {
      thumb.current.style.transform = `translateX(${shown}px)`;
    }
    if (fill.current) {
      // Never narrower than the thumb, or the rebound would expose the green
      // it is supposed to be hiding.
      fill.current.style.width = `${THUMB + Math.max(0, shown)}px`;
      fill.current.style.background = `rgb(${mix(0)},${mix(1)},${mix(2)})`;
    }
    // The instruction fades out well before the end: once you are clearly
    // committed it has done its job and is only in the way of the colour.
    if (hint.current)
      hint.current.style.opacity = String(Math.max(0, 1 - t * 1.5));
  };

  const maxOf = () => {
    const w = track.current?.getBoundingClientRect().width ?? 0;
    return Math.max(0, w - BORDER * 2 - THUMB - INSET * 2);
  };

  function down(e: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || pointer.current !== null) return;
    // Catching a thumb still on its way home stops it where it is, so the drag
    // picks up from what the eye can see rather than from where it was headed.
    settling.current?.stop();
    settling.current = null;
    pointer.current = e.pointerId;
    armed.current = false;
    dragged.current = false;
    trail.current = [{ x: e.clientX, t: performance.now() }];
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || e.pointerId !== pointer.current) return;
    const rect = track.current?.getBoundingClientRect();
    if (!rect) return;
    const max = maxOf();
    const x = Math.max(
      0,
      Math.min(max, e.clientX - rect.left - BORDER - INSET - THUMB / 2),
    );
    armed.current = x >= max - SLOP;
    // Enough travel to be an intent rather than the wobble in a tap.
    if (Math.abs(e.clientX - (trail.current[0]?.x ?? e.clientX)) > TAP_SLOP)
      dragged.current = true;
    trail.current.push({ x: e.clientX, t: performance.now() });
    if (trail.current.length > 8) trail.current.shift();
    paint(x, max);
  }

  function up(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerId !== pointer.current) return;
    pointer.current = null;
    // `up` also serves pointercancel, where the browser has already taken the
    // capture back and releasing it again throws — which would strand the thumb
    // wherever the cancelled gesture left it.
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* already released */
    }
    const max = maxOf();
    if (armed.current) {
      // Left at the end rather than snapped back, so the control still reads as
      // thrown when the screen it opens takes over.
      paint(max, max);
      armed.current = false;
      onStart();
      return;
    }

    const rect = track.current?.getBoundingClientRect();
    const from = rect
      ? Math.max(
          0,
          Math.min(
            max,
            (trail.current[trail.current.length - 1]?.x ?? rect.left) -
              rect.left -
              BORDER -
              INSET -
              THUMB / 2,
          ),
        )
      : 0;

    if (reduced()) {
      paint(0, max);
      return;
    }

    /*
     * Let go short of the end and the thumb does not merely retract — it is
     * pulled back, arrives with the speed it was carrying, and rocks once
     * before it settles.
     *
     * A spring rather than a curve because the finger's own speed goes into it:
     * release it drifting and it eases home, throw it and it snaps and rebounds.
     * This is the one place in the app where visible bounce belongs — an
     * abandoned gesture, where the overshoot is what says the control refused
     * rather than that it merely reset.
     */
    const controls = animate(from, 0, {
      type: "spring",
      /*
       * Every peak of this spring is now a visible bounce rather than only the
       * ones that happened to fall on the right, so it needs far less of them
       * than when half the motion was being lost into the wall: 0.55 comes off
       * the stop at twenty-six pixels, then five, then one.
       *
       * Duration is what governs whether it looks hurried, not bounce — three
       * clean bounces in 0.85s, spread far enough apart to be counted rather
       * than blurring into a vibration.
       */
      duration: 0.85,
      bounce: 0.55,
      velocity: velocityOf(trail.current) * 1000,
      onUpdate: (v) => paint(v, max),
    });
    settling.current = { stop: () => controls.stop() };
    void controls.finished.then(() => {
      settling.current = null;
    });
  }

  return (
    <div
      ref={track}
      style={{ height: TRACK_H }}
      className="relative select-none rounded-full border border-faint bg-[#050505] touch-none"
    >
      <div
        ref={fill}
        aria-hidden="true"
        /*
         * Sized and placed to sit exactly under the thumb at rest, so the track
         * reads as empty until you actually push it. Spanning the full inner
         * height instead — as the canvas draws it — leaves a green ring
         * standing proud of the circle on all four sides before the gesture has
         * even started, which reads as a rendering fault rather than as a
         * control waiting to be filled.
         */
        style={{
          position: "absolute",
          top: INSET,
          left: INSET,
          height: THUMB,
          width: THUMB,
          borderRadius: 999,
          background: `rgb(${FROM.join(",")})`,
        }}
      />
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <span
          ref={hint}
          className={`font-mono text-[0.75rem] font-semibold uppercase tracking-[0.22em] ${
            reduced() ? "text-dim" : "slide-glow"
          }`}
        >
          Slide to {verb.toLowerCase()}
        </span>
      </div>
      <button
        ref={thumb}
        type="button"
        disabled={disabled}
        aria-label={`${verb} ${label}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        // A tap or a key press is the whole gesture at once — the drag is an
        // enhancement, never the only route in.
        // The tap and keyboard route in. Suppressed after a drag, because the
        // browser raises a click at the end of one either way and a slide that
        // stopped short means the opposite of start.
        onClick={() => {
          if (disabled) return;
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          onStart();
        }}
        style={{ width: THUMB, height: THUMB, top: INSET, left: INSET }}
        className="absolute grid cursor-grab place-items-center rounded-full bg-fg text-black shadow-[0_2px_18px_rgba(0,0,0,0.6)] active:cursor-grabbing disabled:opacity-40"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 5l6.5 7L7 19" />
          <path d="M14 5l6.5 7L14 19" />
        </svg>
      </button>
    </div>
  );
}
