import { DashCard } from "gym";

/**
 * DashCard is the large-radius bento tile the dashboard is built from - same
 * surface as Card but rounder, border-less, and tappable as a whole when
 * onClick is passed.
 */
const frame: React.CSSProperties = { background: "#000", padding: 16 };

export const StatTile = () => (
  <div style={{ ...frame, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
    <DashCard className="px-4 py-4">
      <p className="text-[32px] font-bold tabular-nums leading-none">
        86.2 <span className="text-base font-semibold text-muted">kg</span>
      </p>
      <p className="mt-6 text-[15px] font-semibold leading-tight">Body weight</p>
      <p className="mt-0.5 text-[12px] text-muted">32 min ago</p>
    </DashCard>
    <DashCard className="px-4 py-4">
      <p className="text-[32px] font-bold tabular-nums leading-none">
        22 <span className="text-base font-semibold text-muted">total</span>
      </p>
      <p className="mt-6 text-[15px] font-semibold leading-tight">Workouts</p>
      <p className="mt-0.5 text-[12px] text-muted">All time</p>
    </DashCard>
  </div>
);

export const WideTile = () => (
  <div style={frame}>
    <DashCard className="flex items-center justify-between px-5 py-4">
      <div>
        <p className="text-[15px] font-semibold leading-tight">Volume lifted</p>
        <p className="mt-0.5 text-[12px] text-muted">Last 7 days</p>
      </div>
      <p className="text-[26px] font-bold tabular-nums leading-none">
        16,740 <span className="text-base font-semibold text-muted">kg</span>
      </p>
    </DashCard>
  </div>
);

/**
 * Height is an inline style, not `h-[104px]`: the shipped stylesheet is the
 * app's own compiled Tailwind output, so an arbitrary-value class that no app
 * file uses simply isn't in it and would silently collapse the tile.
 */
export const Tappable = () => (
  <div style={frame}>
    <DashCard onClick={() => {}}>
      <span
        className="text-2xl text-muted"
        style={{ display: "grid", placeItems: "center", height: 104 }}
      >
        +
      </span>
    </DashCard>
  </div>
);
