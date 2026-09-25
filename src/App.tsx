import { useEffect, useRef, useState, type ComponentType } from "react";
import { CalendarIcon, ChartIcon } from "./components/icons";
import { Paywall } from "./components/Paywall";
import { ProExpired } from "./components/ProExpired";
import { ProInvite } from "./components/ProInvite";
import { ProFinalDay, ProUnlocked } from "./components/ProNotices";
import { track } from "./lib/analytics";
import {
  gateDestination,
  hasQualifyingWorkout,
  type GateSubject,
} from "./lib/entitlement";
import { useEntitlement } from "./lib/useEntitlement";
import { sessionElapsed } from "./lib/stats";
import { fmtDuration } from "./lib/util";
import { ActiveWorkout } from "./screens/ActiveWorkout";
import { History } from "./screens/History";
import { Home } from "./screens/Home";
import { Onboarding } from "./screens/Onboarding";
import { Progress } from "./screens/Progress";
import { Routines } from "./screens/Routines";
import { Settings } from "./screens/Settings";
import { SignIn } from "./screens/SignIn";
import { useAuth } from "./auth";
import { useHideOnScroll } from "./lib/useHideOnScroll";
import { useStore } from "./store";

export type Tab = "home" | "routines" | "history" | "progress";

type IconT = ComponentType<{ className?: string; size?: number }>;

/**
 * Four tabs, icons only, in a bar that floats over the content.
 *
 * Settings was once a fifth tab and is now reached from the Strength header: it
 * is a place you visit rarely, and giving it a fifth of the bar cost the four
 * you use constantly the room to be a comfortable size.
 *
 * The labels are gone, which is only survivable because something else now says
 * where you are: a highlight that travels to the tab you picked. An unlabelled
 * icon in a static bar leaves you reading four small drawings to work out which
 * one is lit; an unlabelled icon the highlight just slid onto tells you both
 * where you are and which way you came. The names live on as `aria-label`,
 * so
 * the bar reads the same to a screen reader as it did when it was labelled.
 */
const TABS: { id: Tab; label: string; Icon: IconT }[] = [
  { id: "home", label: "Strength", Icon: BodyIcon },
  { id: "routines", label: "Routines", Icon: ListIcon },
  { id: "history", label: "History", Icon: CalendarIcon },
  { id: "progress", label: "Progress", Icon: ChartIcon },
];

function BodyIcon({
  className,
  size = 20,
}: {
  className?: string;
  size?: number;
}) {
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

function ListIcon({
  className,
  size = 20,
}: {
  className?: string;
  size?: number;
}) {
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
  const auth = useAuth();
  // Declining an account is remembered, so "use without an account" is a
  // decision rather than a question asked on every launch.
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
    const fresh =
      !s.bodyweight.length && !s.splits.length && !s.sessions.length;
    setOnboarding(fresh && localStorage.getItem("strata.onboarded") !== "1");
  }, [
    s.ready,
    s.bodyweight.length,
    s.splits.length,
    s.sessions.length,
    onboarding,
  ]);

  /** Whether the sign-in screen is up in front of onboarding. */
  const [signInOpen, setSignInOpen] = useState(false);

  /*
   * The Pro preview, and the one rule that starts it.
   *
   * Not "on install" and not "on sign-up": the seven days begin when there is a
   * finished workout carrying at least one logged, unskipped set. Expressed as a
   * standing condition rather than as something hung off the Finish button,
   * which is what makes every awkward case fall out for free — a second
   * completed workout, a reload a moment after the first, a completion that
   * happened offline and syncs later, and the existing user who already has a
   * history and meets the condition the first time this code ever runs.
   *
   * `start_pro_preview()` is idempotent on the server, so calling it again is
   * cheap and calling it twice is harmless. Nothing is written locally on the
   * way in, so a call that fails leaves the account still eligible and simply
   * tries again — a preview is never consumed by a round trip that did not
   * land.
   */
  const pro = useEntitlement();
  const [paywall, setPaywall] = useState(false);
  const [expiryOpen, setExpiryOpen] = useState(false);
  /** Which shape of preview invitation is up, if any. */
  const [invite, setInvite] = useState<"guest" | "workout" | null>(null);
  /** Which tab the sign-in screen should open on, when it is up. */
  const [signInAs, setSignInAs] = useState<"in" | "up" | null>(null);

  /*
   * Every locked control in the app comes through here.
   *
   * One router rather than a `setPaywall(true)` scattered through the screens,
   * because what a locked control should *do* depends on who is tapping it and
   * that decision should exist once. `gateDestination` makes the choice and is
   * tested on its own; this only carries it out.
   */
  const openGate = (feature: GateSubject) => {
    track("pro_feature_gate_viewed", {
      // `start-workout` is a gate subject rather than a matrix key; reported as
      // a plain string so the funnel can still see it.
      feature: feature === "start-workout" ? undefined : feature,
      reason: feature,
      state: pro.ent.state,
    });
    const where = gateDestination({
      ent: pro.ent,
      signedIn: pro.signedIn,
      hasQualifyingWorkout: hasQualifyingWorkout(s.sessions),
    });
    if (where === "none") return;
    if (where === "paywall") setPaywall(true);
    else setInvite(where === "invite-guest" ? "guest" : "workout");
  };

  const startPreview = pro.startPreview;
  useEffect(() => {
    if (!pro.signedIn || pro.loading || pro.ent.previewConsumed) return;
    if (!hasQualifyingWorkout(s.sessions)) return;
    void startPreview();
    // Narrow on purpose: depending on the whole context would re-run this every
    // time the countdown ticks, which is once a minute, forever.
  }, [pro.signedIn, pro.loading, pro.ent.previewConsumed, s.sessions, startPreview]);

  /*
   * The expiry screen waits for a natural moment rather than taking one.
   *
   * It is armed once per launch when the preview has run out, and only
   * rendered further down, where the logger is already known to be down — so a
   * preview that ends mid-set is not something the person mid-set finds out
   * about.
   */
  const expiryArmed = useRef(false);
  useEffect(() => {
    if (onboarding !== false || pro.loading) return;
    if (pro.ent.state !== "expired" || pro.notices.expiryDismissed) return;
    if (expiryArmed.current) return;
    expiryArmed.current = true;
    track("pro_preview_expired", { state: pro.ent.state });
    setExpiryOpen(true);
  }, [onboarding, pro.loading, pro.ent.state, pro.notices.expiryDismissed]);

  /*
   * What signing in during first run means.
   *
   * A returning lifter has a bodyweight, a split and a history sitting on the
   * server, and asking them to build a second profile by hand would be absurd
   * — so the moment any of it has arrived, first run is over and they land in
   * the app proper.
   *
   * It waits for the data rather than acting on the session, because the
   * account might be empty: somebody who taps "create account" here has no
   * profile anywhere, and dismissing on the session alone would drop them into
   * a grey body chart having skipped the only questions that could have filled
   * it in. An empty account keeps the questions, and their answers sync up to
   * it afterwards like any other data.
   */
  useEffect(() => {
    if (!auth.session) return;
    setSignInAs(null);
    setSignInOpen(false);
    if (!onboarding) return;
    if (s.bodyweight.length || s.splits.length || s.sessions.length) {
      localStorage.setItem("strata.onboarded", "1");
      setOnboarding(false);
    }
  }, [
    auth.session,
    onboarding,
    s.bodyweight.length,
    s.splits.length,
    s.sessions.length,
  ]);

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
  // Block-bodied on purpose: an expression body returns whatever the call
  // evaluates to, and React takes any non-function return as a cleanup and
  // throws tearing it down. window.scrollTo returns undefined in a clean
  // browser, but not necessarily in one where an extension has patched it.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab, viewLogger, settingsOpen]);

  // Now that the stack floats over the content rather than sitting under it,
  // it can leave while you read without anything reflowing behind it.
  const barRef = useHideOnScroll();

  if (!s.ready || !auth.ready) {
    return (
      <div className="grid h-full place-items-center">
        <div className="animate-pulse font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-muted">
          Loading
        </div>
      </div>
    );
  }

  function dismissOnboarding() {
    localStorage.setItem("strata.onboarded", "1");
    setOnboarding(false);
  }

  // Onboarding and the logger are full-screen: no tab bar, nothing behind them.
  if (onboarding) {
    return (
      <div className="mx-auto flex min-h-full max-w-lg flex-col">
        {signInOpen ? (
          <SignIn
            onSkip={() => setSignInOpen(false)}
            skipLabel="Back to setup"
            skipNote="Setting up here builds a profile on this device. You can connect an account later from Settings."
          />
        ) : (
          <Onboarding
            onDone={dismissOnboarding}
            onSignIn={() => setSignInOpen(true)}
          />
        )}
      </div>
    );
  }

  const showLogger = inWorkout && viewLogger;

  const activeIdx = TABS.findIndex((t) => t.id === tab);

  function goTab(id: Tab) {
    setTab(id);
    setViewLogger(false);
    setSettingsOpen(false);
  }

  /*
   * Opened from the Pro invitation, and full-screen like the logger — a form
   * with two fields does not belong in a sheet stacked over another sheet.
   * `skipLabel` is "Not now" because this is an offer somebody can decline, not
   * a gate they are stuck behind.
   */
  if (signInAs) {
    return (
      <div className="mx-auto flex min-h-full max-w-lg flex-col">
        <SignIn
          initialMode={signInAs}
          onSkip={() => setSignInAs(null)}
          skipLabel="Not now"
          skipNote="Your workouts stay on this device. You can create an account later from Settings."
        />
      </div>
    );
  }

  if (showLogger) {
    return (
      <div className="mx-auto min-h-full max-w-lg">
        <ActiveWorkout onBack={() => setViewLogger(false)} onUnlock={openGate} />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-full max-w-lg">
      {settingsOpen ? (
        <Settings
          onBack={() => setSettingsOpen(false)}
          onUnlock={() => setPaywall(true)}
          onCreateAccount={() => setSignInAs("up")}
          onSignIn={() => setSignInAs("in")}
        />
      ) : (
        <>
          {tab === "home" && (
            <Home onSettings={() => setSettingsOpen(true)} onUnlock={openGate} />
          )}
          {tab === "routines" && (
            <Routines
              onOpenLogger={() => setViewLogger(true)}
              // The same notice the app raises when the preview runs out, so a
              // refused start reads as that ending rather than as a price list.
              onLocked={() => setExpiryOpen(true)}
            />
          )}
          {tab === "history" && <History onUnlock={openGate} />}
          {tab === "progress" && <Progress onUnlock={openGate} />}
        </>
      )}

      {/*
        The pill and the tab bar are one stack pinned to the bottom, rather than
        two things each pinned separately. The pill used to sit at a hardcoded
        69px off the bottom — the tab bar's height, measured once and written
        down — so the moment the reader's text size moved the bar grew and the
        pill sat on top of it. Stacked, the pill is above the bar because it is
        above it in the document, at any size.

        The stack now floats, with the screen showing through it. That is what
        buys the hiding — a bar welded to the bottom edge is part of the page's
        frame, and its leaving reads as the frame breaking, where something
        already hovering can slide away and come back without the content ever
        noticing.

        The bottom inset is 14px like the sides, and on a phone with a home
        indicator it is the safe area less 12 — `max` with it, never plus.

        The inset is a distance from the bottom of the screen, and the safe area
        already is such a distance, so adding the two counts the same gap twice
        and lifts the bar 48px up on an iPhone: adrift in the middle of the
        screen rather than parked at the bottom. Even the full safe area is more
        room than this needs. It is sized to keep a full-width bar's *content*
        off the home indicator, and what sits there is a floating bar with 7px
        of padding inside it — so it gives back 12 and rides closer to the
        bottom edge, still clear of the indicator itself.

        The floor keeps a screen with no indicator at the design's own 14px,
        where subtracting anything would sit the bar on the edge.

        `pointer-events-none` on the stack and `auto` on each control: the gaps
        between and around them are 14px of screen the finger should still be
        able to reach the content through.
      */}
      <div
        ref={barRef}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-lg flex-col gap-2.5 px-3.5 pb-[max(calc(env(safe-area-inset-bottom)-12px),14px)] transition-transform duration-[260ms] ease-settle"
      >
        {/*
          The preview's two small messages, above the pill and the bar. They
          render here and only here, which is inside the branch the logger has
          already been ruled out of — so neither can land during a workout, on
          the celebration card, or while a set is being entered.
        */}
        <ProUnlocked />
        <ProFinalDay />

        {inWorkout && (
          <button
            onClick={() => setViewLogger(true)}
            aria-label="Return to the workout in progress"
            className="press press-row glass pointer-events-auto flex items-center justify-between gap-3 rounded-full px-5 py-[13px] text-left [--lift:0_10px_30px_rgb(0_0_0/0.55)]"
          >
            <span className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-fg">
              Workout in progress
            </span>
            <span className="font-mono text-[0.8125rem] text-muted">
              {fmtDuration(sessionElapsed(s.active!, s.now))} →
            </span>
          </button>
        )}

        {/*
          A fixed height in pixels, where the rest of the app scales with the
          reader's text size. There is no type in here any more, and what the
          height is actually sized to is a thumb: 66 less the 7 of padding at
          each end leaves 52px targets, comfortably over the 44 the platform
          asks for. A thumb does not get bigger when you turn the text up.
        */}
        <nav
          aria-label="Sections"
          className="glass pointer-events-auto relative flex h-[66px] rounded-full p-[7px]"
        >
          {/*
            The one switch animation in the app, and the only reason the labels
            could go. It travels rather than cutting, so the movement itself
            says which way you went — two tabs to the right feels different from
            one to the left, which is part of what a label was carrying.

            A strong ease-in-out rather than the app's usual settle: this is a
            solid object crossing open screen, and it should leave slowly, cover
            the distance, and arrive slowly. 240ms is deliberate without
            crossing the 300ms ceiling for something you tap this often.

            Sized as a quarter of the inner width and moved by whole multiples
            of itself, so it lands exactly on a tab at any screen width.
          */}
          <span
            aria-hidden="true"
            className="absolute inset-y-[7px] left-[7px] w-[calc((100%-14px)/4)] rounded-full border border-white/[0.12] bg-white/[0.11] shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] transition-[transform,opacity] duration-[240ms] ease-[cubic-bezier(0.77,0,0.175,1)]"
            style={{
              transform: `translateX(${activeIdx * 100}%)`,
              // Settings is not a tab, so while it is open no tab is current.
              // The highlight fades where it stands rather than sliding off to
              // nowhere, and comes back from there when you pick a tab again.
              opacity: settingsOpen ? 0 : 1,
            }}
          />
          {TABS.map(({ id, label, Icon }) => {
            const active = !settingsOpen && tab === id;
            return (
              <button
                key={id}
                onClick={() => goTab(id)}
                // With the label gone, the name has to be said somewhere: a
                // screen reader reads this instead of the icon, and hears from
                // `aria-current` which one it is on — neither of which the
                // travelling highlight can tell it.
                aria-label={label}
                aria-current={active ? "page" : undefined}
                // A deeper dip than the app's default. `press` was tuned for
                // wide controls, and 3% on a 52px circle is a movement you
                // cannot see; the icon is small enough to need the full 10%.
                className={`press relative z-[1] grid min-w-0 flex-1 place-items-center rounded-full [--press:0.9] ${
                  active ? "text-fg" : "text-dim"
                }`}
              >
                <Icon size={23} />
              </button>
            );
          })}
        </nav>
      </div>

      {/*
        Above the tab bar and outside it, because it is the one thing on this
        screen that is not navigation. It lives here rather than inside a tab so
        that the gate in Routines and the once-a-launch prompt open the same
        sheet rather than two that look alike.
      */}
      <Paywall open={paywall} onClose={() => setPaywall(false)} />

      <ProInvite
        open={!!invite}
        variant={invite ?? "guest"}
        onClose={() => setInvite(null)}
        onCreateAccount={() => {
          setInvite(null);
          setSignInAs("up");
        }}
        onSignIn={() => {
          setInvite(null);
          setSignInAs("in");
        }}
        onStartWorkout={() => {
          setInvite(null);
          goTab("routines");
        }}
      />

      <ProExpired
        open={expiryOpen}
        onClose={() => {
          setExpiryOpen(false);
          track("pro_continue_free", { state: pro.ent.state });
          pro.markNotice("expiryDismissed");
        }}
        onUnlock={() => {
          setExpiryOpen(false);
          pro.markNotice("expiryDismissed");
          setPaywall(true);
        }}
      />
    </div>
  );
}
