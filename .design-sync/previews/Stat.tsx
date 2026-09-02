import { Stat } from "gym";

const frame: React.CSSProperties = { background: "#000", padding: 16 };

export const StatRow = () => (
  <div style={{ ...frame, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
    <Stat label="Workouts" value="22" sub="all time" />
    <Stat label="Volume" value="33k" sub="kg" />
    <Stat label="Exercises" value="4" sub="tracked" />
  </div>
);

export const WithoutSub = () => (
  <div style={{ ...frame, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
    <Stat label="This week" value="3" />
    <Stat label="Streak" value="12" />
  </div>
);

export const LongValue = () => (
  <div style={{ ...frame, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
    <Stat label="Best session volume" value="7,240" sub="kg" />
    <Stat label="Heaviest set" value="116.7 × 5" sub="Back Squat" />
  </div>
);
