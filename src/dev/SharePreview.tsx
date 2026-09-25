import { useState } from "react";
import { ProgressSharePreview } from "../components/ProgressSharePreview";
import { liftCard } from "../lib/card/select";

const examples: Record<string, number[]> = {
  "New record": [80, 82.5, 85, 82.5, 90, 100],
  "Below earlier best": [80, 85, 90],
  "Decrease": [100, 95, 90, 92.5, 85],
  "Unchanged": [80, 80, 80],
  "First reading": [80],
  "Long name / large value": [12340, 13500, 15800],
};
export default function SharePreview() {
  const [example, setExample] = useState("New record");
  const [open, setOpen] = useState(false);
  const values = examples[example];
  const large = example.startsWith("Long");
  const data = liftCard({
    currentStreak: 6,
    name: large ? "Single-arm Incline Dumbbell Bench Press" : "Barbell Bench Press",
    metricId: large ? "volume" : "e1rm", metricLabel: large ? "Session volume" : "Estimated 1RM",
    values, history: example === "Below earlier best" ? [120, ...values] : values,
    unit: "kg", sinceLabel: "Since 12 Jun", stats: [],
    dates: values.map((_, i) => ["12 Jun", "26 Jun", "10 Jul", "24 Jul", "7 Aug", "21 Aug"][i]), decimals: 1,
  });
  return <main className="mx-auto max-w-lg space-y-6 px-6 py-12">
    <p className="font-mono text-xs uppercase tracking-widest text-muted">Design preview · sample data</p>
    <h1 className="text-3xl font-bold">Your progress, shared.</h1>
    <p className="text-muted">Explore the three cards, add a photo, and try Story or Chat. This preview does not read or change your workout data.</p>
    <label className="block">Example
      <select className="mt-2 block w-full rounded-lg border border-rule bg-card p-3" value={example} onChange={e => setExample(e.target.value)}>
        {Object.keys(examples).map(name => <option key={name}>{name}</option>)}
      </select>
    </label>
    <button className="w-full rounded-full bg-fg py-4 text-black" onClick={() => setOpen(true)}>Preview cards</button>
    <a className="block text-sm text-muted underline" href="/?workout-share-preview">Workout cards</a>
    <a className="block text-sm text-muted underline" href="/">Back to Strata</a>
    {open && <ProgressSharePreview data={data} onClose={() => setOpen(false)} />}
  </main>;
}
