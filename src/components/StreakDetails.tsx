import { X } from "./icons";
import { Scrim } from "./ui";
import { useDialog, usePresence } from "../lib/useDialog";
import type { StreakSummary } from "../lib/stats";

const R = 70;
const CIRC = 2 * Math.PI * R;

function remainingLabel(ms: number) {
  const minutes = Math.max(0, Math.ceil(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return days ? `${days}d ${rest}h` : `${hours}h`;
}

function exactTime(at: number) {
  return new Date(at).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function StreakDetails({
  open,
  onClose,
  summary,
  latestWorkout,
}: {
  open: boolean;
  onClose: () => void;
  summary: StreakSummary;
  latestWorkout: string | null;
}) {
  const panel = useDialog(open, onClose);
  const { present, closing } = usePresence(open);
  if (!present) return null;

  const active = summary.current > 0 && summary.expiresAt != null;
  const best = Math.max(summary.best, summary.current, 1);
  const progress = active ? Math.min(1, summary.current / best) : 0;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-5">
      <Scrim onClose={onClose} closing={closing} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Streak details"
        tabIndex={-1}
        data-closing={closing || undefined}
        className="animate-cb-card leave-panel relative w-full max-w-sm overflow-hidden rounded-[22px] border border-cardrule bg-card outline-none"
      >
        <div className="flex items-center justify-between border-b border-cardrule px-5 py-3.5">
          <span className="font-mono text-label font-semibold uppercase tracking-[0.2em] text-muted">
            Your streak
          </span>
          <button
            onClick={onClose}
            aria-label="Close streak details"
            className="-my-3 -mr-3 grid size-11 place-items-center text-muted active:text-fg"
          >
            <X size={17} />
          </button>
        </div>

        <div className="px-5 pb-5 pt-6">
          <div className="relative mx-auto size-[156px]">
            <svg
              width="156"
              height="156"
              viewBox="0 0 156 156"
              aria-hidden="true"
              className="absolute inset-0 -rotate-90"
            >
              <circle cx="78" cy="78" r={R} fill="none" stroke="#333" strokeWidth="3" />
              {active && (
                <circle
                  cx="78"
                  cy="78"
                  r={R}
                  fill="none"
                  stroke="var(--color-ember)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC * (1 - progress)}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={active ? "font-mono text-[58px] font-medium leading-none tracking-[-0.06em] text-ember" : "font-mono text-[58px] font-medium leading-none tracking-[-0.06em] text-muted"}>
                {summary.current}
              </span>
              <span className="mt-2 font-mono text-label font-semibold uppercase tracking-[0.2em] text-muted">
                Day streak
              </span>
            </div>
          </div>

          {active ? (
            <div className="mt-5 text-center">
              <p className="font-mono text-[1.25rem] font-medium text-fg">
                {remainingLabel(summary.remainingMs)} left
              </p>
              <p className="mt-1.5 font-mono text-label font-semibold uppercase tracking-[0.12em] text-muted">
                Train by {exactTime(summary.expiresAt!)}
              </p>
            </div>
          ) : (
            <div className="mt-5 text-center">
              <p className="text-[1.0625rem] font-semibold text-fg">
                {summary.best ? "Start your next run." : "Your first streak starts here."}
              </p>
              <p className="mx-auto mt-2 max-w-[17rem] text-[0.8125rem] leading-relaxed text-muted text-pretty">
                Complete at least one working set to begin a new 60-hour window.
              </p>
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-2">
            <div className="rounded-[16px] border border-cardrule bg-[#101010] px-4 py-4">
              <p className="font-mono text-[1.5rem] font-medium tracking-[-0.03em] text-fg">
                {summary.current}
              </p>
              <p className="mt-1 font-mono text-label font-semibold uppercase tracking-[0.16em] text-muted">
                Current
              </p>
            </div>
            <div className="rounded-[16px] border border-cardrule bg-[#101010] px-4 py-4">
              <p className="font-mono text-[1.5rem] font-medium tracking-[-0.03em] text-fg">
                {summary.best}
              </p>
              <p className="mt-1 font-mono text-label font-semibold uppercase tracking-[0.16em] text-muted">
                Best
              </p>
            </div>
          </div>

          <div className="mt-2 rounded-[16px] border border-cardrule bg-[#101010] px-4 py-4">
            <p className="font-mono text-label font-semibold uppercase tracking-[0.16em] text-muted">
              Last qualifying workout
            </p>
            {summary.latestCompletedAt ? (
              <>
                <p className="mt-2 truncate text-[0.9375rem] font-medium text-fg">
                  {latestWorkout ?? "Workout"}
                </p>
                <p className="mt-1 font-mono text-label uppercase tracking-[0.1em] text-muted">
                  {exactTime(summary.latestCompletedAt)}
                </p>
              </>
            ) : (
              <p className="mt-2 text-[0.875rem] text-muted">Nothing yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
