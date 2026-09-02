import { Field, inputCls } from "gym";

const frame: React.CSSProperties = { background: "#000", padding: 16, display: "grid", gap: 16 };

export const Default = () => (
  <div style={frame}>
    <Field label="Exercise name">
      <input className={inputCls} defaultValue="Romanian Deadlift" />
    </Field>
  </div>
);

export const WithHint = () => (
  <div style={frame}>
    <Field label="Body weight" hint="Saved against today. One entry per day.">
      <input className={inputCls} inputMode="decimal" defaultValue="86.2" />
    </Field>
  </div>
);

export const Stacked = () => (
  <div style={frame}>
    <Field label="Routine name">
      <input className={inputCls} defaultValue="Push A" />
    </Field>
    <Field label="Muscle group" hint="Used to group it in the exercise picker.">
      <input className={inputCls} defaultValue="Chest" />
    </Field>
    <Field label="Notes">
      <input className={inputCls} placeholder="Optional" />
    </Field>
  </div>
);
