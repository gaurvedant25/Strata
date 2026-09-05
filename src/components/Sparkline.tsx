/**
 * The only chart in the app: a hairline through the points, a rule at the
 * floor, and a dot on the latest value.
 *
 * It replaced a Recharts line chart with axes, a grid and a tooltip. On a
 * screen whose whole argument is that structure comes from rules and type, a
 * charting library's furniture was the loudest thing on it — and the numbers
 * that furniture existed to label are now set in type above the chart, where
 * they read better anyway.
 */
export function Sparkline({
  values,
  width = 350,
  height = 168,
  padT = 8,
  padB = 26,
  stroke = "#f5f5f5",
  strokeWidth = 1.6,
  showBaseline = true,
  labels,
}: {
  values: number[];
  width?: number;
  height?: number;
  padT?: number;
  padB?: number;
  stroke?: string;
  strokeWidth?: number;
  showBaseline?: boolean;
  /** Optional first/last captions, drawn on the baseline. */
  labels?: [string, string];
}) {
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

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      style={{ display: "block", overflow: "visible" }}
    >
      {showBaseline && (
        <line x1="0" x2={width} y1={baseline} y2={baseline} stroke="#1a1a1a" strokeWidth="1" />
      )}
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last.x} cy={last.y} r={strokeWidth > 1.5 ? 3.5 : 3} fill="#f5f5f5" />
      {labels && (
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
