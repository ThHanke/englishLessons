import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["src/companion/web/vitest.setup.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      ".trunk/**",
      ".playwright-mcp/**",
    ],
  },
});
