/**
 * Custom Vitest Reporter
 *
 * Uses inkx's createTerm for terminal output.
 * Does NOT use React rendering (inkx render) since vitest workers output
 * to the same terminal. Instead, uses term.write() with raw ANSI output.
 *
 * SYMBOLS:
 *   · (green dim) = passed (fast, <2x threshold)
 *   ● (green)     = passed but very slow (>=2x threshold)
 *   x (red)       = failed
 *   ! (magenta)   = noisy (test with console output)
 *   - (gray)      = skipped
 *
 * GROUPING MODES:
 *   auto          = smart selection based on file/package count (default)
 *   consolidated  = single row of all dots
 *   files-only    = file names with dots, no package grouping
 *   packages-only = package names with dots
 *   packages+files = two-level: package header + indented files
 */

import fs from "node:fs"
import type {
  Reporter,
  TestCase,
  TestModule,
  TestSpecification,
  TestSuite,
  Vitest,
} from "vitest/node"
import { createTerm, type Term } from "inkx"
// import { renderString } from "inkx"
import Debug from "debug"

// Import components (to be created)
// import { Header, Summary, StatsTable, SlowestList, Failures, TestDots, PackageHeader } from "./components.js"

const debug = Debug("km:vitest-reporter")

// Symbols - dots in increasing size order
const sym = {
  pass: "·", // smallest - fast tests
  slow2x: "•", // small bullet - 2x threshold
  slow5x: "●", // medium circle - 5x threshold
  slow10x: "⬤", // large circle - 10x+ threshold
  fail: "x",
  skip: "-",
  pending: "*",
  noisy: "!",
  check: "✓",
  cross: "✗",
}

// Cursor control
const cursor = {
  hide: "\x1b[?25l",
  show: "\x1b[?25h",
}

interface TestTiming {
  name: string
  file: string
  duration: number
  state: "passed" | "failed" | "skipped"
}

type GroupingMode =
  | "auto"
  | "consolidated"
  | "files-only"
  | "packages-only"
  | "packages+files"

interface ReporterOptions {
  slowThreshold?: number
  perfOutput?: string
  showSlow?: boolean
  maxSlow?: number
  grouping?: GroupingMode
  showLiveStats?: boolean
  targetLineCount?: number // Target vertical items before stopping breakout (default: 30)
  significantDuration?: number // Files >= this duration (ms) are prioritized for breakout (default: 3000)
}

interface FileStats {
  testIds: string[]
  passed: number
  failed: number
  skipped: number
  duration: number
  slowCount: number
}

interface SlowestTest {
  name: string
  file: string
  duration: number
}

interface CategoryStats {
  testIds: string[]
  passed: number
  failed: number
  skipped: number
  duration: number
  slowCount: number
  files: Map<string, FileStats>
  fileOrder: string[]
}

interface TestError {
  name: string
  file: string
  errors: Array<{ message: string; stack?: string }>
}

// ============================================================================
// Plain Text Rendering (using Term)
// ============================================================================

function plainTextHeader(term: Term, version: string, cwd: string): string {
  return (
    `${term.style().bold.inverse.cyan(" RUN ")} ${term.style().cyan(`v${version}`)} ${term.style().dim(cwd)}\n` +
    `${term.style().dim("Legend:")} ${term.style().green(sym.pass)} ${term.style().dim("pass")}  ${term.style().green(sym.slow2x)} ${term.style().dim("slow")}  ${term.style().red(sym.fail)} ${term.style().dim("fail")}  ${term.style().magenta(sym.noisy)} ${term.style().dim("noisy")}  ${term.style().gray(sym.skip)} ${term.style().dim("skip")}\n\n`
  )
}

/**
 * Get the styled dot for a slow test based on duration thresholds.
 * All green, with increasing size and brightness:
 * - 20x threshold: ⬤ green bright (largest, bright)
 * - 10x threshold: ⬤ green dim (largest, dimmed)
 * - 5x threshold: ● green dim (medium, dimmed)
 * - 2x threshold: • green dim (small, dimmed)
 */
function slowDot(term: Term, duration: number, threshold: number): string {
  if (duration >= threshold * 20) {
    return term.style().green(sym.slow10x)
  }
  if (duration >= threshold * 10) {
    return term.style().green.dim(sym.slow10x)
  }
  if (duration >= threshold * 5) {
    return term.style().green.dim(sym.slow5x)
  }
  return term.style().green.dim(sym.slow2x)
}

function plainTextDot(
  term: Term,
  state: "pending" | "passed" | "failed" | "skipped",
  duration: number,
  isNoisy: boolean,
  threshold: number,
): string {
  if (isNoisy && state !== "failed") {
    return term.style().magenta(sym.noisy)
  }

  switch (state) {
    case "passed":
      if (duration >= threshold * 2) {
        return slowDot(term, duration, threshold)
      }
      return term.style().green.dim(sym.pass)
    case "failed":
      return term.style().red(sym.fail)
    case "skipped":
      return term.style().gray.dim(sym.skip)
    case "pending":
      return term.style().yellow(sym.pending)
  }
}

function plainTextRow(
  term: Term,
  name: string,
  testIds: string[],
  testStates: Map<string, "pending" | "passed" | "failed" | "skipped">,
  testDurations: Map<string, number>,
  noisyTestIds: Set<string>,
  threshold: number,
  maxDots: number,
  indent: string = "",
  labelWidth: number = 20,
  isPackage: boolean = false,
): string {
  const effectiveLabelWidth = labelWidth - indent.length
  const label =
    name.length > effectiveLabelWidth - 1
      ? name.slice(0, effectiveLabelWidth - 2) + "…"
      : name

  // Generate all dots
  const allDots = testIds.map((id) =>
    plainTextDot(
      term,
      testStates.get(id) ?? "pending",
      testDurations.get(id) ?? 0,
      noisyTestIds.has(id),
      threshold,
    ),
  )

  // Split dots into lines that fit within maxDots
  const lines: string[] = []
  for (let i = 0; i < allDots.length; i += maxDots) {
    lines.push(allDots.slice(i, i + maxDots).join(""))
  }

  // Build output: first line has label, subsequent lines are indented to align
  const labelPadding = " ".repeat(effectiveLabelWidth)
  const styledLabel = isPackage
    ? term.style().bold.white(label.padEnd(effectiveLabelWidth))
    : term.style().dim(label.padEnd(effectiveLabelWidth))
  let result = `${indent}${styledLabel}${lines[0] ?? ""}\n`
  for (let i = 1; i < lines.length; i++) {
    result += `${indent}${labelPadding}${lines[i]}\n`
  }

  return result
}

function plainTextConsolidatedRow(
  term: Term,
  testIds: string[],
  testStates: Map<string, "pending" | "passed" | "failed" | "skipped">,
  testDurations: Map<string, number>,
  noisyTestIds: Set<string>,
  threshold: number,
  maxDots: number,
): string {
  // Generate all dots
  const allDots = testIds.map((id) =>
    plainTextDot(
      term,
      testStates.get(id) ?? "pending",
      testDurations.get(id) ?? 0,
      noisyTestIds.has(id),
      threshold,
    ),
  )

  // Split dots into lines that fit within maxDots
  const lines: string[] = []
  for (let i = 0; i < allDots.length; i += maxDots) {
    lines.push(allDots.slice(i, i + maxDots).join(""))
  }

  return lines.join("\n") + "\n"
}

function plainTextPackageHeader(term: Term, name: string): string {
  return `${term.style().bold.white(name)}\n`
}

/**
 * Beautify test file name: strip .test.ts, .spec.ts, etc.
 */
function beautifyFileName(name: string): string {
  return name
    .replace(/\.(test|spec)\.(ts|tsx|js|jsx|mjs|md)$/, "")
    .replace(/\.(ts|tsx|js|jsx|mjs|md)$/, "")
}

function plainTextSummary(
  term: Term,
  passed: number,
  failed: number,
  skipped: number,
  total: number,
  elapsed: number,
  testDuration: number,
): string {
  let result = "\n"

  // Single line: Test Files + Duration
  result += term.style().dim("Test Files") + "  "
  if (failed > 0) {
    result +=
      term.style().bold.red(`${failed} failed`) + term.style().dim(" | ")
  }
  if (passed > 0) result += term.style().bold.green(`${passed} passed`)
  if (skipped > 0) {
    result +=
      term.style().dim(" | ") + term.style().yellow(`${skipped} skipped`)
  }
  result += term.style().gray(` (${total})`)
  result += "  " + term.style().dim("Duration") + " " + formatDuration(elapsed)
  result += term.style().gray(` (tests ${formatDuration(testDuration)})`) + "\n"

  return result
}

function plainTextStatsTable(
  term: Term,
  categories: string[],
  categoryStats: Map<string, CategoryStats>,
): string {
  if (categories.length <= 1) return ""

  const nameWidth = Math.max(...categories.map((c) => c.length), 12)
  // Single header line with bold column names
  let result =
    "\n" +
    term.style().bold(`${"PACKAGE".padEnd(nameWidth)}  TESTS     TIME   SLOW`) +
    "\n"

  for (const category of categories) {
    const stats = categoryStats.get(category)
    if (!stats) continue

    const testCount = stats.passed + stats.failed + stats.skipped
    const name = category.padEnd(nameWidth)
    const tests = testCount.toString().padStart(5)
    const time = formatDuration(stats.duration).padStart(8)
    const slow =
      stats.slowCount > 0 ? stats.slowCount.toString().padStart(6) : "     -"

    const nameText =
      stats.failed > 0 ? term.style().red(name) : term.style().dim(name)
    result += `${nameText}  ${tests}  ${time}  ${slow}\n`
  }

  return result
}

function plainTextSlowestList(
  term: Term,
  tests: SlowestTest[],
  baseThreshold: number,
): string {
  if (tests.length === 0) return ""

  // Build legend showing the slow tiers (all green, increasing size/brightness)
  const t2x = baseThreshold * 2
  const t5x = baseThreshold * 5
  const t10x = baseThreshold * 10
  const t20x = baseThreshold * 20
  const legend =
    term.style().green.dim(sym.slow2x) +
    term.style().dim(` ≥${t2x}ms  `) +
    term.style().green.dim(sym.slow5x) +
    term.style().dim(` ≥${t5x}ms  `) +
    term.style().green.dim(sym.slow10x) +
    term.style().dim(` ≥${t10x}ms  `) +
    term.style().green(sym.slow10x) +
    term.style().dim(` ≥${t20x}ms`)

  let result = "\n" + term.style().bold(`SLOW TESTS`) + "  " + legend + "\n"
  for (const t of tests) {
    result += `${slowDot(term, t.duration, baseThreshold)} ${term.style().yellow(formatDuration(t.duration).padStart(6))}  ${term.style().gray(t.file + " >")} ${t.name}\n`
  }

  return result
}

function plainTextFailures(term: Term, errors: Map<string, TestError>): string {
  if (errors.size === 0) return ""

  let result = "\n" + term.style().bold.red("FAILURES") + "\n\n"

  for (const errInfo of errors.values()) {
    result += ` ${term.style().bold.red(sym.cross + " FAIL")} ${errInfo.file}${term.style().gray(" >")} ${errInfo.name}\n`

    for (const err of errInfo.errors) {
      result += `   ${term.style().red(err.message)}\n`
      if (err.stack) {
        const stackLines = err.stack
          .split("\n")
          .filter((line) => line.trim().startsWith("at "))
          .slice(0, 5)
        for (const line of stackLines) {
          result += term.style().dim(`   ${line.trim()}`) + "\n"
        }
      }
    }
    result += "\n"
  }

  return result
}

// ============================================================================
// Utilities
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  const mins = Math.floor(ms / 60000)
  const secs = ((ms % 60000) / 1000).toFixed(0)
  return `${mins}m ${secs}s`
}

// ============================================================================
// Reporter Class
// ============================================================================

export class KmReporter implements Reporter {
  private ctx!: Vitest
  private term: Term | null = null
  private options: Required<ReporterOptions>
  private timings: TestTiming[] = []
  private passed = 0
  private failed = 0
  private skipped = 0
  private startTime = 0

  private testStates = new Map<
    string,
    "pending" | "passed" | "failed" | "skipped"
  >()
  private testOrder: string[] = []
  private finishedTests = new Set<string>()
  private runningTests = new Set<string>()
  private slowTestIds = new Set<string>()
  private testDurations = new Map<string, number>()
  private testErrors = new Map<string, TestError>()
  private noisyTestIds = new Set<string>()
  private testToCategory = new Map<string, string>()
  private testToFile = new Map<string, string>()
  private categoryStats = new Map<string, CategoryStats>()
  private categoryOrder: string[] = []
  private fileStats = new Map<string, FileStats>()
  private fileOrder: string[] = []
  private topSlowest: SlowestTest[] = []
  private packageNameCache = new Map<string, string>()

  private get isTTY(): boolean {
    // Explicit override via env var
    if (process.env.VITEST_REPORTER_TTY === "false") return false
    if (process.env.VITEST_REPORTER_TTY === "true") return true

    // CI environments → non-TTY (plain text output)
    if (
      process.env.CI ||
      process.env.GITHUB_ACTIONS ||
      process.env.GITLAB_CI ||
      process.env.JENKINS_URL
    ) {
      return false
    }

    // Auto-detect based on stdout and TERM
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
      grouping: options.grouping ?? "auto",
      showLiveStats: options.showLiveStats ?? true,
      targetLineCount: options.targetLineCount ?? 30,
      significantDuration: options.significantDuration ?? 3000,
    }
    debug("reporter initialized with options: %O", this.options)
  }

  /**
   * Determine the effective grouping mode based on auto-detection logic.
   * "Items" = output lines for each mode:
   *   - consolidated: 1 line (all dots)
   *   - files-only: fileCount lines
   *   - packages-only: packageCount lines
   *   - packages+files: packageCount + fileCount lines
   *
   * Thresholds:
   *   - ≥40 items → consolidated (too many to list)
   *   - 0-1 packages → files-only (package grouping adds no value)
   *   - <30 items → packages+files (detailed view fits)
   *   - else → packages-only (compact grouped view)
   */
  private getEffectiveGrouping(): Exclude<GroupingMode, "auto"> {
    if (this.options.grouping !== "auto") {
      return this.options.grouping
    }

    const packageCount = this.categoryOrder.length
    const fileCount = this.fileOrder.length

    // Calculate items (lines) for each mode
    const filesOnlyItems = fileCount
    const packagesOnlyItems = packageCount
    const packagesFilesItems = packageCount + fileCount

    // 0-1 packages → files-only (package grouping adds no value)
    if (packageCount <= 1) {
      // But if too many files, use consolidated
      if (filesOnlyItems >= 40) {
        return "consolidated"
      }
      return "files-only"
    }

    // ≥40 items in most compact grouped mode → consolidated
    if (packagesOnlyItems >= 40) {
      return "consolidated"
    }

    // <30 items in detailed mode → packages+files
    if (packagesFilesItems < 30) {
      return "packages+files"
    }

    // else → packages-only
    return "packages-only"
  }

  /**
   * Calculate which files to break out in packages-only mode.
   * Uses a pressure-based algorithm that fills vertical space then handles overflow.
   *
   * Phase 1: Fill vertical space up to targetLineCount by breaking out files
   * Phase 2: Only break out files from packages whose dots exceed maxDots
   *
   * File selection priority:
   * 1. Files with testCount > maxDots/2 (large files)
   * 2. Files with duration >= significantDuration (slow files)
   * 3. File with the most tests
   */
  private calculateFileBreakouts(maxDots: number): Map<string, Set<string>> {
    const breakouts = new Map<string, Set<string>>() // category -> set of broken out file names

    // Initialize with no breakouts
    for (const category of this.categoryOrder) {
      breakouts.set(category, new Set())
    }

    // Helper: count current lines (packages + broken out files)
    const countLines = (): number => {
      let count = this.categoryOrder.length
      for (const files of breakouts.values()) {
        count += files.size
      }
      return count
    }

    // Helper: get aggregated dot count for a package (excluding broken out files)
    const getPackageDots = (category: string): number => {
      const stats = this.categoryStats.get(category)
      if (!stats) return 0
      const brokenOut = breakouts.get(category) ?? new Set()
      let count = 0
      for (const fileName of stats.fileOrder) {
        if (!brokenOut.has(fileName)) {
          const fileStats = stats.files.get(fileName)
          if (fileStats) count += fileStats.testIds.length
        }
      }
      return count
    }

    // Helper: find next file to break out, returns [category, fileName] or null
    const findNextBreakout = (
      onlyOverflowing: boolean,
    ): [string, string] | null => {
      const candidates: Array<{
        category: string
        fileName: string
        testCount: number
        duration: number
      }> = []

      for (const category of this.categoryOrder) {
        const stats = this.categoryStats.get(category)
        if (!stats) continue

        // Skip packages that don't overflow if we only want overflowing
        if (onlyOverflowing && getPackageDots(category) <= maxDots) continue

        const brokenOut = breakouts.get(category) ?? new Set()
        for (const fileName of stats.fileOrder) {
          if (brokenOut.has(fileName)) continue
          const fileStats = stats.files.get(fileName)
          if (!fileStats) continue
          candidates.push({
            category,
            fileName,
            testCount: fileStats.testIds.length,
            duration: fileStats.duration,
          })
        }
      }

      if (candidates.length === 0) return null

      // Priority 1: files with testCount > maxDots/3
      const large = candidates.filter((c) => c.testCount > maxDots / 3)
      if (large.length > 0) {
        large.sort((a, b) => b.testCount - a.testCount)
        const first = large[0]
        if (first) return [first.category, first.fileName]
      }

      // Priority 2: slow files (>= significantDuration)
      const slow = candidates.filter(
        (c) => c.duration >= this.options.significantDuration,
      )
      if (slow.length > 0) {
        slow.sort((a, b) => b.duration - a.duration)
        const first = slow[0]
        if (first) return [first.category, first.fileName]
      }

      // Priority 3: file with most tests
      candidates.sort((a, b) => b.testCount - a.testCount)
      const first = candidates[0]
      if (first) return [first.category, first.fileName]
    }

    // Phase 1: Fill vertical space up to targetLineCount
    while (countLines() < this.options.targetLineCount) {
      const next = findNextBreakout(false)
      if (!next) break
      breakouts.get(next[0])?.add(next[1])
    }

    // Phase 2: Handle packages that overflow
    let changed = true
    while (changed) {
      changed = false
      const next = findNextBreakout(true)
      if (next) {
        breakouts.get(next[0])?.add(next[1])
        changed = true
      }
    }

    return breakouts
  }

  onInit(ctx: Vitest) {
    debug("onInit called")
    this.ctx = ctx
    this.term = createTerm()
    this.reset()
  }

  private reset() {
    debug("reset called")
    this.timings = []
    this.passed = 0
    this.failed = 0
    this.skipped = 0
    this.startTime = Date.now()
    this.testStates.clear()
    this.testOrder = []
    this.finishedTests.clear()
    this.runningTests.clear()
    this.slowTestIds.clear()
    this.testDurations.clear()
    this.testErrors.clear()
    this.noisyTestIds.clear()
    this.testToCategory.clear()
    this.testToFile.clear()
    this.categoryStats.clear()
    this.categoryOrder = []
    this.fileStats.clear()
    this.fileOrder = []
    this.topSlowest = []
    this.packageNameCache.clear()
  }

  onTestRunStart(_specs: readonly TestSpecification[]) {
    debug(
      "onTestRunStart called with %d specs, isTTY=%s",
      _specs.length,
      this.isTTY,
    )
    if (!this.term) return

    // Write header
    this.term.write(plainTextHeader(this.term, this.ctx.version, process.cwd()))

    // Hide cursor in TTY mode
    if (this.isTTY) {
      this.term.write(cursor.hide)
    }
  }

  onTestModuleCollected(module: TestModule) {
    debug(
      "onTestModuleCollected: %s",
      (module as { moduleId?: string }).moduleId,
    )
    for (const test of module.children.allTests()) {
      this.onTestCaseReady(test)
    }
  }

  onTestSuiteReady(suite: TestSuite) {
    debug("onTestSuiteReady: %s", suite.name)
    for (const test of suite.children.allTests()) {
      this.onTestCaseReady(test)
    }
  }

  onTestCaseReady(testCase: TestCase) {
    const id = testCase.id
    if (this.finishedTests.has(id)) return
    if (this.testStates.has(id)) return

    const moduleId =
      (testCase.module as { moduleId?: string }).moduleId ?? "unknown"
    debug(
      "onTestCaseReady: id=%s name=%s module=%s",
      id,
      testCase.name,
      moduleId,
    )

    this.testStates.set(id, "pending")
    this.testOrder.push(id)
    this.runningTests.add(id)

    const category = this.extractCategory(moduleId)
    const fileName = this.extractFileName(moduleId)
    this.testToCategory.set(id, category)
    this.testToFile.set(id, fileName)

    // Track file-level stats (for files-only and packages+files modes)
    if (!this.fileStats.has(fileName)) {
      this.fileStats.set(fileName, {
        testIds: [],
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        slowCount: 0,
      })
      this.fileOrder.push(fileName)
    }
    const fileStat = this.fileStats.get(fileName)
    if (fileStat) fileStat.testIds.push(id)

    // Track category-level stats (for packages-only and packages+files modes)
    if (!this.categoryStats.has(category)) {
      debug("new category discovered: %s", category)
      this.categoryStats.set(category, {
        testIds: [],
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        slowCount: 0,
        files: new Map(),
        fileOrder: [],
      })
      this.categoryOrder.push(category)
    }
    const stats = this.categoryStats.get(category)
    if (stats) {
      stats.testIds.push(id)

      // Track files within category (for packages+files mode)
      if (!stats.files.has(fileName)) {
        stats.files.set(fileName, {
          testIds: [],
          passed: 0,
          failed: 0,
          skipped: 0,
          duration: 0,
          slowCount: 0,
        })
        stats.fileOrder.push(fileName)
      }
      const categoryFileStats = stats.files.get(fileName)
      if (categoryFileStats) categoryFileStats.testIds.push(id)
    }
  }

  onTestCaseResult(testCase: TestCase) {
    const result = testCase.result()
    if (!result) return

    const id = testCase.id
    const diagnostic = testCase.diagnostic()
    const duration = diagnostic?.duration ?? 0
    const state = result.state

    debug(
      "onTestCaseResult: %s state=%s duration=%dms",
      testCase.name,
      state,
      duration,
    )

    const moduleId =
      (testCase.module as { moduleId?: string }).moduleId ?? "unknown"
    const testState =
      state === "passed" ? "passed" : state === "failed" ? "failed" : "skipped"

    this.timings.push({
      name: testCase.name,
      file: moduleId,
      duration,
      state: testState,
    })

    if (state === "passed") this.passed++
    else if (state === "failed") this.failed++
    else if (state === "skipped") this.skipped++

    this.finishedTests.add(id)
    this.runningTests.delete(id)
    this.testStates.set(id, testState)
    this.testDurations.set(id, duration)

    if (duration >= this.options.slowThreshold) {
      this.slowTestIds.add(id)
    }

    if (testState === "failed" && result.errors && result.errors.length > 0) {
      this.testErrors.set(id, {
        name: testCase.name,
        file: this.relativePath(moduleId),
        errors: result.errors.map((e) => ({
          message: e.message ?? (typeof e === "string" ? e : "Unknown error"),
          stack: e.stack,
        })),
      })
    }

    // Check if test produced console output (noisy test)
    if (diagnostic) {
      const logs = diagnostic as { stdout?: string; stderr?: string }
      if (logs.stdout || logs.stderr) {
        this.noisyTestIds.add(id)
      }
    }

    const category = this.testToCategory.get(id)
    const fileName = this.testToFile.get(id)

    // Update top-level file stats
    if (fileName) {
      const fileStat = this.fileStats.get(fileName)
      if (fileStat) {
        fileStat.duration += duration
        if (testState === "passed") fileStat.passed++
        else if (testState === "failed") fileStat.failed++
        else if (testState === "skipped") fileStat.skipped++
        if (duration >= this.options.slowThreshold) fileStat.slowCount++
      }
    }

    // Update category stats
    const stats = category ? this.categoryStats.get(category) : undefined
    if (stats) {
      stats.duration += duration
      if (testState === "passed") stats.passed++
      else if (testState === "failed") stats.failed++
      else if (testState === "skipped") stats.skipped++
      if (duration >= this.options.slowThreshold) stats.slowCount++

      // Update file stats within category
      if (fileName) {
        const categoryFileStats = stats.files.get(fileName)
        if (categoryFileStats) {
          categoryFileStats.duration += duration
          if (testState === "passed") categoryFileStats.passed++
          else if (testState === "failed") categoryFileStats.failed++
          else if (testState === "skipped") categoryFileStats.skipped++
          if (duration >= this.options.slowThreshold) {
            categoryFileStats.slowCount++
          }
        }
      }
    }

    this.updateTopSlowest(testCase.name, moduleId, duration)
  }

  private updateTopSlowest(name: string, file: string, duration: number) {
    // Match the dots criteria: ● shows for duration >= threshold * 2
    if (duration < this.options.slowThreshold * 2) return
    this.topSlowest.push({ name, file: this.relativePath(file), duration })
    this.topSlowest.sort((a, b) => b.duration - a.duration)
  }

  onTestModuleEnd(_testModule: TestModule) {}

  onTestRunEnd() {
    debug(
      "onTestRunEnd called, passed=%d failed=%d skipped=%d",
      this.passed,
      this.failed,
      this.skipped,
    )
    if (!this.term) return

    const elapsed = Date.now() - this.startTime
    const testDuration = this.timings.reduce((sum, t) => sum + t.duration, 0)
    const total = this.passed + this.failed + this.skipped

    // Render final output using plain text with term styling
    const effectiveGrouping = this.getEffectiveGrouping()
    const labelWidth = 20
    const maxDots = this.columns - labelWidth - 2

    debug(
      "final render: grouping=%s, packages=%d, files=%d",
      effectiveGrouping,
      this.categoryOrder.length,
      this.fileOrder.length,
    )

    const term = this.term
    if (!term) return

    switch (effectiveGrouping) {
      case "consolidated":
        // Single row of all dots
        term.write(
          plainTextConsolidatedRow(
            term,
            this.testOrder,
            this.testStates,
            this.testDurations,
            this.noisyTestIds,
            this.options.slowThreshold,
            this.columns - 2,
          ),
        )
        break

      case "files-only":
        // File names with dots (no package grouping)
        for (const fileName of this.fileOrder) {
          const stats = this.fileStats.get(fileName)
          if (!stats) continue
          term.write(
            plainTextRow(
              term,
              beautifyFileName(fileName),
              stats.testIds,
              this.testStates,
              this.testDurations,
              this.noisyTestIds,
              this.options.slowThreshold,
              maxDots,
            ),
          )
        }
        break

      case "packages+files":
        // Two-level: package header + indented files
        for (const category of this.categoryOrder) {
          const stats = this.categoryStats.get(category)
          if (!stats) continue
          term.write(plainTextPackageHeader(term, category))
          for (const fileName of stats.fileOrder) {
            const fileStats = stats.files.get(fileName)
            if (!fileStats) continue
            term.write(
              plainTextRow(
                term,
                beautifyFileName(fileName),
                fileStats.testIds,
                this.testStates,
                this.testDurations,
                this.noisyTestIds,
                this.options.slowThreshold,
                maxDots - 2,
                "  ",
                labelWidth,
              ),
            )
          }
        }
        break

      case "packages-only":
      default: {
        // Package names with dots, files broken out based on pressure algorithm
        const breakouts = this.calculateFileBreakouts(maxDots)

        for (const category of this.categoryOrder) {
          const stats = this.categoryStats.get(category)
          if (!stats) continue

          const brokenOutFiles = breakouts.get(category) ?? new Set()

          // Collect aggregated test IDs (files not broken out)
          const aggregatedTestIds: string[] = []
          for (const fileName of stats.fileOrder) {
            if (brokenOutFiles.has(fileName)) continue
            const fileStats = stats.files.get(fileName)
            if (fileStats) aggregatedTestIds.push(...fileStats.testIds)
          }

          // Render package row with aggregated dots (if any)
          if (aggregatedTestIds.length > 0) {
            term.write(
              plainTextRow(
                term,
                category,
                aggregatedTestIds,
                this.testStates,
                this.testDurations,
                this.noisyTestIds,
                this.options.slowThreshold,
                maxDots,
                "",
                labelWidth,
                true, // isPackage
              ),
            )
          } else if (brokenOutFiles.size > 0) {
            // Package has only broken out files - just show header
            term.write(plainTextPackageHeader(term, category))
          }

          // Render broken out files as indented sub-items
          for (const fileName of stats.fileOrder) {
            if (!brokenOutFiles.has(fileName)) continue
            const fileStats = stats.files.get(fileName)
            if (!fileStats) continue
            term.write(
              plainTextRow(
                term,
                beautifyFileName(fileName),
                fileStats.testIds,
                this.testStates,
                this.testDurations,
                this.noisyTestIds,
                this.options.slowThreshold,
                maxDots - 2,
                "  ",
                labelWidth,
              ),
            )
          }
        }
        break
      }
    }

    // Write summary and details
    term.write(
      plainTextSummary(
        term,
        this.passed,
        this.failed,
        this.skipped,
        total,
        elapsed,
        testDuration,
      ),
    )
    // Only show package stats table if we have multiple packages
    if (this.categoryOrder.length > 1) {
      term.write(
        plainTextStatsTable(term, this.categoryOrder, this.categoryStats),
      )
    }
    if (this.options.showSlow) {
      term.write(
        plainTextSlowestList(term, this.topSlowest, this.options.slowThreshold),
      )
    }
    term.write(plainTextFailures(term, this.testErrors))

    // Show cursor in TTY mode
    if (this.isTTY) {
      term.write(cursor.show)
    }
    term.write("\n")

    // Dispose term
    term[Symbol.dispose]()
    this.term = null

    if (this.options.perfOutput) {
      this.exportPerformance(elapsed)
    }
  }

  private relativePath(path: string): string {
    const cwd = process.cwd()
    return path.startsWith(cwd) ? path.slice(cwd.length + 1) : path
  }

  private extractCategory(moduleId: string): string {
    const rel = this.relativePath(moduleId)
    const parts = rel.split("/")
    const cwd = process.cwd()

    for (let i = parts.length - 1; i >= 0; i--) {
      const dirPath = parts.slice(0, i + 1).join("/")
      const pkgPath = `${cwd}/${dirPath}/package.json`

      const cached = this.packageNameCache.get(dirPath)
      if (cached !== undefined) return cached

      try {
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
            name?: string
          }
          const name = pkg.name ?? dirPath
          this.packageNameCache.set(dirPath, name)
          return name
        }
      } catch {}
    }

    const groupingDirs = ["packages", "apps", "vendor", "tests"]
    const firstPart = parts[0]
    if (parts.length >= 2 && firstPart && groupingDirs.includes(firstPart)) {
      const fallback = `${firstPart}/${parts[1]}`
      this.packageNameCache.set(fallback, fallback)
      return fallback
    }

    const fallback = firstPart || "root"
    this.packageNameCache.set(fallback, fallback)
    return fallback
  }

  private extractFileName(moduleId: string): string {
    const rel = this.relativePath(moduleId)
    const parts = rel.split("/")
    return parts[parts.length - 1] || "unknown"
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
