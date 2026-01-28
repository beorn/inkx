import { defineConfig } from "vitest/config"
import { availableParallelism } from "node:os"
import tsconfigPaths from "vite-tsconfig-paths"
import { mdtest } from "./vendor/beorn-mdtest/src/integrations/vitest-plugin"

export default defineConfig({
  plugins: [tsconfigPaths(), mdtest()],
  test: {
    // Test quality enforcement - fail on any console/stdout/stderr output
    setupFiles: ["./tests/vitest-setup.ts"],
    // Force certain packages to be bundled in SSR to avoid import issues
    server: {
      deps: {
        inline: ["zod"],
      },
    },
    // Vitest tests - vendor uses bun:test so excluded
    include: ["**/*.{test,spec}.{ts,tsx,md}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/vendor/**",
      "**/.direnv/**",
    ],

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
