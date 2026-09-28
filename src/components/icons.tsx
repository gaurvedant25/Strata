import { useId } from "react";

type P = { className?: string; size?: number };

const base = (size = 22) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

/** The small "tune" control that sits in the corner of every dashboard card. */
export const Tune = ({ className, size = 16 }: P) => (
  <svg {...base(size)} strokeWidth={1.9} className={className}>
    <path d="M3 8h13M19 8h2M3 16h5M11 16h10" />
    <circle cx="17.5" cy="8" r="2.1" />
    <circle cx="9.5" cy="16" r="2.1" />
  </svg>
);

export const Plus = ({ className, size = 20 }: P) => (
  <svg {...base(size)} strokeWidth={2} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const Minus = ({ className, size = 20 }: P) => (
  <svg {...base(size)} strokeWidth={2} className={className}>
    <path d="M5 12h14" />
  </svg>
);

export const Check = ({ className, size = 20 }: P) => (
  <svg {...base(size)} strokeWidth={2.4} className={className}>
    <path d="M4.5 12.5 9.5 17.5 19.5 7" />
  </svg>
);

export const X = ({ className, size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={2} className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/**
 * The share mark: a sheet with something leaving the top of it.
 *
 * The platform arrow-out-of-a-box rather than the three linked dots. The dots
 * are an Android convention and read as "connections" on an iPhone, where this
 * one is the glyph on the button every share sheet in the OS opens from.
 */
export const Share = ({ className, size = 18 }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 16V4M8 8l4-4 4 4" />
    <path d="M5 14v4.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V14" />
  </svg>
);

/** The app's one warm mark: a compact flame for the training streak. */
export const StreakIcon = ({ className, size = 20 }: P) => (
  <svg {...base(size)} strokeWidth={1.9} className={className}>
    <path d="M13.2 2.8c.5 3.4-1.7 4.7-3.2 6.6-1.2 1.5-1.4 3.1-.5 4.4.2-1.7 1.2-2.8 2.6-3.8-.1 2.3 2.5 3.2 2.5 6.1 0 2-1.2 3.8-3.1 4.7" />
    <path d="M9.8 21c-3.2-.7-5.3-3.3-5.3-6.5 0-3.7 2.4-6.2 5.4-9.3-.1 2 .6 3.1 1.4 3.7 1.1-1.3 2.2-3.2 1.9-6.1 3.8 2.8 6.3 6.5 6.3 10.8 0 3.7-2.1 6.5-5.3 7.3" />
  </svg>
);

export const ChevronRight = ({ className, size = 18 }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const ArrowUp = ({ className, size = 18 }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);

export const ArrowDown = ({ className, size = 18 }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
);

/**
 * Two lanes going opposite ways: one lift out, another in.
 *
 * Not the circular arrows, which in this app's vocabulary would read as refresh
 * or undo. This is an exchange — something takes the place of something else —
 * which is what replacing an exercise is.
 */
export const Swap = ({ className, size = 18 }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3.5 8.5h13M13.5 5.5l3 3-3 3" />
    <path d="M20.5 15.5h-13M10.5 12.5l-3 3 3 3" />
  </svg>
);

export const Trash = ({ className, size = 18 }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 12h10l1-12" />
  </svg>
);

/**
 * A dumbbell, small.
 *
 * Stands in for an exercise with no photograph of its own — one somebody
 * created themselves. It says "a lift" without pretending to say which, which
 * is the most an empty slot in a list of photographs should claim.
 */
export const Dumbbell = ({ className, size = 18 }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 9.5v5M7 7.5v9M17 7.5v9M20 9.5v5M7 12h10" />
  </svg>
);

export const Search = ({ className, size = 18 }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </svg>
);

/* ---- bottom navigation ---- */

export const GridIcon = ({ className, size = 23 }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
  </svg>
);

/*
 * The tab bar's four marks, each drawn twice.
 *
 * Outlined at rest and filled when current, the way the platform's own tab
 * bars swap a symbol for its `.fill` variant. With no labels under them, the
 * change of weight is half of what says which tab you are on — the travelling
 * highlight is the other half — so every one of them is an object with an
 * inside that can be filled, rather than a scribble of lines that cannot.
 *
 * Four different silhouettes on purpose: a diagonal, a clipboard, a page with
 * rings, and an open chart, so they can be told apart by shape before they are
 * read.
 *
 * Where a filled mark has detail inside it — the clipboard's lines, the
 * calendar's days — the detail is cut out of the fill with a mask rather than
 * painted on it in black, so it shows whatever is behind the icon, the
 * highlight or the glass, the way a hole would. Every shape inside a mask sets
 * its own stroke: left to inherit the icon's white one, a hole comes out
 * ringed by a halo of the very fill it was meant to cut away.
 */
type TabP = P & { filled?: boolean };

/** A mask id that is unique per icon on the page and legal inside `url()`. */
const useMaskId = (prefix: string) =>
  `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

/**
 * Strength: a dumbbell, laid on the diagonal like the platform's own.
 *
 * Level, it read as a cotton reel — two tall plates and a stub of bar. On the
 * diagonal the bar gets the length it needs to be a bar.
 */
export const StrengthTab = ({ className, size = 24, filled }: TabP) => (
  <svg {...base(size)} className={className}>
    <g transform="rotate(-45 12 12)">
      <path d="M1.5 12h3M8.5 12h7M19.5 12h3" />
      <rect
        x="4.5"
        y="6.5"
        width="4"
        height="11"
        rx="1.6"
        fill={filled ? "currentColor" : "none"}
      />
      <rect
        x="15.5"
        y="6.5"
        width="4"
        height="11"
        rx="1.6"
        fill={filled ? "currentColor" : "none"}
      />
    </g>
  </svg>
);

/** Routines: a clipboard with the plan written on it. */
export const RoutinesTab = ({ className, size = 24, filled }: TabP) => {
  const id = useMaskId("clip");
  const lines = "M8.5 11.5h7M8.5 15h7M8.5 18.5h4";
  return (
    <svg {...base(size)} className={className}>
      {filled ? (
        <>
          <mask id={id}>
            <rect width="24" height="24" fill="#fff" stroke="none" />
            <path d={lines} stroke="#000" />
            <rect
              x="8"
              y="2"
              width="8"
              height="5"
              rx="1.6"
              fill="#000"
              stroke="#000"
            />
          </mask>
          <rect
            x="4.5"
            y="4.5"
            width="15"
            height="17"
            rx="3"
            fill="currentColor"
            mask={`url(#${id})`}
          />
        </>
      ) : (
        <>
          <path d="M9 4.5H7.5a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3v-11a3 3 0 0 0-3-3H15" />
          <path d={lines} />
        </>
      )}
      <rect x="9" y="2.75" width="6" height="3.5" rx="1.2" />
    </svg>
  );
};

/**
 * History: a calendar page.
 *
 * When current the page, its edge and its rings are solid white, and the
 * header rule and the days are drawn over it in grey. The rule stops short of
 * the edge so it does not notch the white border.
 */
export const HistoryTab = ({ className, size = 24, filled }: TabP) => {
  const ink = filled ? "var(--color-faint)" : "currentColor";
  return (
    <svg {...base(size)} className={className}>
      <rect
        x="3.5"
        y="5"
        width="17"
        height="15.5"
        rx="3.5"
        fill={filled ? "currentColor" : "none"}
      />
      <path d="M8 3v3.5M16 3v3.5" />
      <path d={filled ? "M4.4 10h15.2" : "M3.5 10h17"} stroke={ink} />
      {[
        [8, 14],
        [12, 14],
        [16, 14],
        [8, 17.5],
        [12, 17.5],
      ].map(([cx, cy]) => (
        <circle
          key={`${cx}${cy}`}
          cx={cx}
          cy={cy}
          r="1.05"
          fill={ink}
          stroke="none"
        />
      ))}
    </svg>
  );
};

/**
 * Progress: a line that climbs.
 *
 * The one mark with no filled form: when current it is the same line, lit
 * white rather than grey. Filling the ground under it, solid or tinted, read
 * as a shadow or a solid block rather than as the chart.
 */
export const ProgressTab = ({ className, size = 24 }: TabP) => (
  <svg {...base(size)} className={className}>
    <path d="M3.5 20.5h17" />
    <path d="M4.5 16 9 11l4 3.5 6.5-8" />
  </svg>
);

export const ChatIcon = ({ className, size = 23 }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M20.5 11.5a7.5 7.5 0 0 1-10.9 6.7L4.5 19.5l1.3-4.7a7.5 7.5 0 1 1 14.7-3.3Z" />
  </svg>
);

/** Progress ring with the routine's number in the middle. */
export function Ring({
  n,
  progress,
  size = 46,
}: {
  n: number;
  progress: number;
  size?: number;
}) {
  const r = size / 2 - 2.6;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-faint)"
        strokeWidth="2.4"
      />
      {p > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontSize={size * 0.33}
        fontWeight="600"
      >
        {n}
      </text>
    </svg>
  );
}
