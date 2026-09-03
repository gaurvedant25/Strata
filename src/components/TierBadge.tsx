import { RANKS, type RankTier } from "../lib/rank";

/**
 * Turns a hex colour into an rgba string at the given alpha.
 *
 * The tier colours are fixed hexes rather than theme tokens, and Tailwind
 * cannot generate classes from a runtime value, so the badge styles inline.
 */
function alpha(hex: string, a: number) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

const PANEL = "#161618"; // the card these sit on

function channels(hex: string) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * The label colour, lightened only as far as it has to be.
 *
 * Titan's violet is 3.03:1 against the card — fine for a border or a dot, but
 * short of the 4.5:1 WCAG AA wants for text this size. Rather than change the
 * tier's colour, which is its identity, the label alone is mixed toward white
 * until it clears the bar. Every other tier already passes and comes back
 * untouched.
 */
function readableInk(hex: string) {
  let out = hex;
  for (let mix = 0; mix <= 0.6 && contrast(out, PANEL) < 4.5; mix += 0.05) {
    const [r, g, b] = channels(hex).map((c) => Math.round(c + (255 - c) * mix));
    out = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  }
  return out;
}

const SIZES = {
  sm: { pad: "px-2 py-0.5", text: "text-[11px]", dot: 5, gap: "gap-1.5" },
  md: { pad: "px-2.5 py-1", text: "text-[13px]", dot: 7, gap: "gap-2" },
  lg: { pad: "px-3.5 py-1.5", text: "text-[15px]", dot: 9, gap: "gap-2" },
} as const;

/**
 * The rank badge.
 *
 * Built for dark mode: the tier colour is used at full strength for the text
 * and the dot, and heavily faded for the fill and border, so the colour reads
 * as an accent on a dark panel rather than a block of paint. Silver and Gold
 * are light enough to sit on the background as-is; Bronze and Titan are dark
 * enough that a solid fill of either would swallow the label.
 */
export function TierBadge({
  tier,
  size = "md",
  showName = true,
  className,
}: {
  tier: RankTier;
  size?: keyof typeof SIZES;
  showName?: boolean;
  className?: string;
}) {
  const rank = RANKS[tier];
  const s = SIZES[size];
  return (
    <span
      className={`inline-flex select-none items-center ${s.gap} ${s.pad} ${s.text} rounded-full font-semibold ${className ?? ""}`}
      style={{
        color: readableInk(rank.hex),
        backgroundColor: alpha(rank.hex, 0.14),
        border: `1px solid ${alpha(rank.hex, 0.4)}`,
      }}
      title={`${rank.name} — ${rank.level}`}
    >
      <span
        aria-hidden
        className="rounded-full"
        style={{
          width: s.dot,
          height: s.dot,
          backgroundColor: rank.hex,
          // a faint halo, so the light tiers still separate from the fill
          boxShadow: `0 0 6px ${alpha(rank.hex, 0.7)}`,
        }}
      />
      {showName && rank.name}
    </span>
  );
}
