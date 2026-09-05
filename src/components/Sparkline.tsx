import { useRef, type PointerEvent } from "react";

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
  /** Omit to make the chart non-interactive. */
  onSelect?: (i: number | null) => void;
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
  const dragging = useRef(false);

  if (!values.length) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero; give it a span and it draws a level line.
  const span = max - min || 1;
  const inner = height - padT - padB;
  const x = (i: number) => (values.length === 1 ? width / 2 : (i / (values.length - 1)) * width);
  const y = (v: number) => padT + inner - ((v - min) / span) * inner;

  const pts = values.map((v, i) => ({ x: +x(i).toFixed(1), y: +y(v).toFixed(1) }));
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join("");
  const last = pts[pts.length - 1];
  const baseline = padT + inner;
  const sel = selected != null && pts[selected] ? pts[selected] : null;

  /** Maps a pointer position onto the nearest session. */
  function pick(e: PointerEvent<SVGSVGElement>) {
    if (!onSelect) return;
    const rect = svg.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    const i = Math.round(ratio * (values.length - 1));
    onSelect(Math.max(0, Math.min(values.length - 1, i)));
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
      onPointerDown={(e) => {
        if (!onSelect) return;
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e);
      }}
      onPointerMove={(e) => {
        if (dragging.current) pick(e);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
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
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {markers &&
        pts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={1.9}
            fill="#000"
            stroke={stroke}
            strokeWidth="1"
            opacity={sel && i !== selected ? 0.45 : 1}
          />
        ))}

      <circle
        cx={sel ? sel.x : last.x}
        cy={sel ? sel.y : last.y}
        r={strokeWidth > 1.5 ? 3.5 : 3}
        fill="#f5f5f5"
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
          >
            {labels[1]}
          </text>
        </>
      )}
    </svg>
  );
}
