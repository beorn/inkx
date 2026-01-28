/**
 * Custom Vitest Reporter
 *
 * WHY: Vitest's built-in dot reporter has a bug where it outputs empty ANSI
 * color sequences (yellow-reset codes with no content) between dots. This
 * creates visual artifacts in terminal output. The bug is in formatTests():
 *
 *   let currentIcon = pending  // yellow, count = 0
 *   for (const state of states) {
 *     if (currentIcon === icon) { count++; continue }
 *     output += currentIcon.color(currentIcon.char.repeat(count))  // BUG: count=0 on first iteration
 *     ...
 *   }
 *
 * When the first test passes (green), it outputs c.yellow("") which produces
 * ^[[33m^[[39m (yellow-reset) escape sequences.
 *
 * FEATURES:
 * - Clean dot output (no color sequences at all)
 * - Test performance tracking per-test
 * - Slow test detection and reporting (configurable threshold)
 * - JSON export for performance trending over time
 *
 * RELATED:
 * - km-test-perf bead
 * - docs/future/monorepo-infra.md
 */

import type { Reporter, TestCase, TestModule, Vitest } from "vitest/node"

interface TestTiming {
  name: string
  file: string
  duration: number
}

interface ReporterOptions {
  /** Threshold in ms for "slow" tests (default: 100) */
  slowThreshold?: number
  /** Output performance JSON to file */
  perfOutput?: string
  /** Show individual slow tests in summary */
  showSlow?: boolean
}

export class KmReporter implements Reporter {
  private ctx!: Vitest
  private options: Required<ReporterOptions>
  private timings: TestTiming[] = []
  private passed = 0
  private failed = 0
  private skipped = 0
  private dotBuffer = ""
  private startTime = 0

  constructor(options: ReporterOptions = {}) {
    this.options = {
      slowThreshold: options.slowThreshold ?? 100,
      perfOutput: options.perfOutput ?? "",
      showSlow: options.showSlow ?? true,
    }
  }

  onInit(ctx: Vitest) {
    this.ctx = ctx
    this.timings = []
    this.passed = 0
    this.failed = 0
    this.skipped = 0
    this.dotBuffer = ""
    this.startTime = Date.now()
  }

  onTestCaseResult(testCase: TestCase) {
    const result = testCase.result()
    if (!result) return

    // Duration is in diagnostic(), not result()
    const diagnostic = testCase.diagnostic()
    const duration = diagnostic.duration ?? 0
    const state = result.state

    // Track timing
    const moduleId = (testCase.module as { moduleId?: string }).moduleId ?? "unknown"
    this.timings.push({
      name: testCase.name,
      file: moduleId,
      duration,
    })

    // Update counts and emit dot
    if (state === "passed") {
      this.passed++
      this.dotBuffer += "·"
    } else if (state === "failed") {
      this.failed++
      this.dotBuffer += "x"
    } else if (state === "skipped") {
      this.skipped++
      this.dotBuffer += "-"
    }

    // Flush dots periodically for streaming output
    if (this.dotBuffer.length >= 80) {
      this.flushDots()
    }
  }

  onTestModuleEnd(_testModule: TestModule) {
    // Could emit newline per file if desired
  }

  onTestRunEnd() {
    this.flushDots()

    const total = this.passed + this.failed + this.skipped
    const elapsed = Date.now() - this.startTime
    const testDuration = this.timings.reduce((sum, t) => sum + t.duration, 0)

    // Summary
    this.ctx.logger.log("")
    this.ctx.logger.log("")

    if (this.failed > 0) {
      this.ctx.logger.log(`Tests: ${this.failed} failed, ${this.passed} passed, ${total} total`)
    } else {
      this.ctx.logger.log(`Tests: ${this.passed} passed${this.skipped ? `, ${this.skipped} skipped` : ""}, ${total} total`)
    }
    this.ctx.logger.log(`Time:  ${this.formatDuration(elapsed)} (test time: ${this.formatDuration(testDuration)})`)

    // Slow tests report
    if (this.options.showSlow) {
      const slow = this.timings
        .filter((t) => t.duration >= this.options.slowThreshold)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 10)

      if (slow.length > 0) {
        this.ctx.logger.log("")
        this.ctx.logger.log(`Slow tests (>${this.options.slowThreshold}ms):`)
        for (const t of slow) {
          const file = t.file.replace(process.cwd() + "/", "")
          this.ctx.logger.log(`  ${this.formatDuration(t.duration).padStart(8)} ${file} > ${t.name}`)
        }
      }
    }

    // Export performance data
    if (this.options.perfOutput) {
      this.exportPerformance()
    }
  }

  private flushDots() {
    if (this.dotBuffer) {
      // Write directly without colors - avoiding the vitest bug
      process.stdout.write(this.dotBuffer)
      this.dotBuffer = ""
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  private exportPerformance() {
    const data = {
      timestamp: new Date().toISOString(),
      summary: {
        passed: this.passed,
        failed: this.failed,
        skipped: this.skipped,
        elapsed: Date.now() - this.startTime,
        testDuration: this.timings.reduce((sum, t) => sum + t.duration, 0),
      },
      slowTests: this.timings
        .filter((t) => t.duration >= this.options.slowThreshold)
        .sort((a, b) => b.duration - a.duration),
      allTests: this.timings,
    }

    const fs = require("fs")
    fs.writeFileSync(this.options.perfOutput, JSON.stringify(data, null, 2))
  }
}

export default KmReporter
