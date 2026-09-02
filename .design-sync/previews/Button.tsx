import { Button } from "gym";

const row: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
  padding: 16,
  background: "#000",
};

export const Variants = () => (
  <div style={row}>
    <Button variant="solid">Save workout</Button>
    <Button variant="ghost">+ Set</Button>
    <Button variant="outline">Add exercise</Button>
    <Button variant="danger">Discard workout</Button>
  </div>
);

export const Sizes = () => (
  <div style={row}>
    <Button size="sm">Finish</Button>
    <Button size="md">Log body weight</Button>
    <Button size="lg">Start empty workout</Button>
  </div>
);

export const Disabled = () => (
  <div style={row}>
    <Button variant="solid" disabled>
      Start
    </Button>
    <Button variant="ghost" disabled>
      − Set
    </Button>
  </div>
);

export const FullWidth = () => (
  <div style={{ ...row, display: "block" }}>
    <Button size="lg" className="w-full">
      Start empty workout
    </Button>
  </div>
);
