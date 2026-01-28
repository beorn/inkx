import { defineConfig } from "vitest/config"
import { availableParallelism } from "node:os"
import tsconfigPaths from "vite-tsconfig-paths"
import { mdtest } from "./vendor/beorn-mdtest/src/integrations/vitest-plugin"

export default defineConfig({
  plugins: [tsconfigPaths(), mdtest()],
  resolve: {
    alias: {
      // mdtest plugin transforms .test.md files to import this
      "@beorn/mdtest/vitest": new URL(
        "./vendor/beorn-mdtest/src/integrations/vitest.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    // Force certain packages to be bundled in SSR to avoid import issues
    server: {
      deps: {
        inline: ["zod"],
      },
    },
    // Vitest tests - vendor uses bun:test so excluded
    include: [
      "packages/**/tests/**/*.{test,spec}.{ts,tsx}",
      "apps/**/tests/**/*.{test,spec}.{ts,tsx}",
      "tests/**/*.test.ts",
      "**/*.test.md",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.direnv/**"],

    // Worker configuration for parallel test execution
    maxWorkers: process.env.VITEST_MAX_WORKERS
      ? Number.parseInt(process.env.VITEST_MAX_WORKERS)
      : Math.max(availableParallelism() - 1, 1),
    minWorkers: 1,
    fileParallelism: true,

    // Multiple reporters for CI integration
    reporters: ["tap", "html", "junit"],
    outputFile: {
      html: "./test-results/vitest-report.html",
      junit: "./test-results/junit.xml",
    },
    // Other aliases resolved automatically by vite-tsconfig-paths plugin
  },
})
