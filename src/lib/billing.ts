import { Capacitor } from "@capacitor/core";
import { playBilling } from "./playBilling";
import { PLANS, type PlanId, type StorePrice } from "./plans";

/**
 * The bridge to whichever store the app is running inside.
 *
 * Nothing above this file knows whether it is talking to Play Billing,
 * StoreKit or nothing at all, which is the point: the paywall, the gate and the
 * entitlement are the same code on all three, and only this module changes when
 * a store is wired up.
 *
 * It is deliberately an interface with an *unconfigured* implementation rather
 * than a stub that pretends to work. A paywall that appears to take money and
 * silently unlocks would be the worst possible bug to discover in production,
 * so the honest answer until Play Console has products in it is "this store
 * cannot sell you anything yet", said out loud on screen.
 *
 * There is deliberately no mock. Access is granted by the server now, so a mock
 * purchase could not unlock anything even if it wanted to — all it could do is
 * lie to the screen. The preview states are exercised against the database
 * instead; `scripts/check-entitlement.cjs` covers the rules.
 */

export const PACKAGE_NAME = "com.vedant.gymlog";

/**
 * What a completed store purchase looks like on the way back in.
 *
 * Note what is *not* here: anything that grants access. Entitlement lives in
 * `gym_entitlements` and is written by the server, so a finished purchase ends
 * with the store receipt being verified server-side and the row updated — never
 * with the client deciding it is now Pro. This type is the handoff, not the
 * grant.
 */
export type Purchase = {
  plan: PlanId;
  /** Unix ms. Absent for the lifetime unlock, which does not expire. */
  expiresAt?: number;
};

/**
 * A plan as the store describes it.
 *
 * `price.text` is the localised string to print. `price.amount` and
 * `price.currency` are what make the monthly equivalent and the saving
 * calculable — Play supplies them as `priceAmountMicros` plus a currency code,
 * StoreKit as a decimal plus a locale. An implementation that cannot supply
 * them still works; the comparisons just go quiet.
 */
export type StorePlan = {
  plan: PlanId;
  price: StorePrice;
};

/**
 * How a purchase ended.
 *
 * `pending` is the one worth dwelling on. A store can take a payment and then
 * take its time telling anyone — a slow verification, a bank step, an offline
 * moment between the charge and the receipt. The app cannot know whether money
 * moved, so it must not say that none did. That is why there is no error here
 * that means "nothing was charged": the app is not in a position to promise it.
 */
export type BillingError =
  | "unavailable"
  | "cancelled"
  | "already-owned"
  | "pending"
  | "failed";

export class BillingFailure extends Error {
  // Declared and assigned rather than a constructor parameter property: this
  // project compiles with `erasableSyntaxOnly`, which rules out the shorthand.
  code: BillingError;
  constructor(code: BillingError) {
    super(code);
    this.code = code;
  }
}

export interface Billing {
  /** Whether this build can actually take money right now. */
  readonly ready: boolean;
  /** The plans the store will sell, with its prices. Empty when not ready. */
  plans(): Promise<StorePlan[]>;
  /** Runs the store's own purchase sheet. Throws `BillingFailure` otherwise. */
  buy(plan: PlanId): Promise<Purchase>;
  /**
   * What this store account already owns.
   *
   * Both stores require a route back to a purchase on a new device, and Apple
   * rejects non-consumables — the lifetime unlock — that have no way to be
   * restored. It is not an optional nicety.
   */
  restore(): Promise<Purchase | null>;
}

/**
 * What runs until Play Console has products in it.
 *
 * `ready` is false, so the paywall can say so rather than offering a button
 * that goes nowhere.
 */
const Unconfigured: Billing = {
  ready: false,
  async plans() {
    return [];
  },
  async buy() {
    throw new BillingFailure("unavailable");
  },
  async restore() {
    return null;
  },
};

/**
 * Where the user cancels — which is never here.
 *
 * Both stores insist that a subscription is managed in the store, not in the
 * app that sold it, and Play wants the deep link to name the product. Writing
 * our own "cancel" button that only unset a local flag would leave people
 * believing they had stopped a renewal that was still coming.
 */
export function manageUrl(plan?: PlanId): string {
  if (Capacitor.getPlatform() === "ios")
    return "https://apps.apple.com/account/subscriptions";
  const sku = plan ? PLANS.find((p) => p.id === plan)?.productId : undefined;
  const q = new URLSearchParams({ package: PACKAGE_NAME });
  if (sku) q.set("sku", sku);
  return `https://play.google.com/store/account/subscriptions?${q}`;
}

/** Which store, if any, this build is talking to. */
export const storeName = () =>
  Capacitor.getPlatform() === "ios" ? "the App Store" : "Google Play";

/*
 * ─── STORE BILLING INTEGRATION POINT ────────────────────────────────────────
 *
 * Everything above this line is the contract. Wiring a store means writing one
 * more object that satisfies `Billing` and swapping it in here:
 *
 *   Play    a Capacitor billing plugin, `gym_pro` with its `monthly` and
 *           `yearly` base plans, plus the `gym_lifetime` one-time product.
 *   Apple   StoreKit 2 over the same three ids in `plans.ts`.
 *
 * The purchase itself is only half of it. The other half is server-side: the
 * receipt goes to an Edge Function, which verifies it against the store and
 * writes `subscription_status` and `subscription_expires_at` into
 * `gym_entitlements`. Nothing in the client is allowed to grant Pro — this
 * module hands over a receipt and then asks the server what it decided.
 *
 * Until that exists, `Unconfigured` is what runs, `ready` is false, and the
 * paywall says so in plain words rather than offering a button to nowhere.
 */
/**
 * The store this build actually talks to.
 *
 * Play's implementation lives in `playBilling.ts`, which imports the contract
 * back out of this file — a cycle, and a deliberate one: this is the module the
 * rest of the app names, and moving the choice elsewhere to avoid the arrow
 * would mean the documented integration point was no longer where integration
 * happens. It is safe because neither side touches the other's bindings while
 * the modules are evaluating: everything `playBilling.ts` imports from here is
 * read inside a function, and the plugin itself arrives through a dynamic
 * import that cannot resolve before both files have finished.
 *
 * Anywhere that is not Android keeps `Unconfigured` — the web build has no Play
 * Billing to talk to, and a paywall that says so is better than one that
 * pretends.
 */
export const billing: Billing =
  Capacitor.getPlatform() === "android" ? playBilling : Unconfigured;
