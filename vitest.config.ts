import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    setupFiles: ["src/companion/web/vitest.setup.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      ".trunk/**",
      ".playwright-mcp/**",
      ".claude/worktrees/**",
    ],
  },
});
