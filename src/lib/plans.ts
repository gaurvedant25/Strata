/**
 * What the app sells, in one place.
 *
 * The rupee figures here are the Indian list prices and they are a *fallback*,
 * not the truth. Once billing is wired the store hands back a localised price
 * string for the buyer's own country, and that string is what the paywall must
 * print: both stores require the price on screen to be the price actually
 * charged, so a hardcoded ₹ shown to somebody in Berlin is a rejection rather
 * than a rounding error. `priceOf` is where that preference is expressed.
 *
 * The identifiers are what you create in Play Console and App Store Connect,
 * and the two stores model the same three products differently:
 *
 *   Play    one subscription `gym_pro` with two base plans under it, plus a
 *           separate one-time in-app product for the lifetime unlock.
 *   Apple   two auto-renewing products in a single subscription group, so a
 *           buyer can move between them, plus a non-consumable for lifetime.
 *
 * `basePlanId` is the part only Play uses. Apple addresses each plan by its own
 * product id, which is why `appleId` exists alongside.
 */

export type PlanId = "monthly" | "yearly" | "lifetime";

export type Plan = {
  id: PlanId;
  /** The plan's name on the paywall. */
  name: string;
  /** Play: the subscription (or one-time product) this sits under. */
  productId: string;
  /** Play only: which base plan under `productId`. */
  basePlanId?: string;
  /** Apple: the product id, which is per-plan rather than per-group. */
  appleId: string;
  /** Indian list price in whole rupees, used until a store answers with its own. */
  inr: number;
  /** How often it renews. Absent means it never does. */
  period?: "month" | "year";
  /**
   * A second line under the name. Kept to things that are arithmetic on the
   * prices above or a plain statement of what the plan is — anything that
   * reads as a claim belongs in copy you have approved, not here.
   */
  note?: string;
};

export const PLANS: Plan[] = [
  {
    id: "monthly",
    name: "Monthly",
    productId: "gym_pro",
    basePlanId: "monthly",
    appleId: "gym_pro_monthly",
    inr: 250,
    period: "month",
  },
  {
    id: "yearly",
    name: "Yearly",
    productId: "gym_pro",
    basePlanId: "yearly",
    appleId: "gym_pro_yearly",
    inr: 1800,
    period: "year",
  },
  {
    id: "lifetime",
    name: "Lifetime",
    productId: "gym_lifetime",
    appleId: "gym_lifetime",
    inr: 3000,
    note: "One payment, no renewal",
  },
];

export const planById = (id: PlanId) => PLANS.find((p) => p.id === id)!;

/** Whether buying this plan starts something that will bill again by itself. */
export const renews = (p: Plan) => !!p.period;

/**
 * A price as something that can be both printed and reasoned about.
 *
 * `text` is what goes on screen and comes from the store where there is one,
 * because only the store knows the buyer's country, currency and tax. `amount`
 * and `currency` are what make a *comparison* possible — a monthly equivalent
 * or a saving is arithmetic, and arithmetic needs numbers rather than a
 * formatted string that might say "US$2.99" or "2,99 €".
 *
 * Both stores supply them: Play as `priceAmountMicros` with a currency code,
 * StoreKit as a decimal and a locale. When they are missing the price still
 * prints and the comparisons simply do not appear, which is the right failure —
 * a wrong "₹150/month" is worse than no line at all.
 */
export type PriceInfo = {
  text: string;
  amount?: number;
  currency?: string;
};

/** What a store hands back for one plan. */
export type StorePrice = {
  text: string;
  amount?: number;
  currency?: string;
};

/**
 * The Indian list price, as something printable.
 *
 * Deliberately not a fallback for the paywall. It used to be one — `priceInfo`
 * returned this whenever the store had not answered — which meant the first
 * paint of the paywall quoted rupees to every buyer on earth, and a lifter in
 * Berlin watched "₹1,800" turn into "€19.99" under their thumb. Play requires
 * the price on screen to be the price it will actually charge, so a rupee
 * figure shown to a euro buyer is a policy breach rather than an
 * approximation.
 *
 * What is left is a reference: the number this app charges in India, used to
 * fill the screen in development where there is no store to ask, and to check
 * the comparison arithmetic. A shipped build prints what the store says or it
 * prints nothing.
 */
export function listPrice(p: Plan): PriceInfo {
  return {
    text: `₹${p.inr.toLocaleString("en-IN")}`,
    amount: p.inr,
    currency: "INR",
  };
}

/**
 * "₹250/month", or just the price for something that does not renew — and
 * null while there is no price to put in it.
 */
export function priceLine(p: Plan, price: PriceInfo | null): string | null {
  if (!price) return null;
  return p.period ? `${price.text}/${p.period}` : price.text;
}

const money = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    // An unrecognised currency code is not worth a broken screen; the caller
    // treats null as "say nothing".
    return null;
  }
};

/**
 * "₹150/month · billed annually", or nothing.
 *
 * Nothing whenever the figure cannot be trusted: no amount, no currency, or a
 * currency the platform will not format. A made-up equivalent under a real
 * price is the kind of error people notice at exactly the wrong moment.
 */
export function monthlyEquivalent(yearly: PriceInfo | null): string | null {
  if (!yearly || yearly.amount === undefined || !yearly.currency) return null;
  const per = money(yearly.amount / 12, yearly.currency);
  return per ? `${per}/month · billed annually` : null;
}

/**
 * How much the yearly plan saves against twelve monthlies, as a whole percent,
 * or null when the two cannot be compared.
 *
 * Compared only within one currency. Two prices in different currencies are not
 * a discount, they are an exchange-rate question, and the answer would be wrong
 * in whichever direction the day's rate happened to fall.
 */
export function savePercent(
  monthly: PriceInfo | null,
  yearly: PriceInfo | null,
): number | null {
  if (!monthly || !yearly) return null;
  if (monthly.amount === undefined || yearly.amount === undefined) return null;
  if (!monthly.currency || monthly.currency !== yearly.currency) return null;
  const full = monthly.amount * 12;
  if (full <= 0) return null;
  const saved = Math.round((1 - yearly.amount / full) * 100);
  // Only worth saying when it is both true and worth hearing.
  return saved >= 1 ? saved : null;
}
