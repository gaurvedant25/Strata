import { useEffect, useRef, useState } from "react";

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

/** Where a leader line lands, as a fraction of the figure's own box. */
export type Anchor = [x: number, y: number, bilateral?: boolean];

export type CalloutLine = {
  text: string;
  size?: number;
  weight?: number;
  /** Sentence case and no tracking, for a value rather than a label. */
  tight?: boolean;
  dim?: boolean;
  /**
   * Resolve this line out of noise. Off by default: only the values in a
   * callout change from region to region, and scrambling the labels around
   * them made the whole box look like it was reloading rather than drawing
   * attention to the one thing that had actually changed.
   */
  scramble?: boolean;
};

/** Share of the stage width the figure takes; the boxes flank it. */
export const FIG_FRAC = 0.47;

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

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789×@#%";
const dots = (s: string) => s.replace(/[^ ]/g, "·");

const reduced = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  const [out, setOut] = useState(() => (reduced() ? full : dots(full)));
  const start = useRef(0);
  if (!start.current) start.current = performance.now();

  // Restarting on a changed value rather than on a remount matters when the
  // value changes rapidly — dragging a chart, say. Remounting would reset the
  // output to dots on every frame and the effect would never get far enough to
  // show noise, so a fast series of changes would read as a stutter rather
  // than as the value spinning.
  const shown = useRef(full);
  if (shown.current !== full) {
    shown.current = full;
    start.current = performance.now();
  }

  useEffect(() => {
    if (reduced()) {
      setOut(full);
      return;
    }
    const chars = full.split("");
    const noise = () => SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
    const tick = () => {
      const t = performance.now() - start.current - delay;
      if (t < 0) return false;
      const revealed = Math.floor((t - hold) / perChar);
      if (revealed >= chars.length) {
        setOut(full);
        return true;
      }
      setOut(chars.map((c, i) => (i < revealed || c === " " ? c : noise())).join(""));
      return false;
    };
    if (tick()) return;
    const id = setInterval(() => {
      if (tick()) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, [full, delay, perChar, hold]);

  return <>{out}</>;
}

export function Callout({
  side,
  lines,
  anchor,
}: {
  side: "left" | "right";
  lines: CalloutLine[];
  anchor: Anchor;
}) {
  const [rx0, ry] = anchor;
  const isLeft = side === "left";
  // Bilateral regions are drawn on both sides; mirror the anchor for the
  // right-hand box so neither line crosses the body.
  const rx = isLeft || !anchor[2] ? rx0 : 1 - rx0;
  const ax = (0.5 - FIG_FRAC / 2 + rx * FIG_FRAC) * VB_W;
  const ay = ry * VB_H;
  // The box's corner nearest the body. The line stops here rather than running
  // on across the box's top edge: arrival and expansion then happen in the same
  // place, so the two read as one gesture instead of the box opening from the
  // opposite end to the one the line reached.
  const corner = isLeft ? 0.245 * VB_W : 0.755 * VB_W;
  const boxY = Math.min(72, Math.max(8, ay - 9));
  // A short horizontal before the corner keeps the elbow, giving the eye
  // somewhere to land between the diagonal and the box.
  const bend = isLeft ? corner + 6 : corner - 6;
  const leader = `M${ax.toFixed(1)} ${ay.toFixed(1)} L${bend.toFixed(1)} ${boxY.toFixed(1)} H${corner.toFixed(1)}`;

  // Swept from the muscle end towards the corner: at rest the clip sits on the
  // anchor and hides the whole line, and it opens out to the box's corner.
  const axPct = (ax / VB_W) * 100;
  const cornerPct = (corner / VB_W) * 100;
  const edgePct = (p: number) => (isLeft ? `inset(0 0 0 ${p.toFixed(2)}%)` : `inset(0 ${(100 - p).toFixed(2)}% 0 0)`);

  // 0 = nothing, 1 = line drawn, 2 = box in.
  const start = useRef(0);
  if (!start.current) start.current = performance.now();
  const [phase, setPhase] = useState(() => (reduced() ? 2 : 0));

  useEffect(() => {
    if (reduced()) return;
    const compute = () => {
      const t = performance.now() - start.current;
      const p = t >= 315 ? 2 : 1;
      setPhase(p);
      return p === 2;
    };
    const raf = requestAnimationFrame(compute);
    const id = setInterval(() => {
      if (compute()) clearInterval(id);
    }, 60);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
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
          transition: "clip-path 300ms cubic-bezier(.3,.7,.3,1)",
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

      <div
        style={{
          position: "absolute",
          top: `${boxY}%`,
          [isLeft ? "left" : "right"]: 0,
          width: "24.5%",
          maxWidth: 104,
          textAlign: isLeft ? "left" : "right",
          padding: "7px 8px",
          boxSizing: "border-box",
          border: "1px solid #1f1f1f",
          borderRadius: 3,
          background: "transparent",
          pointerEvents: "none",
          // Opens from the corner the line arrives at, so the box unfolds away
          // from the body rather than towards it.
          transformOrigin: isLeft ? "top right" : "top left",
          transform: phase > 1 ? "scale(1)" : "scale(.18)",
          opacity: phase > 1 ? 1 : 0,
          transition: "transform 180ms cubic-bezier(.22,.61,.36,1), opacity 135ms ease-out",
          zIndex: 4,
        }}
      >
        {lines.map((l, i) => (
          <div
            key={i}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: l.size ?? 10,
              fontWeight: l.weight ?? 500,
              letterSpacing: l.tight ? "0" : ".1em",
              textTransform: l.tight ? "none" : "uppercase",
              lineHeight: 1.35,
              color: l.dim ? "#666" : "#f5f5f5",
              marginTop: i ? 3 : 0,
              whiteSpace: l.tight ? "nowrap" : "normal",
              overflowWrap: "break-word",
            }}
          >
            {l.scramble ? <Scramble text={l.text} delay={480 + i * 53} /> : l.text}
          </div>
        ))}
      </div>
    </>
  );
}
