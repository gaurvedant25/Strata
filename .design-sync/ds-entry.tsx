/**
 * design-sync entry barrel.
 *
 * This app has no library build, so the converter would otherwise synthesize an
 * entry that `export *`s every source file - pulling recharts, idb, the store,
 * and all six screens into the design-system bundle. This barrel pins the
 * synced surface to the reusable UI kit instead.
 *
 * Deliberately excluded:
 *  - screens/*      full pages, not design-system parts, and they require
 *                   StoreProvider + IndexedDB to render at all
 *  - ExercisePicker calls useStore(), so it can't render outside the app shell
 *  - icons.tsx      single-path SVG glyphs; they stay importable through the
 *                   components that use them, they just don't earn their own cards
 */
export {
  Button,
  Card,
  DashCard,
  IconButton,
  Screen,
  Sheet,
  Field,
  Empty,
  Stat,
  inputCls,
} from "../src/components/ui";

export { BodyMap } from "../src/components/BodyMap";
export { Heatmap } from "../src/components/Heatmap";
