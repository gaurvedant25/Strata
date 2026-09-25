import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The Android wrapper around the same `dist` the web build produces. The app is
 * local-first already — IndexedDB, no server needed to train — so the APK is a
 * WebView pointed at bundled assets rather than at anything hosted.
 */
const config: CapacitorConfig = {
  appId: "com.vedant.strata",
  appName: "Strata",
  webDir: "dist",
  android: {
    // The screen is black end to end; a white flash on launch would be the only
    // light the app ever shows.
    backgroundColor: "#000000",
  },
};

export default config;
