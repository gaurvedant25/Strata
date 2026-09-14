import { ASPECTS, layout, type Aspect, type OverlayTransform, type RenderMode } from "./draw";
import { templatesFor } from "./templates";
import type { CardSubject, CardTemplate } from "./types";

/**
 * Turning a template and some data into a picture, and choosing which template
 * that should be.
 */

/**
 * Which card you get, and why it is not the same one twice.
 *
 * A share opens on the template *after* the one last sent for this subject,
 * wrapping round — so sharing your streak on Monday and again on Thursday
 * produces two different pictures without anyone having to pick.
 *
 * Kept in `localStorage`, like the app's other view preferences — this is not
 * training data and has no business being synced between devices.
 */
const KEY = (subject: CardSubject) => `gymlog.card.last.${subject}`;

/** The card last sent for this subject, if the device still remembers one. */
export function lastCardId(subject: CardSubject): string | null {
  try {
    return localStorage.getItem(KEY(subject));
  } catch {
    /* private mode, or storage turned off. One card is fine. */
    return null;
  }
}

export function rememberCard(subject: CardSubject, id: string) {
  try {
    localStorage.setItem(KEY(subject), id);
  } catch {
    /* nothing to do; the rotation just restarts next time. */
  }
}

/**
 * Where a rotation starts: one past the card last sent.
 *
 * An unknown id — a template renamed away, or nothing stored yet — starts at
 * the beginning rather than throwing the rotation off.
 */
export function nextAfter(list: CardTemplate[], last: string | null) {
  return (list.findIndex((t) => t.id === last) + 1) % list.length;
}

/**
 * The whole choice made for you, for the screens that send without asking.
 *
 * Reading and advancing in one step, with the choice written down the moment
 * it is made rather than when the share completes: backing out of the system
 * share sheet still advances, because having seen a card is enough reason not
 * to send that one next. A screen that shows the deck first does *not* want
 * this — it remembers what you actually chose instead, so nothing is spent
 * merely by looking.
 */
export function pickTemplate(
  subject: CardSubject,
  data: unknown,
): CardTemplate {
  const usable = templatesFor(subject, data);
  const next = usable[nextAfter(usable, lastCardId(subject))];
  rememberCard(subject, next.id);
  return next;
}

/**
 * Draws a card at the size it will actually be sent.
 *
 * The canvas is 1080 wide because that is what the card *is* — multiplying by
 * `devicePixelRatio` would only make a heavier file of the same picture, and
 * on a phone the preview is already showing it at better than native density.
 *
 * The faces are asked for by name and waited on. `document.fonts.ready` alone
 * settles only what the page is already using, and a card is set at sizes and
 * weights no screen in the app asks for — so without this the first card drawn
 * after a cold start comes out in the fallback face.
 */
export async function renderCard(
  canvas: HTMLCanvasElement,
  template: CardTemplate,
  aspect: Aspect,
  data: unknown,
  photo?: import("./draw").Layout["photo"],
  overlay?: OverlayTransform,
  renderMode: RenderMode = "all",
  overlayColor?: string,
) {
  await Promise.all([
    document.fonts.load('500 100px "IBM Plex Mono"'),
    document.fonts.load('600 100px "IBM Plex Mono"'),
    document.fonts.load('400 100px "DM Sans Variable"'),
    document.fonts.load('600 100px "DM Sans Variable"'),
    document.fonts.load('700 100px "DM Sans Variable"'),
  ]);
  const { w, h } = ASPECTS[aspect];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not draw the card.");
  // The one place the registry's loose payload type is tied back to the
  // template that understands it. Every caller reaches this through
  // `pickTemplate` with the data it was built for.
  (template.draw as (l: ReturnType<typeof layout>, d: unknown) => void)(
    { ...layout(ctx, aspect), photo, overlay, overlayColor, renderMode },
    data,
  );
}

export function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
}
