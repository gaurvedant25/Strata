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

export const Trash = ({ className, size = 18 }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 12h10l1-12" />
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

export const CalendarIcon = ({ className, size = 23 }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="3.5" y="5" width="17" height="16" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

export const ChartIcon = ({ className, size = 23 }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M5 20V11M12 20V4M19 20v-6" />
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
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
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
