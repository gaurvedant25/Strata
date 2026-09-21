import { useRef, useState, type ReactNode } from "react";
import { useAuth } from "../auth";
import { useConfirm } from "../components/confirm";
import { Button, Eyebrow, Segmented, Sheet, inputCls } from "../components/ui";
import { exportBackup, importBackup, wipe } from "../lib/db";
import { CREDITS_URL, PRIVACY_URL, TERMS_URL } from "../lib/legal";
import { manageUrl, storeName } from "../lib/billing";
import { SUPPORT_CONFIGURED, SUPPORT_URL } from "../lib/support";
import { hasRenewingSubscription, planLabel } from "../lib/entitlement";
import { useEntitlement, useWriteGate } from "../lib/useEntitlement";
import { fmtDate, fmtRelative, todayKey } from "../lib/util";
import { useStore } from "../store";
import { SignIn } from "./SignIn";
import type { Gender, Unit } from "../types";

export function Settings({
  onBack,
  onUnlock,
  onCreateAccount,
  onSignIn,
}: {
  onBack: () => void;
  /** Opens the subscription sheet, which lives above this screen in `App`. */
  onUnlock: () => void;
  onCreateAccount: () => void;
  onSignIn: () => void;
}) {
  const pro = useEntitlement();
  const [planOpen, setPlanOpen] = useState(false);
  /*
   * Editing the exercise library is an action and is gated. Export, restore,
   * erase and delete are not: those are the user's rights over their own
   * records rather than features, and putting a price on the exit would be both
   * wrong and a quick way to fail a store review.
   */
  const { guard } = useWriteGate(onUnlock);
  const s = useStore();
  const auth = useAuth();
  const ask = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [exOpen, setExOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // Sign-in is no longer a gate in front of the app, so this is the way to it.
  const [signInOpen, setSignInOpen] = useState(false);

  async function doExport() {
    const data = await exportBackup();
    const json = JSON.stringify(data, null, 2);
    const file = new File([json], `gym-log-${todayKey()}.json`, {
      type: "application/json",
    });

    // iOS installed PWAs handle share sheets far better than <a download>
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Gym Log backup" });
        return;
      } catch {
        /* user cancelled — fall through to download */
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setMsg(`Saved ${file.name} to your downloads.`);
  }

  async function doImport(f: File) {
    try {
      const parsed: unknown = JSON.parse(await f.text());
      await importBackup(parsed);
      await s.reload();
      setMsg("Backup restored.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not read that file.");
    }
  }

  /*
   * A sign-in that worked is the end of this screen's job.
   *
   * Nothing used to close it but the "not now" button, so signing in
   * successfully left the filled-in form sitting there — session live, sync
   * already running, and the screen still saying "Welcome back." Pressing the
   * button appeared to do nothing at all, and the only way to see that it had
   * in fact worked was to reload, which reset this flag.
   *
   * The session closes it rather than a callback from `SignIn`, so every route
   * in is covered by one rule: a password, Google coming back through a
   * redirect, or a confirmation link opened in another tab. Adjusted during
   * render rather than in an effect, the way `usePresence` is and for the same
   * reason — an effect runs after this render has committed, which would show
   * the stale form for a frame after it had already succeeded.
   */
  if (signInOpen && auth.session) setSignInOpen(false);

  if (signInOpen) {
    return (
      <div className="mx-auto flex min-h-full max-w-lg flex-col">
        <SignIn
          onSkip={() => setSignInOpen(false)}
          skipLabel="Not now"
          skipNote="Your logs stay on this device. You can connect an account whenever you want them backed up."
        />
      </div>
    );
  }

  return (
    <div className="min-h-full pb-stack">
      <div className="flex items-center justify-between px-5 pb-5 pt-[calc(env(safe-area-inset-top)+14px)]">
        <Eyebrow>Settings</Eyebrow>
        <button
          onClick={onBack}
          aria-label="Back to Strength"
          className="-my-3 -mr-2 flex h-11 items-center gap-1.5 pr-2 text-muted active:text-fg"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 6l-6 6 6 6" />
          </svg>
          <span className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em]">
            Strength
          </span>
        </button>
      </div>

      {/*
        Subscription state lives with the account rather than on a screen of its
        own: it is a fact about who you are signed in as, and it is checked far
        less often than it would be worth a tab.
      */}
      {/*
        Shown signed out as well, reading "Free". Somebody with no account has
        no way of knowing the app gives a week of Pro away, and a Plan row that
        only appears once you have an account can only ever tell people who
        already know.
      */}
      {auth.cloud && (
        <>
          <Group title="Plan" />
          <ActionRow
            label="Plan"
            value={auth.session ? planLabel(pro.ent) : "Free"}
            onClick={() => setPlanOpen(true)}
          />
        </>
      )}

      {auth.cloud && (
        <>
          <Group title="Account" />
          {auth.session ? (
            <>
              <div className="flex items-center justify-between gap-4 border-b border-subrule px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-[0.9375rem]">
                    {auth.name ?? auth.email}
                  </p>
                  <p className="mt-0.5 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted">
                    {auth.sync === "syncing"
                      ? "Syncing…"
                      : auth.sync === "error"
                        ? "Offline · will catch up"
                        : auth.lastSyncedAt
                          ? `Synced ${fmtRelative(auth.lastSyncedAt, Date.now())}`
                          : "Synced"}
                  </p>
                </div>
                <button
                  onClick={() => void auth.push()}
                  className="-my-2 -mr-2 flex h-11 shrink-0 items-center px-2 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] underline decoration-[1.5px] underline-offset-[5px]"
                >
                  Sync now
                </button>
              </div>
              <button
                disabled={signingOut}
                onClick={async () => {
                  const yes = await ask({
                    title: "Sign out?",
                    body: "Your workouts stay in your account and sync back when you sign in again.",
                    confirmLabel: "Sign out",
                  });
                  if (!yes) return;
                  setSigningOut(true);
                  try {
                    await auth.signOut();
                  } finally {
                    setSigningOut(false);
                  }
                }}
                className="flex w-full items-center justify-between border-b border-rule px-5 py-3.5 text-left active:bg-[#0b0b0b] disabled:opacity-50"
              >
                <span className="text-[0.9375rem]">
                  {signingOut ? "Signing out…" : "Sign out"}
                </span>
                <span className="text-muted">{signingOut ? "" : "→"}</span>
              </button>
            </>
          ) : (
            <div className="border-b border-rule px-5 py-4">
              <p className="text-[0.8125rem] leading-relaxed text-muted text-pretty">
                You are using Gym Log without an account, so these logs live
                only on this device.
              </p>
              <div className="pt-3.5">
                <Button onClick={() => setSignInOpen(true)}>
                  Sign in or create account
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Group title="Units" />
      <SettingRow label="Weight unit" rule="subrule">
        <Segmented
          options={[
            { id: "kg" as Unit, label: "kg" },
            { id: "lb" as Unit, label: "lb" },
          ]}
          value={s.settings.unit}
          onChange={(u) => void s.saveSettings({ unit: u })}
        />
      </SettingRow>
      <SettingRow label="Sex" hint="Strength standards differ by sex.">
        <Segmented
          options={[
            { id: "male" as Gender, label: "male" },
            { id: "female" as Gender, label: "female" },
          ]}
          value={s.settings.gender}
          onChange={(g) => void s.saveSettings({ gender: g })}
        />
      </SettingRow>

      <Group title="Exercises" />
      <ActionRow
        label="Exercise library"
        value={`${s.exercises.length} →`}
        onClick={guard(() => setExOpen(true))}
      />

      <Group title="Your data" />
      <ActionRow
        label="Export backup"
        value=".json →"
        rule="subrule"
        onClick={() => void doExport()}
      />
      <ActionRow
        label="Restore from backup"
        value="→"
        rule="subrule"
        onClick={() => fileRef.current?.click()}
      />
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void doImport(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={async () => {
          const yes = await ask({
            title: "Erase everything on this device?",
            body: "Every workout, routine and exercise stored here. This cannot be undone.",
            confirmLabel: "Erase all data",
            danger: true,
          });
          if (yes) void wipe().then(() => location.reload());
        }}
        className="flex w-full items-center justify-between border-b border-rule px-5 py-3.5 text-left active:bg-[#0b0b0b]"
      >
        <span className="text-[0.9375rem] text-danger">Erase all data</span>
        {/* Was #4d1a16 — a dimmed danger red at 1.5:1, the least visible mark
            in the app sitting on its most destructive row. */}
        <span className="text-danger">→</span>
      </button>

      {/* Only for someone who has an account to delete. Signed out, the row
          above already erases everything that exists. */}
      {auth.session && (
        <button
          onClick={async () => {
            const yes = await ask({
              title: "Delete your account?",
              body: "Your account, and every workout synced to it, is deleted from the server and from this device. This cannot be undone, and it cannot be recovered by signing in again.",
              confirmLabel: "Delete account",
              danger: true,
            });
            if (!yes) return;
            try {
              // The server first. If it refuses, the device still has the only
              // copy, and saying so beats erasing it on a false promise.
              await auth.deleteAccount();
            } catch {
              setMsg("Could not reach the server. Nothing was deleted — try again with a connection.");
              return;
            }
            await wipe();
            location.reload();
          }}
          className="flex w-full items-center justify-between border-b border-rule px-5 py-3.5 text-left active:bg-[#0b0b0b]"
        >
          <span className="text-[0.9375rem] text-danger">Delete account</span>
          <span className="text-danger">→</span>
        </button>
      )}

      <p className="px-5 pt-6 text-[0.75rem] leading-[1.7] text-muted text-pretty">
        {auth.session
          ? "Your workouts are stored on this device and in your account, and the two reconcile whenever you have a connection. Everything keeps working offline; clearing your browser data only clears this device."
          : "Everything lives on this device only — nothing is uploaded. Clearing your browser data or deleting the app also deletes your logs, so back up regularly."}
      </p>

      {/* Both documents ship inside the app, so this works with no signal —
          and so the address a store listing points at is the app's own. */}
      <Group title="Legal" />
      <LinkRow label="Privacy policy" href={PRIVACY_URL} rule="subrule" />
      <LinkRow
        label="Terms and conditions"
        href={TERMS_URL}
        rule="subrule"
      />
      {/* The exercise drawings are used under a licence that asks to be
          credited, and this is where the credit lives. */}
      <LinkRow label="Image credits" href={CREDITS_URL} />

      {msg && (
        <div className="fixed inset-x-0 bottom-28 z-50 mx-auto flex max-w-lg items-center justify-between gap-4 border-y border-rule bg-ink px-5 py-3.5 text-[0.875rem]">
          {msg}
          <button
            className="-my-2 -mr-2 flex h-11 shrink-0 items-center px-2 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-fg"
            onClick={() => setMsg(null)}
          >
            OK
          </button>
        </div>
      )}

      <ExerciseManager open={exOpen} onClose={() => setExOpen(false)} />

      <PlanSheet
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        signedIn={!!auth.session}
        onUnlock={() => {
          setPlanOpen(false);
          onUnlock();
        }}
        onCreateAccount={() => {
          setPlanOpen(false);
          onCreateAccount();
        }}
        onSignIn={() => {
          setPlanOpen(false);
          onSignIn();
        }}
      />
    </div>
  );
}

function Group({ title }: { title: string }) {
  return (
    <div className="border-t border-rule px-5 pb-2 pt-4">
      <Eyebrow className="tracking-[0.18em]">{title}</Eyebrow>
    </div>
  );
}

function SettingRow({
  label,
  hint,
  children,
  rule = "rule",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  rule?: "rule" | "subrule";
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 px-5 py-3 ${
        rule === "rule" ? "border-b border-rule" : "border-b border-subrule"
      }`}
    >
      <div className="min-w-0">
        <p className="text-[0.9375rem]">{label}</p>
        {hint && <p className="mt-0.5 text-[0.75rem] text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/**
 * The same row as `ActionRow`, but an anchor rather than a button.
 *
 * These two go somewhere rather than doing something, and the difference is
 * not cosmetic: a real link can be opened in a new tab, copied, and read out
 * by a screen reader as a destination.
 */
function LinkRow({
  label,
  href,
  rule = "rule",
}: {
  label: string;
  href: string;
  rule?: "rule" | "subrule";
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`flex w-full items-center justify-between px-5 py-3.5 text-left active:bg-[#0b0b0b] ${
        rule === "rule" ? "border-b border-rule" : "border-b border-subrule"
      }`}
    >
      <span className="text-[0.9375rem]">{label}</span>
      <span className="font-mono text-[0.75rem] text-muted">↗</span>
    </a>
  );
}

function ActionRow({
  label,
  value,
  onClick,
  rule = "rule",
}: {
  label: string;
  value: string;
  onClick: () => void;
  rule?: "rule" | "subrule";
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between px-5 py-3.5 text-left active:bg-[#0b0b0b] ${
        rule === "rule" ? "border-b border-rule" : "border-b border-subrule"
      }`}
    >
      <span className="text-[0.9375rem]">{label}</span>
      <span className="font-mono text-[0.75rem] text-muted">{value}</span>
    </button>
  );
}

/**
 * The plan, and the two things you can do about it.
 *
 * Both of those things happen at the store, not here, and the rows say so
 * rather than implying otherwise. Apple and Google each require a subscription
 * to be cancelled and changed in the store that sold it, and a "Cancel" button
 * in this app that only unset a local flag would leave somebody believing they
 * had stopped a renewal that was still coming.
 *
 * What is offered depends on what is actually running, because the three kinds
 * of Pro are not the same thing:
 *
 *   preview    ends by itself, has taken no card, and has nothing to cancel
 *   lifetime   renews nothing, so a cancel row would be offering to take
 *              something away for no reason
 *   monthly
 *   or yearly  the only one that will bill again, and the only one with a
 *              cancel and a change of plan to offer
 */
function PlanSheet({
  open,
  onClose,
  signedIn,
  onUnlock,
  onCreateAccount,
  onSignIn,
}: {
  open: boolean;
  onClose: () => void;
  signedIn: boolean;
  onUnlock: () => void;
  onCreateAccount: () => void;
  onSignIn: () => void;
}) {
  const { ent } = useEntitlement();
  const store = storeName();
  const renewing = hasRenewingSubscription(ent);
  const day = (ms: number) => fmtDate(todayKey(new Date(ms)));
  const cancelled = ent.subscriptionStatus === "cancelled";

  /*
   * Signed out there is no entitlement to describe, only an offer to make —
   * and it is the same offer the locked controls make, so it is worded the
   * same way. Creating the account does not start the week; the first logged
   * workout does, and saying so here avoids a nasty surprise later.
   */
  if (!signedIn)
    return (
      <Sheet open={open} onClose={onClose} title="Plan">
        <p className="text-[1.25rem] font-semibold tracking-[-0.02em]">Free</p>
        <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted">
          Create an account to save your workouts and unlock a 7-day Pro
          preview after your first completed workout.
        </p>
        <p className="mt-3 font-mono text-label font-semibold uppercase tracking-[0.16em] text-dim">
          No card · No automatic charge
        </p>
        <div className="-mx-5 mt-5 border-t border-rule">
          <ActionRow label="Create account" value="→" onClick={onCreateAccount} />
          <ActionRow label="Sign in" value="→" onClick={onSignIn} />
        </div>
      </Sheet>
    );

  return (
    <Sheet open={open} onClose={onClose} title="Plan">
      <p className="text-[1.25rem] font-semibold tracking-[-0.02em]">
        {planLabel(ent)}
      </p>

      {ent.state === "pro_preview" && ent.previewEndsAt && (
        <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted">
          Ends {day(ent.previewEndsAt)}. No card, and nothing will be charged
          when it does.
        </p>
      )}
      {ent.state === "subscribed" && renewing && ent.subscriptionExpiresAt && (
        <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted">
          {cancelled
            ? `Cancelled. Pro stays on until ${day(ent.subscriptionExpiresAt)}, and nothing further will be charged.`
            : `Renews ${day(ent.subscriptionExpiresAt)}.`}
        </p>
      )}
      {ent.state === "subscribed" && !renewing && (
        <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted">
          A one-time unlock. Nothing renews and nothing will be charged.
        </p>
      )}
      {(ent.state === "free" || ent.state === "expired") && (
        <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted">
          Reading everything you have logged stays free. Adding to it —
          workouts, weigh-ins, routines — needs Pro.
        </p>
      )}

      <div className="-mx-5 mt-5 border-t border-rule">
        {/* Everything except a live subscription can still buy one — including
            a preview, which somebody may want to convert before it ends. */}
        {ent.state !== "subscribed" && (
          <ActionRow label="Unlock Pro" value="→" onClick={onUnlock} />
        )}
        {renewing && (
          <>
            <LinkRow label="Change plan" href={manageUrl()} />
            {/* Already cancelled: the only thing left is to turn it back on,
                which is also the store's job. */}
            {!cancelled && (
              <LinkRow label="Cancel subscription" href={manageUrl()} />
            )}
          </>
        )}
      </div>

      {SUPPORT_CONFIGURED && (
        <div className="-mx-5 border-b border-rule">
          <LinkRow label="Purchase help" href={SUPPORT_URL} />
        </div>
      )}

      {renewing && (
        <p className="mt-3 text-[0.75rem] leading-relaxed text-dim">
          Both open {store}, which is where subscriptions are changed and
          cancelled. Cancelling keeps Pro until {day(ent.subscriptionExpiresAt!)}
          .
        </p>
      )}
    </Sheet>
  );
}

function ExerciseManager({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const s = useStore();
  const ask = useConfirm();
  const [q, setQ] = useState("");
  const list = s.exercises
    .filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort(
      (a, b) =>
        a.muscle.localeCompare(b.muscle) || a.name.localeCompare(b.name),
    );

  const used = new Set(
    s.sessions.flatMap((x) => x.entries.map((e) => e.exerciseId)),
  );

  return (
    <Sheet open={open} onClose={onClose} title="Exercise library">
      <input
        className={`${inputCls} mb-4`}
        placeholder="Search…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="border-t border-rule">
        {list.map((e) => (
          <div
            key={e.id}
            className="flex items-center gap-3 border-b border-subrule py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.9375rem]">{e.name}</p>
              <p className="mt-0.5 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted">
                {e.muscle}
                {e.bodyweight ? " · bodyweight" : ""}
              </p>
            </div>
            {used.has(e.id) ? (
              <span className="shrink-0 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-dim">
                logged
              </span>
            ) : (
              <button
                onClick={async () => {
                  const yes = await ask({
                    title: `Delete "${e.name}"?`,
                    body: "It is removed from your exercise library.",
                    confirmLabel: "Delete",
                    danger: true,
                  });
                  if (yes) void s.deleteExercise(e.id);
                }}
                className="-my-2 -mr-2 flex h-11 shrink-0 items-center px-2 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-danger"
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="pt-4 text-[0.75rem] leading-relaxed text-muted">
        Exercises you have already logged can't be deleted — that would orphan
        your history. Add new ones from the picker inside a workout.
      </p>
    </Sheet>
  );
}
