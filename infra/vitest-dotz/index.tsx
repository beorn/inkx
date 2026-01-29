/**
 * DotzReporter - Live-updating Vitest Reporter
 *
 * Renders test progress as colored dots with live re-rendering in place.
 * Uses cursor movement to update the same screen area (not fullscreen mode).
 *
 * Features:
 * - Live updating display (redraws in place)
 * - Keyboard controls: a=auto, p=packages, f=files, q=quit
 * - Grouping modes control how dots are organized
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
import {
  createFlexxEngine,
  setLayoutEngine,
  isLayoutEngineInitialized,
  createTerm,
  type Term,
} from "inkx"
import Debug from "debug"

import {
  createTestStore,
  type TestStore,
  type TestStoreState,
} from "./store.js"

const debug = Debug("km:vitest-dotz")

// =============================================================================
// Constants & Types
// =============================================================================

type GroupingMode = "auto" | "packages" | "files"
type TestState = "pending" | "passed" | "failed" | "skipped"
const DOT = {
  fail: "x",
  skip: "-",
  pending: "*",
  noisy: "!",
} as const

const CSI = {
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  clearLine: "\x1b[K",
  moveUp: (n: number) => `\x1b[${n}A`,
  moveToCol1: "\x1b[G",
} as const

export interface ReporterOptions {
  slowThreshold?: number
  perfOutput?: string
  showSlow?: boolean
  /** Symbols for pass states, mapped linearly from 0x to 10x threshold. Last symbol repeats bright for >10x. */
  symbols?: string[]
}

const PASS_SLOW_SYMBOLS = {
  dots: ["·", "•", "●"],
  // bars: ["▁", "▂", "▃", "▄", "▅", "▆", "▇"],
}

// =============================================================================
// DotzReporter Class
// =============================================================================

export class DotzReporter implements Reporter {
  private ctx!: Vitest
  private term: Term | null = null
  private store: TestStore
  private options: Required<ReporterOptions>
  private packageNameCache = new Map<string, string>()
  private finishedTests = new Set<string>()
  private finishedCalled = false

  // Keyboard state
  private groupingMode: GroupingMode = "auto"
  private stdinHandler: ((data: Buffer) => void) | null = null
  private wasRawMode = false

  // Rendering state
  private lastLineCount = 0
  private cols = 80

  constructor(options: ReporterOptions = {}) {
    this.options = {
      slowThreshold: options.slowThreshold ?? 100,
      perfOutput: options.perfOutput ?? "",
      showSlow: options.showSlow ?? true,
      symbols: options.symbols ?? PASS_SLOW_SYMBOLS.dots,
    }
    this.store = createTestStore(this.options.slowThreshold)
    debug("reporter initialized with options: %O", this.options)
  }

  // ===========================================================================
  // Vitest Reporter Lifecycle
  // ===========================================================================

  onInit(ctx: Vitest) {
    debug("onInit called")
    this.ctx = ctx
    this.term = createTerm()
    if (!isLayoutEngineInitialized()) setLayoutEngine(createFlexxEngine())
    this.term.write(CSI.hideCursor)
    this.setupKeyboardInput()
  }

  onTestRunStart(_specs: readonly TestSpecification[]) {
    debug("onTestRunStart called with %d specs", _specs.length)
    this.store.reset()
    this.store.setRunning(true)
    this.finishedTests.clear()
    this.finishedCalled = false
    this.lastLineCount = 0
    this.cols = process.stdout.columns || this.term?.cols || 80
    this.renderFrame()
  }

  onTestModuleCollected(module: TestModule) {
    debug(
      "onTestModuleCollected: %s",
      (module as { moduleId?: string }).moduleId,
    )
    for (const test of module.children.allTests()) this.onTestCaseReady(test)
  }

  onTestSuiteReady(suite: TestSuite) {
    debug("onTestSuiteReady: %s", suite.name)
    for (const test of suite.children.allTests()) this.onTestCaseReady(test)
  }

  onTestCaseReady(testCase: TestCase) {
    if (this.finishedTests.has(testCase.id)) return
    const moduleId =
      (testCase.module as { moduleId?: string }).moduleId ?? "unknown"
    this.store.addTest(
      testCase.id,
      this.extractCategory(moduleId),
      this.extractFileName(moduleId),
    )
  }

  onTestCaseResult(testCase: TestCase) {
    const result = testCase.result()
    if (!result) return

    const id = testCase.id
    const diagnostic = testCase.diagnostic()
    const duration = diagnostic?.duration ?? 0
    const moduleId =
      (testCase.module as { moduleId?: string }).moduleId ?? "unknown"
    const testState: TestState =
      result.state === "passed"
        ? "passed"
        : result.state === "failed"
          ? "failed"
          : "skipped"

    this.finishedTests.add(id)

    const errors =
      testState === "failed" && result.errors?.length
        ? result.errors.map((e) => ({
            message: e.message ?? "Unknown error",
            stack: e.stack,
          }))
        : undefined

    const logs = diagnostic as { stdout?: string; stderr?: string } | undefined
    const isNoisy = Boolean(logs?.stdout || logs?.stderr)

    this.store.updateTest(id, testState, duration, errors, isNoisy)
    this.store.updateSlowest(
      testCase.name,
      this.relativePath(moduleId),
      duration,
      this.options.slowThreshold,
    )
    this.renderFrame()
  }

  onTestModuleEnd(_: TestModule) {}

  onTestRunEnd(
    testModules?: Iterable<TestModule>,
    errors?: readonly unknown[],
    state?: unknown,
  ) {
    debug("onTestRunEnd called", {
      testModules: !!testModules,
      errors: (errors as unknown[])?.length,
      state,
    })
    this.finishRun()
  }

  // Deprecated in vitest 3+, but kept for compatibility
  onFinished(_files?: unknown[], _errors?: unknown[]) {
    debug("onFinished called")
    this.finishRun()
  }

  private finishRun() {
    if (this.finishedCalled) return
    this.finishedCalled = true
    this.store.setRunning(false)
    this.cleanup()
    this.renderFrame()
    this.term?.write(CSI.showCursor + "\n")
    this.term?.[Symbol.dispose]()
    this.term = null
    if (this.options.perfOutput) this.exportPerformance()
  }

  // ===========================================================================
  // Keyboard Input
  // ===========================================================================

  private setupKeyboardInput() {
    if (!process.stdin.isTTY) return

    this.wasRawMode = process.stdin.isRaw ?? false
    process.stdin.setRawMode(true)
    process.stdin.resume()

    this.stdinHandler = (data: Buffer) => {
      const key = data.toString().toLowerCase()
      debug("key pressed: %s", key)

      if (key === "a") this.setGroupingMode("auto")
      else if (key === "p") this.setGroupingMode("packages")
      else if (key === "f") this.setGroupingMode("files")
      else if (key === "q" || key === "\x03") {
        this.cleanup()
        process.exit(0)
      }
    }

    process.stdin.on("data", this.stdinHandler)
  }

  private setGroupingMode(mode: GroupingMode) {
    if (mode === this.groupingMode) return
    this.groupingMode = mode
    this.renderFrame()
  }

  private cleanup() {
    if (this.stdinHandler) {
      process.stdin.off("data", this.stdinHandler)
      this.stdinHandler = null
    }
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(this.wasRawMode)
      process.stdin.pause()
    }
  }

  // ===========================================================================
  // Rendering
  // ===========================================================================

  private renderFrame() {
    if (!this.term) return
    const t = this.term
    const state = this.store.getSnapshot()
    const lines: string[] = []

    // Header
    this.buildHeader(t, lines)

    // Dots display
    this.buildDotsDisplay(t, state, lines)

    // Summary
    this.buildSummary(t, state, lines)

    // Package stats (always show if multiple packages)
    this.buildPackageTable(t, state, lines)

    // Slow tests (always show if any)
    this.buildSlowTests(t, state, lines)

    // Failures (always show if any)
    this.buildFailures(t, state, lines)

    // Render with cursor repositioning
    this.writeFrame(t, lines)
  }

  private buildHeader(t: Term, lines: string[]) {
    const symbols = this.options.symbols

    lines.push(
      `${t.bold.inverse.cyan(" DOTZ ")} ${t.cyan(`v${this.ctx?.version ?? "?"}`)} ${t.dim(process.cwd())}`,
    )

    // Simple legend: pass symbol + fail/noisy/skip
    lines.push(
      `${t.green.dim(symbols[0]!)} ${t.dim("pass")}  ` +
        `${t.red(DOT.fail)} ${t.dim("fail")}  ` +
        `${t.magenta(DOT.noisy)} ${t.dim("noisy")}  ` +
        `${t.gray(DOT.skip)} ${t.dim("skip")}`,
    )

    // Show keyboard shortcuts only in watch mode
    if (this.ctx?.config?.watch) {
      lines.push(
        `${t.dim("Keys:")} ${t.cyan("a")}${t.dim("=auto")}  ` +
          `${t.cyan("p")}${t.dim("=packages")}  ` +
          `${t.cyan("f")}${t.dim("=files")}  ` +
          `${t.cyan("q")}${t.dim("=quit")}  ` +
          `${t.dim("Mode:")} ${t.cyan(this.groupingMode)}`,
      )
    }
    lines.push("")
  }

  private buildDotsDisplay(t: Term, state: TestStoreState, lines: string[]) {
    // Calculate which specific files should be broken out
    const fileBreakouts = this.calculateFileBreakouts(state)

    // Find max label width for left-aligned dots
    let maxLabelWidth = 0
    for (const category of state.categoryOrder) {
      maxLabelWidth = Math.max(maxLabelWidth, category.length)
      const brokenOutFiles = fileBreakouts.get(category)
      if (brokenOutFiles) {
        const catStats = state.categoryStats.get(category)
        if (catStats) {
          for (const file of brokenOutFiles) {
            const rawName = file.split("/").pop() ?? file
            const prettyName = prettifyFilename(rawName)
            maxLabelWidth = Math.max(maxLabelWidth, prettyName.length + 2)
          }
        }
      }
    }
    const labelWidth = Math.min(maxLabelWidth + 1, 28)

    for (const category of state.categoryOrder) {
      const catStats = state.categoryStats.get(category)
      if (!catStats) continue

      const brokenOutFiles = fileBreakouts.get(category) ?? new Set<string>()

      // Collect test IDs for files NOT broken out (for package line)
      const inlineTestIds: string[] = []
      for (const file of catStats.fileOrder) {
        if (!brokenOutFiles.has(file)) {
          const fileStats = catStats.files.get(file)
          if (fileStats) {
            inlineTestIds.push(...fileStats.testIds)
          }
        }
      }

      // Package line: name + dots for non-broken-out files
      const label = category.padEnd(labelWidth)
      if (inlineTestIds.length > 0) {
        this.addDotsWithPrefix(
          t,
          t.cyan(label),
          labelWidth,
          inlineTestIds,
          state,
          lines,
        )
      } else if (brokenOutFiles.size > 0) {
        // All files broken out - just show package name
        lines.push(t.cyan(category))
      }

      // Broken out files with individual dots
      for (const file of catStats.fileOrder) {
        if (!brokenOutFiles.has(file)) continue
        const fileStats = catStats.files.get(file)
        if (!fileStats) continue
        const rawName = file.split("/").pop() ?? file
        const prettyName = prettifyFilename(rawName, labelWidth - 3)
        const fileLabel = `  ${prettyName}`.padEnd(labelWidth)
        this.addDotsWithPrefix(
          t,
          t.dim(fileLabel),
          labelWidth,
          fileStats.testIds,
          state,
          lines,
        )
      }
    }
  }

  /** Returns map of category -> set of files to break out */
  private calculateFileBreakouts(
    state: TestStoreState,
  ): Map<string, Set<string>> {
    const breakouts = new Map<string, Set<string>>()

    // "packages" mode: never break out
    if (this.groupingMode === "packages") {
      return breakouts
    }

    for (const category of state.categoryOrder) {
      const catStats = state.categoryStats.get(category)
      if (!catStats) continue

      const fileBreakouts = new Set<string>()
      const dotsPerLine = Math.max(20, this.cols - 28) // assume max label width

      if (this.groupingMode === "files") {
        // "files" mode: break out all files
        for (const file of catStats.fileOrder) {
          fileBreakouts.add(file)
        }
      } else {
        // "auto" mode: break out largest files until package line fits on one line
        // Use conservative label width (28 max) to account for display alignment
        const maxDots = this.cols - 28 - 1

        // Sort files by test count (largest first)
        const filesBySize = [...catStats.fileOrder]
          .map((file) => ({
            file,
            count: catStats.files.get(file)?.testIds.length ?? 0,
          }))
          .sort((a, b) => b.count - a.count)

        // Break out largest files until remaining dots fit on one line
        let remainingDots = catStats.testIds.length
        for (const { file, count } of filesBySize) {
          if (remainingDots <= maxDots) break
          fileBreakouts.add(file)
          remainingDots -= count
        }
      }

      if (fileBreakouts.size > 0) {
        breakouts.set(category, fileBreakouts)
      }
    }

    return breakouts
  }

  private addDotsWithPrefix(
    t: Term,
    prefix: string,
    prefixLen: number,
    testIds: string[],
    state: TestStoreState,
    lines: string[],
  ) {
    const dots = this.buildDots(t, testIds, state)
    const maxDotsPerLine = Math.max(20, this.cols - prefixLen - 1)
    const wrapped = this.wrapAnsiString(dots, maxDotsPerLine)

    for (let i = 0; i < wrapped.length; i++) {
      lines.push(
        i === 0 ? prefix + wrapped[i] : " ".repeat(prefixLen) + wrapped[i],
      )
    }
  }

  private buildDots(t: Term, testIds: string[], state: TestStoreState): string {
    const parts: string[] = []
    for (const id of testIds) {
      const testState = state.testStates.get(id) ?? "pending"
      const duration = state.testDurations.get(id) ?? 0
      const isNoisy = state.noisyTestIds.has(id)
      parts.push(this.dot(t, testState, duration, isNoisy))
    }
    return parts.join("")
  }

  private dot(
    t: Term,
    state: TestState,
    duration: number,
    noisy: boolean,
  ): string {
    if (noisy && state !== "failed") return t.magenta(DOT.noisy)
    if (state === "passed") {
      const symbols = this.options.symbols
      const { index, bright } = this.durationToSymbolIndex(duration)
      const symbol = symbols[Math.min(index, symbols.length - 1)]!
      return bright ? t.green(symbol) : t.green.dim(symbol)
    }
    if (state === "failed") return t.red(DOT.fail)
    if (state === "skipped") return t.gray.dim(DOT.skip)
    return t.yellow(DOT.pending)
  }

  /** Map duration to symbol index. N symbols = N+1 stages (last symbol repeats bright for >10x). */
  private durationToSymbolIndex(duration: number): {
    index: number
    bright: boolean
  } {
    const threshold = this.options.slowThreshold
    const symbols = this.options.symbols
    const n = symbols.length

    // multiplier: how many times threshold
    const multiplier = duration / threshold

    // N symbols divide 0-10x range into N equal parts
    // Stage i covers [i * 10/N, (i+1) * 10/N) of threshold
    // Stage N (bright) is >= 10x
    const rangePerSymbol = 10 / n
    const stage = Math.floor(multiplier / rangePerSymbol)

    if (stage >= n) {
      // >10x threshold: last symbol, bright
      return { index: n - 1, bright: true }
    }
    return { index: stage, bright: false }
  }

  private wrapAnsiString(str: string, maxVisible: number): string[] {
    if (maxVisible <= 0) maxVisible = 40
    const lines: string[] = []
    let line = ""
    let visible = 0
    let i = 0

    while (i < str.length) {
      if (str[i] === "\x1b") {
        // Consume ANSI escape sequence
        const start = i
        while (i < str.length && str[i] !== "m") i++
        if (i < str.length) i++ // include 'm'
        line += str.slice(start, i)
      } else {
        line += str[i]
        visible++
        i++
        if (visible >= maxVisible) {
          lines.push(line)
          line = ""
          visible = 0
        }
      }
    }

    if (line || lines.length === 0) lines.push(line)
    return lines
  }

  private buildSummary(t: Term, state: TestStoreState, lines: string[]) {
    lines.push("")
    const { passed, failed, skipped } = state
    const total = passed + failed + skipped
    const elapsed = Date.now() - state.startTime
    const sum = [...state.testDurations.values()].reduce((a, b) => a + b, 0)

    const counts: string[] = []
    if (failed > 0) counts.push(t.bold.red(`${failed} failed`))
    if (passed > 0) counts.push(t.bold.green(`${passed} passed`))
    if (skipped > 0) counts.push(t.yellow(`${skipped} skipped`))

    lines.push(
      `${t.dim("Tests")} ${counts.length ? counts.join(t.dim(" | ")) : t.dim("0")}` +
        `${t.gray(` (${total})`)}  ` +
        `${t.dim("Time")} ${fmtDuration(elapsed)}${t.gray(` (sum ${fmtDuration(sum)})`)}`,
    )
  }

  private buildPackageTable(t: Term, state: TestStoreState, lines: string[]) {
    if (state.categoryOrder.length <= 1) return

    lines.push("")
    const w = Math.max(...state.categoryOrder.map((c) => c.length), 12)
    lines.push(
      t.bold.white(
        `${"PACKAGE".padEnd(w)}  ${"TESTS".padStart(5)}  ${"TIME".padStart(8)}  ${"SLOW".padStart(6)}`,
      ),
    )

    for (const cat of state.categoryOrder) {
      const s = state.categoryStats.get(cat)
      if (!s) continue
      const n = s.passed + s.failed + s.skipped
      const slow =
        s.slowCount > 0 ? s.slowCount.toString().padStart(6) : "     -"
      const row = `${cat.padEnd(w)}  ${n.toString().padStart(5)}  ${fmtDuration(s.duration).padStart(8)}  ${slow}`
      lines.push(s.failed > 0 ? t.red(row) : t.dim(row))
    }
  }

  private buildSlowTests(t: Term, state: TestStoreState, lines: string[]) {
    if (!this.options.showSlow || state.topSlowest.length === 0) return

    const symbols = this.options.symbols
    const threshold = this.options.slowThreshold
    const fmt = (ms: number) => (ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`)
    const n = symbols.length
    const rangePerSymbol = 10 / n

    // Build slow symbol legend (space before ≥ for readability)
    const legendParts: string[] = []
    for (let i = 1; i < n; i++) {
      // Start from 1 (skip first symbol shown in header)
      const minMult = i * rangePerSymbol
      legendParts.push(
        `${t.green.dim(symbols[i]!)} ${t.dim(`≥${fmt(Math.round(threshold * minMult))}`)}`,
      )
    }
    // Last symbol bright for >10x
    legendParts.push(
      `${t.green(symbols[n - 1]!)} ${t.dim(`≥${fmt(threshold * 10)}`)}`,
    )

    lines.push("")
    lines.push(`${t.bold("SLOW TESTS")}  ${legendParts.join("  ")}`)

    for (const test of state.topSlowest) {
      const { index, bright } = this.durationToSymbolIndex(test.duration)
      const symbol = symbols[Math.min(index, symbols.length - 1)]!
      const styledSymbol = bright ? t.green(symbol) : t.green.dim(symbol)
      lines.push(
        `${styledSymbol} ${t.green(fmtDuration(test.duration).padStart(6))} ${t.gray(test.file + " >")} ${test.name}`,
      )
    }
  }

  private buildFailures(t: Term, state: TestStoreState, lines: string[]) {
    if (state.testErrors.size === 0) return

    lines.push("")
    lines.push(t.bold.red("FAILURES"))

    for (const [, err] of state.testErrors) {
      lines.push("")
      lines.push(`${t.red("✗")} ${t.bold(err.name)}`)
      lines.push(`  ${t.dim(err.file)}`)
      for (const e of err.errors) {
        lines.push(`  ${e.message}`)
        if (e.stack) {
          for (const stackLine of e.stack.split("\n")) {
            lines.push(t.dim(stackLine))
          }
        }
      }
    }
  }

  private writeFrame(t: Term, lines: string[]) {
    const termRows = process.stdout.rows || 24
    const maxLines = termRows - 2 // leave room for prompt

    // During live updates, cap output to screen height to prevent scroll/flicker
    // Final frame (when !isRunning) can be taller and will scroll once
    const state = this.store.getSnapshot()
    const shouldTruncate = state.isRunning && lines.length > maxLines

    const outputLines = shouldTruncate ? lines.slice(0, maxLines - 1) : lines
    const truncatedCount = shouldTruncate ? lines.length - maxLines + 1 : 0

    // Move cursor up to overwrite previous frame
    if (this.lastLineCount > 0) {
      const moveUp = Math.min(this.lastLineCount, maxLines)
      t.write(CSI.moveUp(moveUp) + CSI.moveToCol1)
    }

    // Write frame
    for (const line of outputLines) {
      t.write(line + CSI.clearLine + "\n")
    }

    // Show truncation indicator if needed
    if (truncatedCount > 0) {
      t.write(t.dim(`  ... ${truncatedCount} more lines`) + CSI.clearLine + "\n")
    }

    // Clear leftover lines from previous frame
    const actualOutput = outputLines.length + (truncatedCount > 0 ? 1 : 0)
    const extra = this.lastLineCount - actualOutput
    if (extra > 0) {
      for (let i = 0; i < extra; i++) t.write(CSI.clearLine + "\n")
      t.write(CSI.moveUp(extra))
    }

    this.lastLineCount = actualOutput
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  private relativePath(path: string) {
    const cwd = process.cwd()
    return path.startsWith(cwd) ? path.slice(cwd.length + 1) : path
  }

  private extractCategory(moduleId: string): string {
    const rel = this.relativePath(moduleId)
    const parts = rel.split("/")
    const cwd = process.cwd()

    // Walk up looking for package.json
    for (let i = parts.length - 1; i >= 0; i--) {
      const dirPath = parts.slice(0, i + 1).join("/")
      const cached = this.packageNameCache.get(dirPath)
      if (cached !== undefined) return cached

      try {
        const pkgPath = `${cwd}/${dirPath}/package.json`
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

    // Fallback: use directory structure
    const groupingDirs = ["packages", "apps", "vendor", "tests"]
    const fallback =
      parts.length >= 2 && parts[0] && groupingDirs.includes(parts[0])
        ? `${parts[0]}/${parts[1]}`
        : parts[0] || "root"
    this.packageNameCache.set(fallback, fallback)
    return fallback
  }

  private extractFileName(moduleId: string): string {
    return this.relativePath(moduleId).split("/").pop() || "unknown"
  }

  private exportPerformance() {
    const state = this.store.getSnapshot()
    const allTests = [...state.testDurations.entries()].map(
      ([id, duration]) => ({
        id,
        duration,
        state: state.testStates.get(id) ?? "pending",
        file: state.testToFile.get(id) ?? "unknown",
      }),
    )

    fs.writeFileSync(
      this.options.perfOutput,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          summary: {
            passed: state.passed,
            failed: state.failed,
            skipped: state.skipped,
            elapsed: Date.now() - state.startTime,
            testDuration: [...state.testDurations.values()].reduce(
              (a, b) => a + b,
              0,
            ),
          },
          slowTests: allTests
            .filter((t) => t.duration >= this.options.slowThreshold)
            .sort((a, b) => b.duration - a.duration),
          allTests,
        },
        null,
        2,
      ),
    )
  }
}

export default DotzReporter

// =============================================================================
// Helpers
// =============================================================================

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`
}

function prettifyFilename(filename: string, maxLen: number = 24): string {
  // Remove common test suffixes
  let name = filename
    .replace(/\.(test|spec)\.(ts|tsx|js|jsx|md)$/, "")
    .replace(/\.(ts|tsx|js|jsx|md)$/, "")

  // Truncate if too long
  if (name.length > maxLen) {
    name = name.slice(0, maxLen - 1) + "…"
  }

  return name
}
