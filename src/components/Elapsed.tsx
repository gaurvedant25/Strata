import { sessionElapsed } from "../lib/stats";
import { useNow } from "../lib/useNow";
import { fmtDuration } from "../lib/util";
import type { Session } from "../types";

/**
 * A workout's running time, and the only thing that re-renders as it runs.
 *
 * Its own component so the second-by-second tick stops here: the pill and the
 * logger's header each draw one, and neither the app around the pill nor the
 * logger around its header has to render every second to keep it moving.
 */
export function Elapsed({ session }: { session: Session }) {
  const now = useNow(1000);
  return <>{fmtDuration(sessionElapsed(session, now))}</>;
}
