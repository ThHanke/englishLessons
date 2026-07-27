import { defineConfig } from "vitest/config";

/** Default environment stays 'node' (matches the existing server/CLI test suite);
 * jsdom is scoped only to the web frontend under src/companion/web/**. `esbuild.jsx: 'automatic'`
 * so .tsx files transform without a `React` import in scope (esbuild's own default is
 * 'transform', which expects a global `React` — vitest doesn't run Vite's React plugin, which is
 * what normally sets this at build time). */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    environmentMatchGlobs: [["src/companion/web/**", "jsdom"]],
    setupFiles: ["src/companion/web/vitest.setup.ts"],
  },
});
