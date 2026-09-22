import { isSeedId } from "./seed";
import type { Exercise } from "../types";

/**
 * The thumbnail for a library exercise, or nothing for one you created.
 *
 * No manifest to keep in step: a seeded exercise's id is `sx-` followed by the
 * slug of its name, and `scripts/exercise-art.py` writes each file under
 * exactly that slug. So the path is derivable, and `npm run check:art`
 * fails if the library and the folder ever disagree.
 *
 * An exercise somebody created themselves has a random id and no picture — there
 * is nowhere to fetch one from, and guessing by name would sooner or later put
 * a picture of the wrong lift beside it. Those rows show a mark instead.
 *
 * Relative to `BASE_URL`, because the app is built with a relative base so it
 * still works served from a sub-path.
 */
export function exerciseArt(exercise: Exercise): string | undefined {
  if (!isSeedId(exercise.id)) return undefined;
  return `${import.meta.env.BASE_URL}exercise/${exercise.id.slice(3)}.png`;
}
