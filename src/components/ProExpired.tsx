import { previewSummary } from "../lib/entitlement";
import { useEntitlement } from "../lib/useEntitlement";
import { fmtDuration } from "../lib/util";
import { useStore } from "../store";
import { Button, Sheet } from "./ui";

/**
 * What the preview week was, and what happens next.
 *
 * Shown at the first quiet moment after the seven days run out — never over a
 * workout, because the caller only mounts this when the logger is down. It is
 * dismissible from three places: the ✕, the scrim, and "Continue with Free",
 * which is a real button that really continues. Nothing here is a trap.
 *
 * The summary is the reason this screen exists at all. An expiry notice that
 * only asks for money is a pricing page; one that first says what the week
 * contained is a receipt, and a receipt is what somebody deciding whether to
 * pay actually wants to read.
 *
 * Only figures that can be counted are shown. A tile whose value is zero is
 * dropped rather than printed as a nought — a week with nothing logged says so
 * by having nothing to show, which is gentler and more honest than four zeroes.
 */
export function ProExpired({
  open,
  onClose,
  onUnlock,
}: {
  open: boolean;
  onClose: () => void;
  onUnlock: () => void;
}) {
  const { ent } = useEntitlement();
  const s = useStore();

  const sum = previewSummary(
    s.sessions,
    ent.previewStartedAt,
    ent.previewEndsAt,
    s.now,
  );

  const tiles = [
    { label: "Workouts", value: sum.workouts > 0 ? String(sum.workouts) : null },
    {
      label: "Training time",
      value: sum.trainingMs > 0 ? fmtDuration(sum.trainingMs) : null,
    },
    {
      label: "Records",
      value: sum.records > 0 ? String(sum.records) : null,
    },
    {
      label: "Streak",
      value: sum.streak > 0 ? `${sum.streak} day${sum.streak === 1 ? "" : "s"}` : null,
    },
  ].filter((t): t is { label: string; value: string } => t.value !== null);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Pro preview"
      footer={
        <div className="space-y-2.5">
          <Button onClick={onUnlock}>Unlock Pro</Button>
          {/*
            Secondary, but never quiet enough to hunt for. This is the button
            most people will press, and the screen should not be embarrassed
            about it.
          */}
          <Button variant="outline" onClick={onClose}>
            Continue with Free
          </Button>
        </div>
      }
    >
      <p className="text-pretty text-[1.5rem] font-semibold leading-[1.15] tracking-[-0.03em]">
        Your Pro preview has ended
      </p>

      {tiles.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          {tiles.map((t) => (
            <div
              key={t.label}
              className="rounded-2xl border border-cardrule bg-card px-4 py-3.5"
            >
              <p className="font-mono text-[1.25rem] font-medium tracking-[-0.02em] text-fg">
                {t.value}
              </p>
              <p className="mt-1 font-mono text-label font-medium uppercase tracking-[0.14em] text-dim">
                {t.label}
              </p>
            </div>
          ))}
        </div>
      )}

      <p className="mt-5 text-[0.9375rem] leading-relaxed text-muted">
        All your workouts and history are safe.
      </p>
      {/* The same list the paywall shows, from the same constant, so the two
          can never promise different things — and it no longer claims logging
          among them, because starting a new workout now needs Pro. */}
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-dim">
        Reading them stays free, always. Adding to them needs Pro. Nothing was
        charged, and nothing will be.
      </p>
    </Sheet>
  );
}
