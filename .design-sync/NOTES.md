# design-sync notes — Gym Log

## What this repo is (and isn't)

This is a **Vite PWA app**, not a component library. There is no library build,
no `exports`/`main` in `package.json`, and `tsconfig.app.json` sets
`"noEmit": true`, so no `.d.ts` tree is ever produced. Two consequences shape
the whole config:

- **The entry is a hand-written barrel**, `.design-sync/ds-entry.tsx`, passed via
  `--entry`. Without it the converter falls into synth-entry mode and
  `export *`s every source file, dragging `recharts`, `idb`, the store, and all
  six screens into the bundle. With the barrel the bundle is ~16 KB.
- **Every `<Name>Props` is hand-written** in `cfg.dtsPropsFor`. Auto-extraction
  yields `[key: string]: unknown` for all 11 components because there are no
  declarations to read. See "Re-sync risks" — this is the main staleness hazard.

## Scope

Synced (11): Button, Card, DashCard, IconButton, Screen, Sheet, Field, Empty,
Stat, BodyMap, Heatmap. Plus the `inputCls` string export.

Deliberately excluded, all via the barrel:
- `src/screens/*` — full pages, and they need StoreProvider + IndexedDB to render.
- `ExercisePicker` — calls `useStore()`, so it cannot render outside the app shell.
- `src/components/icons.tsx` — 15 single-path SVG glyphs; low value as cards.
  They stay importable through the components that use them.

## The compiled-CSS trap (most important gotcha)

`cfg.cssEntry` points at **the app's own compiled Tailwind v4 output**, so the
stylesheet contains *only the utility classes the app actually uses*. A perfectly
valid Tailwind class that no app file references is simply absent, and applying
it silently does nothing — no error, just unstyled output.

Confirmed missing at time of writing: `p-4`, `p-5` (the app uses `px-`/`py-`
pairs), `text-3xl`, `text-[28px]`, `bg-ink` (only `bg-ink/85` and `bg-ink/95`
exist), `bg-black`, and arbitrary values like `h-[104px]`.

Two real preview bugs came from this — `h-[104px]` collapsed DashCard's Tappable
tile to a thin bar, and `p-4`/`p-5`/`text-3xl` left its stat tiles unpadded with
undersized numerals. Both are fixed; previews now use inline styles or verified
classes.

**Run `node .design-sync/check-preview-classes.mjs` after any preview edit or app
CSS change.** It reports every class used in `previews/` that isn't in the built
stylesheet. It expects `ds-bundle/` to exist (build first).

## Build chain

`cfg.buildCmd` is `npm run build && node .design-sync/prep.mjs`. Vite emits the
stylesheet as `dist/assets/index-<hash>.css` and the hash changes every build,
but `cssEntry` needs one fixed path — `prep.mjs` copies the newest compiled CSS
to `.design-sync/.cache/ds-styles.css`. **The build must run before the
converter**, or `cssEntry` points at a stale or missing file.

Converter invocation (note the explicit `--entry`):

```sh
node .ds-sync/package-build.mjs --config .design-sync/config.json \
  --node-modules ./node_modules --entry ./.design-sync/ds-entry.tsx --out ./ds-bundle
```

## Headless rendering

There is no playwright browser cache on this machine, and installing chromium is
a ~200 MB download. System Chrome is present, so every validate/capture run was
done with:

```sh
DS_CHROMIUM_PATH="/c/Program Files/Google/Chrome/Application/chrome.exe"
```

Only the `playwright` npm package is installed in `.ds-sync/` (with
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`). If Chrome moves or is uninstalled, either
fix that path or run `npx playwright install chromium`.

## Overrides

- `Sheet` → `{"cardMode": "single", "primaryStory": "LogBodyWeight", "viewport": "420x520"}`.
  It's a `position: fixed` overlay that returns `null` when closed, so it escapes
  grid cells; validate flags `[GRID_OVERFLOW]` without this.

## Known render warns

None. Validate currently exits 0 with zero warnings — if a re-sync prints any
warn line, it is new; investigate rather than assuming it's expected.

## Re-sync risks

- **`cfg.dtsPropsFor` is hand-maintained and can silently rot.** Nothing checks
  it against the source, because there are no declarations to check against. If
  a component's props change in `src/components/`, the `.d.ts` the design agent
  codes against will be wrong until someone edits the config. Re-read
  `src/components/ui.tsx`, `BodyMap.tsx`, and `Heatmap.tsx` against the
  `dtsPropsFor` entries on any re-sync that follows component changes.
- **The barrel is hand-maintained too.** New components in `src/components/`
  won't appear until added to `.design-sync/ds-entry.tsx` *and*
  `cfg.componentSrcMap`.
- **CSS coupling to app usage** (see the trap above). Refactoring the app can
  delete a class the previews depend on. The checker script catches this; nothing
  else will.
- **`prep.mjs` picks the newest `dist/assets/*.css` by mtime.** If the Vite build
  ever emits more than one stylesheet, it may grab the wrong one.
- **Preview data is inlined.** BodyMap scores, Heatmap cadences, and all copy in
  `previews/*.tsx` are literals; they don't track the real app's data shapes.
  If `MuscleScore`/`MuscleGroup` in `src/lib/strength.ts` change, the BodyMap
  preview and its `dtsPropsFor` entry both need updating.
- **Verified against system Chrome, not pinned chromium.** Rendering could differ
  slightly from the product's own environment.
