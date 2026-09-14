import { useState, type MouseEvent, type ReactNode } from "react";
import { useDialog, usePresence } from "../lib/useDialog";
import { cls } from "../lib/util";

/**
 * The vocabulary the redesign is built from.
 *
 * There are no panels and no cards. A screen is black, and its structure comes
 * from hairline rules (`border-rule` between sections, `border-subrule` between
 * rows) and from type scale. Radii collapse to two values: 0 for anything in a
 * row, 999px for pills. Numerals and labels are mono; language is sans.
 */

/** Small uppercase mono label. The only thing that titles a section. */
export function Eyebrow({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "dim" | "fg";
  className?: string;
}) {
  return (
    <span
      className={cls(
        "font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.2em]",
        tone === "fg" ? "text-fg" : tone === "dim" ? "text-dim" : "text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "solid",
  className,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  /**
   * `solid` is the one filled control on a screen — a white pill.
   * `quiet` is the same shape unfilled, `link` is an underlined mono word, and
   * `danger` is the only place another colour is allowed.
   */
  variant?: "solid" | "quiet" | "outline" | "link" | "danger";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const variants = {
    solid:
      "h-13 w-full rounded-full bg-fg px-5 font-mono text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-black active:bg-white",
    quiet:
      "h-11 w-full bg-transparent font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-muted active:text-fg",
    outline:
      "h-13 w-full rounded-full border border-rule bg-transparent px-5 font-mono text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-fg active:border-faint",
    /* Underlined with `text-decoration` rather than a bottom border: the hit
       area is now 44px tall, and a border would draw the rule at the bottom of
       that box instead of under the word. */
    link: "h-11 px-1 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-fg underline decoration-[1.5px] underline-offset-[5px]",
    danger:
      "h-11 w-full bg-transparent font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-danger active:opacity-70",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cls(
        "press inline-flex select-none items-center justify-center gap-2 disabled:opacity-40",
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * A screen. The title is a mono eyebrow rather than a heading — the biggest
 * type on these screens belongs to the data, not the chrome.
 */
export function Screen({
  title,
  right,
  children,
  pad = true,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  /** Off when the screen draws its own full-bleed rows. */
  pad?: boolean;
}) {
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 bg-ink/95 px-5 pb-3.5 pt-[calc(env(safe-area-inset-top)+14px)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>{title}</Eyebrow>
          {right}
        </div>
      </header>
      <div className={cls("pb-stack", pad && "px-5")}>{children}</div>
    </div>
  );
}

/**
 * The empty state. A statement set large, not a centred icon and an apology —
 * with the eyebrow naming what is missing.
 */
export function Empty({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="pt-[70px]">
      <Eyebrow tone="dim">{eyebrow}</Eyebrow>
      <h2 className="mt-4 text-[1.6875rem] font-bold leading-[1.15] tracking-[-0.025em] text-pretty">
        {title}
      </h2>
      {body && (
        <p className="mt-3.5 text-[0.875rem] leading-relaxed text-muted text-pretty">
          {body}
        </p>
      )}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}

/**
 * A row of figures divided by vertical hairlines. The last cell drops its
 * divider so the group reads as one band rather than a table.
 */
export function StatBand({
  stats,
  size = "md",
  frame = "bleed",
}: {
  stats: { label: string; value: ReactNode }[];
  size?: "sm" | "md";
  /**
   * `bleed` runs edge to edge across a black screen, ruled top and bottom.
   * `card` sits inside a panel that already has an edge: it keeps only the
   * rule that separates it from what is above, and drops its outer padding so
   * the first figure lines up with the card's own gutter.
   */
  frame?: "bleed" | "card";
}) {
  const card = frame === "card";
  return (
    <div
      className={cls(
        "grid",
        card ? "border-t border-rule" : "border-y border-rule",
      )}
      style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0,1fr))` }}
    >
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={cls(
            "flex flex-col items-start gap-1.5",
            // Inside a panel the band is the last thing on it and the card's
            // own bottom gutter finishes the column, so it does not need the
            // breathing room a band ruled top and bottom across a black
            // screen does.
            card ? "py-3" : "py-3.5",
            card
              ? i === 0
                ? "pr-3.5"
                : i === stats.length - 1
                  ? "pl-3.5"
                  : "px-3.5"
              : "px-5",
            i < stats.length - 1 && "border-r border-rule",
          )}
        >
          <span
            className={cls(
              "font-mono font-medium tracking-[-0.015em]",
              size === "sm" ? "text-[0.9375rem]" : "text-[1.3125rem]",
            )}
          >
            {s.value}
          </span>
          <span className="break-words font-mono text-chrome font-semibold uppercase leading-snug tracking-[0.18em] text-muted">
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The large mono figure a screen is built around, with its unit alongside. */
export function BigNumber({
  value,
  unit,
  size = 46,
}: {
  value: ReactNode;
  unit: string;
  /** In px, at the reader's default text size. Emitted as rem so it scales. */
  size?: number;
}) {
  return (
    <div className="flex items-end gap-2.5">
      <span
        className="font-mono font-medium leading-[0.9] tracking-[-0.035em]"
        style={{ fontSize: `${size / 16}rem` }}
      >
        {value}
      </span>
      <span className="pb-1.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-muted">
        {unit}
      </span>
    </div>
  );
}

/**
 * A `BigNumber` you can also type into.
 *
 * The steppers under these figures are the right tool for a nudge and the wrong
 * one for an answer: reaching 82.5 from 80 is two taps, reaching it from 60 is
 * twenty-five, and there was no other way in. Tapping the figure now opens the
 * number for editing with the numeric keyboard, and the steppers stay for the
 * adjustment they were always good at.
 *
 * The figure still animates through `display` while idle — editing swaps in a
 * plain input, because a field whose digits roll as you type them is unreadable.
 */
export function EditableNumber({
  value,
  display,
  unit,
  size = 46,
  min = 0,
  max = 9999,
  decimals = 1,
  label,
  onChange,
}: {
  value: number;
  /** What the figure looks like at rest — usually an animated numeral. */
  display: ReactNode;
  unit: string;
  size?: number;
  min?: number;
  max?: number;
  /** 0 for a count, 1 for a weight. */
  decimals?: number;
  /** Names the figure for anyone not reading the eyebrow above it. */
  label: string;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [buf, setBuf] = useState("");

  function commit() {
    const parsed = parseFloat(buf);
    if (isFinite(parsed)) {
      const clamped = Math.min(max, Math.max(min, parsed));
      onChange(+clamped.toFixed(decimals));
    }
    setEditing(false);
  }

  const fontSize = `${size / 16}rem`;

  if (editing) {
    return (
      <div className="flex items-end gap-2.5">
        <input
          autoFocus
          // `decimal` rather than `numeric` so the keypad carries a separator
          // for a bodyweight like 82.5; a rep count sets decimals to 0 and the
          // extra key simply goes unused.
          inputMode={decimals ? "decimal" : "numeric"}
          enterKeyHint="done"
          aria-label={label}
          value={buf}
          onChange={(e) => setBuf(e.target.value.replace(/[^0-9.]/g, ""))}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="border-b border-fg bg-transparent p-0 font-mono font-medium leading-[0.9] tracking-[-0.035em] text-fg outline-none"
          // Sized to its content so the unit stays beside the figure rather
          // than being pushed out by a full-width field. Safe in ch units
          // because the face is monospaced.
          style={{ fontSize, width: `${Math.max(buf.length, 2) + 0.5}ch` }}
        />
        <span className="pb-1.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-muted">
          {unit}
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setBuf(decimals ? String(value) : String(Math.round(value)));
        setEditing(true);
      }}
      aria-label={`${label}: ${value} ${unit}. Tap to type a new one.`}
      className="flex items-end gap-2.5 text-left"
    >
      <span
        className="font-mono font-medium leading-[0.9] tracking-[-0.035em]"
        style={{ fontSize }}
      >
        {display}
      </span>
      <span className="pb-1.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-muted">
        {unit}
      </span>
    </button>
  );
}

/** Underlined mono tabs. Used for view, metric and filter switches alike. */
export function TextTabs<T extends string>({
  options,
  value,
  onChange,
  className,
  gap = "gap-5",
  dense = false,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  gap?: string;
  /**
   * Lays the row out at the height of the word and hangs the touch target off
   * it, rather than reserving the whole 44px in the flow. The target is the
   * same size either way — this only decides whether the page pays for it in
   * layout. For a row that wraps, keep at least `gap-y-6` between the lines,
   * which is where two rows' hit areas meet rather than overlap.
   */
  dense?: boolean;
}) {
  return (
    <div className={cls("flex flex-wrap", gap, className)}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cls(
            // The hit area is widened past the word with a pseudo-element
            // rather than with padding, because the bottom border is the
            // selected state and padding would stretch that rule out either
            // side of the label it is meant to underline.
            "press relative flex items-end border-b pb-[3px] font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] before:absolute before:left-1/2 before:w-[max(2.75rem,calc(100%+1rem))] before:-translate-x-1/2 before:content-['']",
            // Dense reaches the same 44px by growing the pseudo-element up and
            // down instead of the button, so the word keeps its baseline and
            // the row keeps only the word's height.
            dense ? "before:-inset-y-3" : "h-11 before:inset-y-0",
            value === o.id
              ? "border-fg text-fg"
              : "border-transparent text-dim",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A pill segmented control, for settings-style either/or choices. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-full border border-rule p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cls(
            "press flex h-11 min-w-[52px] items-center justify-center rounded-full px-3.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em]",
            value === o.id ? "bg-fg text-black" : "text-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A full-bleed tappable row. The workhorse of every list in the app. */
export function Row({
  children,
  onClick,
  className,
  rule = "rule",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  rule?: "rule" | "subrule" | "none";
}) {
  const cn = cls(
    "w-full px-5 text-left",
    rule === "rule" && "border-b border-rule",
    rule === "subrule" && "border-b border-subrule",
    onClick && "press press-row active:bg-[#0b0b0b]",
    className,
  );
  return onClick ? (
    <button onClick={onClick} className={cn}>
      {children}
    </button>
  ) : (
    <div className={cn}>{children}</div>
  );
}

/**
 * The scrim behind a dialog.
 *
 * Deliberately not a button. It used to be one, which put a control the size of
 * the whole screen labelled "Close" into the tab order ahead of everything in
 * the dialog it was meant to be behind. Tapping it still dismisses; people not
 * using a pointer get Escape and the dialog's own close control instead.
 */
export function Scrim({
  onClose,
  className,
  closing,
}: {
  onClose: () => void;
  className?: string;
  closing?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      data-closing={closing || undefined}
      onClick={onClose}
      className={cls(
        "leave-scrim absolute inset-0 bg-black/80 backdrop-blur-[2px]",
        className,
      )}
    />
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panel = useDialog(open, onClose);
  const { present, closing } = usePresence(open);

  if (!present) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <Scrim onClose={onClose} closing={closing} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-closing={closing || undefined}
        className="animate-rise leave-panel relative mx-auto flex max-h-[88vh] w-full max-w-lg flex-col border-t border-rule bg-ink outline-none"
      >
        <div className="flex items-center justify-between border-b border-rule px-5 py-3.5">
          <Eyebrow>{title}</Eyebrow>
          <button
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="-my-3 -mr-3 grid size-11 place-items-center font-mono text-[0.9375rem] text-muted active:text-fg"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
        {footer && (
          <div className="border-t border-rule px-5 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <Eyebrow className="mb-2 block">{label}</Eyebrow>
      {children}
      {hint && (
        <span className="mt-1.5 block text-[0.75rem] text-muted">{hint}</span>
      )}
    </label>
  );
}

/** Inputs are a hairline underline, not a filled box. */
export const inputCls =
  "w-full border-b border-rule bg-transparent px-0 py-2.5 text-fg outline-none placeholder:text-dim focus:border-fg";

/** Same, for a value the user types as a numeral. */
export const numInputCls = `${inputCls} font-mono`;

/** Small round button used for per-row affordances. */
export function IconButton({
  children,
  onClick,
  size = 44,
  className,
  label,
  pressed,
}: {
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  size?: number;
  className?: string;
  label?: string;
  /** Set when the button is a toggle, so its state is announced as well as drawn. */
  pressed?: boolean;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      style={{ width: size, height: size }}
      className={cls(
        "press grid shrink-0 place-items-center rounded-full text-muted active:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}
