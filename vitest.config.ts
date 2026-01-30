import { createVitestConfig } from "./packages/km-infra/vitest/index.ts"
import { mdtest } from "@beorn/mdtest/vitest-plugin"

export default createVitestConfig({
  plugins: [mdtest()],
  test: {
    // Default reporter: standard dot reporter
    // Custom reporter available via test:fast2 (see infra/vitest-dotz/)
    //reporters: ["dot"],
    // Enable location info (line/column) for test cases in reporters
    includeTaskLocation: true,
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
