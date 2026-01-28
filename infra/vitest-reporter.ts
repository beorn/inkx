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
 *     output += currentIcon.color(currentIcon.char.repeat(count))  // BUG: count=0
 *   }
 *
 * SYMBOLS:
 *   · (green)  = passed
 *   ● (yellow) = passed but slow (>threshold)
 *   x (red)    = failed
 *   ⠋ (cyan)   = running (animated spinner in TTY mode)
 *   * (yellow) = pending/queued
 *   - (gray)   = skipped
 *
 * FEATURES:
 * - Clean colored dot output (no empty color sequences)
 * - Animated spinner for running tests (TTY mode only)
 * - Slow test detection with different symbol
 * - Test performance tracking per-test
 * - Slow test summary at end (configurable threshold)
 * - JSON export for performance trending over time
 *
 * RELATED:
 * - km-test-perf bead
 * - docs/future/monorepo-infra.md
 */

import type { Reporter, TestCase, TestModule, TestSpecification, Vitest } from "vitest/node"

// ANSI color codes
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bgCyan: "\x1b[46m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
}

// ANSI cursor control
const cursor = {
  save: "\x1b7",
  restore: "\x1b8",
  hide: "\x1b[?25l",
  show: "\x1b[?25h",
  clearLine: "\x1b[2K",
  moveToColumn: (n: number) => `\x1b[${n}G`,
  moveLeft: (n: number) => `\x1b[${n}D`,
}

// Symbols
const sym = {
  pass: "·",
  fail: "x",
  skip: "-",
  pending: "*",
  slow: "●", // Filled dot for slow tests
  check: "✓",
  cross: "✗",
  pointer: "❯",
  dash: "⎯",
}

// Spinner frames for running tests (TTY only)
const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

interface TestTiming {
  name: string
  file: string
  duration: number
  state: "passed" | "failed" | "skipped"
}

interface ReporterOptions {
  /** Threshold in ms for "slow" tests (default: 100) */
  slowThreshold?: number
  /** Output performance JSON to file */
  perfOutput?: string
  /** Show individual slow tests in summary */
  showSlow?: boolean
  /** Max slow tests to show (default: 10) */
  maxSlow?: number
}

export class KmReporter implements Reporter {
  private ctx!: Vitest
  private options: Required<ReporterOptions>
  private timings: TestTiming[] = []
  private passed = 0
  private failed = 0
  private skipped = 0
  private startTime = 0
  private dotCount = 0

  // TTY-aware rendering for pending tests
  private isTTY = process.stdout.isTTY ?? false
  private testStates = new Map<string, "pending" | "passed" | "failed" | "skipped">()
  private testOrder: string[] = [] // Track order for rendering
  private finishedTests = new Set<string>()
  private columns = process.stdout.columns ?? 80

  // Animation for running tests (TTY only)
  private spinnerFrame = 0
  private spinnerInterval: NodeJS.Timeout | null = null
  private runningTests = new Set<string>() // Tests currently running (for animation)

  // Track slow tests for special display
  private slowTestIds = new Set<string>()

  constructor(options: ReporterOptions = {}) {
    this.options = {
      slowThreshold: options.slowThreshold ?? 100,
      perfOutput: options.perfOutput ?? "",
      showSlow: options.showSlow ?? true,
      maxSlow: options.maxSlow ?? 10,
    }
  }

  onInit(ctx: Vitest) {
    this.ctx = ctx
    this.reset()
  }

  private reset() {
    this.timings = []
    this.passed = 0
    this.failed = 0
    this.skipped = 0
    this.startTime = Date.now()
    this.dotCount = 0
    this.testStates.clear()
    this.testOrder = []
    this.finishedTests.clear()
    this.committedCount = 0
    this.spinnerFrame = 0
    this.runningTests.clear()
    this.slowTestIds.clear()
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval)
      this.spinnerInterval = null
    }
  }

  onTestRunStart(_specs: TestSpecification[]) {
    // Print header
    const version = this.ctx.version
    const cwd = process.cwd()
    process.stdout.write(`\n ${c.bold}${c.bgCyan} RUN ${c.reset} ${c.cyan}v${version}${c.reset} ${c.gray}${cwd}${c.reset}\n\n`)

    // Hide cursor and start animation for TTY
    if (this.isTTY) {
      process.stdout.write(cursor.hide)
      // Start spinner animation at 80ms interval (12.5 fps)
      this.spinnerInterval = setInterval(() => {
        this.spinnerFrame = (this.spinnerFrame + 1) % spinnerFrames.length
        if (this.runningTests.size > 0) {
          this.renderDots()
        }
      }, 80)
    }
  }

  onTestModuleCollected(module: TestModule) {
    // Mark all discovered tests as pending
    for (const test of module.children.allTests()) {
      this.onTestCaseReady(test)
    }
  }

  onTestCaseReady(testCase: TestCase) {
    const id = testCase.id
    if (this.finishedTests.has(id)) return
    if (this.testStates.has(id)) return // Already tracked

    this.testStates.set(id, "pending")
    this.testOrder.push(id)
    this.runningTests.add(id) // Track as running for animation

    // On TTY, render pending state; on non-TTY, wait for result
    if (this.isTTY) {
      this.renderDots()
    }
  }

  onTestCaseResult(testCase: TestCase) {
    const result = testCase.result()
    if (!result) return

    const id = testCase.id
    const diagnostic = testCase.diagnostic()
    const duration = diagnostic.duration ?? 0
    const state = result.state

    // Track timing
    const moduleId = (testCase.module as { moduleId?: string }).moduleId ?? "unknown"
    const testState = state === "passed" ? "passed" : state === "failed" ? "failed" : "skipped"

    this.timings.push({
      name: testCase.name,
      file: moduleId,
      duration,
      state: testState,
    })

    // Update counters
    if (state === "passed") this.passed++
    else if (state === "failed") this.failed++
    else if (state === "skipped") this.skipped++

    // Mark as finished and update state
    this.finishedTests.add(id)
    this.runningTests.delete(id) // No longer running
    this.testStates.set(id, testState)

    // Track slow tests for special display
    if (duration >= this.options.slowThreshold) {
      this.slowTestIds.add(id)
    }

    if (this.isTTY) {
      // TTY mode: re-render the dot line to show updated state
      this.renderDots()
    } else {
      // Non-TTY: emit dot immediately for streaming output
      const dot = this.formatDot(testState, id)
      process.stdout.write(dot)
      this.dotCount++
    }
  }

  private formatDot(state: "pending" | "passed" | "failed" | "skipped", id?: string): string {
    const isSlow = id ? this.slowTestIds.has(id) : false
    const isRunning = id ? this.runningTests.has(id) : false

    switch (state) {
      case "passed":
        // Slow passing tests get a filled dot in yellow
        if (isSlow) return `${c.yellow}${sym.slow}${c.reset}`
        return `${c.green}${sym.pass}${c.reset}`
      case "failed":
        return `${c.red}${sym.fail}${c.reset}`
      case "skipped":
        return `${c.dim}${c.gray}${sym.skip}${c.reset}`
      case "pending":
        // Animate running tests in TTY mode
        if (isRunning && this.isTTY) {
          const frame = spinnerFrames[this.spinnerFrame]
          return `${c.cyan}${frame}${c.reset}`
        }
        return `${c.yellow}${sym.pending}${c.reset}`
    }
  }

  private committedCount = 0 // Tests already printed in committed lines

  private renderDots() {
    // Only render uncommitted tests (current line)
    const uncommittedTests = this.testOrder.slice(this.committedCount)
    const dots = uncommittedTests.map((id) => {
      const state = this.testStates.get(id) ?? "pending"
      return this.formatDot(state, id)
    })

    // Check if we have a full line of finished tests to commit
    const finishedInCurrentLine = uncommittedTests.filter((id) =>
      this.finishedTests.has(id)
    ).length

    if (finishedInCurrentLine >= this.columns) {
      // Commit the full line and start fresh
      const lineToCommit = dots.slice(0, this.columns).join("")
      process.stdout.write(`\r${cursor.clearLine}${lineToCommit}\n`)
      this.committedCount += this.columns
      // Recursively render remaining
      if (uncommittedTests.length > this.columns) {
        this.renderDots()
      }
      return
    }

    // Update current line in place
    process.stdout.write(`\r${cursor.clearLine}${dots.join("")}`)
  }

  onTestModuleEnd(_testModule: TestModule) {
    // Optionally emit newline per file
  }

  onTestRunEnd() {
    const total = this.passed + this.failed + this.skipped
    const elapsed = Date.now() - this.startTime
    const testDuration = this.timings.reduce((sum, t) => sum + t.duration, 0)

    // Stop animation and show cursor again
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval)
      this.spinnerInterval = null
    }
    if (this.isTTY) {
      process.stdout.write(cursor.show)
    }

    // Blank line after dots
    process.stdout.write("\n\n")

    // Failed tests details (if any)
    if (this.failed > 0) {
      const failedTests = this.timings.filter(t => t.state === "failed")
      for (const t of failedTests) {
        const file = this.relativePath(t.file)
        process.stdout.write(` ${c.red}${c.bold}${sym.cross} FAIL${c.reset} ${file} ${c.gray}>${c.reset} ${t.name}\n`)
      }
      process.stdout.write("\n")
    }

    // Summary line
    const parts: string[] = []
    if (this.failed > 0) {
      parts.push(`${c.bold}${c.red}${this.failed} failed${c.reset}`)
    }
    if (this.passed > 0) {
      parts.push(`${c.bold}${c.green}${this.passed} passed${c.reset}`)
    }
    if (this.skipped > 0) {
      parts.push(`${c.yellow}${this.skipped} skipped${c.reset}`)
    }

    process.stdout.write(` ${c.dim}Test Files${c.reset}  ${parts.join(`${c.dim} | ${c.reset}`)}${c.gray} (${total})${c.reset}\n`)
    process.stdout.write(` ${c.dim}  Duration${c.reset}  ${this.formatDuration(elapsed)}${c.gray} (tests ${this.formatDuration(testDuration)})${c.reset}\n`)

    // Slow tests report
    if (this.options.showSlow && this.failed === 0) {
      const slow = this.timings
        .filter((t) => t.duration >= this.options.slowThreshold)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, this.options.maxSlow)

      if (slow.length > 0) {
        process.stdout.write(`\n ${c.dim}Slow tests (>${this.options.slowThreshold}ms):${c.reset}\n`)
        for (const t of slow) {
          const file = this.relativePath(t.file)
          const dur = this.formatDuration(t.duration).padStart(8)
          process.stdout.write(`   ${c.yellow}${dur}${c.reset}  ${c.gray}${file} >${c.reset} ${t.name}\n`)
        }
      }
    }

    process.stdout.write("\n")

    // Export performance data
    if (this.options.perfOutput) {
      this.exportPerformance(elapsed)
    }
  }

  private relativePath(path: string): string {
    const cwd = process.cwd()
    return path.startsWith(cwd) ? path.slice(cwd.length + 1) : path
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
    const mins = Math.floor(ms / 60000)
    const secs = ((ms % 60000) / 1000).toFixed(0)
    return `${mins}m ${secs}s`
  }

  private exportPerformance(elapsed: number) {
    const data = {
      timestamp: new Date().toISOString(),
      summary: {
        passed: this.passed,
        failed: this.failed,
        skipped: this.skipped,
        elapsed,
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
