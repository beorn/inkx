/**
 * DotzReporter - inkx-based Vitest Reporter
 *
 * Single React component used for both modes:
 * - TTY: render() with mode: 'inline' for live updates
 * - Non-TTY: renderString() for static output
 *
 * All output goes through inkx - layout, colors, everything.
 */

import * as fs from "node:fs"
import { useSyncExternalStore, createContext, useContext } from "react"
import type {
  Reporter,
  TestCase,
  TestModule,
  TestSpecification,
  TestSuite,
  Vitest,
} from "vitest/node"
import {
  render,
  createTerm,
  Box,
  Text,
  useTerm,
  type Term,
  type Instance,
} from "inkx"
import Debug from "debug"

import {
  createTestStore,
  type TestStore,
  type TestStoreState,
} from "./store.js"

const debug = Debug("km:vitest-dotz")

// =============================================================================
// Context for Interactive Mode
// =============================================================================

const InteractiveContext = createContext(true)
function useInteractive() {
  return useContext(InteractiveContext)
}

// =============================================================================
// Constants & Types
// =============================================================================

type TestState = "pending" | "passed" | "failed" | "skipped"

const DOT = {
  fail: "x",
  skip: "-",
  pending: "*",
  noisy: "!",
} as const

export interface ReporterOptions {
  slowThreshold?: number
  perfOutput?: string
  showSlow?: boolean
  /** Symbols for pass states, mapped linearly from 0x to 10x threshold. */
  symbols?: string[]
}

const PASS_SLOW_SYMBOLS = {
  dots: ["·", "•", "●"],
}

// =============================================================================
// React Hooks
// =============================================================================

function useTestStore(store: TestStore): TestStoreState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

// =============================================================================
// Main Report Component (used for both TTY and non-TTY)
// =============================================================================

interface ReportProps {
  store: TestStore
  options: Required<ReporterOptions>
}

function Report({ store, options }: ReportProps) {
  const interactive = useInteractive()
  const state = useTestStore(store)

  return (
    <Box flexDirection="column">
      {/* Live dots - only in interactive mode WHILE RUNNING */}
      {interactive && state.isRunning && (
        <DotsDisplay state={state} options={options} />
      )}

      {/* Summary sections - shown when not running (or always in non-interactive) */}
      {(!interactive || !state.isRunning) && (
        <>
          <Summary state={state} />
          <PackageTable state={state} />
          <SlowTests state={state} options={options} />
          <Failures state={state} />
        </>
      )}
    </Box>
  )
}

// -----------------------------------------------------------------------------
// Dots Display (live updating dots grouped by package)
// -----------------------------------------------------------------------------

interface DotsDisplayProps {
  state: TestStoreState
  options: Required<ReporterOptions>
}

function DotsDisplay({ state, options }: DotsDisplayProps) {
  const term = useTerm()
  const cols = process.stdout.columns || 80

  // Calculate max label width
  const maxLabelWidth = Math.min(
    Math.max(...state.categoryOrder.map((c) => c.length), 12) + 1,
    20,
  )

  const maxDotsPerLine = Math.max(20, cols - maxLabelWidth - 1)

  return (
    <Box flexDirection="column">
      {state.categoryOrder.map((category) => {
        const catStats = state.categoryStats.get(category)
        if (!catStats) return null

        // Build dots for all tests in this category
        const dots = catStats.testIds.map((id) => {
          const testState = state.testStates.get(id) ?? "pending"
          const duration = state.testDurations.get(id) ?? 0
          const isNoisy = state.noisyTestIds.has(id)
          return renderDot(term, testState, duration, isNoisy, options)
        })

        // Wrap dots into lines
        const lines: string[][] = []
        for (let i = 0; i < dots.length; i += maxDotsPerLine) {
          lines.push(dots.slice(i, i + maxDotsPerLine))
        }

        return (
          <Box key={category} flexDirection="column">
            {lines.map((lineDots, i) => (
              <Text key={i}>
                {i === 0
                  ? term.style().cyan(category.padEnd(maxLabelWidth))
                  : " ".repeat(maxLabelWidth)}
                {lineDots.join("")}
              </Text>
            ))}
          </Box>
        )
      })}
    </Box>
  )
}

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

interface SummaryProps {
  state: TestStoreState
}

function Summary({ state }: SummaryProps) {
  const term = useTerm()
  const { passed, failed, skipped } = state
  const total = passed + failed + skipped
  const elapsed = Date.now() - state.startTime
  const sum = [...state.testDurations.values()].reduce((a, b) => a + b, 0)

  const counts: string[] = []
  if (failed > 0) counts.push(term.style().bold.red(`${failed} failed`))
  if (passed > 0) counts.push(term.style().bold.green(`${passed} passed`))
  if (skipped > 0) counts.push(term.style().yellow(`${skipped} skipped`))

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        {term.style().dim("Tests")}{" "}
        {counts.length
          ? counts.join(term.style().dim(" | "))
          : term.style().dim("0")}
        {term.style().gray(` (${total})`)}
        {"  "}
        {term.style().dim("Time")} {fmtDuration(elapsed)}
        {term.style().gray(` (sum ${fmtDuration(sum)})`)}
      </Text>
    </Box>
  )
}

// -----------------------------------------------------------------------------
// Package Table
// -----------------------------------------------------------------------------

interface PackageTableProps {
  state: TestStoreState
}

function PackageTable({ state }: PackageTableProps) {
  const term = useTerm()

  if (state.categoryOrder.length <= 1) return null

  const w = Math.max(...state.categoryOrder.map((c) => c.length), 12)

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        {term
          .style()
          .bold.white(
            `${"PACKAGE".padEnd(w)}  ${"TESTS".padStart(5)}  ${"TIME".padStart(8)}  ${"SLOW".padStart(6)}`,
          )}
      </Text>
      {state.categoryOrder.map((cat) => {
        const s = state.categoryStats.get(cat)
        if (!s) return null
        const n = s.passed + s.failed + s.skipped
        const slow =
          s.slowCount > 0 ? s.slowCount.toString().padStart(6) : "     -"
        const row = `${cat.padEnd(w)}  ${n.toString().padStart(5)}  ${fmtDuration(s.duration).padStart(8)}  ${slow}`
        return (
          <Text key={cat}>
            {s.failed > 0 ? term.style().red(row) : term.style().dim(row)}
          </Text>
        )
      })}
    </Box>
  )
}

// -----------------------------------------------------------------------------
// Slow Tests
// -----------------------------------------------------------------------------

interface SlowTestsProps {
  state: TestStoreState
  options: Required<ReporterOptions>
}

function SlowTests({ state, options }: SlowTestsProps) {
  const term = useTerm()

  if (!options.showSlow || state.topSlowest.length === 0) return null

  const { symbols, slowThreshold: threshold } = options
  const n = symbols.length
  const rangePerSymbol = 10 / n
  const fmt = (ms: number) => (ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`)

  // Build slow symbol legend
  const legendParts: string[] = []
  for (let i = 1; i < n; i++) {
    const minMult = i * rangePerSymbol
    const sym = symbols[i] ?? "●"
    legendParts.push(
      `${term.style().green.dim(sym)} ${term.style().dim(`≥${fmt(Math.round(threshold * minMult))}`)}`,
    )
  }
  const lastSym = symbols[n - 1] ?? "●"
  legendParts.push(
    `${term.style().green(lastSym)} ${term.style().dim(`≥${fmt(threshold * 10)}`)}`,
  )

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        {term.style().bold("SLOW TESTS")}
        {"  "}
        {legendParts.join("  ")}
      </Text>
      {state.topSlowest.map((test, i) => {
        const { index, bright } = durationToSymbolIndex(
          test.duration,
          threshold,
          symbols.length,
        )
        const symbol = symbols[Math.min(index, symbols.length - 1)] ?? "●"
        const styledSymbol = bright
          ? term.style().green(symbol)
          : term.style().green.dim(symbol)
        const fileLoc = test.line ? `${test.file}:${test.line}` : test.file
        return (
          <Text key={i}>
            {styledSymbol}{" "}
            {term.style().green(fmtDuration(test.duration).padStart(6))}{" "}
            {term.style().gray(fileLoc + " >")} {test.name}
          </Text>
        )
      })}
    </Box>
  )
}

// -----------------------------------------------------------------------------
// Failures
// -----------------------------------------------------------------------------

interface FailuresProps {
  state: TestStoreState
}

function Failures({ state }: FailuresProps) {
  const term = useTerm()

  if (state.testErrors.size === 0) return null

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>{term.style().bold.red("FAILURES")}</Text>
      {[...state.testErrors.values()].map((err, i) => (
        <Box key={i} flexDirection="column" marginTop={1}>
          <Text>
            {term.style().red("✗")} {term.style().bold(err.name)}
          </Text>
          <Text>
            {"  "}
            {term.style().dim(err.file)}
          </Text>
          {err.errors.map((e, j) => (
            <Box key={j} flexDirection="column">
              <Text>
                {"  "}
                {e.message}
              </Text>
              {e.stack &&
                e.stack
                  .split("\n")
                  .map((line, k) => (
                    <Text key={k}>{term.style().dim(line)}</Text>
                  ))}
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )
}

// =============================================================================
// DotzReporter Class
// =============================================================================

export class DotzReporter implements Reporter {
  private ctx!: Vitest
  private store: TestStore
  private options: Required<ReporterOptions>
  private packageNameCache = new Map<string, string>()
  private finishedTests = new Set<string>()
  private finishedCalled = false
  private isTTY = false
  private term: Term | null = null
  private app: Instance | null = null

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
    // Check for TTY AND non-dumb terminal
    // Also disable for CI environments which often have pseudo-TTYs but no interactivity
    const term = process.env.TERM ?? ""
    const isDumbTerminal = term === "dumb" || term === ""
    const isCI = Boolean(process.env.CI)
    this.isTTY = (process.stdout.isTTY ?? false) && !isDumbTerminal && !isCI
    debug(
      "isTTY=%s (stdout.isTTY=%s, TERM=%s, CI=%s)",
      this.isTTY,
      process.stdout.isTTY,
      term,
      isCI,
    )
  }

  async onTestRunStart(_specs: readonly TestSpecification[]) {
    debug("onTestRunStart called with %d specs", _specs.length)
    this.store.reset()
    this.store.setRunning(true)
    this.finishedTests.clear()
    this.finishedCalled = false

    // TTY mode: Start inkx render with inline mode
    if (this.isTTY) {
      // Disable act() warnings - we're a reporter, not a test
      // @ts-expect-error - React internal flag
      globalThis.IS_REACT_ACT_ENVIRONMENT = false

      this.term = createTerm()
      this.app = await render(
        this.term,
        <InteractiveContext.Provider value={true}>
          <Report store={this.store} options={this.options} />
        </InteractiveContext.Provider>,
        {
          mode: "inline",
        },
      )
    }
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

    // Get line number: prefer mdtest metadata, fall back to Vitest location
    const meta = testCase.meta() as { mdtestLocation?: { line?: number } }
    const computedLocation = (testCase as { location?: { line?: number } })
      .location
    const line = meta.mdtestLocation?.line ?? computedLocation?.line

    this.store.updateTest(id, testState, duration, errors, isNoisy)
    this.store.updateSlowest(
      testCase.name,
      this.relativePath(moduleId),
      line,
      duration,
      this.options.slowThreshold,
    )
    // React re-renders automatically via store subscription
  }

  onTestModuleEnd(_: TestModule) {}

  onTestRunEnd(
    testModules?: Iterable<TestModule>,
    errors?: readonly unknown[],
    _state?: unknown,
  ) {
    debug("onTestRunEnd called", {
      testModules: !!testModules,
      errors: (errors as unknown[])?.length,
    })
    void this.finishRun()
  }

  // Deprecated in vitest 3+, but kept for compatibility
  onFinished(_files?: unknown[], _errors?: unknown[]) {
    debug("onFinished called")
    void this.finishRun()
  }

  private async finishRun() {
    if (this.finishedCalled) return
    this.finishedCalled = true
    this.store.setRunning(false)

    if (this.isTTY && this.app) {
      // TTY: Wait for final render, then cleanup
      await new Promise((resolve) => {
        setTimeout(resolve, 100)
      })
      this.app.unmount()
      this.app = null
      this.term?.[Symbol.dispose]()
      this.term = null
    } else {
      // Non-TTY: Render static report using renderString
      await this.printSummary()
    }

    if (this.options.perfOutput) this.exportPerformance()
  }

  private async printSummary() {
    const cols = process.stdout.columns || 80

    // Dynamically import renderString
    const { renderString } = await import("inkx")

    // Render the static report - renderString provides Term via context automatically
    const output = await renderString(
      <InteractiveContext.Provider value={false}>
        <Report store={this.store} options={this.options} />
      </InteractiveContext.Provider>,
      { width: cols, height: 100 },
    )

    // TODO: why is this needed?  if it's a bug with inkx, we should fix it.
    // Trim trailing blank lines (including lines with only ANSI codes)
    // Match: newlines followed by optional ANSI escape sequences and/or whitespace
    const trimmed = output.replace(/(\n(\x1b\[[0-9;]*[a-zA-Z]|\s)*)+$/, "")
    console.log(trimmed)
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

function renderDot(
  term: Term,
  state: TestState,
  duration: number,
  noisy: boolean,
  options: Required<ReporterOptions>,
): string {
  if (noisy && state !== "failed") return term.style().magenta(DOT.noisy)
  if (state === "passed") {
    const symbols = options.symbols
    const { index, bright } = durationToSymbolIndex(
      duration,
      options.slowThreshold,
      symbols.length,
    )
    const symbol = symbols[Math.min(index, symbols.length - 1)] ?? "●"
    return bright ? term.style().green(symbol) : term.style().green.dim(symbol)
  }
  if (state === "failed") return term.style().red(DOT.fail)
  if (state === "skipped") return term.style().gray.dim(DOT.skip)
  return term.style().yellow(DOT.pending)
}

function durationToSymbolIndex(
  duration: number,
  threshold: number,
  symbolCount: number,
): { index: number; bright: boolean } {
  const multiplier = duration / threshold
  const rangePerSymbol = 10 / symbolCount
  const stage = Math.floor(multiplier / rangePerSymbol)

  if (stage >= symbolCount) {
    return { index: symbolCount - 1, bright: true }
  }
  return { index: stage, bright: false }
}
