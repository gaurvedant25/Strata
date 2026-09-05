import { StrictMode, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth";
import { ConfirmProvider } from "./components/confirm";
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
        <App />
      </ConfirmProvider>
    </AuthProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <Shell />
    </StoreProvider>
  </StrictMode>,
);
