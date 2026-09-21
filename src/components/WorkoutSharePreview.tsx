import type { WorkoutData } from "../lib/card/types";
import { ShareCardEditor } from "./ShareCardEditor";

export function WorkoutSharePreview({ data, onClose, onUnlock }: { onUnlock?: () => void; data: WorkoutData; onClose: () => void }) {
  return <ShareCardEditor subject="workout" data={data} onClose={onClose} onUnlock={onUnlock} />;
}
