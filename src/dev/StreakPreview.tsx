import { useState } from "react";
import { StreakDetails } from "../components/StreakDetails";
import type { StreakSummary } from "../lib/stats";

type Scenario = "active" | "nearly" | "expired" | "empty";

export default function StreakPreview() {
  const [scenario, setScenario] = useState<Scenario>("active");
  const [open, setOpen] = useState(true);
  const [now] = useState(() => Date.now());
  const latest = now - 60 * 60 * 1000;
  const summaries: Record<Scenario, StreakSummary> = {
    active: {
      current: 6,
      best: 11,
      expiresAt: latest + 60 * 60 * 60 * 1000,
      remainingMs: 59 * 60 * 60 * 1000,
      latestCompletedAt: latest,
      latestSessionId: "sample",
    },
    nearly: {
      current: 6,
      best: 11,
      expiresAt: now + 42 * 60 * 1000,
      remainingMs: 42 * 60 * 1000,
      latestCompletedAt: now - (60 * 60 - 42) * 60 * 1000,
      latestSessionId: "sample",
    },
    expired: {
      current: 0,
      best: 11,
      expiresAt: null,
      remainingMs: 0,
      latestCompletedAt: now - 72 * 60 * 60 * 1000,
      latestSessionId: "sample",
    },
    empty: {
      current: 0,
      best: 0,
      expiresAt: null,
      remainingMs: 0,
      latestCompletedAt: null,
      latestSessionId: null,
    },
  };

  return (
    <main className="min-h-full bg-ink px-5 pb-10 pt-[calc(env(safe-area-inset-top)+22px)] text-fg">
      <p className="font-mono text-label font-semibold uppercase tracking-[0.2em] text-muted">
        Design preview · sample streak
      </p>
      <h1 className="mt-5 text-[2rem] font-bold tracking-[-0.04em]">
        Streak details
      </h1>
      <label className="mt-8 block font-mono text-label font-semibold uppercase tracking-[0.16em] text-muted">
        Example
        <select
          value={scenario}
          onChange={(event) => {
            setScenario(event.target.value as Scenario);
            setOpen(true);
          }}
          className="mt-2 h-12 w-full rounded-[14px] border border-cardrule bg-card px-4 text-fg outline-none"
        >
          <option value="active">Active</option>
          <option value="nearly">Nearly expired</option>
          <option value="expired">Expired</option>
          <option value="empty">No history</option>
        </select>
      </label>
      <button
        onClick={() => setOpen(true)}
        className="mt-4 h-13 w-full rounded-full bg-fg font-mono text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-black"
      >
        Preview streak
      </button>
      <StreakDetails
        open={open}
        onClose={() => setOpen(false)}
        summary={summaries[scenario]}
        latestWorkout={scenario === "empty" ? null : "Upper body"}
      />
    </main>
  );
}
