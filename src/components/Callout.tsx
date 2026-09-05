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
  /** Off for text that should appear whole. */
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
  const edge = isLeft ? 0.245 * VB_W : 0.755 * VB_W;
  // The horizontal run lands on the box's top inner edge, so it never crosses
  // a row of glyphs while still passing behind the box.
  const boxY = Math.min(72, Math.max(8, ay - 9));
  const elbow = isLeft ? edge + 5.5 : edge - 5.5;
  const farEdge = isLeft ? 0 : VB_W;
  const leader = `M${ax.toFixed(1)} ${ay.toFixed(1)} L${elbow.toFixed(1)} ${boxY.toFixed(1)} H${farEdge}`;

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
          transformOrigin: `${((ax / VB_W) * 100).toFixed(1)}% ${((ay / VB_H) * 100).toFixed(1)}%`,
          transform: phase ? "scale(1)" : "scale(.06)",
          opacity: phase ? 1 : 0,
          transition: "transform 300ms cubic-bezier(.3,.7,.3,1), opacity 150ms ease-out",
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
          transformOrigin: isLeft ? "top left" : "top right",
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
            {l.scramble === false ? l.text : <Scramble text={l.text} delay={480 + i * 53} />}
          </div>
        ))}
      </div>
    </>
  );
}
