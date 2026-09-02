import { Card, IconButton, Screen, Stat } from "gym";

/**
 * Screen is the page frame every tab uses: a sticky blurred header with a large
 * title (plus optional subtitle and a right-hand slot) over a padded body.
 */
export const WithSubtitle = () => (
  <div style={{ height: 420, overflow: "hidden", background: "#000" }}>
    <Screen title="Progress" subtitle="Every number comes from your own logs">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Workouts" value="22" sub="all time" />
        <Stat label="Volume" value="33k" sub="kg" />
        <Stat label="Exercises" value="4" sub="tracked" />
      </div>
      <Card className="mt-4 px-4 py-3">
        <p className="text-[15px] font-medium">Barbell Bench Press</p>
        <p className="mt-0.5 text-[12px] text-muted">Best 93.3 kg est. 1RM · 1.24× bodyweight</p>
      </Card>
    </Screen>
  </div>
);

export const WithHeaderAction = () => (
  <div style={{ height: 420, overflow: "hidden", background: "#000" }}>
    <Screen
      title="Routines"
      subtitle="Reusable templates for your split"
      right={<IconButton tone="light">+</IconButton>}
    >
      <div className="space-y-2">
        {["Push", "Pull", "Legs"].map((n) => (
          <Card key={n} className="px-4 py-3">
            <p className="text-[15px] font-semibold">{n}</p>
            <p className="mt-0.5 text-[12px] text-muted">5 exercises · 16 sets</p>
          </Card>
        ))}
      </div>
    </Screen>
  </div>
);

export const TitleOnly = () => (
  <div style={{ height: 300, overflow: "hidden", background: "#000" }}>
    <Screen title="Settings">
      <Card className="px-4 py-3.5">
        <p className="text-[15px]">Weight unit</p>
      </Card>
    </Screen>
  </div>
);
