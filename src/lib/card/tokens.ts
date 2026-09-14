/**
 * The card palette and type, written out as plain values.
 *
 * These are the same colours as `--color-*` in `src/index.css`, deliberately
 * copied rather than read back out of the page with `getComputedStyle`. A card
 * is a file that leaves the phone: it has to rasterise to the same pixels
 * whichever screen invoked it, and reading the live stylesheet would make the
 * export depend on the DOM it happened to be launched from. `BodyMap` makes the
 * same call for `SKIN` and `STRUCTURE`.
 *
 * If a tone changes in the stylesheet, change it here too.
 */

/** The ground. Every card is drawn on black. */
export const INK = "#000000";
/** A panel lifted off the ground. */
export const CARD = "#121212";
/** The edge of a panel, and the dividers inside it. */
export const CARDRULE = "#262626";
/** A hairline drawn straight on black. */
export const RULE = "#1a1a1a";
/** Black, but not quite: an area fill that reads as a shape without lighting. */
export const VEIL = "#101010";

/**
 * The floating surface, for the one card that has no ground of its own.
 *
 * These are the `.glass` panel off the tab bar, written as canvas colours. The
 * blur behind it cannot come with them — a transparent PNG has nothing behind
 * it to blur — so the translucency, the hairline edge and the sheen along the
 * top are doing all the work of separating the panel from whatever photo it
 * lands on.
 */
export const GLASS = "rgba(20, 20, 22, 0.72)";
export const GLASS_EDGE = "rgba(255, 255, 255, 0.1)";
export const GLASS_SHEEN = "rgba(255, 255, 255, 0.07)";

/** Primary text. */
export const FG = "#f5f5f5";
/** Secondary text — labels, units, captions. */
export const MUTED = "#9a9a9a";
/** Tertiary text. */
export const DIM = "#808080";
/** Marks only, never words. */
export const FAINT = "#646464";

/**
 * The warm accent, and the only colour on a card that is not black or grey.
 *
 * The stylesheet holds this as `oklch(0.78 0.16 58)`, which is very slightly
 * outside sRGB — the red channel clips. This is that colour after the clip,
 * written as a hex so a canvas on an older iOS, where `oklch()` is not a
 * colour a context will parse, draws the same streak as the screen does.
 */
export const EMBER = "#ff9a3f";
/** The same, as channels, for the glow's rgba stops. */
export const EMBER_RGB = [255, 154, 63] as const;

export const FAMILY = {
  mono: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace',
  sans: '"DM Sans Variable", ui-sans-serif, system-ui, -apple-system, sans-serif',
} as const;

export type Family = keyof typeof FAMILY;

/**
 * The four tracking values the app actually uses, in ems.
 *
 * Wide tracking on small uppercase mono is this app's signature, and it is the
 * one piece of the look that a card cannot fudge — an untracked label reads as
 * a different app. `TIGHT` is the opposite end: the big numerals are set closed
 * up so a figure reads as one object rather than as digits in a row.
 */
export const TRACK = {
  eyebrow: 0.2,
  label: 0.18,
  button: 0.14,
  tight: -0.02,
} as const;
