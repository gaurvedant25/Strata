import { useEffect, type ReactNode } from "react";
import { cls } from "../lib/util";

export function Button({
  children,
  onClick,
  variant = "solid",
  size = "md",
  className,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "solid" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const variants = {
    solid: "bg-accent text-ink font-semibold active:bg-accentdim",
    ghost: "bg-panel2 text-white/90 active:bg-line",
    outline: "border border-line text-white/90 active:bg-panel2",
    danger: "bg-red-500/15 text-red-300 border border-red-500/30 active:bg-red-500/25",
  };
  const sizes = {
    sm: "h-9 px-3 text-[13px] rounded-lg",
    md: "h-11 px-4 text-[15px] rounded-xl",
    lg: "h-13 px-5 text-base rounded-2xl",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cls(
        "inline-flex select-none items-center justify-center gap-2 transition-colors disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cls("rounded-2xl border border-line bg-panel", className)}>{children}</div>
  );
}

export function Screen({
  title,
  right,
  children,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-ink/85 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)] backdrop-blur-xl">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[26px] font-bold leading-tight tracking-tight">{title}</h1>
            {subtitle && <p className="mt-0.5 truncate text-[13px] text-muted">{subtitle}</p>}
          </div>
          {right}
        </div>
      </header>
      <div className="px-4 pb-40 pt-4">{children}</div>
    </div>
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
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
      />
      <div className="animate-rise relative mx-auto flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-3xl border-t border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full bg-panel2 text-muted active:bg-line"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <div className="border-t border-line px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3">
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
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-muted/80">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-line bg-panel2 px-3.5 py-3 text-white outline-none placeholder:text-muted/60 focus:border-accent/60";

export function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="mt-10 flex flex-col items-center px-6 text-center">
      <div className="mb-3 text-4xl opacity-70">{icon}</div>
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums leading-none">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-muted">{sub}</p>}
    </Card>
  );
}
