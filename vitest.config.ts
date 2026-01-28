import { defineConfig } from "vitest/config"
import { availableParallelism } from "node:os"

export default defineConfig({
  test: {
    // All packages now use Vitest (migration complete)
    include: [
      "packages/*/tests/**/*.test.ts",
      "packages/*/tests/**/*.spec.ts",
      "packages/*/tests/**/*.test.md",
      "apps/*/tests/**/*.test.ts",
      "apps/*/tests/**/*.spec.ts",
      "apps/*/tests/**/*.test.md",
      "apps/*/tests/**/*.test.tsx",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],

    // Worker configuration for parallel test execution
    // Note: Vitest runs in Bun runtime via `bun vitest` but uses Node's worker_threads
    // under the hood. This is different from km-storage which uses Bun's native Worker API.
    maxWorkers: process.env.VITEST_MAX_WORKERS
      ? Number.parseInt(process.env.VITEST_MAX_WORKERS)
      : Math.max(availableParallelism() - 1, 1),
    minWorkers: 1,
    // Enable file-level parallelization for better suite distribution
    fileParallelism: true,

    // Multiple reporters for CI integration
    reporters: ["tap", "html", "junit"],
    outputFile: {
      html: "./test-results/vitest-report.html",
      junit: "./test-results/junit.xml",
    },
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
