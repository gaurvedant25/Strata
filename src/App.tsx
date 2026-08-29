import { useEffect, useState } from "react";
import { RestTimer } from "./components/RestTimer";
import { fmtDuration } from "./lib/util";
import { ActiveWorkout } from "./screens/ActiveWorkout";
import { History } from "./screens/History";
import { Home } from "./screens/Home";
import { Progress } from "./screens/Progress";
import { Routines } from "./screens/Routines";
import { Settings } from "./screens/Settings";
import { useStore } from "./store";

export type Tab = "home" | "routines" | "history" | "progress" | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "Log", icon: "🏋️" },
  { id: "routines", label: "Routines", icon: "📋" },
  { id: "history", label: "History", icon: "📆" },
  { id: "progress", label: "Progress", icon: "📈" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

export default function App() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>("home");

  // each tab should open at its own top, not inherit the last tab's scroll
  useEffect(() => window.scrollTo(0, 0), [tab]);

  if (!s.ready) {
    return (
      <div className="grid h-full place-items-center text-muted">
        <div className="animate-pulse text-sm">Loading…</div>
      </div>
    );
  }

  const inWorkout = !!s.active;

  return (
    <div className="mx-auto min-h-full max-w-lg">
      {tab === "home" && (inWorkout ? <ActiveWorkout /> : <Home go={setTab} />)}
      {tab === "routines" && <Routines />}
      {tab === "history" && <History />}
      {tab === "progress" && <Progress />}
      {tab === "settings" && <Settings />}

      <RestTimer />

      {inWorkout && tab !== "home" && s.restUntil == null && (
        <button
          onClick={() => setTab("home")}
          className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-40 flex items-center justify-between rounded-2xl border border-accent/40 bg-accent/15 px-4 py-3 backdrop-blur-xl"
        >
          <span className="text-[14px] font-semibold text-accent">Workout in progress</span>
          <span className="text-[13px] tabular-nums text-accent/80">
            {fmtDuration(s.now - s.active!.startedAt)} →
          </span>
        </button>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex flex-1 flex-col items-center gap-0.5 py-2.5"
            >
              <span className={`text-lg leading-none ${tab === t.id ? "" : "opacity-45 grayscale"}`}>
                {t.icon}
              </span>
              <span
                className={`text-[10px] font-medium ${tab === t.id ? "text-accent" : "text-muted"}`}
              >
                {t.id === "home" && inWorkout ? "Active" : t.label}
              </span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
