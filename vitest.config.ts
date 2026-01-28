import { createVitestConfig } from "./packages/km-infra/vitest/index.ts"
import { mdtest } from "./vendor/beorn-mdtest/src/integrations/vitest-plugin"

export default createVitestConfig({
  plugins: [mdtest()],
  test: {
    // Custom reporter: colored dots + slow test tracking (see infra/vitest-reporter/)
    // Uses @beorn/term for terminal styling
    reporters: ["./infra/vitest-reporter/index.tsx"],
    // Reporters configured via CLI flags (see package.json scripts)
    // Use test:fast:html or test:all:html for HTML reports and performance tracking
    outputFile: {
      html: "./test-results/vitest-report.html",
      junit: "./test-results/junit.xml",
    },
    // Override default maxWorkers (root-only config)
    maxWorkers: process.env.VITEST_MAX_WORKERS
      ? Number.parseInt(process.env.VITEST_MAX_WORKERS)
      : 20,
  },
})
