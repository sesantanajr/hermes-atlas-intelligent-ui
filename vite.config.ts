import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const { version } = JSON.parse(readFileSync(here("./package.json"), "utf8"));

// The standalone app. It is written into the Python package so `hermes atlas serve` (and the
// optional wheel) can serve it without a copy step. The host bundles are built by scripts/build.mjs.
//
// `npm run dev` serves the app on :5173 against a backend on :7331 (`hermes atlas serve`), plus
// the harness pages that load the built host bundles: /harness/dashboard.html and
// /harness/desktop.html.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // ATLAS_STYLES is the Desktop extension's inlined stylesheet (scripts/build.mjs); empty here.
  define: { __ATLAS_VERSION__: JSON.stringify(version), ATLAS_STYLES: JSON.stringify("") },
  // Hermes Desktop provides this module at runtime; the Desktop harness provides it in development.
  resolve: command === "serve" && !process.env.VITEST
    ? { alias: { "@hermes/plugin-sdk": here("./harness/desktop-sdk.ts") } }
    : undefined,
  // Keep the page's Host: the backend refuses writes whose Origin differs from it.
  server: { proxy: { "/api": { target: "http://127.0.0.1:7331", changeOrigin: false } } },
  build: {
    outDir: "hermes_atlas/static",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (/[/\\]node_modules[/\\](react|react-dom|scheduler)[/\\]/.test(id)) return "react";
        },
      },
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // Tests get a double of the Desktop SDK that they can reconfigure.
    alias: { "@hermes/plugin-sdk": here("./src/host/testing/plugin-sdk.ts") },
  },
}));
