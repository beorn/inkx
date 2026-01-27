import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Include all TypeScript test files
    include: [
      "packages/**/*.test.ts",
      "packages/**/*.spec.ts",
      "apps/**/*.test.ts",
      "apps/**/*.spec.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // Handle .test.md files with mdtest loader
    alias: {
      "@km/core": new URL("./packages/km-core/src/index.ts", import.meta.url)
        .pathname,
      "@km/tree": new URL("./packages/km-tree/src/index.ts", import.meta.url)
        .pathname,
      "@km/storage": new URL(
        "./packages/km-storage/src/index.ts",
        import.meta.url,
      ).pathname,
      "@km/board": new URL("./packages/km-board/src/index.ts", import.meta.url)
        .pathname,
      "@beorn/tap": new URL("./vendor/beorn-tap/src/index.ts", import.meta.url)
        .pathname,
    },
  },
})
