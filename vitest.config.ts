import { defineConfig } from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"
import { mdtest } from "./vendor/beorn-mdtest/src/integrations/vitest-plugin"

export default defineConfig({
  plugins: [tsconfigPaths(), mdtest()],
  test: {
    // Custom reporter: colored dots + slow test tracking (see infra/vitest-reporter.ts)
    // CLI flag --reporter=./infra/vitest-reporter.ts overrides when specified
    reporters: ["./infra/vitest-reporter.ts"],
    // Test quality enforcement - fail on any console output
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

    // Benchmark configuration
    benchmark: {
      include: ["**/*.bench.{ts,tsx}"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/vendor/**",
        "**/.direnv/**",
      ],
    },

    // Worker configuration for parallel test execution
    // Default to 20 workers - override with VITEST_MAX_WORKERS env var
    maxWorkers: process.env.VITEST_MAX_WORKERS
      ? Number.parseInt(process.env.VITEST_MAX_WORKERS)
      : 20,
    minWorkers: 1,
    fileParallelism: true,

    // Reporters configured via CLI flags (see package.json scripts)
    // Use test:fast:html or test:all:html for HTML reports and performance tracking
    outputFile: {
      html: "./test-results/vitest-report.html",
      junit: "./test-results/junit.xml",
    },
    // Other aliases resolved automatically by vite-tsconfig-paths plugin
  },
})
