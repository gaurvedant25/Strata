import type { EntitlementState, ProFeature } from "./entitlement";
import type { PlanId } from "./plans";

/**
 * Where subscription events go, which today is nowhere.
 *
 * A no-op on purpose. The app has no analytics provider and this does not add
 * one — it is the shape of the thing, so that the call sites exist, are typed,
 * and are already correct on the day a provider is connected. `sink` is the one
 * line that changes then.
 *
 * The event list is closed and the property list is closed, and that is the
 * point rather than tidiness. An open `Record<string, unknown>` is how workout
 * notes, exercise names and email addresses end up on somebody else's server by
 * accident. Nothing here can carry them: the only things that can be attached
 * are a feature id, an entitlement state, a plan id and a platform, all of
 * which are drawn from fixed sets defined in this codebase.
 */

export type ProEvent =
  | "pro_preview_invitation_viewed"
  | "pro_preview_account_started"
  | "pro_preview_started"
  | "pro_feature_gate_viewed"
  | "pro_paywall_viewed"
  | "pro_plan_selected"
  | "pro_purchase_started"
  | "pro_purchase_completed"
  | "pro_purchase_failed"
  | "pro_restore_started"
  | "pro_restore_completed"
  | "pro_preview_expired"
  | "pro_continue_free";

/**
 * Everything an event is allowed to carry.
 *
 * Every field is an enum or an id from this app's own vocabulary. There is
 * deliberately no free-text field, no identifier for the person, and no way to
 * pass one — anything a caller wants to add has to be added here first, where
 * it can be looked at.
 */
export type ProEventProps = {
  feature?: ProFeature;
  state?: EntitlementState;
  plan?: PlanId;
  platform?: string;
  /** Why a purchase ended the way it did, from `BillingError`. */
  reason?: string;
};

type Sink = (event: ProEvent, props: ProEventProps) => void;

/**
 * The connection point. Replace this one function with a provider's `track` and
 * every call site below starts reporting; nothing else needs to move.
 */
const sink: Sink = (event, props) => {
  // Visible while developing so the funnel can be watched without a provider,
  // and silent in a production build.
  if (import.meta.env.DEV) console.debug("[pro]", event, props);
};

export function track(event: ProEvent, props: ProEventProps = {}) {
  try {
    sink(event, props);
  } catch {
    // Reporting must never be able to break the thing it is reporting on.
  }
}
