import { useEffect, useRef, useState, type ComponentType } from "react";
import { CalendarIcon, ChartIcon } from "./components/icons";
import { fmtDuration } from "./lib/util";
import { ActiveWorkout } from "./screens/ActiveWorkout";
import { History } from "./screens/History";
import { Home } from "./screens/Home";
import { Progress } from "./screens/Progress";
import { Routines } from "./screens/Routines";
import { Settings } from "./screens/Settings";
import { useStore } from "./store";

export type Tab = "home" | "routines" | "history" | "progress" | "settings";

// icon-only bottom nav, matching the dashboard reference — no labels, no active pill
type IconT = ComponentType<{ className?: string; size?: number }>;

const TABS: { id: Tab; label: string; Icon: IconT }[] = [
  { id: "home", label: "Strength", Icon: BodyIcon },
  { id: "routines", label: "Routines", Icon: ListIcon },
  { id: "history", label: "History", Icon: CalendarIcon },
  { id: "progress", label: "Progress", Icon: ChartIcon },
  { id: "settings", label: "Settings", Icon: GearIcon },
];

function BodyIcon({ className, size = 23 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="4.3" r="2.3" />
      <path d="M12 8.2v6.3M7.5 10.2 12 8.2l4.5 2M8.3 21l1.9-6.5h3.6L15.7 21M9 14.5l-2.2 2.2M15 14.5l2.2 2.2" />
    </svg>
  );
}

function ListIcon({ className, size = 23 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function GearIcon({ className, size = 23 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2.4M12 18.1v2.4M20.5 12h-2.4M5.9 12H3.5M17.7 6.3l-1.7 1.7M8 16l-1.7 1.7M17.7 17.7 16 16M8 8 6.3 6.3" />
    </svg>
  );
}

export default function App() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>("home");
  // Whether the full-screen logger is the thing on top right now. Starting or
  // resuming a session opens it; navigating away (nav taps, the header back
  // button) only minimizes it — the session keeps running underneath and a
  // "Workout in progress" pill is how you get back in.
  const [viewLogger, setViewLogger] = useState(false);
  const prevActiveId = useRef<string | null>(null);

  const inWorkout = !!s.active;

  // open the logger the moment a session starts or is resumed; close it (back
  // to whatever tab was showing) the moment it's finished or discarded
  useEffect(() => {
    const prev = prevActiveId.current;
    prevActiveId.current = s.activeSessionId;
    if (prev == null && s.activeSessionId != null) setViewLogger(true);
    if (prev != null && s.activeSessionId == null) setViewLogger(false);
  }, [s.activeSessionId]);

  // each tab should open at its own top, not inherit the last tab's scroll
  useEffect(() => window.scrollTo(0, 0), [tab, viewLogger]);

  if (!s.ready) {
    return (
      <div className="grid h-full place-items-center text-muted">
        <div className="animate-pulse text-sm">Loading…</div>
      </div>
    );
  }

  const showLogger = inWorkout && viewLogger;

  function goTab(id: Tab) {
    setTab(id);
    setViewLogger(false);
  }

  return (
    <div className="mx-auto min-h-full max-w-lg">
      {showLogger ? (
        <ActiveWorkout onBack={() => setViewLogger(false)} />
      ) : (
        <>
          {tab === "home" && <Home go={goTab} />}
          {tab === "routines" && <Routines />}
          {tab === "history" && <History />}
          {tab === "progress" && <Progress />}
          {tab === "settings" && <Settings />}
        </>
      )}

      {inWorkout && !showLogger && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-40 mx-auto max-w-lg px-3">
          <button
            onClick={() => setViewLogger(true)}
            className="flex w-full items-center justify-between rounded-2xl border border-line bg-panel/95 px-4 py-3 backdrop-blur-xl"
          >
            <span className="text-[14px] font-semibold text-white">Workout in progress</span>
            <span className="text-[13px] tabular-nums text-muted">
              {fmtDuration(s.now - s.active!.startedAt)} →
            </span>
          </button>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg">
          {TABS.map(({ id, label, Icon }) => {
            const active = !showLogger && tab === id;
            return (
              <button
                key={id}
                aria-label={label}
                onClick={() => goTab(id)}
                className="flex flex-1 items-center justify-center py-4"
              >
                <Icon className={active ? "text-white" : "text-muted"} />
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
