import { Button, Field, Sheet, inputCls } from "gym";

/**
 * Sheet renders `position: fixed` over the whole viewport and returns null when
 * `open` is false, so every cell here mounts it open inside a tall relative
 * frame - that's the only state worth looking at.
 */
const frame: React.CSSProperties = {
  position: "relative",
  height: 460,
  background: "#000",
  overflow: "hidden",
};

export const LogBodyWeight = () => (
  <div style={frame}>
    <Sheet
      open
      title="Log body weight"
      onClose={() => {}}
      footer={
        <Button className="w-full" size="lg">
          Save
        </Button>
      }
    >
      <input className={inputCls} placeholder="Weight in kg" defaultValue="86.2" />
      <p className="mt-2 text-[12px] text-muted">Saved against today. One entry per day.</p>
    </Sheet>
  </div>
);

export const FinishWorkout = () => (
  <div style={frame}>
    <Sheet
      open
      title="Finish workout?"
      onClose={() => {}}
      footer={
        <div className="space-y-2">
          <Button className="w-full" size="lg">
            Save workout
          </Button>
          <Button variant="danger" className="w-full">
            Discard workout
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted">18 sets · 7,240 kg total volume · 1h 04m.</p>
      <p className="mt-2 text-sm text-muted">Sets you never ticked off are dropped on save.</p>
    </Sheet>
  </div>
);

export const WithFields = () => (
  <div style={frame}>
    <Sheet open title="New exercise" onClose={() => {}}>
      <div className="space-y-4">
        <Field label="Exercise name">
          <input className={inputCls} defaultValue="Romanian Deadlift" />
        </Field>
        <Field label="Muscle group" hint="Used to group it in the picker.">
          <input className={inputCls} defaultValue="Legs" />
        </Field>
      </div>
    </Sheet>
  </div>
);
