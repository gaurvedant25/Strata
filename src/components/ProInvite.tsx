import { useEffect } from "react";
import { track } from "../lib/analytics";
import { PREVIEW_DAYS } from "../lib/entitlement";
import { Button, Sheet } from "./ui";

/**
 * What a locked control says to somebody who has not had their preview yet.
 *
 * This sheet exists because the old flow got the order backwards. A signed-out
 * visitor tapping `90D` was shown ₹1,800 — a price, before anybody had told
 * them the app gives a week of Pro away for nothing. The offer has to come
 * first; the price list is the right answer only once the offer is spent.
 *
 * Two shapes, decided by `gateDestination` rather than here:
 *
 *   guest    no account yet. The account is what the preview is attached to,
 *            so it is the ask — but creating one does not start the week, and
 *            the copy says so rather than letting somebody find out later.
 *   workout  account, no qualifying workout. Nothing to sell and nothing to
 *            sign up for; the only honest thing to say is what starts it.
 *
 * Neither shape mentions money, because at this point there is none to mention.
 */
export function ProInvite({
  open,
  variant,
  onClose,
  onCreateAccount,
  onSignIn,
  onStartWorkout,
}: {
  open: boolean;
  variant: "guest" | "workout";
  onClose: () => void;
  onCreateAccount: () => void;
  onSignIn: () => void;
  onStartWorkout: () => void;
}) {
  useEffect(() => {
    if (open) track("pro_preview_invitation_viewed", { state: "free" });
  }, [open]);

  const guest = variant === "guest";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={guest ? "Pro preview" : "Pro preview"}
      footer={
        <div className="space-y-2.5">
          {guest ? (
            <>
              <Button
                onClick={() => {
                  track("pro_preview_account_started", { state: "free" });
                  onCreateAccount();
                }}
              >
                Create account
              </Button>
              <Button variant="outline" onClick={onSignIn}>
                Sign in
              </Button>
              {/*
                A real third option, not a dismissal disguised as one. Somebody
                who does not want an account should be able to say so and get
                their screen back.
              */}
              <Button variant="quiet" onClick={onClose}>
                Not now
              </Button>
            </>
          ) : (
            <>
              <Button onClick={onStartWorkout}>Start a workout</Button>
              <Button variant="quiet" onClick={onClose}>
                Not now
              </Button>
            </>
          )}
        </div>
      }
    >
      <p className="text-pretty text-[1.5rem] font-semibold leading-[1.15] tracking-[-0.03em]">
        {guest
          ? `Try Pro free for ${PREVIEW_DAYS} days`
          : `Your ${PREVIEW_DAYS}-day Pro preview starts after your first completed workout`}
      </p>

      {guest && (
        <>
          <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-muted">
            Create an account to save your workouts and unlock your Pro preview
            after your first completed workout.
          </p>
          <p className="mt-4 font-mono text-label font-semibold uppercase tracking-[0.16em] text-dim">
            No card · No automatic charge
          </p>
          {/*
            Said here rather than discovered later. Somebody who signs up
            expecting Pro immediately and does not get it has been misled, even
            though every individual sentence was true.
          */}
          <p className="mt-4 text-[0.8125rem] leading-relaxed text-dim">
            Anything you have already logged on this device comes with you when
            you sign up.
          </p>
        </>
      )}

      {!guest && (
        <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-muted">
          One workout with at least one set logged is enough. Nothing is
          charged, and no card is needed.
        </p>
      )}
    </Sheet>
  );
}
