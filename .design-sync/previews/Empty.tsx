import { Button, Empty } from "gym";

const frame: React.CSSProperties = { background: "#000", padding: 16, minHeight: 260 };

export const Default = () => (
  <div style={frame}>
    <Empty
      icon="📆"
      title="Nothing here yet"
      body="Finished workouts show up here, grouped by month."
    />
  </div>
);

export const WithAction = () => (
  <div style={frame}>
    <Empty
      icon="📋"
      title="No routines"
      body="A routine is a saved list of exercises with target sets and reps. Start a workout from one and it comes pre-filled."
      action={<Button>Create routine</Button>}
    />
  </div>
);

export const NoData = () => (
  <div style={frame}>
    <Empty
      icon="📈"
      title="No data to chart yet"
      body="Finish a couple of workouts and your strength curve per exercise shows up here."
    />
  </div>
);
