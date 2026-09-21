import { useState } from "react";
import { Eyebrow } from "./ui";
import { TIERS, TIER_COLOR } from "../lib/strength";

const SEEN = "gymlog.rankIntroSeen";

/**
 * Whether the one-time card still has anything to say.
 *
 * Read once, in a lazy initialiser, so the first paint is already the right
 * answer — an effect would render the card and then take it away again, which
 * is a flash of an introduction on every launch for everyone who has already
 * read it. Wrapped because `localStorage` is not merely empty but throws in a
 * private window and in some embedded webviews, and a storage refusal must not
 * take the screen down with it.
 */
export function useRankIntro() {
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem(SEEN) !== "1";
    } catch {
      return false;
    }
  });

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(SEEN, "1");
    } catch {
      // A browser refusing storage is not a reason to keep the card on screen
      // for the rest of the session; it only means it may return next launch.
    }
  }

  return { show, dismiss };
}

/**
 * The card a new lifter meets their own colours through.
 *
 * Setup seeds a body chart, so the first thing anyone sees on this screen is a
 * figure already lit in ranks they have not knowingly earned — which makes
 * "where did Silver come from?" the first question the screen provokes and the
 * one it never answered. It sits inline above the figure rather than arriving
 * as a modal over it: the thing being explained should be on screen behind the
 * explanation, not hidden by it.
 *
 * Shown once. Both the explanation and the dismissal retire it, because
 * someone who has read the full card does not need to be offered it again.
 */
export function RankIntroCard({
  onOpen,
  onDismiss,
}: {
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className="mb-2.5 rounded-[15px] border border-cardrule bg-card px-[13px] py-3">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow tone="fg">Your ranks</Eyebrow>
        <button
          type="button"
          onClick={onDismiss}
          className="-my-2 -mr-1 shrink-0 px-1 py-2 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted active:text-fg"
        >
          Got it
        </button>
      </div>

      <p className="mt-2 text-pretty text-[0.8125rem] leading-relaxed text-muted">
        Every muscle group is scored on the strongest eligible lift you have
        logged, and given one of six tiers. They measure your own progress over
        time — not other people.
      </p>

      {/* The ladder itself, since it is the thing the colours on the figure are
          speaking in. Colour is the only place a tier colour is allowed, and
          each dot carries its name so it is not the only carrier. */}
      <ol className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {TIERS.map((t, i) => (
          <li key={t} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block size-[6px] shrink-0 rounded-full"
              style={{ background: TIER_COLOR[t] }}
            />
            <span
              className="font-mono text-[0.625rem] font-medium uppercase tracking-[0.1em]"
              style={{ color: TIER_COLOR[t] }}
            >
              {t}
            </span>
            {i < TIERS.length - 1 && (
              <span aria-hidden="true" className="text-[0.625rem] text-dim">
                &rsaquo;
              </span>
            )}
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={onOpen}
        className="press press-row mt-3 flex min-h-11 w-full items-center justify-between gap-2.5 rounded-[9px] bg-[#1e1e1e] px-3.5 text-left"
      >
        <span className="text-[0.8125rem] text-fg">How rankings work</span>
        <span aria-hidden="true" className="font-mono text-[0.875rem] text-muted">
          &rsaquo;
        </span>
      </button>
    </section>
  );
}
