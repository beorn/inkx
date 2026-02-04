/**
 * Playwright reporter that outputs TAP format.
 *
 * Converts Playwright test results to TAP (Test Anything Protocol) for
 * unified test orchestration with other TAP producers.
 *
 * Configure in playwright.config.ts:
 *   reporter: [['@beorn/tap/producers/playwright']]
 *
 * Output format:
 * - TAP version 14
 * - Plan line (1..N)
 * - ok/not ok lines with timing
 * - YAML diagnostic blocks for failures
 * - SKIP directive for skipped tests
 */

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter"

export default class TapReporter implements Reporter {
  private count = 0
  private total = 0

  onBegin(_config: FullConfig, suite: Suite): void {
    this.total = suite.allTests().length
    console.log("TAP version 14")
    console.log(`1..${this.total}`)
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.count++
    const status = result.status === "passed" ? "ok" : "not ok"
    const timeComment = `# time=${result.duration}ms`

    if (result.status === "skipped") {
      console.log(`ok ${this.count} - ${test.title} # SKIP`)
      return
    }

    console.log(`${status} ${this.count} - ${test.title} ${timeComment}`)

    if (result.status === "failed" && result.error) {
      console.log("  ---")
      console.log(
        `  message: ${result.error.message?.split("\n")[0] ?? "Test failed"}`,
      )
      if (test.location) {
        console.log("  at:")
        console.log(`    file: ${test.location.file}`)
        console.log(`    line: ${test.location.line}`)
      }
      console.log("  ...")
    }
  }

  onEnd(_result: FullResult): void {
    // Plan already written in onBegin
  }
}
