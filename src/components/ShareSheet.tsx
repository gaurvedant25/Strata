import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDialog } from "../lib/useDialog";
import { useEntitlement } from "../lib/useEntitlement";
import type { DeckCard } from "../lib/card/useShareDeck";
import { ASPECTS, DEFAULT_OVERLAY, type Aspect, type Layout, type OverlayTransform } from "../lib/card/draw";
import { constrainOverlay, pinchOverlay } from "../lib/card/overlay";
import { clampPhotoZoom, photoSize, pinchPhoto } from "../lib/card/photo";
import { Button, Eyebrow } from "./ui";

type OverlayEditor = {
  active: boolean;
  transform: OverlayTransform;
  transforms: Record<string, OverlayTransform>;
  aspect: Aspect;
  onChange: (next: OverlayTransform) => void;
};

type PhotoEditor = {
  active: boolean;
  photo: NonNullable<Layout["photo"]>;
  onChange: (next: NonNullable<Layout["photo"]>) => void;
};

export function ShareSheet({
  open, onClose, cards, pending, onSend, subject, selectedId, onSelect,
  controls, error, onRetry, feedback, sending, overlayEditor, photoEditor, onUnlock,
}: {
  open: boolean; onClose: () => void; cards: DeckCard[]; pending: boolean;
  onSend: (at: number) => void; subject: string;
  selectedId: string; onSelect: (id: string) => void; controls?: ReactNode;
  error?: string | null; onRetry?: () => void; feedback?: string; sending?: boolean;
  /**
   * Opens the Pro gate for a premium template. Absent where there is nowhere
   * sensible to send somebody, in which case a locked card explains itself and
   * stops there rather than offering a button that goes nowhere.
   */
  onUnlock?: () => void;
  overlayEditor?: OverlayEditor;
  photoEditor?: PhotoEditor;
}) {
  const panel = useDialog(open, onClose);
  const view = useRef<HTMLDivElement>(null);
  const [previewSpace, setPreviewSpace] = useState({ width: 0, height: 0 });
  const liveTransform = useRef<OverlayTransform>(DEFAULT_OVERLAY);
  const livePhoto = useRef<NonNullable<Layout["photo"]> | null>(null);
  const drag = useRef<{ x: number; left: number; id: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    x: number; y: number; distance: number; angle: number; transform: OverlayTransform;
  } | null>(null);
  const photoGesture = useRef<{
    x: number; y: number; distance: number; angle: number; photo: NonNullable<Layout["photo"]>;
  } | null>(null);
  const photoTouch = useRef<{
    x: number; y: number; distance: number; angle: number; photo: NonNullable<Layout["photo"]>;
  } | null>(null);
  const overlayTouch = useRef<{
    x: number; y: number; distance: number; angle: number; transform: OverlayTransform;
  } | null>(null);
  const at = Math.max(0, cards.findIndex(c => c.id === selectedId));
  const card = cards[at];
  /*
   * A premium template is visible, swipeable and fully rendered; only the
   * export is held back. Putting the wall in front of the picture would hide
   * the one thing that makes the case for paying, and a card somebody has
   * already seen is a far easier thing to decide about.
   */
  const { can } = useEntitlement();
  const locked = !!card?.pro && !can("premium-share");
  // A new image revision restores the same template, without a visual slide.
  useEffect(() => {
    if (view.current) view.current.scrollLeft = at * view.current.clientWidth;
  }, [cards.length, at]);
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const resize = new ResizeObserver(() => {
      el.scrollLeft = at * el.clientWidth;
      setPreviewSpace({ width: Math.max(0, el.clientWidth - 40), height: Math.max(0, el.clientHeight - 24) });
    });
    resize.observe(el);
    return () => resize.disconnect();
  }, [at]);
  useEffect(() => {
    pointers.current.clear();
    gesture.current = null;
    photoGesture.current = null;
    photoTouch.current = null;
    overlayTouch.current = null;
  }, [selectedId, overlayEditor?.aspect, photoEditor?.active]);
  function go(index: number) {
    if ((!cards.length && pending) || sending) return;
    const el = view.current;
    const next = cards[Math.max(0, Math.min(cards.length - 1, index))];
    if (!next || !el) return;
    onSelect(next.id);
  }
  function gestureOrigin(transform: OverlayTransform) {
    const points = [...pointers.current.values()];
    if (!points.length) { gesture.current = null; return; }
    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const distance = points.length > 1
      ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
      : 0;
    const angle = points.length > 1
      ? Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x)
      : 0;
    gesture.current = { x, y, distance, angle, transform };
  }
  function photoOrigin(photo: NonNullable<Layout["photo"]>) {
    const points = [...pointers.current.values()];
    if (!points.length) { photoGesture.current = null; return; }
    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const distance = points.length > 1
      ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
      : 0;
    const angle = points.length > 1
      ? Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x)
      : 0;
    photoGesture.current = { x, y, distance, angle, photo };
  }
  function moveOverlay(e: React.PointerEvent<HTMLDivElement>) {
    if (!overlayEditor?.active || !pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const points = [...pointers.current.values()];
    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const box = e.currentTarget.getBoundingClientRect();
    const start = gesture.current;
    const distance = points.length > 1
      ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
      : 0;
    const angle = points.length > 1
      ? Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x)
      : start.angle;
    const next = pinchOverlay(start.transform,
      { x: (start.x - box.left) / box.width, y: (start.y - box.top) / box.height },
      { x: (x - box.left) / box.width, y: (y - box.top) / box.height },
      start.distance > 0 && distance > 0 ? distance / start.distance : 1,
      overlayEditor.aspect,
      start.distance > 0 && distance > 0 ? ((angle - start.angle) * 180) / Math.PI : 0);
    liveTransform.current = next;
    overlayEditor.onChange(next);
  }
  function movePhoto(e: React.PointerEvent<HTMLDivElement>) {
    if (!photoEditor?.active || !pointers.current.has(e.pointerId) || !photoGesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const points = [...pointers.current.values()];
    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const box = e.currentTarget.getBoundingClientRect();
    const start = photoGesture.current;
    const distance = points.length > 1
      ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
      : 0;
    const angle = points.length > 1
      ? Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x)
      : start.angle;
    const image = start.photo.image;
    const transform = pinchPhoto(start.photo,
      { width: image.naturalWidth, height: image.naturalHeight },
      { width: box.width, height: box.height },
      { x: start.x - box.left, y: start.y - box.top },
      { x: x - box.left, y: y - box.top },
      start.distance > 0 && distance > 0 ? distance / start.distance : 1,
      start.distance > 0 && distance > 0 ? ((angle - start.angle) * 180) / Math.PI : 0);
    const next = {
      image,
      ...transform,
    };
    livePhoto.current = next;
    photoEditor.onChange(next);
  }
  function releasePointer(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    if (photoEditor?.active && livePhoto.current) photoOrigin(livePhoto.current);
    else gestureOrigin(liveTransform.current);
  }
  function touchPosition(touches: React.TouchList) {
    const points = Array.from(touches).slice(0, 2);
    const x = points.reduce((sum, point) => sum + point.clientX, 0) / points.length;
    const y = points.reduce((sum, point) => sum + point.clientY, 0) / points.length;
    const distance = points.length > 1
      ? Math.hypot(points[0].clientX - points[1].clientX, points[0].clientY - points[1].clientY)
      : 0;
    const angle = points.length > 1
      ? Math.atan2(points[1].clientY - points[0].clientY, points[1].clientX - points[0].clientX)
      : 0;
    return { x, y, distance, angle };
  }
  function startEditTouch(e: React.TouchEvent<HTMLDivElement>,
    photo = photoEditor?.photo, transform = overlayEditor?.transform) {
    if (!e.touches.length || (!photoEditor?.active && !overlayEditor?.active)) return;
    e.preventDefault(); e.stopPropagation();
    const point = touchPosition(e.touches);
    if (photoEditor?.active && photo) {
      photoTouch.current = { ...point, photo };
      livePhoto.current = photo;
    } else if (overlayEditor?.active && transform) {
      overlayTouch.current = { ...point, transform };
      liveTransform.current = transform;
    }
  }
  function moveEditTouch(e: React.TouchEvent<HTMLDivElement>) {
    if (!e.touches.length) return;
    e.preventDefault(); e.stopPropagation();
    const point = touchPosition(e.touches);
    const box = e.currentTarget.getBoundingClientRect();
    if (photoEditor?.active && photoTouch.current) {
      const start = photoTouch.current;
      const image = start.photo.image;
      const transform = pinchPhoto(start.photo,
        { width: image.naturalWidth, height: image.naturalHeight },
        { width: box.width, height: box.height },
        { x: start.x - box.left, y: start.y - box.top },
        { x: point.x - box.left, y: point.y - box.top },
        start.distance > 0 && point.distance > 0 ? point.distance / start.distance : 1,
        start.distance > 0 && point.distance > 0 ? ((point.angle - start.angle) * 180) / Math.PI : 0);
      const next = { image, ...transform };
      livePhoto.current = next;
      photoEditor.onChange(next);
    } else if (overlayEditor?.active && overlayTouch.current) {
      const start = overlayTouch.current;
      const next = pinchOverlay(start.transform,
        { x: (start.x - box.left) / box.width, y: (start.y - box.top) / box.height },
        { x: (point.x - box.left) / box.width, y: (point.y - box.top) / box.height },
        start.distance > 0 && point.distance > 0 ? point.distance / start.distance : 1,
        overlayEditor.aspect,
        start.distance > 0 && point.distance > 0 ? ((point.angle - start.angle) * 180) / Math.PI : 0);
      liveTransform.current = next;
      overlayEditor.onChange(next);
    }
  }
  function endEditTouch(e: React.TouchEvent<HTMLDivElement>) {
    if (!photoEditor?.active && !overlayEditor?.active) return;
    e.preventDefault(); e.stopPropagation();
    if (e.touches.length) startEditTouch(e, livePhoto.current ?? photoEditor?.photo, liveTransform.current);
    else {
      photoTouch.current = null;
      overlayTouch.current = null;
    }
  }
  const ratio = overlayEditor ? ASPECTS[overlayEditor.aspect].w / ASPECTS[overlayEditor.aspect].h : 9 / 16;
  const previewWidth = Math.min(previewSpace.width, previewSpace.height * ratio);
  const previewHeight = previewWidth / ratio;
  const photoFrame = {
    left: 0,
    top: 0,
    width: previewWidth,
    height: previewHeight,
  };
  const previewPhoto = photoEditor?.photo;
  const previewPhotoSize = previewPhoto ? photoSize(
    { width: previewPhoto.image.naturalWidth, height: previewPhoto.image.naturalHeight },
    { width: photoFrame.width, height: photoFrame.height }, previewPhoto.zoom,
  ) : { width: 0, height: 0 };
  if (!open) return null;
  return <div className="fixed inset-0 z-[80] bg-black/85">
    <div ref={panel} role="dialog" aria-modal="true" aria-label={`Share this ${subject}`} tabIndex={-1}
      onKeyDown={e => {
        if (e.target instanceof HTMLInputElement) return;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); go(at + (e.key === "ArrowLeft" ? -1 : 1)); }
      }}
      className="relative mx-auto flex h-[100dvh] w-full max-w-lg flex-col bg-ink outline-none">
      <header className="flex shrink-0 items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+12px)]">
        <div><Eyebrow>Make it yours</Eyebrow><p className="mt-1 text-xs text-muted">{subject === "workout" ? "Your workout. Your way." : "Your progress. Your way."}</p></div>
        <button onClick={onClose} aria-label="Close share" className="grid size-11 place-items-center text-lg">✕</button>
      </header>
      <div ref={view} aria-label="Card previews"
        onScroll={e => {
          if (!cards.length || drag.current) return;
          const el = e.currentTarget;
          const index = Math.round(el.scrollLeft / el.clientWidth);
          if (Math.abs(el.scrollLeft - index * el.clientWidth) < 2 && cards[index] && cards[index].id !== selectedId) onSelect(cards[index].id);
        }}
        onPointerDown={e => {
          if (overlayEditor?.active) return;
          if (e.pointerType !== "mouse" || e.button !== 0 || pending || sending) return;
          drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft, id: e.pointerId };
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.style.scrollSnapType = "none";
        }}
        onPointerMove={e => {
          if (drag.current?.id !== e.pointerId) return;
          e.currentTarget.scrollLeft = drag.current.left + drag.current.x - e.clientX;
        }}
        onPointerUp={e => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          drag.current = null;
          e.currentTarget.style.scrollSnapType = "";
          const delta = e.clientX - d.x;
          go(Math.abs(delta) > 40 ? at - Math.sign(delta) : at);
          e.currentTarget.scrollLeft = Math.max(0, Math.min(cards.length - 1, Math.abs(delta) > 40 ? at - Math.sign(delta) : at)) * e.currentTarget.clientWidth;
        }}
        onPointerCancel={e => { drag.current = null; e.currentTarget.style.scrollSnapType = ""; e.currentTarget.scrollLeft = at * e.currentTarget.clientWidth; }}
        className="flex min-h-[160px] flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain py-3 [scrollbar-width:none]">
        {cards.map(c => <div key={c.id} className="flex h-full w-full shrink-0 snap-center items-center justify-center px-5">
          {c.backgroundUrl && c.overlayUrl ? <div className="relative shrink-0 overflow-hidden bg-black"
            style={{ width: previewWidth, height: previewHeight }}>
            {previewPhoto ? <div className="absolute overflow-hidden"
              style={photoFrame}>
              <img src={previewPhoto.image.src} alt="" draggable={false} className="pointer-events-none absolute max-w-none select-none"
                style={{
                  width: previewPhotoSize.width,
                  height: previewPhotoSize.height,
                  left: photoFrame.width * previewPhoto.x - previewPhotoSize.width / 2,
                  top: photoFrame.height * previewPhoto.y - previewPhotoSize.height / 2,
                  transform: `rotate(${previewPhoto.rotation}deg)`,
                }} />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,.42),rgba(0,0,0,.04)_20%,rgba(0,0,0,.04)_62%,rgba(0,0,0,.68))]" />
            </div> : <img src={c.backgroundUrl} alt="" draggable={false}
              className="absolute inset-0 block size-full select-none" />}
            <img src={c.overlayUrl} alt={`${c.name} card`} draggable={false}
              className="pointer-events-none absolute inset-0 block size-full select-none"
              style={{
                transform: `translate(${(overlayEditor?.transforms[c.id]?.x ?? 0) * 100}%, ${(overlayEditor?.transforms[c.id]?.y ?? 0) * 100}%) rotate(${overlayEditor?.transforms[c.id]?.rotation ?? 0}deg) scale(${overlayEditor?.transforms[c.id]?.scale ?? 1})`,
                transformOrigin: "center",
              }} />
            {c.id === selectedId && (overlayEditor?.active || photoEditor?.active) && <div
              role="application" tabIndex={0}
                aria-label={photoEditor?.active
                  ? "Photo. Drag to reposition; pinch to zoom and rotate. Arrow keys move it; plus and minus zoom; brackets rotate."
                  : "Stats. Drag to move; pinch to resize and rotate. Arrow keys move it; plus and minus resize; brackets rotate."}
              style={photoEditor?.active ? photoFrame : undefined}
              onKeyDown={e => {
                const step = e.shiftKey ? 0.025 : 0.01;
                if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "[", "]"].includes(e.key)) return;
                e.preventDefault();
                if (photoEditor?.active) {
                  const next = { ...photoEditor.photo };
                  if (e.key === "ArrowLeft") next.x -= step;
                  if (e.key === "ArrowRight") next.x += step;
                  if (e.key === "ArrowUp") next.y -= step;
                  if (e.key === "ArrowDown") next.y += step;
                  if (e.key === "+" || e.key === "=") next.zoom = clampPhotoZoom(next.zoom + 0.05);
                  if (e.key === "-") next.zoom = clampPhotoZoom(next.zoom - 0.05);
                  if (e.key === "[") next.rotation -= e.shiftKey ? 5 : 2;
                  if (e.key === "]") next.rotation += e.shiftKey ? 5 : 2;
                  livePhoto.current = next; photoEditor.onChange(next);
                } else if (overlayEditor) {
                  const next = { ...overlayEditor.transform };
                  if (e.key === "ArrowLeft") next.x -= step;
                  if (e.key === "ArrowRight") next.x += step;
                  if (e.key === "ArrowUp") next.y -= step;
                  if (e.key === "ArrowDown") next.y += step;
                  if (e.key === "+" || e.key === "=") next.scale += 0.05;
                  if (e.key === "-") next.scale -= 0.05;
                  if (e.key === "[") next.rotation -= e.shiftKey ? 5 : 2;
                  if (e.key === "]") next.rotation += e.shiftKey ? 5 : 2;
                  liveTransform.current = constrainOverlay(next);
                  overlayEditor.onChange(liveTransform.current);
                }
                e.stopPropagation();
              }}
              onPointerDown={e => {
                if (e.pointerType === "touch") return;
                e.preventDefault(); e.stopPropagation();
                e.currentTarget.focus({ preventScroll: true });
                if (pointers.current.size >= 2) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                if (photoEditor?.active) {
                  if (pointers.current.size === 1) livePhoto.current = photoEditor.photo;
                  photoOrigin(livePhoto.current ?? photoEditor.photo);
                } else if (overlayEditor) {
                  if (pointers.current.size === 1) liveTransform.current = overlayEditor.transform;
                  gestureOrigin(liveTransform.current);
                }
              }}
              onPointerMove={e => {
                if (e.pointerType === "touch") return;
                if (photoEditor?.active) movePhoto(e);
                else moveOverlay(e);
              }}
              onPointerUp={releasePointer}
              onPointerCancel={releasePointer}
              onLostPointerCapture={releasePointer}
              onTouchStart={startEditTouch}
              onTouchMove={moveEditTouch}
              onTouchEnd={endEditTouch}
              onTouchCancel={endEditTouch}
              className="absolute inset-0 cursor-grab touch-none outline-none active:cursor-grabbing focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/60"
            />}
          </div> : <img src={c.url} alt={`${c.name} card`} draggable={false}
            className="block max-h-full max-w-full select-none rounded-lg object-contain" />}
        </div>)}
        {!cards.length && <div className="flex w-full shrink-0 items-center justify-center px-5 text-center text-sm text-muted" role="status">
          {error || "Preparing your cards…"}
        </div>}
      </div>
      <div className="max-h-[48dvh] shrink-0 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+14px)]">
        <div className="flex h-11 items-center justify-between">
          <button aria-label="Previous card" disabled={pending || at === 0 || sending} onClick={() => go(at - 1)} className="size-11 text-xl disabled:opacity-25">←</button>
          <div className="text-center"><span className="text-sm">{card?.name ?? "Preparing"}</span>
            {card?.pro && !can("premium-share") && (
              <span className="ml-1.5 align-[1px] font-mono text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-dim">Pro</span>
            )}
            <div className="flex justify-center">
              {cards.map((c, i) => <button key={c.id} aria-label={c.pro && !can("premium-share") ? `Show ${c.name} — Pro` : `Show ${c.name}`} aria-current={c.id === selectedId}
                disabled={sending} onClick={() => go(i)} className="grid h-5 w-6 place-items-center">
                <span className={`size-1 rounded-full ${c.id === selectedId ? "bg-fg" : "bg-faint"}`} />
              </button>)}
            </div>
          </div>
          <button aria-label="Next card" disabled={pending || at >= cards.length - 1 || sending} onClick={() => go(at + 1)} className="size-11 text-xl disabled:opacity-25">→</button>
        </div>
        <div className="my-3">{controls}</div>
        {error && <button onClick={onRetry} className="mb-2 w-full py-2 text-sm underline">Try again</button>}
        {locked ? (
          <div className="space-y-2">
            <Button onClick={onUnlock} disabled={!onUnlock}>Unlock Pro to share</Button>
            <p className="text-center text-[0.75rem] leading-relaxed text-dim" role="status">
              {card?.name} is a Pro template. The basic template shares as normal.
            </p>
          </div>
        ) : (
          <Button onClick={() => onSend(at)} disabled={!card || pending || sending}>{sending ? "Sharing…" : pending ? "Preparing…" : "Share this card"}</Button>
        )}
        {feedback && <p role="status" className="mt-2 text-center text-xs text-muted">{feedback}</p>}
      </div>
    </div>
  </div>;
}
