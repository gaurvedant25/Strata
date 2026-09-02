import type { MuscleGroup, MuscleScore } from "../lib/strength";

const BASE: [number, number, number] = [0x2c, 0x2c, 0x2f]; // matches --color-faint
const LIT: [number, number, number] = [0xff, 0xff, 0xff];

function litFill(score: number) {
  const t = Math.max(0, Math.min(1, score));
  const [r, g, b] = BASE.map((v, i) => Math.round(v + (LIT[i] - v) * t));
  return `rgb(${r},${g},${b})`;
}

function glow(score: number) {
  if (score <= 0.03) return "none";
  const alpha = 0.15 + score * 0.45;
  const blur = 6 + score * 16;
  return `drop-shadow(0 0 ${blur}px rgba(255,255,255,${alpha}))`;
}

/**
 * Stylized front-view body silhouette. Four regions (shoulders, chest, arms,
 * legs) are tappable and lit up in proportion to their strength score; the
 * rest (head, forearms, shins, hands, feet) is static structure, dimmed and
 * inert, just to keep the figure readable.
 */
export function BodyMap({
  scores,
  selected,
  onSelect,
}: {
  scores: Partial<Record<MuscleGroup, MuscleScore>>;
  selected: MuscleGroup | null;
  onSelect: (m: MuscleGroup) => void;
}) {
  const fill = (m: MuscleGroup) => litFill(scores[m]?.score ?? 0);
  const filter = (m: MuscleGroup) => glow(scores[m]?.score ?? 0);
  const ring = (m: MuscleGroup) => (selected === m ? "#ffffff" : "none");

  return (
    <svg viewBox="0 0 220 460" className="mx-auto w-full max-w-[230px] overflow-visible">
      {/* static structure: head, neck, forearms, hands, shins, feet, hip saddle */}
      <g fill="#232326">
        <ellipse cx="110" cy="34" rx="21" ry="25" />
        <rect x="99" y="50" width="22" height="20" rx="8" />
        <rect x="26" y="180" width="20" height="78" rx="10" />
        <rect x="174" y="180" width="20" height="78" rx="10" />
        <ellipse cx="36" cy="266" rx="12" ry="15" />
        <ellipse cx="184" cy="266" rx="12" ry="15" />
        <path d="M74 224 Q110 240 146 224 L148 244 Q110 262 72 244 Z" />
        <rect x="70" y="332" width="30" height="96" rx="14" />
        <rect x="120" y="332" width="30" height="96" rx="14" />
        <ellipse cx="83" cy="438" rx="21" ry="12" />
        <ellipse cx="137" cy="438" rx="21" ry="12" />
      </g>

      <g
        onClick={() => onSelect("shoulders")}
        style={{ filter: filter("shoulders"), cursor: "pointer" }}
        role="button"
        aria-label="Shoulders"
      >
        <ellipse cx="50" cy="92" rx="24" ry="28" fill={fill("shoulders")} stroke={ring("shoulders")} strokeWidth="2.5" />
        <ellipse cx="170" cy="92" rx="24" ry="28" fill={fill("shoulders")} stroke={ring("shoulders")} strokeWidth="2.5" />
      </g>

      <g
        onClick={() => onSelect("arms")}
        style={{ filter: filter("arms"), cursor: "pointer" }}
        role="button"
        aria-label="Arms"
      >
        <rect x="22" y="106" width="27" height="84" rx="13.5" fill={fill("arms")} stroke={ring("arms")} strokeWidth="2.5" />
        <rect x="171" y="106" width="27" height="84" rx="13.5" fill={fill("arms")} stroke={ring("arms")} strokeWidth="2.5" />
      </g>

      <g
        onClick={() => onSelect("chest")}
        style={{ filter: filter("chest"), cursor: "pointer" }}
        role="button"
        aria-label="Chest"
      >
        <path
          d="M64 80 Q110 66 156 80 L159 148 Q157 172 149 180 L149 226 Q110 244 71 226 L71 180 Q63 172 61 148 Z"
          fill={fill("chest")}
          stroke={ring("chest")}
          strokeWidth="2.5"
        />
        <path
          d="M110 82 L110 178 M79 150 L141 150 M81 172 L139 172 M85 196 L135 196"
          stroke="#0a0a0b"
          strokeOpacity="0.28"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
      </g>

      <g
        onClick={() => onSelect("legs")}
        style={{ filter: filter("legs"), cursor: "pointer" }}
        role="button"
        aria-label="Legs"
      >
        <path d="M69 228 Q65 282 68 330 L99 330 Q101 282 97 230 Z" fill={fill("legs")} stroke={ring("legs")} strokeWidth="2.5" />
        <path d="M151 228 Q155 282 152 330 L121 330 Q119 282 123 230 Z" fill={fill("legs")} stroke={ring("legs")} strokeWidth="2.5" />
      </g>
    </svg>
  );
}
