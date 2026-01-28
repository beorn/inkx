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
 *   · (green dim) = passed (fast or slow, <2x threshold)
 *   ● (green)     = passed but very slow (>=2x threshold)
 *   x (red)     = failed
 *   ! (magenta) = noisy (test with console output)
 *   ⠋ (cyan)    = running (animated spinner in TTY mode)
 *   * (yellow)  = pending/queued
 *   - (gray)    = skipped
 *
 * FEATURES:
 * - Clean colored dot output (no empty color sequences)
 * - Animated spinner for running tests (TTY mode only)
 * - Slow test detection with graduated dot sizes (bigger = slower)
 * - Noisy test detection (tests with console output marked with !)
 * - Error traces shown for failed tests
 * - Grouped output by package (reads package.json for names)
 * - Per-package summary with test counts and timing
 * - Test performance tracking per-test
 * - Slow test summary at end (configurable threshold)
 * - JSON export for performance trending over time
 *
 * RELATED:
 * - km-test-perf bead
 * - docs/future/monorepo-infra.md
 */

import fs from "node:fs"
import type { Reporter, TestCase, TestModule, TestSpecification, Vitest } from "vitest/node"
import { chalk } from "@beorn/chalkx"
import Debug from "debug"

const debug = Debug("km:vitest-reporter")

// ANSI cursor control (chalk doesn't provide these)
const cursor = {
  save: "\x1b7",
  restore: "\x1b8",
  hide: "\x1b[?25l",
  show: "\x1b[?25h",
  clearLine: "\x1b[2K",
  moveUp: (n: number) => `\x1b[${n}A`,
  moveToColumn: (n: number) => `\x1b[${n}G`,
  moveLeft: (n: number) => `\x1b[${n}D`,
}

// Symbols - dimmed dots for normal, bright disc for very slow
const sym = {
  pass: "·", // Normal test - middle dot U+00B7 (shown dimmed)
  passSlow2: "●", // Very slow (>=2x threshold) - black circle U+25CF (shown bright)
  fail: "x",
  skip: "-",
  pending: "*",
  noisy: "!", // Test with console output
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
  /** Group tests by package/directory (default: true) */
  groupByPackage?: boolean
}

interface CategoryStats {
  testIds: string[]
  passed: number
  failed: number
  skipped: number
  duration: number
  slowCount: number
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
  // NOTE: Check isTTY at runtime via getter, not at construction time,
  // because vitest-setup.ts may set process.stdout.isTTY = false after reporter loads
  private testStates = new Map<string, "pending" | "passed" | "failed" | "skipped">()
  private testOrder: string[] = [] // Track order for rendering
  private finishedTests = new Set<string>()

  // Animation for running tests (TTY only)
  private spinnerFrame = 0
  private spinnerInterval: NodeJS.Timeout | null = null
  private runningTests = new Set<string>() // Tests currently running (for animation)

  // Track slow tests for special display
  private slowTestIds = new Set<string>()
  private testDurations = new Map<string, number>() // test ID → duration in ms

  // Track test errors for display at end
  private testErrors = new Map<string, { name: string; file: string; errors: Array<{ message: string; stack?: string }> }>()

  // Track noisy tests (tests with console output)
  private noisyTestIds = new Set<string>()

  // Category grouping
  private testToCategory = new Map<string, string>() // test ID → category
  private categoryStats = new Map<string, CategoryStats>() // category → stats
  private categoryOrder: string[] = [] // Maintain discovery order
  private categoryCommittedCounts = new Map<string, number>() // For TTY rendering

  // Runtime TTY detection - must be checked at runtime, not cached
  private get isTTY(): boolean {
    // Check both process.stdout.isTTY AND TERM != dumb
    // TERM=dumb is set by test scripts to prevent escape sequences
    return (process.stdout.isTTY ?? false) && process.env.TERM !== "dumb"
  }

  private get columns(): number {
    return process.stdout.columns ?? 80
  }

  constructor(options: ReporterOptions = {}) {
    this.options = {
      slowThreshold: options.slowThreshold ?? 100,
      perfOutput: options.perfOutput ?? "",
      showSlow: options.showSlow ?? true,
      maxSlow: options.maxSlow ?? 10,
      groupByPackage: options.groupByPackage ?? true,
    }
    debug("reporter initialized with options: %O", this.options)
  }

  onInit(ctx: Vitest) {
    debug("onInit called")
    this.ctx = ctx
    this.reset()
  }

  private reset() {
    debug("reset called")
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
    this.testDurations.clear()
    this.testErrors.clear()
    this.noisyTestIds.clear()
    this.testToCategory.clear()
    this.categoryStats.clear()
    this.categoryOrder = []
    this.categoryCommittedCounts.clear()
    this.lastRenderedCategoryCount = 0
    this.packageNameCache.clear()
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval)
      this.spinnerInterval = null
    }
  }

  onTestRunStart(_specs: TestSpecification[]) {
    debug("onTestRunStart called with %d specs, isTTY=%s", _specs.length, this.isTTY)

    // Print header
    const version = this.ctx.version
    const cwd = process.cwd()
    process.stdout.write(`\n ${chalk.bold.bgCyan(" RUN ")} ${chalk.cyan(`v${version}`)} ${chalk.gray(cwd)}\n`)

    // Print legend
    process.stdout.write(` ${chalk.dim("Legend:")} ${chalk.green(sym.pass)}${chalk.dim("pass")} ${chalk.green(sym.passSlow2)}${chalk.dim("slow")} ${chalk.red(sym.fail)}${chalk.dim("fail")} ${chalk.magenta(sym.noisy)}${chalk.dim("noisy")} ${chalk.gray(sym.skip)}${chalk.dim("skip")}\n\n`)

    // Hide cursor and start animation for TTY
    if (this.isTTY) {
      debug("starting TTY mode with spinner animation")
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
    debug("onTestModuleCollected: %s", (module as { moduleId?: string }).moduleId)
    // Mark all discovered tests as pending
    for (const test of module.children.allTests()) {
      this.onTestCaseReady(test)
    }
  }

  onTestCaseReady(testCase: TestCase) {
    const id = testCase.id
    if (this.finishedTests.has(id)) return
    if (this.testStates.has(id)) return // Already tracked

    debug("onTestCaseReady: %s", testCase.name)
    this.testStates.set(id, "pending")
    this.testOrder.push(id)
    this.runningTests.add(id) // Track as running for animation

    // Track category for grouping
    if (this.options.groupByPackage) {
      const moduleId = (testCase.module as { moduleId?: string }).moduleId ?? "unknown"
      const category = this.extractCategory(moduleId)
      this.testToCategory.set(id, category)

      if (!this.categoryStats.has(category)) {
        debug("new category discovered: %s", category)
        this.categoryStats.set(category, {
          testIds: [],
          passed: 0,
          failed: 0,
          skipped: 0,
          duration: 0,
          slowCount: 0,
        })
        this.categoryOrder.push(category)
        this.categoryCommittedCounts.set(category, 0)
      }
      const stats = this.categoryStats.get(category)
      if (stats) stats.testIds.push(id)
    }

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

    debug("onTestCaseResult: %s state=%s duration=%dms", testCase.name, state, duration)

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

    // Track slow tests and durations for display
    this.testDurations.set(id, duration)
    if (duration >= this.options.slowThreshold) {
      this.slowTestIds.add(id)
    }

    // Track errors for failed tests
    if (testState === "failed" && result.errors && result.errors.length > 0) {
      this.testErrors.set(id, {
        name: testCase.name,
        file: moduleId,
        errors: result.errors.map((e) => ({
          message: e.message ?? (typeof e === "string" ? e : "Unknown error"),
          stack: e.stack,
        })),
      })
    }

    // Track noisy tests (tests with console output)
    // Note: vitest doesn't expose stdout/stderr directly in the reporter API,
    // but we can check if the test has any logs in diagnostic
    const logs = (diagnostic as { stdout?: string; stderr?: string })
    if (logs.stdout || logs.stderr) {
      this.noisyTestIds.add(id)
    }

    // Update category stats
    if (this.options.groupByPackage) {
      const category = this.testToCategory.get(id)
      const stats = category ? this.categoryStats.get(category) : undefined
      if (stats) {
        stats.duration += duration
        if (testState === "passed") stats.passed++
        else if (testState === "failed") stats.failed++
        else if (testState === "skipped") stats.skipped++
        if (duration >= this.options.slowThreshold) stats.slowCount++
      }
    }

    if (this.isTTY) {
      // TTY mode: re-render grouped dot lines in place
      this.renderDots()
    } else if (this.options.groupByPackage) {
      // Non-TTY with grouping: suppress flat dots, show grouped output at end
      // (handled by renderFinalGroupedDots in onTestRunEnd)
    } else {
      // Non-TTY flat mode: emit dots as tests complete
      const dot = this.formatDot(testState, id)
      process.stdout.write(dot)
      this.dotCount++
    }
  }

  private formatDot(state: "pending" | "passed" | "failed" | "skipped", id?: string): string {
    const duration = id ? this.testDurations.get(id) ?? 0 : 0
    const isRunning = id ? this.runningTests.has(id) : false
    const isNoisy = id ? this.noisyTestIds.has(id) : false
    const threshold = this.options.slowThreshold

    // Noisy tests (with console output) get a magenta ! indicator
    if (isNoisy && state !== "failed") {
      return chalk.magenta(sym.noisy)
    }

    switch (state) {
      case "passed":
        // All dots are dimmed except very slow tests which get a bright large disc
        if (duration >= threshold * 2) return chalk.green(sym.passSlow2) // Very slow: ● (bright)
        return chalk.dim.green(sym.pass) // Fast/slow: · (dimmed)
      case "failed":
        return chalk.red(sym.fail)
      case "skipped":
        return chalk.dim.gray(sym.skip)
      case "pending":
        // Animate running tests in TTY mode
        if (isRunning && this.isTTY) {
          const frame = spinnerFrames[this.spinnerFrame]
          return chalk.cyan(frame)
        }
        return chalk.yellow(sym.pending)
    }
  }

  private committedCount = 0 // Tests already printed in committed lines
  private lastRenderedCategoryCount = 0 // For cursor control in grouped mode

  private renderDots() {
    if (this.options.groupByPackage) {
      this.renderGroupedDots()
    } else {
      this.renderFlatDots()
    }
  }

  private renderGroupedDots() {
    // Move cursor up to start of category block
    if (this.lastRenderedCategoryCount > 0) {
      process.stdout.write(cursor.moveUp(this.lastRenderedCategoryCount))
    }

    const labelWidth = 20
    const maxDots = this.columns - labelWidth - 2

    for (const category of this.categoryOrder) {
      const stats = this.categoryStats.get(category)
      if (!stats) continue
      const testIds = stats.testIds

      // Build dots string for this category
      const dots = testIds.map((id) => {
        const state = this.testStates.get(id) ?? "pending"
        return this.formatDot(state, id)
      })

      // Truncate if too many dots
      const dotsStr = dots.length > maxDots
        ? dots.slice(0, maxDots - 1).join("") + "…"
        : dots.join("")

      // Format label (right-padded)
      const label = category.length > labelWidth - 1
        ? category.slice(0, labelWidth - 2) + "…"
        : category
      const paddedLabel = label.padEnd(labelWidth)

      process.stdout.write(`${cursor.clearLine}${chalk.dim(paddedLabel)}${dotsStr}\n`)
    }

    this.lastRenderedCategoryCount = this.categoryOrder.length
  }

  private renderFlatDots() {
    // Original flat rendering (no grouping)
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
        this.renderFlatDots()
      }
      return
    }

    // Update current line in place
    process.stdout.write(`\r${cursor.clearLine}${dots.join("")}`)
  }

  private renderFinalGroupedDots() {
    // Render grouped dots at end of run (for non-TTY mode)
    const labelWidth = 20
    const maxDots = this.columns - labelWidth - 2

    for (const category of this.categoryOrder) {
      const stats = this.categoryStats.get(category)
      if (!stats) continue
      const testIds = stats.testIds

      // Build dots string for this category
      const dots = testIds.map((id) => {
        const state = this.testStates.get(id) ?? "pending"
        return this.formatDot(state, id)
      })

      // Truncate if too many dots
      const dotsStr = dots.length > maxDots
        ? dots.slice(0, maxDots - 1).join("") + "…"
        : dots.join("")

      // Format label (right-padded)
      const label = category.length > labelWidth - 1
        ? category.slice(0, labelWidth - 2) + "…"
        : category
      const paddedLabel = label.padEnd(labelWidth)

      process.stdout.write(`${chalk.dim(paddedLabel)}${dotsStr}\n`)
    }
  }

  onTestModuleEnd(_testModule: TestModule) {
    // Optionally emit newline per file
  }

  onTestRunEnd() {
    debug("onTestRunEnd called, passed=%d failed=%d skipped=%d", this.passed, this.failed, this.skipped)

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
    process.stdout.write("\n")

    // In non-TTY mode, show grouped dots at end (since we couldn't update in place)
    if (!this.isTTY && this.options.groupByPackage && this.categoryOrder.length > 1) {
      process.stdout.write("\n")
      this.renderFinalGroupedDots()
    }

    process.stdout.write("\n")

    // Failed tests details with error traces
    if (this.failed > 0) {
      for (const [_id, errInfo] of this.testErrors) {
        const file = this.relativePath(errInfo.file)
        process.stdout.write(` ${chalk.red.bold(`${sym.cross} FAIL`)} ${file} ${chalk.gray(">")} ${errInfo.name}\n`)

        // Show error details
        for (const err of errInfo.errors) {
          // Show error message
          process.stdout.write(`   ${chalk.red(err.message)}\n`)

          // Show stack trace (limit lines for readability)
          if (err.stack) {
            const stackLines = err.stack
              .split("\n")
              .filter((line) => line.trim().startsWith("at "))
              .slice(0, 5) // Show first 5 stack frames
            for (const line of stackLines) {
              process.stdout.write(`   ${chalk.dim(line.trim())}\n`)
            }
          }
        }
        process.stdout.write("\n")
      }
    }

    // Summary line
    const parts: string[] = []
    if (this.failed > 0) {
      parts.push(chalk.bold.red(`${this.failed} failed`))
    }
    if (this.passed > 0) {
      parts.push(chalk.bold.green(`${this.passed} passed`))
    }
    if (this.skipped > 0) {
      parts.push(chalk.yellow(`${this.skipped} skipped`))
    }

    process.stdout.write(` ${chalk.dim("Test Files")}  ${parts.join(chalk.dim(" | "))}${chalk.gray(` (${total})`)}\n`)
    process.stdout.write(` ${chalk.dim("  Duration")}  ${this.formatDuration(elapsed)}${chalk.gray(` (tests ${this.formatDuration(testDuration)})`)}\n`)

    // Per-category summary (if grouping enabled)
    if (this.options.groupByPackage && this.categoryOrder.length > 1) {
      process.stdout.write(`\n ${chalk.dim("By package:")}\n`)
      const nameWidth = Math.max(...this.categoryOrder.map((c) => c.length), 12)
      process.stdout.write(`   ${chalk.dim(`${"Package".padEnd(nameWidth)}  Tests     Time   Slow`)}\n`)

      for (const category of this.categoryOrder) {
        const stats = this.categoryStats.get(category)
        if (!stats) continue
        const testCount = stats.passed + stats.failed + stats.skipped
        const name = category.padEnd(nameWidth)
        const tests = testCount.toString().padStart(5)
        const time = this.formatDuration(stats.duration).padStart(8)
        const slow = stats.slowCount > 0 ? stats.slowCount.toString().padStart(6) : "     -"

        // Color the name based on failures
        const nameColored = stats.failed > 0 ? chalk.red(name) : chalk.dim(name)
        process.stdout.write(`   ${nameColored}  ${tests}  ${time}  ${slow}\n`)
      }
    }

    // Slow tests report
    if (this.options.showSlow && this.failed === 0) {
      const slow = this.timings
        .filter((t) => t.duration >= this.options.slowThreshold)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, this.options.maxSlow)

      if (slow.length > 0) {
        process.stdout.write(`\n ${chalk.dim(`Slow tests (>${this.options.slowThreshold}ms):`)}\n`)
        for (const t of slow) {
          const file = this.relativePath(t.file)
          const dur = this.formatDuration(t.duration).padStart(8)
          process.stdout.write(`   ${chalk.yellow(dur)}  ${chalk.gray(`${file} >`)} ${t.name}\n`)
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

  // Cache for package.json lookups
  private packageNameCache = new Map<string, string>()

  /**
   * Extract category from file path by finding nearest package.json.
   * Returns the package name from package.json, or directory path as fallback.
   */
  private extractCategory(moduleId: string): string {
    const rel = this.relativePath(moduleId)
    const parts = rel.split("/")

    // Try to find package.json in parent directories
    const cwd = process.cwd()
    for (let i = parts.length - 1; i >= 0; i--) {
      const dirPath = parts.slice(0, i + 1).join("/")
      const pkgPath = `${cwd}/${dirPath}/package.json`

      // Check cache first
      const cached = this.packageNameCache.get(dirPath)
      if (cached !== undefined) {
        return cached
      }

      // Try to read package.json
      try {
        if (fs.existsSync(pkgPath)) {
          const pkg: { name?: string } = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
          const name = pkg.name ?? dirPath
          this.packageNameCache.set(dirPath, name)
          return name
        }
      } catch {
        // File doesn't exist or can't be parsed, continue searching
      }
    }

    // Fallback: use first two segments for known grouping dirs
    const groupingDirs = ["packages", "apps", "vendor", "tests"]
    if (parts.length >= 2 && groupingDirs.includes(parts[0])) {
      const fallback = `${parts[0]}/${parts[1]}`
      this.packageNameCache.set(fallback, fallback)
      return fallback
    }

    // Last fallback: first segment
    const fallback = parts[0] || "root"
    this.packageNameCache.set(fallback, fallback)
    return fallback
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

    fs.writeFileSync(this.options.perfOutput, JSON.stringify(data, null, 2))
  }
}

export default KmReporter
