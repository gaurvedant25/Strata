import { useRef } from "react";
import { useDialog } from "../lib/useDialog";
import { Button, Eyebrow } from "./ui";

/**
 * The first thing Share asks, before any card exists.
 *
 * A photo is what makes the card yours, so it is the one filled button;
 * carrying on without one sits quietly underneath. There is no cropping step —
 * the photo lands centred in the frame and is adjusted in the editor itself.
 */
export function SharePhotoPrompt({ subject, busy, error, onChoose, onSkip, onClose }: {
  subject: "lift" | "workout" | "body";
  busy: boolean;
  error?: string;
  onChoose: (file?: File) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const panel = useDialog(true, onClose);
  const input = useRef<HTMLInputElement>(null);
  return <div className="fixed inset-0 z-[80] bg-black/85">
    <div ref={panel} role="dialog" aria-modal="true" aria-label={`Share this ${subject}`} tabIndex={-1}
      className="relative mx-auto flex h-[100dvh] w-full max-w-lg flex-col bg-ink outline-none">
      <header className="flex shrink-0 items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+12px)]">
        <div><Eyebrow>Make it yours</Eyebrow>
          <p className="mt-1 text-xs text-muted">{subject === "workout" ? "Your workout. Your way." : "Your progress. Your way."}</p></div>
        <button onClick={onClose} aria-label="Close share" className="grid size-11 place-items-center text-lg">✕</button>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center px-5 py-6">
        <div className="grid aspect-[9/16] max-h-full w-auto max-w-[240px] place-items-center border border-rule px-6 text-center">
          <div>
            <p className="text-base font-semibold">Start with a photo</p>
            <p className="mt-2 text-xs text-muted">
              Your {subject === "workout" ? "session" : "progress"} sits on top of it, and both layers move.
            </p>
          </div>
        </div>
      </div>
      <div className="shrink-0 px-5 pb-[calc(env(safe-area-inset-bottom)+14px)]">
        <input ref={input} aria-label="Add photo" type="file" accept="image/*" disabled={busy} className="sr-only"
          onChange={e => { onChoose(e.target.files?.[0]); e.target.value = ""; }} />
        <Button onClick={() => input.current?.click()} disabled={busy}>{busy ? "Opening photo…" : "Add photo"}</Button>
        <Button variant="quiet" onClick={onSkip} disabled={busy} className="mt-1">Continue without photo</Button>
        {error && <p role="alert" className="mt-1 text-center text-xs text-danger">{error}</p>}
      </div>
    </div>
  </div>;
}
