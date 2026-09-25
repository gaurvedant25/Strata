import { useEffect, useMemo, useState } from "react";
import { shareFile, type ShareOutcome } from "../share";
import { canvasBlob, rememberCard, renderCard } from "./render";
import { templatesFor } from "./templates";
import type { CardSubject } from "./types";
import type { Aspect, Layout, OverlayTransform } from "./draw";

export type DeckCard = {
  id: string;
  name: string;
  /** Carried through from the template so the sheet can mark and gate it. */
  pro?: boolean;
  url: string;
  file?: File;
  /** Present for the directly manipulated Progress preview. */
  backgroundUrl?: string;
  overlayUrl?: string;
};

type Result = {
  data: unknown;
  aspect: Aspect;
  photo: Layout["photo"];
  overlays?: Record<string, OverlayTransform>;
  overlayColor?: string;
  cards: DeckCard[];
  error: string | null;
};

type LayerResult = {
  data: unknown;
  aspect: Aspect;
  photoPresent: boolean;
  overlayColor?: string;
  cards: DeckCard[];
  error: string | null;
};

/** The caller freezes the payload. Each render revision owns its object URLs. */
export function useShareDeck(
  subject: CardSubject | null,
  data: unknown,
  filename: string,
  aspect: Aspect = "story",
  photo?: Layout["photo"],
  overlays?: Record<string, OverlayTransform>,
  overlayColor?: string,
) {
  const [result, setResult] = useState<Result | null>(null);
  const [layers, setLayers] = useState<LayerResult | null>(null);
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);
  const [sending, setSending] = useState(false);
  const [retry, setRetry] = useState(0);
  const layered = (subject === "lift" || subject === "workout" || subject === "body") && overlays != null;
  const photoPresent = !!photo;
  const photoImage = photo?.image;
  const layerPhoto = useMemo<Layout["photo"]>(() => photoImage
    ? { image: photoImage, zoom: 1, x: 0.5, y: 0.5, rotation: 0 }
    : undefined, [photoImage]);
  const resultCurrent = result?.data === data && result?.aspect === aspect &&
    result?.photo === photo && result?.overlays === overlays && result?.overlayColor === overlayColor;
  const layersCurrent = !layered || (layers?.data === data && layers?.aspect === aspect &&
    layers?.photoPresent === photoPresent && layers?.overlayColor === overlayColor);

  // Split preview: fixed photograph below, transparent template above. This
  // keeps movement under the user's fingers while the export renders later.
  useEffect(() => {
    if (!subject || !layered) return;
    let alive = true;
    const urls: string[] = [];
    void (async () => {
      try {
        const canvas = document.createElement("canvas");
        const made: DeckCard[] = [];
        for (const t of templatesFor(subject, data)) {
          await renderCard(canvas, t, aspect, data, layerPhoto, undefined, "background", overlayColor);
          if (!alive) return;
          const background = await canvasBlob(canvas);
          if (!alive) return;
          if (!background) throw new Error("Background encoding failed");
          const backgroundUrl = URL.createObjectURL(background); urls.push(backgroundUrl);

          await renderCard(canvas, t, aspect, data, layerPhoto, undefined, "overlay", overlayColor);
          if (!alive) return;
          const overlay = await canvasBlob(canvas);
          if (!alive) return;
          if (!overlay) throw new Error("Overlay encoding failed");
          const overlayUrl = URL.createObjectURL(overlay); urls.push(overlayUrl);
          made.push({ id: t.id, name: t.name, pro: t.pro, url: backgroundUrl, backgroundUrl, overlayUrl });
        }
        if (alive) setLayers({ data, aspect, photoPresent, overlayColor, cards: made, error: null });
      } catch {
        if (alive) setLayers({ data, aspect, photoPresent, overlayColor, cards: [], error: "Couldn't prepare your cards. Please try again." });
      }
    })();
    return () => { alive = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [subject, layered, data, aspect, layerPhoto, photoPresent, overlayColor, retry]);

  // Build exact share files shortly after a gesture settles. Send remains
  // unavailable until the PNG and the visible composition are identical.
  useEffect(() => {
    if (!subject) return;
    let alive = true;
    const urls: string[] = [];
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const canvas = document.createElement("canvas");
          const made: DeckCard[] = [];
          for (const t of templatesFor(subject, data)) {
            await renderCard(canvas, t, aspect, data, photo, overlays?.[t.id], "all", overlayColor);
            if (!alive) return;
            const blob = await canvasBlob(canvas);
            if (!alive) return;
            if (!blob) throw new Error("Image encoding failed");
            const file = new File([blob], filename, { type: "image/png" });
            const url = URL.createObjectURL(file); urls.push(url);
            made.push({ id: t.id, name: t.name, pro: t.pro, url, file });
          }
          if (alive) setResult({ data, aspect, photo, overlays, overlayColor, cards: made, error: null });
        } catch {
          if (alive) setResult({ data, aspect, photo, overlays, overlayColor, cards: [], error: "Couldn't prepare your cards. Please try again." });
        }
      })();
    }, layered ? 120 : 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      urls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [subject, data, filename, aspect, photo, overlays, overlayColor, layered, retry]);

  const exportCards = resultCurrent ? result.cards : [];
  const cards = layered && layersCurrent
    ? (layers?.cards ?? []).map(card => ({
        ...card,
        file: exportCards.find(exported => exported.id === card.id)?.file,
      }))
    : exportCards;
  const error = (resultCurrent ? result?.error : null) || (layersCurrent ? layers?.error : null);

  function share(at: number) {
    const card = cards[at];
    if (!card?.file || !subject || sending || !resultCurrent) return;
    setSending(true); setOutcome(null);
    try {
      void shareFile(card.file, "Strata").then(value => {
        setOutcome(value);
        if (value === "shared" || value === "saved") rememberCard(subject, card.id);
      }).catch(() => setOutcome("failed")).finally(() => setSending(false));
    } catch { setSending(false); setOutcome("failed"); }
  }

  return {
    cards,
    done: !!resultCurrent && !!layersCurrent,
    error,
    share,
    outcome,
    sending,
    retry: () => { setResult(null); setLayers(null); setRetry(value => value + 1); },
  };
}
