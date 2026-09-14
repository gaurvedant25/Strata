import { useEffect, useMemo, useRef, useState } from "react";
import { shareFile, type ShareOutcome } from "../share";
import { canvasBlob, pickTemplate, renderCard } from "./render";
import type { CardSubject, CardTemplate } from "./types";

/**
 * A share card, drawn and encoded before anyone asks for it.
 *
 * The point of rendering early is the tap. On WebKit `navigator.share` has to
 * be called on the first tick of the gesture that reached it, and drawing a
 * card and encoding it to PNG takes something like seventy milliseconds —
 * enough to lose the activation and have the share rejected outright. So the
 * work happens when whatever offers the button appears, seconds before the
 * button is pressed, and the press only hands over a file already sitting in
 * a ref.
 *
 * `null` data means there is nothing to draw yet, and the hook stays idle.
 */
export function useShareCard(
  subject: CardSubject | null,
  data: unknown,
  filename: string,
) {
  const fileRef = useRef<File | null>(null);
  const latest = useRef(data);
  latest.current = data;
  const [template, setTemplate] = useState<CardTemplate | null>(null);
  const [ready, setReady] = useState(false);
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);

  // The payload is rebuilt on every render, so anything that depends on it
  // keys off its contents rather than its identity — otherwise the card would
  // redraw on every tick of the workout clock.
  const key = useMemo(() => (data ? JSON.stringify(data) : ""), [data]);
  const live = !!subject && !!key;

  /*
   * Which card, decided once.
   *
   * Deliberately not in the drawing effect below: that one re-runs whenever
   * the data moves — the session clock alone changes it once a minute — and
   * advancing the rotation on a clock tick would mean the card you were
   * looking at quietly became a different card. This runs when the offer
   * appears and not again.
   */
  useEffect(() => {
    if (!live || !subject) {
      setTemplate(null);
      fileRef.current = null;
      setReady(false);
      return;
    }
    setTemplate(pickTemplate(subject, latest.current));
    // `subject` and being live are the whole trigger; the payload is read
    // through a ref precisely so it is not one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, live]);

  useEffect(() => {
    if (!template || !key) return;
    let alive = true;
    // Only closed while there is nothing to hand over. Redrawing for a clock
    // tick should not flicker the button off under a finger when the card
    // already in hand is perfectly good.
    if (!fileRef.current) setReady(false);
    void (async () => {
      const canvas = document.createElement("canvas");
      await renderCard(canvas, template, "story", JSON.parse(key) as unknown);
      const blob = await canvasBlob(canvas);
      if (!alive || !blob) return;
      fileRef.current = new File([blob], filename, { type: "image/png" });
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [template, key, filename]);

  /**
   * Deliberately synchronous. Everything slow has already happened, and the
   * only thing between the tap and the share sheet is reading a ref.
   */
  function share() {
    const file = fileRef.current;
    if (!file) return;
    void shareFile(file, "Gym Log").then(setOutcome);
  }

  return { ready, share, outcome, templateName: template?.name ?? null };
}
