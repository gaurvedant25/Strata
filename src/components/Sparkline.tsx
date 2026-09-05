import { useEffect, useRef, useState, type PointerEvent } from "react";

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

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Pt = { x: number; y: number };

const reduced = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Sparkline({
  values,
  labels,
  selected = null,
  onSelect,
  width = 350,
  height = 168,
  padT = 8,
  padB = 26,
  stroke = "#f5f5f5",
  strokeWidth = 1.6,
  showBaseline = true,
  showPoints = true,
}: {
  values: number[];
  /** First and last captions, drawn on the baseline. */
  labels?: [string, string];
  /** Index of the point being inspected, or null for none. */
  selected?: number | null;
  /**
   * Omit to make the chart non-interactive. `via` says which gesture produced
   * the selection: a tap lands on one session, a drag sweeps across many.
   */
  onSelect?: (i: number, via: "tap" | "drag") => void;
  width?: number;
  height?: number;
  padT?: number;
  padB?: number;
  stroke?: string;
  strokeWidth?: number;
  showBaseline?: boolean;
  showPoints?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const down = useRef(false);
  const startX = useRef(0);
  /** Set once the pointer has travelled far enough to be a drag, not a tap. */
  const moved = useRef(false);

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
  const [p, setP] = useState(1);
  const raf = useRef(0);

  const key = values.join(",");
  if (shownKey.current !== key) {
    // Anything but the very first render has a series to travel away from.
    from.current = shownKey.current === "" ? null : parseKeyed(shownKey.current);
    shownKey.current = key;
  }

  useEffect(() => {
    if (!from.current || reduced() || !values.length) {
      setP(1);
      return;
    }
    setP(0);
    const t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / MORPH_MS);
      setP(t);
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // the joined key is what actually identifies a series change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!values.length) return null;

  const inner = height - padT - padB;

  /** Positions for one series, in this chart's pixel space, on its own scale. */
  function geom(vals: number[]) {
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    // A flat series would divide by zero; give it a span and it draws level.
    const span = max - min || 1;
    const px = (i: number) => (vals.length === 1 ? width / 2 : (i / (vals.length - 1)) * width);
    const py = (v: number) => padT + inner - ((v - min) / span) * inner;
    const pts: Pt[] = vals.map((v, i) => ({ x: +px(i).toFixed(1), y: +py(v).toFixed(1) }));
    /** The point a fraction `t` of the way along the series. */
    const at = (t: number): Pt => {
      if (vals.length === 1) return pts[0];
      const f = t * (vals.length - 1);
      const lo = Math.max(0, Math.min(vals.length - 2, Math.floor(f)));
      const k = f - lo;
      return { x: lerp(pts[lo].x, pts[lo + 1].x, k), y: lerp(pts[lo].y, pts[lo + 1].y, k) };
    };
    return { pts, at };
  }

  const to = geom(values);
  const morphing = p < 1 && !!from.current && from.current.length > 0;
  const old = morphing ? geom(from.current!) : null;
  const e = easeOut(p);

  // The line is sampled at a fixed resolution so it can morph between any two
  // point counts without either series dictating the other's shape.
  const path = (() => {
    if (!morphing || !old) return to.pts.map((q, i) => `${i ? "L" : "M"}${q.x} ${q.y}`).join("");
    let d = "";
    for (let i = 0; i < PATH_STEPS; i++) {
      const t = i / (PATH_STEPS - 1);
      const a = old.at(t);
      const b = to.at(t);
      d += `${i ? "L" : "M"}${lerp(a.x, b.x, e).toFixed(1)} ${lerp(a.y, b.y, e).toFixed(1)}`;
    }
    return d;
  })();

  const last = to.pts[to.pts.length - 1];
  const baseline = padT + inner;
  const sel = !morphing && selected != null && to.pts[selected] ? to.pts[selected] : null;

  // Old markers leave and new ones arrive over the tail of the morph.
  const handover = Math.max(0, (p - HANDOVER) / (1 - HANDOVER));
  const leaving = morphing ? 1 - handover : 0;
  const arriving = morphing ? handover : 1;

  /** Maps a pointer position onto the nearest session. */
  function pick(ev: PointerEvent<SVGSVGElement>, via: "tap" | "drag") {
    if (!onSelect) return;
    const rect = svg.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const ratio = (ev.clientX - rect.left) / rect.width;
    const i = Math.round(ratio * (values.length - 1));
    onSelect(Math.max(0, Math.min(values.length - 1, i)), via);
  }

  // Points crowd together on a long history, so they thin out rather than
  // merging into a dotted rule.
  const markers = showPoints && values.length <= 60;

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      style={{
        display: "block",
        overflow: "visible",
        touchAction: onSelect ? "pan-y" : undefined,
        cursor: onSelect ? "crosshair" : undefined,
      }}
      onPointerDown={(ev) => {
        if (!onSelect) return;
        down.current = true;
        moved.current = false;
        startX.current = ev.clientX;
        ev.currentTarget.setPointerCapture(ev.pointerId);
        // Nothing is selected yet: until the pointer moves this could still be
        // a tap, and the two are reported differently.
      }}
      onPointerMove={(ev) => {
        if (!down.current) return;
        if (!moved.current && Math.abs(ev.clientX - startX.current) > 4) moved.current = true;
        if (moved.current) pick(ev, "drag");
      }}
      onPointerUp={(ev) => {
        if (!down.current) return;
        down.current = false;
        if (!moved.current) pick(ev, "tap");
      }}
      onPointerCancel={() => {
        down.current = false;
      }}
    >
      {showBaseline && (
        <line x1="0" x2={width} y1={baseline} y2={baseline} stroke="#1a1a1a" strokeWidth="1" />
      )}

      {/* the inspected session, called out with a full-height rule */}
      {sel && (
        <line
          x1={sel.x}
          x2={sel.x}
          y1={padT - 4}
          y2={baseline}
          stroke="#3a3a3a"
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
      />

      {/* markers of the series being left, travelling to where they belong on
          the new curve before they go */}
      {markers &&
        morphing &&
        old &&
        old.pts.map((a, i) => {
          const b = to.at(old.pts.length === 1 ? 1 : i / (old.pts.length - 1));
          return (
            <circle
              key={`leave-${i}`}
              cx={lerp(a.x, b.x, e)}
              cy={lerp(a.y, b.y, e)}
              r={1.9}
              fill="#000"
              stroke={stroke}
              strokeWidth="1"
              opacity={leaving}
            />
          );
        })}

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
            opacity={(sel && i !== selected ? 0.45 : 1) * arriving}
          />
        ))}

      <circle
        cx={sel ? sel.x : last.x}
        cy={sel ? sel.y : last.y}
        r={strokeWidth > 1.5 ? 3.5 : 3}
        fill="#f5f5f5"
        opacity={arriving}
      />

      {labels && !sel && (
        <>
          <text
            x="0"
            y={height - 4}
            fill="#666"
            fontSize="10"
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
            fill="#666"
            fontSize="10"
            fontFamily="IBM Plex Mono, monospace"
            letterSpacing="1"
            opacity={arriving}
          >
            {labels[1]}
          </text>
        </>
      )}
    </svg>
  );
}

function parseKeyed(key: string) {
  return key.split(",").map(Number);
}
