# Gym Log

An offline-first workout tracker that installs to your phone's home screen as a PWA — no App Store,
no developer fee, no account, no server. Every workout is stored in IndexedDB **on the device**.

## Features

- **Workout logging** — start empty or from a routine, log sets with weight/reps, tick each one off.
  Every exercise shows what you did last time so you know what to beat.
- **Routines** — save your split (Push/Pull/Legs seeded by default), start a session pre-filled.
- **Progress** — per-exercise charts of estimated 1RM, top set and volume, plus PR badges (🏆 appears
  live when a set beats your best) and a body-weight trend.
- **Rest timer** — auto-starts when you tick a working set; vibrates and beeps when it ends.
- **Backup** — export/import a JSON file from Settings. This is your only backup, so use it.

## Develop

```bash
npm install
npm run dev
```

`npm run icons` regenerates the icon set in `public/` (pure Node, no image dependencies).

## Build

```bash
npm run build
```

Outputs a fully static site to `dist/` — HTML, JS, CSS, a web manifest and a Workbox service worker
that precaches everything. There is no backend.

## Deploy (free)

The build is static, so any of these work at no cost:

- **Netlify / Vercel / Cloudflare Pages** — drag `dist/` onto the dashboard, or connect the repo.
- **GitHub Pages** — push `dist/` to a `gh-pages` branch. `base` is `./` so sub-paths work.

HTTPS is required for service workers (all of the above provide it automatically). `localhost` is
also treated as secure, so you can test installs on your own machine.

## Install on a phone

**iPhone/iPad (Safari — it must be Safari, not Chrome):** open the URL → Share → *Add to Home
Screen*. It then launches fullscreen with no browser UI and runs offline.

**Android (Chrome):** open the URL → menu → *Install app* / *Add to home screen*.

After the first load the service worker has cached the whole app, so it opens in airplane mode.

## Accounts and sync (optional)

Out of the box this app has no accounts and no server: it runs on IndexedDB and
never makes a network request after loading. Point it at a Supabase project and
it additionally keeps every record in your account, so a lost phone or a cleared
browser is no longer a lost training history.

The device stays the source of truth. Screens always read local storage and
never wait on the network, so the app works in a gym with no signal exactly as
it did before; sync is a background reconciliation on top. Conflicts are
resolved last-write-wins by timestamp, which is the right trade for one person
on two devices but can lose an edit if the same record is changed on both while
both are offline.

### Setting it up

1. Create a project at [supabase.com](https://supabase.com) (the free tier is
   ample — this stores a few hundred KB per user).
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the project's SQL editor.
   It creates one table and, critically, the row-level security policy that
   stops one account reading another's.
3. Create a Google OAuth client at
   [console.cloud.google.com](https://console.cloud.google.com/apis/credentials):
   *Create credentials → OAuth client ID → Web application*. Under **Authorised
   redirect URIs** add your project's callback:

   ```
   https://REF.supabase.co/auth/v1/callback
   ```

   Substitute `REF` for your own project reference — the subdomain of the
   Project URL in step 6, also shown as *Reference ID* under Project Settings →
   General. Google rejects the URI outright if any placeholder punctuation is
   left in it, and reports only "the attempted action failed".

   Leave *Authorised JavaScript origins* empty: Supabase performs the exchange
   itself, so the redirect URI is the only entry needed.
4. In Supabase, *Authentication → Providers → Google*, paste the client ID and
   secret from step 3 and enable it.
5. In Supabase, *Authentication → URL Configuration*, add the URL you deploy to
   (and `http://localhost:5173` for development) to the redirect allow-list.
6. Copy `.env.example` to `.env.local` and fill in the project URL and anon key
   from *Project Settings → Data API*.

Then check it:

```bash
npm run check:cloud
```

That verifies the project is reachable, the key is the right one, the table
exists, row-level security is actually on, and the Google provider is enabled —
each of which fails silently in its own way and surfaces in the app as one
unhelpful "could not sign in".

Both values are public by design and safe in the bundle: row-level security
means the anon key on its own can read nobody's data.

Leave `.env.local` out and none of the above applies — no sign-in screen, no
network, exactly the local-only app described below.

## Data & storage notes

- With no Supabase project configured, nothing is ever uploaded: no accounts, and no network
  requests after the initial load. Signed in, records are mirrored to your account and nowhere
  else.
- Data lives in IndexedDB, scoped to that browser on that device. Clearing site data, deleting the
  installed app, or switching browsers loses it — export a backup from Settings periodically.
- iOS evicts storage for *websites* left unused for 7 days, but **installed** home-screen PWAs are
  exempt. Install it rather than using it from a Safari tab.

## Credits

The anatomical muscle artwork on the Strength screen is adapted from
[react-native-body-highlighter](https://github.com/HichamELBSI/react-native-body-highlighter)
(MIT © 2022 ELABBASSI Hicham). The path data lives in `src/lib/anatomy/`, each
file carrying the upstream copyright and licence notice.
