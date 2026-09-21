/**
 * Where the Privacy Policy and the Terms and Conditions are.
 *
 * The documents ship with the app rather than living on someone else's domain.
 * `public/legal.html` is served at the app's own origin, is precached with
 * everything else, and therefore opens in a gym with no signal — which is the
 * one promise this app makes everywhere else and would be odd to break for the
 * page that describes it. The Markdown in `docs/` is the readable source the
 * page was built from; the page is what people actually read.
 *
 * The credits page is part of the same document for the same reason: two of
 * the image sets the exercise thumbnails are built from are licensed on
 * condition that they are credited, and a credit that only loads when there is
 * signal is not a credit.
 *
 * The same pair of links has to appear in three places that are legally
 * distinct: the sign-in screen, where agreeing to them is part of what the
 * button does; Settings, where someone goes to read them again later; and the
 * two store listings, which take a URL rather than a link. The store listings
 * want an absolute address — that is this app's deployed origin followed by
 * `/legal.html`, so there is nothing extra to host and nothing to keep in step.
 */

/** Vite's base path. Always ends in a slash, so these concatenate cleanly. */
const base = import.meta.env.BASE_URL || "/";

export const PRIVACY_URL = `${base}legal.html#privacy`;
export const TERMS_URL = `${base}legal.html#terms`;
export const CREDITS_URL = `${base}legal.html#credits`;
