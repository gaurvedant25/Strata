import { Card } from "gym";

const frame: React.CSSProperties = { background: "#000", padding: 16, display: "grid", gap: 10 };

export const Default = () => (
  <div style={frame}>
    <Card className="px-4 py-3">
      <p className="text-[15px] font-medium">Barbell Bench Press</p>
      <p className="mt-0.5 text-[12px] text-muted">Best 93.3 kg est. 1RM · 1.24× bodyweight</p>
    </Card>
  </div>
);

export const ListOfCards = () => (
  <div style={frame}>
    {[
      ["Push", "Sun, Aug 30 · 5 exercises · 16 sets", "4,120 kg"],
      ["Pull", "Fri, Aug 28 · 5 exercises · 16 sets", "5,380 kg"],
      ["Legs", "Wed, Aug 26 · 5 exercises · 17 sets", "7,240 kg"],
    ].map(([name, meta, vol]) => (
      <Card key={name} className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium">{name}</p>
          <p className="mt-0.5 text-[12px] text-muted">{meta}</p>
        </div>
        <p className="shrink-0 text-[13px] tabular-nums text-muted">{vol}</p>
      </Card>
    ))}
  </div>
);

export const SectionCard = () => (
  <div style={frame}>
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-3.5">
        <p className="text-[15px]">Weight unit</p>
      </div>
      <div className="border-b border-line px-4 py-3.5">
        <p className="text-[15px]">Gender</p>
      </div>
      <div className="px-4 py-3.5">
        <p className="text-[15px]">Manage exercise library</p>
      </div>
    </Card>
  </div>
);
