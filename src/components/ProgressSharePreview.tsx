import type { LiftData } from "../lib/card/types";
import { ShareCardEditor } from "./ShareCardEditor";

export function ProgressSharePreview({ data, onClose, onUnlock }: { onUnlock?: () => void; data: LiftData; onClose: () => void }) {
  return <ShareCardEditor subject="lift" data={data} onClose={onClose} onUnlock={onUnlock} />;
}
