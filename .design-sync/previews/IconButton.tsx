import { IconButton } from "gym";

const row: React.CSSProperties = {
  background: "#000",
  padding: 16,
  display: "flex",
  gap: 12,
  alignItems: "center",
};

const Glyph = ({ d }: { d: string }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.9}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={d} />
  </svg>
);

const PLUS = "M12 5v14M5 12h14";
const CHEVRON = "M9 5l7 7-7 7";

export const Tones = () => (
  <div style={row}>
    <IconButton tone="muted">
      <Glyph d={PLUS} />
    </IconButton>
    <IconButton tone="light">
      <Glyph d={PLUS} />
    </IconButton>
  </div>
);

export const Sizes = () => (
  <div style={row}>
    <IconButton size={30}>
      <Glyph d={CHEVRON} />
    </IconButton>
    <IconButton size={36}>
      <Glyph d={CHEVRON} />
    </IconButton>
    <IconButton size={44} tone="light">
      <Glyph d={CHEVRON} />
    </IconButton>
  </div>
);

export const InHeader = () => (
  <div style={{ ...row, justifyContent: "space-between" }}>
    <span className="text-[26px] font-bold tracking-tight">Strength</span>
    <span style={{ display: "flex", gap: 10 }}>
      <IconButton tone="muted">
        <Glyph d={CHEVRON} />
      </IconButton>
      <IconButton tone="light">
        <Glyph d={PLUS} />
      </IconButton>
    </span>
  </div>
);
