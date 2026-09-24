import { useEffect, useMemo, useRef, useState } from "react";
import type { BodyData, LiftData, WorkoutData } from "../lib/card/types";
import { DEFAULT_OVERLAY, type Layout, type OverlayTransform } from "../lib/card/draw";
import { useShareDeck } from "../lib/card/useShareDeck";
import { ShareSheet } from "./ShareSheet";
import { SharePhotoPrompt } from "./SharePhotoPrompt";

/** Mounted only while open: photos and the frozen payload belong to this preview. */
export function ShareCardEditor({ data, subject, onClose, onUnlock }: (
  | { subject: "lift"; data: LiftData }
  | { subject: "workout"; data: WorkoutData }
  | { subject: "body"; data: BodyData }
) & { onClose: () => void; onUnlock?: () => void }) {
  const [frozen] = useState(data);
  // Share opens on the photo question. Nothing is rendered until it is answered.
  const [stage, setStage] = useState<"photo" | "edit">("photo");
  const [aspect, setAspect] = useState<"story" | "square">("story");
  const [photo, setPhoto] = useState<Layout["photo"]>();
  const [photoError, setPhotoError] = useState("");
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [selected, setSelected] = useState(
    subject === "lift" ? "lift/moment" : subject === "body" ? "body/poster" : "workout/streak",
  );
  const [editTarget, setEditTarget] = useState<"photo" | "stats">("stats");
  const [overlayColor, setOverlayColor] = useState("#ffffff");
  const [overlaySettings, setOverlaySettings] = useState<Record<string, OverlayTransform>>({});
  const photoRequest = useRef(0);
  const photoUrl = useRef<string | null>(null);
  useEffect(() => () => {
    photoRequest.current++;
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
  }, []);
  const overlayKey = `${aspect}:${selected}`;
  const overlay = overlaySettings[overlayKey] ?? DEFAULT_OVERLAY;
  const overlayIsDefault = overlay.x === 0 && overlay.y === 0 && overlay.scale === 1 && overlay.rotation === 0;
  const aspectOverlays = useMemo(() => {
    const prefix = `${aspect}:`;
    return Object.fromEntries(Object.entries(overlaySettings)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => [key.slice(prefix.length), value]));
  }, [aspect, overlaySettings]);
  const deck = useShareDeck(stage === "edit" ? subject : null, frozen, `gym-log-${subject}-${aspect}.png`, aspect, photo, aspectOverlays, overlayColor);
  const setOverlay = (next: OverlayTransform) => setOverlaySettings(current => ({ ...current, [overlayKey]: next }));
  async function choose(file?: File) {
    if (!file) return;
    const request = ++photoRequest.current;
    setPhotoError("");
    if (!file.type.startsWith("image/") || file.size > 25 * 1024 * 1024) {
      setLoadingPhoto(false); setPhotoError("Choose an image smaller than 25 MB."); return;
    }
    setLoadingPhoto(true);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.src = url;
      await img.decode();
      if (request !== photoRequest.current) { URL.revokeObjectURL(url); return; }
      if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
      photoUrl.current = url;
      setPhoto({ image: img, zoom: 1, x: 0.5, y: 0.5, rotation: 0 });
      setEditTarget("photo");
      setStage("edit");
    } catch {
      URL.revokeObjectURL(url);
      if (request === photoRequest.current) setPhotoError("Couldn't open that photo. Try a JPG, PNG, or WebP image.");
    } finally { if (request === photoRequest.current) setLoadingPhoto(false); }
  }
  function removePhoto() {
    photoRequest.current++;
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    photoUrl.current = null;
    setPhoto(undefined); setLoadingPhoto(false); setEditTarget("stats");
  }
  const feedback = deck.outcome === "saved" ? "Image saved to your downloads."
    : deck.outcome === "shared" ? "Shared." : deck.outcome === "cancelled" ? "Sharing cancelled. Your card is still here."
    : deck.outcome === "failed" ? "Couldn't share. Please try again." : "";
  if (stage === "photo") return <SharePhotoPrompt subject={subject} busy={loadingPhoto}
    error={photoError} onChoose={file => void choose(file)} onSkip={() => setStage("edit")} onClose={onClose} />;
  return <ShareSheet open onClose={onClose} onUnlock={onUnlock} cards={deck.cards} pending={!deck.done || loadingPhoto}
    onSend={deck.share} subject={subject} selectedId={selected} onSelect={setSelected} sending={deck.sending}
    error={deck.error} onRetry={deck.retry} feedback={feedback}
    overlayEditor={{ active: editTarget === "stats" && !deck.sending, transform: overlay, transforms: aspectOverlays, aspect, onChange: setOverlay }}
    photoEditor={photo ? { active: editTarget === "photo" && !deck.sending, photo, onChange: setPhoto } : undefined}
    controls={<div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex rounded-full border border-rule p-1" aria-label="Image size">
          {([['story', 'Story 9:16'], ['square', 'Chat 1:1']] as const).map(([value, name]) =>
            <button key={value} aria-pressed={aspect === value} disabled={deck.sending}
              onClick={() => setAspect(value)} className={`rounded-full px-4 py-2 text-xs ${aspect === value ? 'bg-fg text-black' : 'text-muted'}`}>{name}</button>)}
        </div>
        <label className="cursor-pointer py-2 text-sm underline underline-offset-4">
          {photo ? "Change photo" : "Add photo"}
          <input aria-label="Add photo" type="file" accept="image/*" disabled={deck.sending} className="sr-only"
            onChange={e => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>
      <div className="flex min-h-11 items-center justify-between gap-3">
        {photo ? <div className="flex rounded-full border border-rule p-1" aria-label="Edit layer">
          {([['photo', 'Photo'], ['stats', 'Stats']] as const).map(([value, name]) => <button key={value}
            aria-pressed={editTarget === value} disabled={deck.sending} onClick={() => setEditTarget(value)}
            className={`rounded-full px-4 py-2 text-xs ${editTarget === value ? 'bg-fg text-black' : 'text-muted'}`}>{name}</button>)}
        </div> : <span className="text-xs text-muted">Editing stats</span>}
        <label className="flex min-h-11 items-center gap-2 text-xs text-muted">Color
          <input aria-label="Stats color" type="color" value={overlayColor} disabled={deck.sending}
            onChange={e => setOverlayColor(e.target.value)} className="size-9 cursor-pointer rounded-full border border-rule bg-transparent p-1" />
        </label>
      </div>
      {photo && editTarget === "photo" && <label className="flex min-h-11 items-center gap-3 text-xs text-muted">
        <span className="shrink-0">Photo size</span>
        <input aria-label="Photo size" type="range" min="0.01" max="3" step="0.01" value={photo.zoom}
          disabled={deck.sending} onChange={e => setPhoto({ ...photo, zoom: Number(e.target.value) })}
          className="h-11 min-w-0 flex-1 accent-white" />
        <span className="w-10 text-right tabular-nums">{Math.round(photo.zoom * 100)}%</span>
      </label>}
      <div className="flex min-h-11 items-center justify-between gap-2">
        <p className="text-xs text-muted">{editTarget === "photo" && photo ? "Drag · Pinch to zoom & tilt" : "Drag · Pinch to resize & tilt"}</p>
        <div className="flex items-center gap-3">
          {photo && <button onClick={removePhoto} disabled={deck.sending}
            className="min-h-11 text-xs text-muted underline underline-offset-4">Remove</button>}
          <button disabled={deck.sending || (editTarget === "photo" && photo
              ? photo.zoom === 1 && photo.x === 0.5 && photo.y === 0.5 && photo.rotation === 0
              : overlayIsDefault)}
            onClick={() => editTarget === "photo" && photo
              ? setPhoto({ ...photo, zoom: 1, x: 0.5, y: 0.5, rotation: 0 })
              : setOverlay(DEFAULT_OVERLAY)}
            className="min-h-11 text-xs text-muted underline underline-offset-4 disabled:opacity-30">Reset</button>
        </div>
      </div>
      {photoError && <p role="alert" className="text-xs text-danger">{photoError}</p>}
    </div>} />;
}
