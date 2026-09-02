import { Card, Heatmap } from "gym";

/**
 * Heatmap draws one column per week and one dot per weekday, lighting the days
 * that carry a workout. Dates are YYYY-MM-DD keys, so the stories build their
 * sets relative to today and stay populated whenever they're re-rendered.
 */
const key = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** every `everyNth` day going back `days` days from today */
const cadence = (days: number, everyNth: number) => {
  const out = new Set<string>();
  for (let i = 0; i < days; i += everyNth) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.add(key(d));
  }
  return out;
};

const frame: React.CSSProperties = { background: "#000", padding: 16 };

export const ConsistentTraining = () => (
  <div style={frame}>
    <Card className="px-4 py-4">
      <Heatmap activeDates={cadence(91, 2)} />
    </Card>
  </div>
);

export const ThreeDaysAWeek = () => (
  <div style={frame}>
    <Card className="px-4 py-4">
      <Heatmap activeDates={cadence(91, 3)} />
    </Card>
  </div>
);

export const SparseHistory = () => (
  <div style={frame}>
    <Card className="px-4 py-4">
      <Heatmap activeDates={cadence(91, 9)} />
    </Card>
  </div>
);

export const ShorterWindow = () => (
  <div style={frame}>
    <Card className="px-4 py-4">
      <Heatmap activeDates={cadence(60, 2)} weeks={8} />
    </Card>
  </div>
);
