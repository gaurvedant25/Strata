// First: moves anything this device saved under the app's old name.
import "./lib/legacyStorage";
import { StrictMode, Suspense, lazy, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth";
import { ConfirmProvider } from "./components/confirm";
import { EntitlementProvider } from "./lib/useEntitlement";
import "./index.css";
import { StoreProvider, useStore } from "./store";

/**
 * Sync writes straight into IndexedDB, underneath the store's own state, so
 * the store has to be told to re-read once a reconciliation lands.
 */
function Shell() {
  const s = useStore();
  const reload = useRef(s.reload);
  reload.current = s.reload;
  const onSynced = useCallback(() => void reload.current(), []);
  return (
    <AuthProvider onSynced={onSynced}>
      <ConfirmProvider>
        <EntitlementProvider>
          <App />
        </EntitlementProvider>
      </ConfirmProvider>
    </AuthProvider>
  );
}

const DesignPreview = import.meta.env.DEV && new URLSearchParams(location.search).has("share-preview")
  ? lazy(() => import("./dev/SharePreview")) : null;
const StreakPreview = import.meta.env.DEV && new URLSearchParams(location.search).has("streak-preview")
  ? lazy(() => import("./dev/StreakPreview")) : null;
const WorkoutPreview = import.meta.env.DEV && new URLSearchParams(location.search).has("workout-share-preview")
  ? lazy(() => import("./dev/WorkoutSharePreview")) : null;
const RankingPreview = import.meta.env.DEV && new URLSearchParams(location.search).has("ranking-preview")
  ? lazy(() => import("./dev/RankingGuidePreview")) : null;
const Preview = WorkoutPreview ?? DesignPreview ?? StreakPreview ?? RankingPreview;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {Preview ? <Suspense fallback={<p>Loading preview…</p>}><Preview /></Suspense> : <StoreProvider>
      <Shell />
    </StoreProvider>}
  </StrictMode>,
);
