/**
 * Deletes the caller's account, for real.
 *
 * A signed-in client can delete its own *rows* — the row-level security policy
 * in `schema.sql` allows exactly that — but it cannot delete its own *user*.
 * That needs the service-role key, which can never ship in the app bundle, so
 * it has to happen on a server. This is that server, and it is deliberately
 * the smallest one possible: it authenticates the caller, deletes precisely
 * that caller, and does nothing else.
 *
 * Deleting the user is enough to take the training log with it. `gym_records`
 * declares `user_id ... references auth.users on delete cascade`, so the rows
 * go when the user does, in the same transaction, with nothing left behind to
 * tidy up later.
 *
 * Deploy with:
 *
 *   supabase functions deploy delete-account
 *
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform;
 * they do not need to be set by hand.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

/*
 * The app calls this from wherever it happens to be running: a dev server on
 * localhost, the deployed site, or `https://localhost` inside the Android
 * WebView. None of those share an origin with the function, so the browser
 * sends a preflight first and refuses the real request without these.
 */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Use POST." });

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json(401, { error: "Not signed in." });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  /*
   * Whose account this is, is decided by the token and nothing else. The
   * request body is never consulted: taking an id from the caller would mean
   * that anyone with a valid session could delete anyone else's account.
   */
  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return json(401, { error: "That session is not valid." });

  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) return json(500, { error: deleteError.message });

  return json(200, { deleted: true });
});
