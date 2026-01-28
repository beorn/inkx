/**
 * Custom Vitest Reporter
 *
 * Plain text output with ANSI colors for terminal output.
 * Auto-detects TTY mode and CI environments.
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
import type { Reporter, TestCase, TestModule, TestSpecification, TestSuite, Vitest } from "vitest/node"
import { chalk } from "@beorn/chalkx"
import Debug from "debug"

const debug = Debug("km:vitest-reporter")

// Symbols
const sym = {
  pass: "·",
  passSlow2: "●",
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

type GroupingMode = "auto" | "consolidated" | "files-only" | "packages-only" | "packages+files"

interface ReporterOptions {
  slowThreshold?: number
  perfOutput?: string
  showSlow?: boolean
  maxSlow?: number
  grouping?: GroupingMode
  showLiveStats?: boolean
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
// Plain Text Rendering
// ============================================================================

function plainTextHeader(version: string, cwd: string): string {
  return (
    `${chalk.bold.inverse.cyan(" RUN ")} ${chalk.cyan(`v${version}`)} ${chalk.dim(cwd)}\n` +
    `${chalk.dim("Legend:")} ${chalk.green(sym.pass)} ${chalk.dim("pass")}  ${chalk.green(sym.passSlow2)} ${chalk.dim("slow")}  ${chalk.red(sym.fail)} ${chalk.dim("fail")}  ${chalk.magenta(sym.noisy)} ${chalk.dim("noisy")}  ${chalk.gray(sym.skip)} ${chalk.dim("skip")}\n\n`
  )
}

function plainTextDot(
  state: "pending" | "passed" | "failed" | "skipped",
  duration: number,
  isNoisy: boolean,
  threshold: number,
): string {
  if (isNoisy && state !== "failed") {
    return chalk.magenta(sym.noisy)
  }

  switch (state) {
    case "passed":
      if (duration >= threshold * 2) {
        return chalk.green(sym.passSlow2)
      }
      return chalk.green.dim(sym.pass)
    case "failed":
      return chalk.red(sym.fail)
    case "skipped":
      return chalk.gray.dim(sym.skip)
    case "pending":
      return chalk.yellow(sym.pending)
  }
}

function plainTextRow(
  name: string,
  testIds: string[],
  testStates: Map<string, "pending" | "passed" | "failed" | "skipped">,
  testDurations: Map<string, number>,
  noisyTestIds: Set<string>,
  threshold: number,
  maxDots: number,
  indent: string = "",
  labelWidth: number = 20,
): string {
  const effectiveLabelWidth = labelWidth - indent.length
  const label =
    name.length > effectiveLabelWidth - 1
      ? name.slice(0, effectiveLabelWidth - 2) + "…"
      : name

  // Generate all dots
  const allDots = testIds.map((id) =>
    plainTextDot(
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
  let result = `${indent}${chalk.dim(label.padEnd(effectiveLabelWidth))}${lines[0] ?? ""}\n`
  for (let i = 1; i < lines.length; i++) {
    result += `${indent}${labelPadding}${lines[i]}\n`
  }

  return result
}

function plainTextConsolidatedRow(
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

function plainTextPackageHeader(name: string): string {
  return `${chalk.dim(name)}\n`
}

function plainTextSummary(
  passed: number,
  failed: number,
  skipped: number,
  total: number,
  elapsed: number,
  testDuration: number,
): string {
  let result = "\n"

  // Single line: Test Files + Duration
  result += chalk.dim("Test Files") + "  "
  if (failed > 0) result += chalk.bold.red(`${failed} failed`) + chalk.dim(" | ")
  if (passed > 0) result += chalk.bold.green(`${passed} passed`)
  if (skipped > 0) result += chalk.dim(" | ") + chalk.yellow(`${skipped} skipped`)
  result += chalk.gray(` (${total})`)
  result += "  " + chalk.dim("Duration") + " " + formatDuration(elapsed)
  result += chalk.gray(` (tests ${formatDuration(testDuration)})`) + "\n"

  return result
}

function plainTextStatsTable(categories: string[], categoryStats: Map<string, CategoryStats>): string {
  if (categories.length <= 1) return ""

  const nameWidth = Math.max(...categories.map((c) => c.length), 12)
  // Single header line with bold column names
  let result = "\n" + chalk.bold(`${"PACKAGE".padEnd(nameWidth)}  TESTS     TIME   SLOW`) + "\n"

  for (const category of categories) {
    const stats = categoryStats.get(category)
    if (!stats) continue

    const testCount = stats.passed + stats.failed + stats.skipped
    const name = category.padEnd(nameWidth)
    const tests = testCount.toString().padStart(5)
    const time = formatDuration(stats.duration).padStart(8)
    const slow = stats.slowCount > 0 ? stats.slowCount.toString().padStart(6) : "     -"

    const nameText = stats.failed > 0 ? chalk.red(name) : chalk.dim(name)
    result += `${nameText}  ${tests}  ${time}  ${slow}\n`
  }

  return result
}

function plainTextSlowestList(tests: SlowestTest[], threshold: number): string {
  if (tests.length === 0) return ""

  let result = "\n" + chalk.bold(`SLOW TESTS`) + chalk.dim(` (>${threshold}ms)`) + "\n"
  for (const t of tests) {
    result += `${chalk.yellow(formatDuration(t.duration).padStart(6))}  ${chalk.gray(t.file + " >")} ${t.name}\n`
  }

  return result
}

function plainTextFailures(errors: Map<string, TestError>): string {
  if (errors.size === 0) return ""

  let result = "\n" + chalk.bold.red("FAILURES") + "\n\n"

  for (const errInfo of errors.values()) {
    result += ` ${chalk.bold.red(sym.cross + " FAIL")} ${errInfo.file}${chalk.gray(" >")} ${errInfo.name}\n`

    for (const err of errInfo.errors) {
      result += `   ${chalk.red(err.message)}\n`
      if (err.stack) {
        const stackLines = err.stack
          .split("\n")
          .filter((line) => line.trim().startsWith("at "))
          .slice(0, 5)
        for (const line of stackLines) {
          result += chalk.dim(`   ${line.trim()}`) + "\n"
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
  private options: Required<ReporterOptions>
  private timings: TestTiming[] = []
  private passed = 0
  private failed = 0
  private skipped = 0
  private startTime = 0

  private testStates = new Map<string, "pending" | "passed" | "failed" | "skipped">()
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

  // Note: inkx inline mode doesn't work well with vitest's worker output,
  // so we use plain text rendering for both TTY and non-TTY modes

  private get isTTY(): boolean {
    // Explicit override via env var
    if (process.env.VITEST_REPORTER_TTY === "false") return false
    if (process.env.VITEST_REPORTER_TTY === "true") return true

    // CI environments → non-TTY (plain text output)
    if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI || process.env.JENKINS_URL) {
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

  async onTestRunStart(_specs: readonly TestSpecification[]) {
    debug("onTestRunStart called with %d specs, isTTY=%s", _specs.length, this.isTTY)

    // Write header
    process.stdout.write(plainTextHeader(this.ctx.version, process.cwd()))

    // Hide cursor in TTY mode
    if (this.isTTY) {
      process.stdout.write(cursor.hide)
    }
  }

  onTestModuleCollected(module: TestModule) {
    debug("onTestModuleCollected: %s", (module as { moduleId?: string }).moduleId)
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

    const moduleId = (testCase.module as { moduleId?: string }).moduleId ?? "unknown"
    debug("onTestCaseReady: id=%s name=%s module=%s", id, testCase.name, moduleId)

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

    debug("onTestCaseResult: %s state=%s duration=%dms", testCase.name, state, duration)

    const moduleId = (testCase.module as { moduleId?: string }).moduleId ?? "unknown"
    const testState = state === "passed" ? "passed" : state === "failed" ? "failed" : "skipped"

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

    const logs = diagnostic as { stdout?: string; stderr?: string }
    if (logs.stdout || logs.stderr) {
      this.noisyTestIds.add(id)
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
          if (duration >= this.options.slowThreshold) categoryFileStats.slowCount++
        }
      }
    }

    this.updateTopSlowest(testCase.name, moduleId, duration)
  }

  private updateTopSlowest(name: string, file: string, duration: number) {
    if (duration < this.options.slowThreshold) return
    this.topSlowest.push({ name, file: this.relativePath(file), duration })
    this.topSlowest.sort((a, b) => b.duration - a.duration)
    this.topSlowest = this.topSlowest.slice(0, this.options.maxSlow)
  }

  onTestModuleEnd(_testModule: TestModule) {}

  onTestRunEnd() {
    debug("onTestRunEnd called, passed=%d failed=%d skipped=%d", this.passed, this.failed, this.skipped)

    const elapsed = Date.now() - this.startTime
    const testDuration = this.timings.reduce((sum, t) => sum + t.duration, 0)
    const total = this.passed + this.failed + this.skipped

    // Render final output using plain text (both TTY and non-TTY)
    // inkx inline mode doesn't work well with vitest's worker output
    const effectiveGrouping = this.getEffectiveGrouping()
    const labelWidth = 20
    const maxDots = this.columns - labelWidth - 2

    debug("final render: grouping=%s, packages=%d, files=%d", effectiveGrouping, this.categoryOrder.length, this.fileOrder.length)

    switch (effectiveGrouping) {
      case "consolidated":
        // Single row of all dots
        process.stdout.write(
          plainTextConsolidatedRow(
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
          process.stdout.write(
            plainTextRow(
              fileName,
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
          process.stdout.write(plainTextPackageHeader(category))
          for (const fileName of stats.fileOrder) {
            const fileStats = stats.files.get(fileName)
            if (!fileStats) continue
            process.stdout.write(
              plainTextRow(
                fileName,
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
      default:
        // Package names with dots
        for (const category of this.categoryOrder) {
          const stats = this.categoryStats.get(category)
          if (!stats) continue
          process.stdout.write(
            plainTextRow(
              category,
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
    }

    // Write summary and details
    process.stdout.write(plainTextSummary(this.passed, this.failed, this.skipped, total, elapsed, testDuration))
    // Only show package stats table if we have multiple packages
    if (this.categoryOrder.length > 1) {
      process.stdout.write(plainTextStatsTable(this.categoryOrder, this.categoryStats))
    }
    if (this.options.showSlow) {
      process.stdout.write(plainTextSlowestList(this.topSlowest, this.options.slowThreshold))
    }
    process.stdout.write(plainTextFailures(this.testErrors))

    // Show cursor in TTY mode
    if (this.isTTY) {
      process.stdout.write(cursor.show)
    }
    process.stdout.write("\n")

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
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { name?: string }
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
