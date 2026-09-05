import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button, Eyebrow } from "./ui";

/**
 * In-app confirmation, replacing window.confirm.
 *
 * The native dialog is not dependable: some embedded and automated browsers
 * dismiss it immediately, and it returns false — so every destructive action in
 * the app silently did nothing, with no error and no clue why. It is also the
 * one piece of chrome the redesign could not style, appearing as an OS box in
 * the middle of a screen built from hairlines.
 *
 * The hook returns a promise so call sites read the same way they did:
 *
 *   if (!(await ask({ title: "Delete this?" }))) return;
 */

export type ConfirmOptions = {
  title: string;
  body?: string;
  /** Label on the button that proceeds. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the action as destructive. */
  danger?: boolean;
};

type Ask = (o: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<Ask | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<ConfirmOptions | null>(null);
  // Held in a ref rather than state: settling the promise is not a render.
  const settle = useRef<(v: boolean) => void>(() => {});

  const ask = useCallback<Ask>((o) => {
    setOpen(o);
    return new Promise<boolean>((resolve) => {
      settle.current = resolve;
    });
  }, []);

  const close = (v: boolean) => {
    setOpen(null);
    settle.current(v);
  };

  return (
    <Ctx.Provider value={ask}>
      {children}
      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <button
            aria-label="Cancel"
            onClick={() => close(false)}
            className="absolute inset-0 bg-black/80 backdrop-blur-[2px]"
          />
          <div className="animate-rise relative mx-auto w-full max-w-lg border-t border-rule bg-ink px-5 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-5">
            <Eyebrow tone={open.danger ? "fg" : "muted"}>
              {open.danger ? "Confirm" : "Are you sure"}
            </Eyebrow>
            <h2 className="mt-3 text-[21px] font-bold leading-tight tracking-[-0.02em] text-pretty">
              {open.title}
            </h2>
            {open.body && (
              <p className="mt-2.5 text-[13px] leading-relaxed text-muted text-pretty">
                {open.body}
              </p>
            )}
            <div className="mt-6 flex flex-col gap-2.5">
              <Button
                variant={open.danger ? "danger" : "solid"}
                onClick={() => close(true)}
                className={open.danger ? "h-13 rounded-full border border-danger/40" : undefined}
              >
                {open.confirmLabel ?? "Confirm"}
              </Button>
              <Button variant="quiet" onClick={() => close(false)}>
                {open.cancelLabel ?? "Cancel"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useConfirm() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return v;
}
