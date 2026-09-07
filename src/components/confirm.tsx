import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useDialog, usePresence } from "../lib/useDialog";
import { Button, Eyebrow, Scrim } from "./ui";

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
  const [last, setLast] = useState<ConfirmOptions | null>(null);

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

  // Escape and a tap outside both mean "no", which is the safe answer: every
  // caller of this is guarding something destructive.
  const panel = useDialog(!!open, () => close(false));
  const { present, closing } = usePresence(!!open);
  // The dialog's text lives in `open`, which is cleared the moment it closes.
  // The last options are kept so the box still has something to say while it
  // animates out, rather than emptying a frame before it goes.
  if (open && open !== last) setLast(open);
  const shown = open ?? last;

  return (
    <Ctx.Provider value={ask}>
      {children}
      {present && shown && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <Scrim onClose={() => close(false)} closing={closing} />
          <div
            ref={panel}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby={shown.body ? "confirm-body" : undefined}
            tabIndex={-1}
            data-closing={closing || undefined}
            className="animate-rise leave-panel relative mx-auto w-full max-w-lg border-t border-rule bg-ink px-5 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-5 outline-none"
          >
            <Eyebrow tone={shown.danger ? "fg" : "muted"}>
              {shown.danger ? "Confirm" : "Are you sure"}
            </Eyebrow>
            <h2
              id="confirm-title"
              className="mt-3 text-[1.3125rem] font-bold leading-tight tracking-[-0.02em] text-pretty"
            >
              {shown.title}
            </h2>
            {shown.body && (
              <p
                id="confirm-body"
                className="mt-2.5 text-[0.8125rem] leading-relaxed text-muted text-pretty"
              >
                {shown.body}
              </p>
            )}
            <div className="mt-6 flex flex-col gap-2.5">
              <Button
                variant={shown.danger ? "danger" : "solid"}
                onClick={() => close(true)}
                className={
                  shown.danger
                    ? "h-13 rounded-full border border-danger/40"
                    : undefined
                }
              >
                {shown.confirmLabel ?? "Confirm"}
              </Button>
              <Button variant="quiet" onClick={() => close(false)}>
                {shown.cancelLabel ?? "Cancel"}
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
