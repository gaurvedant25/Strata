import { useEffect } from "react";
import { PREVIEW_DAYS, endsIn, formatRemaining, isFinalDay } from "../lib/entitlement";
import { useEntitlement } from "../lib/useEntitlement";
import { X } from "./icons";

/**
 * The two small things the preview is allowed to say out loud.
 *
 * One when it starts, one on the last day, and nothing at all in between — the
 * five days in the middle are deliberately silent. Both are floating cards in
 * the same surface as the tab bar they sit above, because a preview is
 * information and not an interruption: neither takes the screen, neither has a
 * scrim, and both leave on their own or on a tap.
 *
 * Neither is rendered while the logger is up. That is what keeps them out of an
 * active workout, off the celebration card and away from somebody entering a
 * set — all three live inside `ActiveWorkout`, so one condition covers them.
 *
 * The standing plan state is not here. It is a row in Settings that opens a
 * sheet, because it is something you go and look at rather than something the
 * app should tell you.
 */

/** Shared shape: a floating card that matches the bar it hovers over. */
function Floating({
  children,
  onDismiss,
  label,
}: {
  children: React.ReactNode;
  onDismiss?: () => void;
  label?: string;
}) {
  return (
    <div className="glass pointer-events-auto flex items-start gap-3 rounded-2xl px-4 py-3 [--lift:0_10px_30px_rgb(0_0_0/0.55)]">
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label={label}
          className="-my-2 -mr-2 grid size-10 shrink-0 place-items-center text-dim active:text-fg"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * "Pro unlocked for 7 days".
 *
 * Shown once, ever, per account, and only once the preview has actually been
 * recorded on the server — so it is never the thing that tells somebody they
 * have Pro a moment before a failed write takes it away again.
 *
 * The second line is the whole point of the feature and is not decoration: it
 * is what makes this a preview rather than a trial, and it should stay.
 */
export function ProUnlocked() {
  const { ent, notices, markNotice } = useEntitlement();
  const show = ent.state === "pro_preview" && !notices.unlockShown;

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => markNotice("unlockShown"), 6000);
    return () => clearTimeout(id);
  }, [show, markNotice]);

  if (!show) return null;
  return (
    <Floating onDismiss={() => markNotice("unlockShown")} label="Dismiss">
      <p className="text-[0.9375rem] font-medium tracking-[-0.01em] text-fg">
        Pro unlocked for {PREVIEW_DAYS} days
      </p>
      <p className="mt-0.5 font-mono text-label font-medium uppercase tracking-[0.14em] text-muted">
        No card · No automatic charge
      </p>
    </Floating>
  );
}

/**
 * The one closing notice, on the last day, dismissible.
 *
 * It says how long is actually left rather than "ends tomorrow", which was true
 * for the first hour of the last day and misleading for the rest of it.
 */
export function ProFinalDay() {
  const { ent, notices, markNotice } = useEntitlement();
  if (!isFinalDay(ent) || notices.finalDismissed) return null;
  return (
    <Floating
      onDismiss={() => markNotice("finalDismissed")}
      label="Dismiss notice"
    >
      <p className="text-[0.9375rem] font-medium tracking-[-0.01em] text-fg">
        Your Pro preview ends {endsIn(ent.msRemaining)}
      </p>
      <p className="mt-0.5 font-mono text-label font-medium uppercase tracking-[0.14em] text-muted">
        {formatRemaining(ent.msRemaining)}
      </p>
    </Floating>
  );
}
