import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The cloud connection, or nothing at all.
 *
 * Both values are public by design — the anon key is safe in a bundle because
 * every table is guarded by row-level security, so a key on its own can read
 * nobody's data. Without them the app runs exactly as it always has: local
 * IndexedDB, no account, no network. That is deliberate rather than a
 * degraded mode, because a fork of this repo with no Supabase project of its
 * own should still be a working workout log.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloudConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        // The session has to outlive a closed tab: the app is installed to a
        // home screen and launched cold, and being asked to sign in on every
        // launch would defeat the point of signing in once.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/**
 * Where Google, a confirmation link and a password reset should come back to.
 *
 * Resolved with `URL` rather than concatenated, because this app is built with
 * `base: "./"` so that it also works from a sub-path — which makes
 * `BASE_URL` the *relative* string `"./"`, not `"/"`. Pasting that onto an
 * origin produced `https://<app>.vercel.app./`: a hostname with a trailing
 * dot, which is a different origin as far as the browser is concerned and
 * matches nothing in Supabase's redirect allowlist. Sign-in got all the way
 * through Google and then came back signed out, every time, with no error
 * anywhere to explain it.
 *
 * `new URL` resolves `"./"` against the origin to `https://host/`, and still
 * does the right thing if the base is ever a real sub-path like `/gym/`.
 */
export function redirectTo() {
  return new URL(import.meta.env.BASE_URL || "/", window.location.origin).href;
}
