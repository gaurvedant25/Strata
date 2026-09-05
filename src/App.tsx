import { useEffect, useRef, useState, type ComponentType } from "react";
import { CalendarIcon, ChartIcon } from "./components/icons";
import { fmtDuration } from "./lib/util";
import { ActiveWorkout } from "./screens/ActiveWorkout";
import { History } from "./screens/History";
import { Home } from "./screens/Home";
import { Onboarding } from "./screens/Onboarding";
import { Progress } from "./screens/Progress";
import { Routines } from "./screens/Routines";
import { Settings } from "./screens/Settings";
import { useStore } from "./store";

export type Tab = "home" | "routines" | "history" | "progress";

type IconT = ComponentType<{ className?: string; size?: number }>;

/**
 * Four labelled tabs, down from five unlabelled icons.
 *
 * Settings was the fifth and is now reached from the Strength header: it is a
 * place you visit rarely, and giving it a fifth of the bar cost the four you
 * use constantly the room for labels. Icons alone were never legible enough to
 * carry a nav on their own.
 */
const TABS: { id: Tab; label: string; Icon: IconT }[] = [
  { id: "home", label: "Strength", Icon: BodyIcon },
  { id: "routines", label: "Routines", Icon: ListIcon },
  { id: "history", label: "History", Icon: CalendarIcon },
  { id: "progress", label: "Progress", Icon: ChartIcon },
];

function BodyIcon({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="4.3" r="2.3" />
      <path d="M12 8.2v6.3M7.5 10.2 12 8.2l4.5 2M8.3 21l1.9-6.5h3.6L15.7 21M9 14.5l-2.2 2.2M15 14.5l2.2 2.2" />
    </svg>
  );
}

function ListIcon({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
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

export default function App() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>("home");
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Whether the full-screen logger is the thing on top right now. Starting or
  // resuming a session opens it; navigating away (nav taps, the header back
  // button) only minimizes it — the session keeps running underneath and a
  // "Workout in progress" pill is how you get back in.
  const [viewLogger, setViewLogger] = useState(false);
  const prevActiveId = useRef<string | null>(null);

  // First run is anything with no bodyweight and no split — the two things the
  // app cannot show anything without. Dismissing it sets `onboarded` so a user
  // who skips is not asked again on every launch.
  const [onboarding, setOnboarding] = useState<boolean | null>(null);
  useEffect(() => {
    if (!s.ready || onboarding !== null) return;
    const fresh = !s.bodyweight.length && !s.splits.length && !s.sessions.length;
    setOnboarding(fresh && localStorage.getItem("gymlog.onboarded") !== "1");
  }, [s.ready, s.bodyweight.length, s.splits.length, s.sessions.length, onboarding]);

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
  useEffect(() => window.scrollTo(0, 0), [tab, viewLogger, settingsOpen]);

  if (!s.ready) {
    return (
      <div className="grid h-full place-items-center">
        <div className="animate-pulse font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Loading
        </div>
      </div>
    );
  }

  function dismissOnboarding() {
    localStorage.setItem("gymlog.onboarded", "1");
    setOnboarding(false);
  }

  // Onboarding and the logger are full-screen: no tab bar, nothing behind them.
  if (onboarding) {
    return (
      <div className="mx-auto flex min-h-full max-w-lg flex-col">
        <Onboarding onDone={dismissOnboarding} />
      </div>
    );
  }

  const showLogger = inWorkout && viewLogger;

  function goTab(id: Tab) {
    setTab(id);
    setViewLogger(false);
    setSettingsOpen(false);
  }

  if (showLogger) {
    return (
      <div className="mx-auto min-h-full max-w-lg">
        <ActiveWorkout onBack={() => setViewLogger(false)} />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-full max-w-lg">
      {settingsOpen ? (
        <Settings onBack={() => setSettingsOpen(false)} />
      ) : (
        <>
          {tab === "home" && <Home onSettings={() => setSettingsOpen(true)} />}
          {tab === "routines" && <Routines />}
          {tab === "history" && <History />}
          {tab === "progress" && <Progress />}
        </>
      )}

      {inWorkout && (
        <button
          onClick={() => setViewLogger(true)}
          className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+69px)] z-40 mx-auto flex max-w-lg items-center justify-between border-y border-rule bg-ink/95 px-5 py-3 backdrop-blur-xl"
        >
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-fg">
            Workout in progress
          </span>
          <span className="font-mono text-[13px] text-muted">
            {fmtDuration(s.now - s.active!.startedAt)} →
          </span>
        </button>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-ink/96 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg">
          {TABS.map(({ id, label, Icon }) => {
            const active = !settingsOpen && tab === id;
            return (
              <button
                key={id}
                onClick={() => goTab(id)}
                className={`flex flex-1 flex-col items-center gap-1.5 pb-[15px] pt-[13px] transition-colors ${
                  active ? "text-fg" : "text-faint"
                }`}
              >
                <Icon size={20} />
                <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em]">
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
