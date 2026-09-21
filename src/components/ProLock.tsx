import type { ReactNode } from "react";
import { PRO_FEATURES, type ProFeature } from "../lib/entitlement";
import { useEntitlement } from "../lib/useEntitlement";

/**
 * A feature, or the reason you cannot see it.
 *
 * The only thing a screen has to know about entitlement. It asks by name —
 * `feature="advanced-trends"` — and never learns what a preview is, when one
 * started, or how to subtract two dates. That is the whole point of routing
 * every check through here: when the rule changes it changes in `entitlement.ts`
 * and nowhere else.
 *
 * What it draws when locked is deliberately plain. No gradient, no badge, no
 * pricing: the app's own card, the app's own hairline, one line saying what is
 * behind it and one button. A locked feature should look like part of the app,
 * not like an advert that wandered into it.
 */
export function ProLock({
  feature,
  onUnlock,
  children,
}: {
  feature: ProFeature;
  /** Routed through `App`'s gate, which decides invitation versus prices. */
  onUnlock: (feature: ProFeature) => void;
  children: ReactNode;
}) {
  const { can } = useEntitlement();
  if (can(feature)) return <>{children}</>;
  return (
    <div className="rounded-2xl border border-cardrule bg-card px-5 py-5 text-center">
      <p className="font-mono text-label font-semibold uppercase tracking-[0.18em] text-dim">
        Pro
      </p>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
        {PRO_FEATURES[feature]}
      </p>
      <button
        onClick={() => onUnlock(feature)}
        aria-label={`Unlock Pro for ${PRO_FEATURES[feature].toLowerCase()}`}
        className="press mt-3 h-11 font-mono text-label font-semibold uppercase tracking-[0.16em] text-fg underline decoration-[1.5px] underline-offset-[5px]"
      >
        Unlock Pro
      </button>
    </div>
  );
}
