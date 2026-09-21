/**
 * Where "Purchase help" goes.
 *
 * The app has no support channel yet, and inventing an address that does not
 * exist would be worse than having no link at all: somebody with a real billing
 * problem would write to it and hear nothing back.
 *
 * So this is one isolated constant with a placeholder that is obviously a
 * placeholder, and the UI reads `SUPPORT_CONFIGURED` rather than assuming. When
 * you have a real destination — a mailbox, a help page, a form — put it in
 * `SUPPORT_URL` and the row starts working everywhere it appears.
 *
 * Both stores expect a contact route for purchase problems in the listing; this
 * is the in-app companion to it, not a replacement for it.
 */

/**
 * Replace with a real destination before release. `mailto:` and `https:` both
 * work; the row opens whatever this is.
 */
export const SUPPORT_URL = "";

/** Whether there is somewhere for the help row to actually go. */
export const SUPPORT_CONFIGURED = SUPPORT_URL.length > 0;

/**
 * What to say when there is not. Shown in development instead of a dead link,
 * so the gap is visible while building rather than discovered by a customer.
 */
export const SUPPORT_PLACEHOLDER =
  "No support destination is configured yet. Set SUPPORT_URL in src/lib/support.ts.";
