import { useState } from "react";
import { WorkoutSharePreview as Editor } from "../components/WorkoutSharePreview";
import { workoutCard } from "../lib/card/workoutData";
import type { Exercise, Session } from "../types";

const now = new Date(2026, 8, 15, 19).getTime();
const exercises: Exercise[] = [
  { id: "bench", name: "Barbell Bench Press", muscle: "Chest", createdAt: 0 },
  { id: "row", name: "Seated Cable Row", muscle: "Back", createdAt: 0 },
  { id: "plank", name: "Plank", muscle: "Core", tracks: "time", createdAt: 0 },
];
const byId = new Map(exercises.map(ex => [ex.id, ex]));
const make = (id: string, endedAt: number, weight: number): Session => ({
  id, name: "Upper body", date: "2026-09-15", startedAt: endedAt - 52 * 60000, endedAt,
  entries: ["bench", "row"].map(exerciseId => ({
    id: `${id}-${exerciseId}`, exerciseId,
    sets: Array.from({ length: 4 }, (_, i) => ({ id: `${id}-${exerciseId}-${i}`, weight, reps: 10, done: true })),
  })),
});
const previous = [1, 2, 3, 4, 5].map(day => make(`before-${day}`, now - day * 86400000, 65));
const examples = ["Records broken", "No new records", "First workout", "Timed only", "Expired streak", "Long name / large values"];

export default function WorkoutDesignPreview() {
  const [example, setExample] = useState(examples[0]);
  const [gender, setGender] = useState<"male" | "female">("male");
  const [open, setOpen] = useState(false);
  const session = make("current", now, example === "No new records" ? 65 : 85);
  if (example === "Timed only") session.entries = [{ id: "hold", exerciseId: "plank", sets: [
    { id: "hold-1", weight: 0, reps: 0, seconds: 60, done: true },
  ] }];
  if (example === "Long name / large values") {
    session.name = "Full-body Strength & Conditioning — Weekend Session";
    session.entries.forEach(e => e.sets.forEach(set => { set.weight = 9999; }));
  }
  const history = example === "First workout" ? [] : previous;
  const data = workoutCard(session, byId, example === "Expired streak" ? now + 60 * 3600000 : now,
    "kg", [...history, session], gender);
  return <main className="mx-auto max-w-lg space-y-6 px-6 py-12">
    <p className="font-mono text-xs uppercase tracking-widest text-muted">Design preview · sample data</p>
    <h1 className="text-3xl font-bold">Session complete. Make it yours.</h1>
    <p className="text-muted">Share asks for a photo first. Then five workout cards, including two wild cards: switch sizes, and move, resize or tilt either layer. No workout data is read or changed.</p>
    <label className="block">Example
      <select className="mt-2 block w-full rounded-lg border border-rule bg-card p-3" value={example} onChange={e => setExample(e.target.value)}>
        {examples.map(name => <option key={name}>{name}</option>)}
      </select>
    </label>
    <label className="block">Body chart
      <select className="mt-2 block w-full rounded-lg border border-rule bg-card p-3" value={gender} onChange={e => setGender(e.target.value as "male" | "female")}>
        <option value="male">Male</option><option value="female">Female</option>
      </select>
    </label>
    <button className="min-h-11 w-full rounded-full bg-fg py-4 text-black" onClick={() => setOpen(true)}>Preview workout cards</button>
    <a className="block text-sm text-muted underline" href="/?share-preview">Progress cards</a>
    <a className="block text-sm text-muted underline" href="/">Back to Gym Log</a>
    {open && <Editor data={data} onClose={() => setOpen(false)} />}
  </main>;
}
