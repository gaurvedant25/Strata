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

## Data & storage notes

- Nothing is ever uploaded. There are no accounts and no network requests after the initial load.
- Data lives in IndexedDB, scoped to that browser on that device. Clearing site data, deleting the
  installed app, or switching browsers loses it — export a backup from Settings periodically.
- iOS evicts storage for *websites* left unused for 7 days, but **installed** home-screen PWAs are
  exempt. Install it rather than using it from a Safari tab.
