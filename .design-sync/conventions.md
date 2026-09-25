# Strata UI kit — how to build with it

A monochrome, phone-first component kit extracted from the Strata PWA. Pure
black ground, near-black panels, white as the only accent. No color beyond
greyscale except two semantic reds/ambers used sparingly for destructive and
warning states.

## Setup

No provider or theme wrapper is required — all eleven components are
presentational and render correctly on their own. Two things do matter:

1. **Load `styles.css`.** It `@import`s `_ds_bundle.css`, which carries both the
   design tokens and every component style. Without it the components render
   as unstyled boxes.
2. **Put them on a black ground.** The kit is designed for a `#000` page. There
   is no `bg-ink` utility class (see the warning below) — set the page
   background with the token directly:

```jsx
<div style={{ background: "var(--color-ink)", minHeight: "100vh" }}>
  {/* components go here */}
</div>
```

## ⚠️ The one rule that will bite you

**The shipped stylesheet is the app's own compiled Tailwind v4 output, so it
contains only the utility classes the source app actually uses.** A class that
is valid Tailwind but unused by the app is simply not in the CSS, and applying
it silently does nothing.

Known gaps to avoid: `p-4`, `p-5` (the app uses `px-`/`py-` pairs, never the
shorthand), `text-3xl`, `text-[28px]`, `bg-ink`, `bg-black`, and any
arbitrary-value class such as `h-[104px]`.

When you need something outside the vocabulary below, use an **inline style** or
a `var(--color-*)` token. Both always work.

## Vocabulary (verified present in the shipped CSS)

**Color tokens** — `--color-ink` (#000 page), `--color-panel` (card surface),
`--color-panel2` (nested chips/inputs), `--color-faint` (inert dots, ring
tracks), `--color-line` (dividers/borders), `--color-muted` (secondary text),
`--color-accent` (#fff, primary), `--color-accentdim`, plus `--font-sans`.

| Purpose | Classes |
|---|---|
| Surfaces | `bg-panel` `bg-panel2` `bg-faint` `bg-accent` `bg-white` |
| Text | `text-white` `text-muted` `text-accent` `text-ink` (black-on-white) |
| Borders | `border-line` |
| Radii | `rounded-xl` `rounded-2xl` `rounded-full` |
| Padding | `p-3`, `px-1`–`px-6`, `py-1` `py-2` `py-3` `py-4` `py-6` `py-8` `py-10` |
| Gaps | `gap-1` `gap-2` `gap-3`, `space-y-2`–`space-y-6` |
| Type sizes | `text-sm` `text-base` `text-lg` `text-xl` `text-2xl`, and the exact set `text-[10px]` `[11px]` `[12px]` `[13px]` `[14px]` `[15px]` `[17px]` `[22px]` `[26px]` `[32px]` |

House habits worth copying: numerals use `tabular-nums` so they don't jitter;
labels are `text-[11px] uppercase tracking-wide text-muted`; body copy is
`text-[15px]`; secondary lines are `text-[12px] text-muted`.

## Where the truth lives

Read `styles.css` and the `_ds_bundle.css` it imports for the real token values
and the full class list. Each component has a `<Name>.prompt.md` next to it with
its exact props — trust those over any summary here.

## Idiomatic example

Library components for the controls; the vocabulary above for your own layout.

```jsx
const { Screen, Card, Stat, Button } = window.GymUI;

<Screen title="Progress" subtitle="Every number comes from your own logs">
  <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
    <Stat label="Workouts" value="22" sub="all time" />
    <Stat label="Volume" value="33k" sub="kg" />
    <Stat label="Exercises" value="4" sub="tracked" />
  </div>

  <Card className="px-4 py-3" >
    <p className="text-[15px] font-medium">Barbell Bench Press</p>
    <p className="mt-0.5 text-[12px] text-muted">Best 93.3 kg est. 1RM</p>
  </Card>

  <Button size="lg" className="w-full">Start empty workout</Button>
</Screen>
```

## Component notes

- **Screen** is the page frame (sticky blurred header + padded body); one per screen.
- **Sheet** is a fixed-position bottom sheet — it covers the viewport and returns
  `null` when `open` is false.
- **Card** vs **DashCard**: same surface, DashCard is the larger-radius bento tile
  and is tappable as a whole via `onClick`.
- **IconButton** takes a numeric `size` (not a variant) and `tone="muted" | "light"`.
- **BodyMap** and **Heatmap** are data-driven visuals: BodyMap lights regions by a
  0–1 score, Heatmap lights days present in an `activeDates` set.
- `inputCls` is an exported class **string**, not a component — spread it onto a
  plain `<input>`, usually inside a `Field`.
