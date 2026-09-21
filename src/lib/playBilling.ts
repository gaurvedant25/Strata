/// <reference types="cordova-plugin-purchase" />
import { Capacitor } from "@capacitor/core";
import {
  BillingFailure,
  PACKAGE_NAME,
  type Billing,
  type BillingError,
  type Purchase,
  type StorePlan,
} from "./billing";
import { PLANS, type PlanId } from "./plans";
import { supabase } from "./supabase";

/**
 * Google Play Billing, behind the `Billing` interface the rest of the app
 * already speaks.
 *
 * Nothing above this file learns that Play exists. The paywall asks for plans,
 * asks to buy one, and asks what is already owned; this is the only module that
 * knows any of those are native calls.
 *
 * ─── The one rule ───────────────────────────────────────────────────────────
 *
 * A purchase here never grants anything. What `buy()` returns is the *result of
 * asking the server*, not the result of asking the store: the token Play hands
 * back goes to `verify-purchase`, which checks it against the Play Developer
 * API with credentials the phone does not have and writes `gym_entitlements`
 * itself. If that round trip fails, the purchase is real and the entitlement is
 * not yet — which is `pending`, not `failed`, and the paywall already knows the
 * difference. A client that decided its own entitlement would be a client that
 * could be told to decide differently.
 *
 * ─── How the plugin actually arrives ────────────────────────────────────────
 *
 * Not by importing it. `cordova-plugin-purchase` ships a plain script with no
 * exports of any kind: it assigns `window.CdvPurchase` as a side effect and
 * constructs a single `store` on it. Capacitor's Cordova bridge lists it in
 * `cordova_plugins.js` and loads it into the WebView before the app runs, so on
 * Android the global is simply there — and on the web it never is, which is the
 * whole distinction this module needs. An `import()` of it would resolve to an
 * empty namespace and risk running the script a second time.
 *
 * The types come in through the reference above rather than an import, for the
 * same reason: `www/store.d.ts` declares an ambient namespace, not a module.
 */

/** The global the Cordova bridge installs, when there is one. */
type Purchases = typeof CdvPurchase;
const globalCdv = () =>
  (globalThis as { CdvPurchase?: Purchases }).CdvPurchase ?? null;

/**
 * Wait for Cordova to have finished installing its plugins.
 *
 * Plugin scripts load asynchronously and announce themselves with
 * `deviceready`, which may well have fired before this module was evaluated —
 * so the global is checked first and the event is only a fallback. The timeout
 * is what stops a device where the bridge never comes up from leaving the
 * paywall waiting forever; it resolves to whatever is there, which is usually
 * nothing, and the caller reads that as "this build cannot sell".
 */
function whenPluginReady(timeoutMs = 10_000): Promise<Purchases | null> {
  const already = globalCdv();
  if (already) return Promise.resolve(already);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      document.removeEventListener("deviceready", done);
      resolve(globalCdv());
    };
    const timer = setTimeout(done, timeoutMs);
    document.addEventListener("deviceready", done, { once: true });
  });
}

/* ------------------------------------------------------------------------- *
 * Products and offers
 * ------------------------------------------------------------------------- */

/**
 * The three plans, as Play models them.
 *
 * Play puts the two renewing plans under one subscription with a base plan
 * each, and the lifetime unlock in its own one-time product — which is why
 * `plans.ts` carries both `productId` and `basePlanId`. Registering the
 * subscription twice would be registering the same product twice, so the ids
 * are deduplicated here rather than in `plans.ts`, where the per-plan shape is
 * the useful one.
 */
function registrations(cdv: Purchases) {
  const seen = new Set<string>();
  const out: CdvPurchase.IRegisterProduct[] = [];
  for (const p of PLANS) {
    if (seen.has(p.productId)) continue;
    seen.add(p.productId);
    out.push({
      id: p.productId,
      type: p.period
        ? cdv.ProductType.PAID_SUBSCRIPTION
        : cdv.ProductType.NON_CONSUMABLE,
      platform: cdv.Platform.GOOGLE_PLAY,
    });
  }
  return out;
}

/**
 * The offer that corresponds to one of our plans.
 *
 * `Product` has no lookup of its own, and an offer's id is not the base plan id
 * — on Google Play the adapter builds it as `productId@basePlanId`, with a
 * third `@offerId` segment appended when a promotional offer hangs off that
 * base plan. So the exact id is preferred and the prefixed form is accepted
 * after it: an exact match is the base plan at its standard price, which is
 * what the paywall quotes, and a promotional variant is better than nothing if
 * Play has decided this buyer gets one.
 */
function offerFor(
  store: CdvPurchase.Store,
  plan: PlanId,
): CdvPurchase.Offer | undefined {
  const p = PLANS.find((x) => x.id === plan);
  if (!p) return undefined;
  const product = store.get(p.productId, CdvPurchase.Platform.GOOGLE_PLAY);
  if (!product) return undefined;
  if (!p.basePlanId) return product.offers[0];
  const exact = `${p.productId}@${p.basePlanId}`;
  return (
    product.offers.find((o) => o.id === exact) ??
    product.offers.find((o) => o.id.startsWith(`${exact}@`))
  );
}

/**
 * The Play purchase token behind a transaction.
 *
 * Not on `Transaction` itself — the generic class carries ids and dates, and
 * the token lives on the Google Play subclass's `nativePurchase`. Reached by
 * feeling for it rather than by casting to the subclass, because a transaction
 * arriving from any other platform would have no such field and the honest
 * answer there is "no token" rather than a crash.
 */
function tokenOf(transaction: CdvPurchase.Transaction): string | undefined {
  const native = (transaction as { nativePurchase?: { purchaseToken?: string } })
    .nativePurchase;
  return native?.purchaseToken;
}

/* ------------------------------------------------------------------------- *
 * Server-side verification
 * ------------------------------------------------------------------------- */

/**
 * Hand the receipt to the server and let it decide.
 *
 * Throws `pending` rather than `failed` on anything that is not an outright
 * refusal. The distinction is the whole point: money has moved by the time this
 * runs, so the app is in no position to tell somebody nothing was charged. A
 * `pending` sends them to "check again", which re-reads the entitlement the
 * server will have written by then.
 */
async function verify(transaction: CdvPurchase.Transaction): Promise<Purchase> {
  const token = tokenOf(transaction);
  if (!supabase || !token) throw new BillingFailure("pending");

  const { data, error } = await supabase.functions.invoke("verify-purchase", {
    method: "POST",
    body: {
      packageName: PACKAGE_NAME,
      productId: transaction.products[0]?.id,
      purchaseToken: token,
    },
  });
  if (error) throw new BillingFailure("pending");

  const result = data as { plan?: PlanId; expiresAt?: number } | null;
  if (!result?.plan) throw new BillingFailure("pending");
  return { plan: result.plan, expiresAt: result.expiresAt };
}

/* ------------------------------------------------------------------------- *
 * The implementation
 * ------------------------------------------------------------------------- */

class PlayBilling implements Billing {
  #cdv: Purchases | null = null;
  #store: CdvPurchase.Store | null = null;
  #started: Promise<boolean> | null = null;
  /**
   * Every transaction Play has approved and not yet had verified, keyed by the
   * product it was for.
   *
   * Play delivers approvals through a callback rather than by resolving
   * `order()`, and it delivers them for purchases nobody asked for in this
   * session too — a subscription bought on another device, a payment that
   * finished while the app was closed, a renewal. Holding them here is what
   * lets `buy()` and `restore()` both be written as ordinary awaits.
   */
  #approved = new Map<string, CdvPurchase.Transaction>();

  ready = false;

  /**
   * Find the plugin and let Play tell us what it has.
   *
   * Started once and shared: `plans()`, `buy()` and `restore()` all await the
   * same promise, so three calls in the same second do not produce three
   * initializations.
   */
  async #start(): Promise<boolean> {
    if (Capacitor.getPlatform() !== "android") return false;
    this.#started ??= (async () => {
      try {
        const cdv = await whenPluginReady();
        // The plugin builds its own `store`; a second one would not be wired to
        // the native bridge that the first one owns.
        const store = cdv?.store;
        if (!cdv || !store) throw new Error("No Play Billing bridge");
        store.register(registrations(cdv));
        store.when().approved((t) => {
          for (const p of t.products) this.#approved.set(p.id, t);
        });
        // `initialize` reports by returning problems rather than by throwing,
        // and an empty array is what success looks like.
        const errors = await store.initialize([cdv.Platform.GOOGLE_PLAY]);
        if (errors.length) throw new Error(errors[0].message);
        this.#cdv = cdv;
        this.#store = store;
        this.ready = true;
        return true;
      } catch {
        // No bridge, no Play Services, or a device with the store signed out.
        // The paywall says so rather than offering a button to nowhere.
        this.ready = false;
        return false;
      }
    })();
    return this.#started;
  }

  /** Called at module load so the paywall is rarely the thing waiting. */
  warm() {
    void this.#start();
  }

  async plans(): Promise<StorePlan[]> {
    if (!(await this.#start()) || !this.#store) return [];
    const store = this.#store;
    const out: StorePlan[] = [];
    for (const p of PLANS) {
      // The last phase is the one that recurs: an offer with a free trial or an
      // introductory rate in front of it still costs its standard price in the
      // end, and that is the figure the paywall is comparing and quoting.
      const phase = offerFor(store, p.id)?.pricingPhases.at(-1);
      if (!phase) continue;
      out.push({
        plan: p.id,
        price: {
          text: phase.price,
          // Play quotes micros; the comparisons in `plans.ts` want a number in
          // the ordinary unit, and they want it to be the store's rather than a
          // conversion of ours. Currency is optional on Play's side, and
          // without it those comparisons correctly go quiet.
          amount: phase.priceMicros / 1_000_000,
          currency: phase.currency,
        },
      });
    }
    return out;
  }

  async buy(plan: PlanId): Promise<Purchase> {
    if (!(await this.#start()) || !this.#store || !this.#cdv)
      throw new BillingFailure("unavailable");
    const store = this.#store;
    const product = PLANS.find((p) => p.id === plan);
    const offer = offerFor(store, plan);
    if (!product || !offer) throw new BillingFailure("unavailable");
    if (store.get(product.productId, this.#cdv.Platform.GOOGLE_PLAY)?.owned)
      throw new BillingFailure("already-owned");

    const error = await store.order(offer);
    if (error) throw new BillingFailure(mapError(this.#cdv, error.code));

    const transaction = this.#approved.get(product.productId);
    // Ordered, not refused, and no approval arrived: Play is still thinking
    // about it. Saying "failed" here would be telling somebody their card was
    // not charged, which is not something this code can know.
    if (!transaction) throw new BillingFailure("pending");

    const purchase = await verify(transaction);
    // Only once the server has written the entitlement. Finishing earlier would
    // tell Play the goods were delivered before anything had been — and Play
    // refunds anything left unfinished, so the order matters both ways.
    await transaction.finish().catch(() => {});
    this.#approved.delete(product.productId);
    return purchase;
  }

  async restore(): Promise<Purchase | null> {
    if (!(await this.#start()) || !this.#store) return null;
    const error = await this.#store.restorePurchases();
    if (error) return null;
    // Anything this account owns is replayed through the same approval callback
    // as a fresh purchase, so by here it is sitting in `#approved`.
    for (const [id, transaction] of this.#approved) {
      const purchase = await verify(transaction);
      await transaction.finish().catch(() => {});
      this.#approved.delete(id);
      return purchase;
    }
    return null;
  }
}

/**
 * Play's error codes, reduced to the outcomes the paywall draws.
 *
 * Anything unrecognised becomes `failed` rather than `pending`, because
 * `pending` makes a promise about money having possibly moved and an unknown
 * code is not evidence of that.
 */
function mapError(cdv: Purchases, code: CdvPurchase.ErrorCode): BillingError {
  if (code === cdv.ErrorCode.PAYMENT_CANCELLED) return "cancelled";
  if (code === cdv.ErrorCode.PAYMENT_NOT_ALLOWED) return "unavailable";
  return "failed";
}

export const playBilling = new PlayBilling();
playBilling.warm();
