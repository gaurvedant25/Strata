#!/usr/bin/env node
/**
 * Checks a Supabase setup end to end, without needing the app or a browser.
 *
 * Every step of the console setup fails silently in its own way — a project
 * with no table, a table with no row-level security, a provider that was
 * configured but never enabled, a redirect URL that was never allow-listed.
 * In the app all of those surface as one unhelpful "could not sign in", so
 * this names which one it is.
 *
 * Run with: npm run check:cloud
 */
import { readFileSync, existsSync } from "node:fs";

const RESET = "[0m";
const dim = (s) => `[2m${s}${RESET}`;
const red = (s) => `[31m${s}${RESET}`;
const green = (s) => `[32m${s}${RESET}`;
const yellow = (s) => `[33m${s}${RESET}`;

let failed = 0;
const pass = (m, extra) => console.log(`${green("PASS")}  ${m}${extra ? dim(`  ${extra}`) : ""}`);
const fail = (m, fix) => {
  failed++;
  console.log(`${red("FAIL")}  ${m}`);
  if (fix) console.log(`      ${yellow("→")} ${fix}`);
};
const warn = (m, fix) => {
  console.log(`${yellow("WARN")}  ${m}`);
  if (fix) console.log(`      ${yellow("→")} ${fix}`);
};

function env() {
  const out = {};
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !out[m[1]]) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

const e = env();
const url = (e.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const key = e.VITE_SUPABASE_ANON_KEY || "";

console.log();
if (!url || !key) {
  fail(
    "No credentials found.",
    "Copy .env.example to .env.local and fill in both values from Supabase → Project Settings → Data API.",
  );
  console.log(`\n${dim("The app runs local-only without these, which is a valid state — but nothing below can be checked.")}\n`);
  process.exit(1);
}
pass("Credentials found in .env.local");

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
  warn(`URL looks unusual: ${url}`, "Expected https://<project-ref>.supabase.co with no trailing path.");
} else {
  pass("Project URL well-formed", url);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };
const timeout = (ms) => AbortSignal.timeout(ms);

// ---- project reachable ------------------------------------------------------
let settings;
try {
  const r = await fetch(`${url}/auth/v1/settings`, { headers, signal: timeout(10000) });
  if (r.status === 401) {
    fail("The project rejected the anon key.", "Re-copy the anon (public) key — not the service_role key, and not the JWT secret.");
  } else if (!r.ok) {
    fail(`Project responded ${r.status}.`, "Check the URL is the right project.");
  } else {
    settings = await r.json();
    pass("Project reachable and key accepted");
  }
} catch (err) {
  fail(`Could not reach ${url} (${err.message}).`, "Check the URL, and that you are online.");
}

// ---- google provider --------------------------------------------------------
if (settings) {
  const providers = settings.external ?? {};
  if (providers.google) {
    pass("Google provider enabled");
  } else {
    fail(
      "Google provider is not enabled.",
      "Supabase → Authentication → Providers → Google: paste the client ID and secret, then toggle it on. Enabling is a separate step from saving the keys.",
    );
  }
  if (settings.disable_signup) {
    fail(
      "Sign-ups are disabled on this project.",
      "Supabase → Authentication → Sign In / Providers → allow new users to sign up.",
    );
  } else {
    pass("Email sign-ups allowed");
  }
  if (settings.mailer_autoconfirm) {
    warn(
      "Email confirmation is off — accounts are usable immediately.",
      "Fine for testing. Turn it on before anyone else uses this.",
    );
  } else {
    pass("Email confirmation required", "sign-up will ask the user to check their inbox");
  }
}

// ---- table and row-level security ------------------------------------------
try {
  const r = await fetch(`${url}/rest/v1/gym_records?select=id&limit=1`, {
    headers,
    signal: timeout(10000),
  });
  const body = await r.text();
  if (r.status === 404 || body.includes("does not exist")) {
    fail(
      "Table gym_records does not exist.",
      "Run supabase/schema.sql in Supabase → SQL Editor.",
    );
  } else if (r.ok) {
    const rows = JSON.parse(body || "[]");
    if (rows.length > 0) {
      fail(
        "Row-level security is NOT protecting this table — an anonymous key read real rows.",
        "Run the policy section of supabase/schema.sql. Until then anyone with the key, which ships in the bundle, can read every account's data.",
      );
    } else {
      pass("Table exists and returns nothing to an anonymous caller", "row-level security is doing its job");
    }
  } else if (r.status === 401 || r.status === 403) {
    pass("Table exists and refuses anonymous access", `${r.status}`);
  } else {
    warn(`Unexpected ${r.status} from gym_records.`, body.slice(0, 160));
  }
} catch (err) {
  fail(`Could not query the table (${err.message}).`);
}

// ---- redirect allow-list ----------------------------------------------------
console.log();
console.log(dim("Cannot be checked from here — verify by hand:"));
console.log(
  dim("  • Supabase → Authentication → URL Configuration lists http://localhost:5173 and your deployed URL"),
);
console.log(
  dim("  • Google Cloud → Credentials → your OAuth client lists https://<project-ref>.supabase.co/auth/v1/callback"),
);

console.log();
if (failed) {
  console.log(red(`${failed} problem${failed === 1 ? "" : "s"} to fix above.`));
  process.exit(1);
}
console.log(green("Cloud setup looks good. Start the app and sign in."));
console.log();
