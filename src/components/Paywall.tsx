import { useEffect, useState } from "react";
import { track } from "../lib/analytics";
import {
  BillingFailure,
  billing,
  manageUrl,
  storeName,
  type StorePlan,
} from "../lib/billing";
import { FREE_FEATURES, PRO_BENEFITS } from "../lib/entitlement";
import { PRIVACY_URL, TERMS_URL } from "../lib/legal";
import {
  PLANS,
  monthlyEquivalent,
  planById,
  priceLine,
  listPrice,
  type PriceInfo,
  savePercent,
  type PlanId,
  type StorePrice,
} from "../lib/plans";
import {
  SUPPORT_CONFIGURED,
  SUPPORT_PLACEHOLDER,
  SUPPORT_URL,
} from "../lib/support";
import { useEntitlement } from "../lib/useEntitlement";
import { Check } from "./icons";
import { Button, Sheet } from "./ui";

/**
 * The screen that asks for money, in the order somebody actually reads.
 *
 * It used to open on prices under the words "deeper analysis", which told a
 * reader nothing they could weigh. It now answers five questions in sequence,
 * and the sequence is the design:
 *
 *   1. what Pro helps me do      three benefits, each one a feature that exists
 *   2. what I keep for free      collapsed, because it is reassurance rather
 *                                than argument, but present without a tap away
 *   3. what each plan costs      with the monthly equivalent spelled out
 *   4. whether it renews         said plainly, next to the store that stops it
 *   5. how to restore or manage  and where to go when a purchase goes wrong
 *
 * Both stores audit this page rather than the code behind it, and the parts
 * that look like boilerplate — the renewal sentence, Restore, the legal links —
 * are the parts they check for.
 */
export function Paywall({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { ent, refresh } = useEntitlement();
  // Yearly rather than monthly: it is the plan most people are better off on
  // and the one the prices are arranged around.
  const [picked, setPicked] = useState<PlanId>("yearly");
  const [store, setStore] = useState<Record<string, StorePrice>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [freeOpen, setFreeOpen] = useState(false);

  useEffect(() => {
    if (open) track("pro_paywall_viewed", { state: ent.state });
  }, [open, ent.state]);

  useEffect(() => {
    if (!open || !billing.ready) return;
    let live = true;
    void billing.plans().then((list: StorePlan[]) => {
      if (!live) return;
      setStore(Object.fromEntries(list.map((p) => [p.plan, p.price])));
    });
    return () => {
      live = false;
    };
  }, [open]);

  /*
   * A price on this screen is the store's or it is nothing.
   *
   * `store` is empty until `plans()` answers, and what used to fill the gap was
   * the Indian list price — so every buyer, in every country, saw rupees for
   * the first frame. Play requires the figure on screen to be the figure it
   * charges, so there is no honest stand-in: until the store has spoken the
   * row shows a dash, which is the same mark this app uses everywhere else for
   * a number it does not have yet.
   *
   * Development is the exception and only because there is no store to ask
   * there: without it the paywall cannot be looked at while it is being built.
   */
  const prices: Record<string, PriceInfo | null> = Object.fromEntries(
    PLANS.map((p) => [
      p.id,
      store[p.id] ?? (import.meta.env.DEV ? listPrice(p) : null),
    ]),
  );
  const saved = savePercent(prices.monthly, prices.yearly);
  const perMonth = monthlyEquivalent(prices.yearly);

  async function buy() {
    setBusy(true);
    setResult(null);
    track("pro_purchase_started", { plan: picked, state: ent.state });
    try {
      await billing.buy(picked);
      // The receipt is verified server-side and the entitlement row is written
      // there. The client's only job afterwards is to re-read it.
      await refresh(true);
      track("pro_purchase_completed", { plan: picked });
      onClose();
    } catch (e) {
      const code = e instanceof BillingFailure ? e.code : "failed";
      if (code === "cancelled") {
        // The user closed the sheet. They know they closed it; saying anything
        // would be telling them what they just did.
        setResult(null);
      } else {
        track("pro_purchase_failed", { plan: picked, reason: code });
        setResult(code);
      }
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    setResult(null);
    track("pro_restore_started", { state: ent.state });
    try {
      const found = await billing.restore();
      await refresh(true);
      if (found) {
        track("pro_restore_completed", {});
        onClose();
      } else setResult("nothing-to-restore");
    } catch {
      setResult("failed");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Ask again about a purchase the store has not finished telling us about.
   *
   * Decided on what the refresh hands back rather than on `ent`. `ent` here is
   * the render this function was made in, which predates the answer by
   * definition — so the tap that actually found the finished purchase read
   * `pro: false`, left the sheet open on the pending message, and only a
   * second tap ever closed it.
   */
  async function checkAgain() {
    setBusy(true);
    const fresh = await refresh(true);
    setBusy(false);
    if (fresh?.pro) onClose();
  }

  const blocked = !billing.ready;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Unlock Pro"
      footer={
        <div className="space-y-3">
          <Button onClick={() => void buy()} disabled={busy || blocked}>
            {busy ? "Working…" : `Continue with ${planById(picked).name}`}
          </Button>

          <Outcome
            result={result}
            busy={busy}
            blocked={blocked}
            onCheckAgain={() => void checkAgain()}
            onRestore={() => void restore()}
          />

          {/*
            The renewal sentence, on the screen where the choice is made rather
            than buried in Settings, and naming the store because that is where
            a renewal is actually stopped.
          */}
          <p className="text-center text-[0.75rem] leading-relaxed text-dim">
            Monthly and yearly renew automatically until you cancel. Cancel any
            time in{" "}
            <a
              href={manageUrl()}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {storeName()}
            </a>
            . Lifetime is a single payment and does not renew.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-x-4 font-mono text-label font-medium text-dim">
            <button
              onClick={() => void restore()}
              disabled={busy}
              className="press h-11 underline underline-offset-[5px] active:text-fg disabled:opacity-40"
            >
              Restore purchases
            </button>
            <PurchaseHelp />
            <a
              href={TERMS_URL}
              target="_blank"
              rel="noreferrer"
              className="flex h-11 items-center underline underline-offset-[5px]"
            >
              Terms
            </a>
            <a
              href={PRIVACY_URL}
              target="_blank"
              rel="noreferrer"
              className="flex h-11 items-center underline underline-offset-[5px]"
            >
              Privacy
            </a>
          </div>
        </div>
      }
    >
      {/*
        Developer-only. Ordinary users must never be shown the word
        "placeholder" about the thing they are trying to buy — in production an
        unavailable store disables the button and `Outcome` explains why.
      */}
      {import.meta.env.DEV && blocked && (
        <p className="mb-4 rounded-2xl border border-cardrule bg-card px-4 py-2.5 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-dim">
          Dev · store billing not connected
        </p>
      )}

      {/* 1 — what Pro helps you do. */}
      <h2 className="text-pretty text-[1.5rem] font-semibold leading-[1.15] tracking-[-0.03em]">
        See more in your training
      </h2>

      <ul className="mt-5 space-y-2.5">
        {PRO_BENEFITS.map((b) => (
          <li
            key={b.feature}
            className="flex items-start gap-3.5 rounded-2xl border border-cardrule bg-card px-4 py-3.5"
          >
            <BenefitMark feature={b.feature} />
            <div className="min-w-0">
              <p className="text-[0.9375rem] font-medium tracking-[-0.01em]">
                {b.title}
              </p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
                {b.body}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {/* 2 — what you keep for free. */}
      <div className="mt-3 rounded-2xl border border-cardrule">
        <button
          onClick={() => setFreeOpen((v) => !v)}
          aria-expanded={freeOpen}
          className="press press-row flex h-12 w-full items-center justify-between px-4 text-left"
        >
          <span className="text-[0.9375rem] tracking-[-0.01em]">
            What stays free?
          </span>
          <span
            aria-hidden="true"
            className="font-mono text-[0.75rem] text-muted transition-transform duration-[160ms]"
            style={{ transform: freeOpen ? "rotate(180deg)" : undefined }}
          >
            ⌄
          </span>
        </button>
        {freeOpen && (
          <ul className="border-t border-cardrule px-4 pb-3.5 pt-3">
            {FREE_FEATURES.map((f) => (
              <li
                key={f}
                className="flex items-center gap-2.5 py-1 text-[0.875rem] text-muted"
              >
                <span aria-hidden="true" className="text-faint">
                  <Check size={12} />
                </span>
                {f}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 3 — what each plan costs. */}
      <div className="mt-5 space-y-2.5">
        {PLANS.map((p) => {
          const on = p.id === picked;
          const price = prices[p.id];
          const note =
            p.id === "yearly"
              ? saved !== null
                ? `Save ${saved}%`
                : undefined
              : p.note;
          return (
            <button
              key={p.id}
              onClick={() => {
                setPicked(p.id);
                track("pro_plan_selected", { plan: p.id });
              }}
              aria-pressed={on}
              // Without a price there is nothing to read out but the plan.
              aria-label={
                priceLine(p, price)
                  ? `${p.name}, ${priceLine(p, price)}`
                  : p.name
              }
              className="press press-row flex w-full items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-colors"
              style={{
                borderColor: on ? "var(--color-fg)" : "var(--color-cardrule)",
                background: on ? "var(--color-card)" : "transparent",
              }}
            >
              <span
                aria-hidden="true"
                className="grid size-5 shrink-0 place-items-center rounded-full border"
                style={{
                  borderColor: on ? "var(--color-fg)" : "var(--color-faint)",
                  background: on ? "var(--color-fg)" : undefined,
                  color: "#000",
                }}
              >
                {on && <Check size={11} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[1rem] font-medium tracking-[-0.015em]">
                  {p.name}
                </span>
                {note && (
                  <span className="mt-0.5 block font-mono text-label font-medium uppercase tracking-[0.14em] text-muted">
                    {note}
                  </span>
                )}
                {/* Only under Yearly, and only when the arithmetic is safe. */}
                {p.id === "yearly" && perMonth && (
                  <span className="mt-0.5 block text-[0.75rem] text-dim">
                    {perMonth}
                  </span>
                )}
              </span>
              <span className="whitespace-nowrap text-right">
                <span className="block font-mono text-[1rem] font-medium tracking-[-0.01em]">
                  {price ? price.text : "—"}
                </span>
                <span className="mt-0.5 block font-mono text-label font-medium uppercase tracking-[0.14em] text-dim">
                  {p.period ? `per ${p.period}` : "once"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

/** Everything the purchase flow can end up saying. */
type Result =
  | "unavailable"
  | "already-owned"
  | "pending"
  | "failed"
  | "nothing-to-restore";

/**
 * What happened, said without over-claiming.
 *
 * The important one is `pending`. When a store has taken a payment but not
 * finished confirming it, the app genuinely does not know whether money moved —
 * so it does not say "nothing has been charged", which is the reassurance every
 * app reaches for and the one thing it is not entitled to promise here. It says
 * the true thing instead: you will not be asked to pay twice.
 */
function Outcome({
  result,
  busy,
  blocked,
  onCheckAgain,
  onRestore,
}: {
  result: Result | null;
  busy: boolean;
  blocked: boolean;
  onCheckAgain: () => void;
  onRestore: () => void;
}) {
  if (!result && !blocked) return null;

  if (result === "pending")
    return (
      <div role="status" className="space-y-2.5">
        <p className="text-center text-[0.8125rem] leading-relaxed text-fg">
          We&apos;re confirming your purchase. You won&apos;t need to pay again.
        </p>
        <div className="flex gap-2.5">
          <Button variant="outline" onClick={onCheckAgain} disabled={busy}>
            Check again
          </Button>
          <Button variant="outline" onClick={onRestore} disabled={busy}>
            Restore purchases
          </Button>
        </div>
      </div>
    );

  const text =
    result === "already-owned"
      ? "You already own this — use Restore purchases below."
      : result === "nothing-to-restore"
        ? "Nothing to restore on this account."
        : result === "failed"
          ? "That didn't go through. Try again."
          : `Purchases are temporarily unavailable from ${storeName()}.`;

  return (
    <p
      role="status"
      className="text-center text-[0.8125rem] leading-relaxed text-muted"
    >
      {text}
    </p>
  );
}

/**
 * The way out when a purchase goes wrong in a way this screen cannot fix.
 *
 * A real link once `SUPPORT_URL` is set. Until then it is a developer-visible
 * note rather than a dead link or, worse, an invented address nobody reads.
 */
function PurchaseHelp() {
  if (SUPPORT_CONFIGURED)
    return (
      <a
        href={SUPPORT_URL}
        target="_blank"
        rel="noreferrer"
        className="flex h-11 items-center underline underline-offset-[5px]"
      >
        Purchase help
      </a>
    );
  if (!import.meta.env.DEV) return null;
  return (
    <span
      title={SUPPORT_PLACEHOLDER}
      className="flex h-11 items-center text-faint line-through"
    >
      Purchase help
    </span>
  );
}

/**
 * A small monochrome fragment of the thing being sold.
 *
 * Drawn in the app's own marks — a curve, a delta, a card — rather than an
 * illustration, so the benefit list reads as a piece of this app rather than a
 * pricing page that wandered in from somewhere else. Stroke only, no fills, no
 * colour.
 */
function BenefitMark({ feature }: { feature: string }) {
  const common = {
    width: 26,
    height: 26,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "mt-0.5 shrink-0 text-muted",
    "aria-hidden": true,
  };
  if (feature === "progress-windows")
    return (
      <svg {...common}>
        <path d="M3 17l5-5 3.5 3.5L21 6" />
        <path d="M3 21h18" opacity=".35" />
        <path d="M8 21v-3M16 21v-7" opacity=".35" />
      </svg>
    );
  if (feature === "trend-periods")
    return (
      <svg {...common}>
        <path d="M4 14l4-4 3 3 5-6" />
        <path d="M16 7h4v4" />
        <path d="M3 20h18" opacity=".35" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M4 15l4-3.5 3.5 3 3-2.5L20 16" />
      <circle cx="14.5" cy="8" r="1.6" />
    </svg>
  );
}
