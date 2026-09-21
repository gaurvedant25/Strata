import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * A Capacitor build ships every asset inside the APK, so the service worker has
 * nothing left to fetch and would only risk serving a stale bundle after an
 * app update. The web build keeps it — that is where it earns its place.
 */
const native = process.env.CAP_BUILD === "1";

export default defineConfig({
  // relative base so a build also works from a sub-path (GitHub Pages project sites)
  base: "./",
  // honour PORT so the harness can assign a free port instead of colliding on 5173
  // host: bind the LAN interface too, so a phone on the same wifi can open the
  // dev server and get hot reload without an APK being rebuilt and installed
  server: { port: Number(process.env.PORT) || 5173, host: true },
  preview: { port: Number(process.env.PORT) || 4173 },
  plugins: [
    react(),
    tailwindcss(),
    ...(native ? [] : [VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      workbox: {
        // webp is the exercise thumbnails. All ninety-seven of them come to
        // 251 KB, which is worth precaching rather than fetching on demand:
        // the one place this app is used is a gym, and a gym is where the
        // signal is worst.
        globPatterns: ["**/*.{js,css,html,svg,png,webp,woff2}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: "Gym Log",
        short_name: "Gym Log",
        description: "Offline workout tracker. Your data never leaves the device.",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    })]),
  ],
});
