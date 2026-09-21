import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * The annotation that draws itself onto the figure: a leader line snaps out
 * from the muscle, a box pops in at the edge of the frame, and its text
 * resolves out of noise.
 *
 * Everything is timed off a wall clock captured on mount rather than off React
 * state, because the Strength screen re-renders every second to keep relative
 * timestamps fresh. Driving the animation from render would restart it on each
 * tick; reading elapsed time means a re-render resumes where it left off.
 */

/**
 * The smallest a callout line is allowed to be drawn.
 *
 * These boxes carried the app's smallest type — labels were being passed in at
 * 8px, set in caps and tracked wide, which is the least readable combination
 * there is. They are lifted to the same 11px floor the rest of the app uses.
 */
const LABEL_FLOOR_PX = 11;

import type { Anchor } from "../lib/anatomy/anchors";

export type { Anchor };

export type CalloutLine = {
  text: string;
  size?: number;
  weight?: number;
  /** Sentence case and no tracking, for a value rather than a label. */
  tight?: boolean;
  /**
   * Let a `tight` line break across lines.
   *
   * `tight` normally implies `nowrap`, because the things set that way are
   * figures — "100 × 10", "+13.3%" — and a figure broken in half is not a
   * figure. A sentence is the exception: it wants the plain case and the
   * ordinary tracking a figure gets, and it has to be allowed to wrap, because
   * the box is a quarter of the stage wide and no sentence fits that.
   */
  wrap?: boolean;
  dim?: boolean;
  /**
   * Resolve this line out of noise. Off by default: only the values in a
   * callout change from region to region, and scrambling the labels around
   * them made the whole box look like it was reloading rather than drawing
   * attention to the one thing that had actually changed.
   */
  scramble?: boolean;
};

/**
 * Share of the stage width the figure takes; the boxes flank it.
 *
 * Trimmed from 0.47 to give the boxes the room the 11px label floor needs.
 * Their labels are mono, uppercase and tracked wide, which is the widest way
 * there is to set a word, and at the old 8px they only just fit — lifted to a
 * legible size, "ESTIMATED" broke across two lines. The figure gives up about
 * four percent of its slice, which it can afford; the labels could not afford
 * to stay unreadable.
 */
export const FIG_FRAC = 0.45;

/** Share of the stage width one flanking box takes. Two of them plus the
 *  figure come to just under the full stage. */
const BOX_FRAC = 0.27;

/**
 * Stage shape, as width / height.
 *
 * Deliberately taller than the 110x100 coordinate space below. The figure is
 * drawn to fit its slice of the stage, so with a stage wider than it is tall
 * the height was what bound its size and widening its slice alone bought
 * nothing. A portrait stage lets the figure grow with the room it is given.
 */
export const STAGE_ASPECT = 0.92;

/** The coordinate space the leader lines and boxes are positioned in. */
export const VB_W = 110;
export const VB_H = 100;

/** How long the leader line takes to reach the box. */
const LINE_MS = 300;
/** How long the box takes to open once it does. */
const BOX_MS = 180;
/**
 * When the text inside the box starts to resolve.
 *
 * As the box begins to open, not after it has finished. A churning line is
 * held invisible until its own turn comes, so waiting for the box to settle
 * first meant a fully-drawn empty box sitting there for a fifth of a second —
 * unnoticeable on arrival, but plain to see on every change of region once
 * these lines churn rather than roll. Filling as it opens is one gesture.
 */
const CHURN_MS = LINE_MS;

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789×@#%";

const reduced = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Whether the page is out of sight.
 *
 * A hidden page does not run animation frames at all and clamps its timers to
 * about a second, so an arrival started there does not play — it stalls partway
 * and stays there. The line is the half that suffers: it is revealed on the
 * next frame, which never comes, while the box is on a timer that eventually
 * fires. What you come back to, or what the app switcher screenshotted while
 * you were away, is a fully drawn box with its leader line stopping short of
 * the corner — which reads as a broken drawing rather than as an animation
 * caught in the middle.
 *
 * So an arrival nobody can watch is not played. It is not a shortcut for
 * saving work; it is the only way the callout is guaranteed to be whole
 * whenever it is next looked at.
 */
const hidden = () =>
  typeof document !== "undefined" && document.visibilityState === "hidden";

/**
 * Resolves text out of noise, one character at a time.
 *
 * Give it a `key` that changes with the value to replay it — progress is read
 * off a clock captured on mount, so a remount is what restarts it. Pair it with
 * a monospace face: the substituted glyphs are arbitrary, and in a proportional
 * one the text would jitter its own width while it settles.
 */
export function Scramble({
  text,
  delay = 0,
  perChar = 41,
  hold = 0,
}: {
  text: string;
  /** Wait before anything happens, e.g. for a box to finish arriving. */
  delay?: number;
  /** How long each character takes to settle. */
  perChar?: number;
  /**
   * Churn every character for this long before any of them settle.
   *
   * A long label resolves slowly enough to read simply because it has many
   * characters. A two-digit number is finished in about a tenth of a second and
   * registers as a flicker, so short values need to be held in noise first.
   */
  hold?: number;
}) {
  const full = String(text);
  /*
   * Held invisible until the churn actually starts.
   *
   * The value is rendered in full from the first paint so the line reserves its
   * real width and nothing reflows when the noise arrives — it is simply not
   * drawn yet. It used to sit as a row of dots instead, which for anything with
   * a delay meant half a second of visible placeholder before the effect began:
   * you saw the dashes, not the value resolving.
   */
  const [out, setOut] = useState(full);
  // Hidden pages get the value outright, for the reason given on `hidden`: the
  // churn is driven by a timer that a hidden page clamps to about a second, and
  // a line waiting its turn is not drawn at all — so an unwatched arrival would
  // leave the box standing there with its values blank.
  const [churning, setChurning] = useState(() => reduced() || hidden());
  const start = useRef(0);
  if (!start.current) start.current = performance.now();

  // Restarting on a changed value rather than on a remount matters when the
  // value changes rapidly — dragging a chart, say. Remounting would reset the
  // output on every frame and the effect would never get far enough to show
  // noise, so a fast series of changes would read as a stutter rather than as
  // the value spinning.
  const shown = useRef(full);
  if (shown.current !== full) {
    shown.current = full;
    start.current = performance.now();
    // A delayed replay hides again rather than showing the new value early.
    if (delay > 0 && !reduced() && !hidden()) setChurning(false);
  }

  useEffect(() => {
    if (reduced() || hidden()) {
      setOut(full);
      setChurning(true);
      return;
    }
    const chars = full.split("");
    const noise = () =>
      SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
    const tick = () => {
      const t = performance.now() - start.current - delay;
      if (t < 0) return false;
      setChurning(true);
      const revealed = Math.floor((t - hold) / perChar);
      if (revealed >= chars.length) {
        setOut(full);
        return true;
      }
      setOut(
        chars.map((c, i) => (i < revealed || c === " " ? c : noise())).join(""),
      );
      return false;
    };
    if (tick()) return;
    const id = setInterval(() => {
      if (tick()) clearInterval(id);
    }, 40);
    // Walking away settles the value where it stands, so what you return to is
    // the number and not a frozen row of noise.
    const land = () => {
      if (!hidden()) return;
      clearInterval(id);
      setOut(full);
      setChurning(true);
    };
    document.addEventListener("visibilitychange", land);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", land);
    };
  }, [full, delay, perChar, hold]);

  return (
    <span style={{ visibility: churning ? undefined : "hidden" }}>{out}</span>
  );
}

export function Callout({
  side,
  lines,
  anchor,
  onClick,
  label,
}: {
  side: "left" | "right";
  lines: CalloutLine[];
  anchor: Anchor;
  /**
   * Makes the box itself the control.
   *
   * A box reading "no data / log a lift" is an instruction with nowhere to go,
   * and it is the thing on the screen people reach for first. Given a handler
   * it becomes a real button — the only state in which the box takes pointer
   * events at all, so a box that merely reports a number stays inert and out of
   * the way of the figure behind it.
   */
  onClick?: () => void;
  /** What the button announces, since the lines inside are fragments. */
  label?: string;
}) {
  const [rx, ry] = anchor;
  const isLeft = side === "left";
  const ax = (0.5 - FIG_FRAC / 2 + rx * FIG_FRAC) * VB_W;
  const ay = ry * VB_H;
  // The box's corner nearest the body. The line stops here rather than running
  // on across the box's top edge: arrival and expansion then happen in the same
  // place, so the two read as one gesture instead of the box opening from the
  // opposite end to the one the line reached.
  //
  // Read off `BOX_FRAC` rather than written as its own number. It used to be a
  // hardcoded 0.245 of the stage while the box was 0.27 of it, so the line
  // overshot the corner by that 2.5% and ran on along the top edge — the exact
  // thing the paragraph above says it must not do. One constant now decides
  // both where the box starts and where the line lands, at every width.
  const corner = isLeft ? BOX_FRAC * VB_W : (1 - BOX_FRAC) * VB_W;
  const boxY = Math.min(72, Math.max(8, ay - 9));
  // A short horizontal before the corner keeps the elbow, giving the eye
  // somewhere to land between the diagonal and the box.
  const bend = isLeft ? corner + 6 : corner - 6;
  const leader = `M${ax.toFixed(1)} ${ay.toFixed(1)} L${bend.toFixed(1)} ${boxY.toFixed(1)} H${corner.toFixed(1)}`;

  // Swept from the muscle end towards the corner: at rest the clip sits on the
  // anchor and hides the whole line, and it opens out to the box's corner.
  const axPct = (ax / VB_W) * 100;
  const cornerPct = (corner / VB_W) * 100;
  const edgePct = (p: number) =>
    isLeft
      ? `inset(0 0 0 ${p.toFixed(2)}%)`
      : `inset(0 ${(100 - p).toFixed(2)}% 0 0)`;

  // 0 = nothing, 1 = line drawn, 2 = box in.
  const start = useRef(0);
  if (!start.current) start.current = performance.now();
  const [phase, setPhase] = useState(() => (reduced() || hidden() ? 2 : 0));

  useEffect(() => {
    if (reduced() || hidden()) return;
    // Timed, not polled. This used to check the clock every 60ms, so the box
    // waited for whichever tick came after the line landed — up to a frame and
    // a half of nothing happening, which is the pause that was visible. Firing
    // at exactly the line's own duration hands one straight to the other.
    const raf = requestAnimationFrame(() => setPhase(1));
    const id = setTimeout(
      () => setPhase(2),
      Math.max(0, LINE_MS - (performance.now() - start.current)),
    );
    // Leaving mid-arrival lands the whole thing, for the same reason: the
    // frames it still needed are not going to be granted while you are away.
    const land = () => {
      if (hidden()) setPhase(2);
    };
    document.addEventListener("visibilitychange", land);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(id);
      document.removeEventListener("visibilitychange", land);
    };
  }, []);

  const reveal = edgePct(phase ? cornerPct : axPct);

  return (
    <>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          overflow: "visible",
          zIndex: 3,
          /**
           * The line is revealed by sweeping a clip out from the muscle.
           *
           * The obvious way — a dash the length of the path, offset to nothing
           * and animated to zero — cannot work here. The stroke has to be
           * non-scaling, because preserveAspectRatio="none" stretches this SVG
           * unevenly and a scaled stroke would come out lopsided; but a
           * non-scaling stroke also measures its dashes in screen pixels, while
           * pathLength normalises to user units. The two do not meet, and the
           * result was a 1px-on, 1px-off dotted line rather than one drawn
           * stroke — invisible against black, obvious across a lit muscle.
           */
          clipPath: reveal,
          transition: `clip-path ${LINE_MS}ms var(--ease-settle)`,
        }}
      >
        {/* a black casing under the hairline, so it stays legible over a lit muscle */}
        <path
          d={leader}
          fill="none"
          stroke="#000"
          strokeWidth="3.5"
          strokeOpacity="0.9"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={leader}
          fill="none"
          stroke="#8b8b90"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <Box
        onClick={onClick}
        label={label}
        style={{
          position: "absolute",
          top: `${boxY}%`,
          [isLeft ? "left" : "right"]: 0,
          // No pixel cap on top of the fraction: a cap that bit would put the
          // box's edge somewhere the leader line, which is measured in stage
          // fractions, could not know about. The stage is already bounded by
          // the app's own max width, so the fraction alone is the whole rule.
          width: `${BOX_FRAC * 100}%`,
          textAlign: isLeft ? "left" : "right",
          padding: "7px 8px",
          boxSizing: "border-box",
          border: "1px solid var(--color-faint)",
          borderRadius: 3,
          background: "transparent",
          pointerEvents: onClick ? "auto" : "none",
          cursor: onClick ? "pointer" : undefined,
          // Opens from the corner the line arrives at, so the box unfolds away
          // from the body rather than towards it.
          transformOrigin: isLeft ? "top right" : "top left",
          transform: phase > 1 ? "scale(1)" : "scale(.18)",
          opacity: phase > 1 ? 1 : 0,
          transition: `transform ${BOX_MS}ms var(--ease-settle), opacity ${Math.round(BOX_MS * 0.75)}ms var(--ease-settle)`,
          zIndex: 4,
        }}
      >
        {lines.map((l, i) => (
          <div
            key={i}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: `${Math.max(l.size ?? 11, LABEL_FLOOR_PX) / 16}rem`,
              fontWeight: l.weight ?? 500,
              letterSpacing: l.tight ? "0" : ".1em",
              textTransform: l.tight ? "none" : "uppercase",
              lineHeight: 1.35,
              color: l.dim ? "var(--color-dim)" : "var(--color-fg)",
              marginTop: i ? 3 : 0,
              whiteSpace: l.tight && !l.wrap ? "nowrap" : "normal",
              overflowWrap: "break-word",
            }}
          >
            {l.scramble ? (
              <Scramble text={l.text} delay={CHURN_MS + i * 53} />
            ) : (
              l.text
            )}
          </div>
        ))}
      </Box>
    </>
  );
}

/**
 * The callout box: a plain div when it only reports, a button when it acts.
 *
 * Kept as one component so the box's geometry is written once — the leader line
 * is measured against it, and a second copy of these numbers would be a second
 * place for the line to stop meeting the corner.
 */
function Box({
  onClick,
  label,
  style,
  children,
}: {
  onClick?: () => void;
  label?: string;
  style: CSSProperties;
  children: ReactNode;
}) {
  if (!onClick) return <div style={style}>{children}</div>;
  return (
    <button type="button" onClick={onClick} aria-label={label} style={style}>
      {children}
    </button>
  );
}
