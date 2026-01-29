/**
 * DotzReporter - inkx-based Vitest Reporter
 *
 * Renders test results using inkx React components.
 * All output goes through inkx - layout, colors, everything.
 */

import * as fs from "node:fs"
import { useSyncExternalStore, type ReactNode } from "react"
import type {
  Reporter,
  TestCase,
  TestModule,
  TestSpecification,
  TestSuite,
  Vitest,
} from "vitest/node"
import { Box, Text, useTerm } from "inkx"
import Debug from "debug"

import {
  createTestStore,
  type TestState,
  type TestStore,
  type TestStoreState,
} from "./store.js"

const debug = Debug("km:vitest-dotz")

// =============================================================================
// Types & Constants
// =============================================================================

export interface ReporterOptions {
  slowThreshold?: number
  perfOutput?: string
  showSlow?: boolean
  /** Symbols for pass states, mapped linearly from 0x to 10x threshold. */
  symbols?: string[]
}

type ResolvedOptions = Required<ReporterOptions>

const DEFAULT_SYMBOLS = ["·", "•", "●"]

// =============================================================================
// React Components
// =============================================================================

function useTestStore(store: TestStore): TestStoreState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

interface ReportProps {
  store: TestStore
  options: ResolvedOptions
}

function Report({ store, options }: ReportProps) {
  const state = useTestStore(store)
  return (
    <Box flexDirection="column">
      <DotsSection state={state} options={options} />
      <Summary state={state} />
      <PackageTable state={state} />
      <SlowTests state={state} options={options} />
      <Failures state={state} />
    </Box>
  )
}

// Dot component - can be used with testId (looks up state) or explicit props (for legend)
type DotProps =
  | { testId: string; store: TestStoreState; options: ResolvedOptions }
  | { status: "passed"; duration: number; options: ResolvedOptions }
  | { status: "failed" }
  | { status: "skipped" }
  | { status: "pending" }
  | { status: "noisy" }

function Dot(props: DotProps) {
  const term = useTerm()

  let testState: TestState
  let duration = 0
  let isNoisy = false
  let options: ResolvedOptions | undefined

  if ("testId" in props) {
    testState = props.store.testStates.get(props.testId) ?? "pending"
    duration = props.store.testDurations.get(props.testId) ?? 0
    isNoisy = props.store.noisyTestIds.has(props.testId)
    options = props.options
  } else if (props.status === "noisy") {
    return <Text>{term.style().magenta(DOT_CHARS.noisy)}</Text>
  } else if (props.status === "failed") {
    return <Text>{term.style().red(DOT_CHARS.fail)}</Text>
  } else if (props.status === "skipped") {
    return <Text>{term.style().gray.dim(DOT_CHARS.skip)}</Text>
  } else if (props.status === "pending") {
    return <Text>{term.style().yellow(DOT_CHARS.pending)}</Text>
  } else {
    // status === "passed"
    testState = "passed"
    duration = props.duration
    options = props.options
  }

  // Handle noisy tests
  if (isNoisy && testState !== "failed") {
    return <Text>{term.style().magenta(DOT_CHARS.noisy)}</Text>
  }

  // Handle passed tests with duration-based symbols
  if (testState === "passed" && options) {
    const { index, bright } = durationToSymbolIndex(
      duration,
      options.slowThreshold,
      options.symbols.length,
    )
    const char = options.symbols[Math.min(index, options.symbols.length - 1)] ?? "●"
    const styled = bright ? term.style().green(char) : term.style().green.dim(char)
    return <Text>{styled}</Text>
  }

  // Fallback for other states
  if (testState === "failed") return <Text>{term.style().red(DOT_CHARS.fail)}</Text>
  if (testState === "skipped") return <Text>{term.style().gray.dim(DOT_CHARS.skip)}</Text>
  return <Text>{term.style().yellow(DOT_CHARS.pending)}</Text>
}

function LegendItem({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  const term = useTerm()
  return (
    <Box flexDirection="row" gap={1}>
      {children}
      <Text>{term.style().dim(label)}</Text>
    </Box>
  )
}

function DotsLegend({ options }: { options: ResolvedOptions }) {
  const term = useTerm()

  return (
    <Box flexDirection="row" gap={2} marginBottom={1}>
      <Text>{term.style().dim("Legend:")}</Text>
      <LegendItem label="fast">
        <Dot status="passed" duration={0} options={options} />
      </LegendItem>
      <LegendItem label="slow">
        <Dot status="passed" duration={options.slowThreshold * 10} options={options} />
      </LegendItem>
      <LegendItem label="fail">
        <Dot status="failed" />
      </LegendItem>
      <LegendItem label="skip">
        <Dot status="skipped" />
      </LegendItem>
      <LegendItem label="pending">
        <Dot status="pending" />
      </LegendItem>
      <LegendItem label="noisy">
        <Dot status="noisy" />
      </LegendItem>
    </Box>
  )
}

function DotsSection({
  state,
  options,
}: {
  state: TestStoreState
  options: ResolvedOptions
}) {
  const term = useTerm()
  const cols = process.stdout.columns || 80

  // Calculate label width based on longest category name
  const maxLabelWidth = Math.min(
    Math.max(...state.categoryOrder.map((c) => c.length), 12) + 1,
    24,
  )
  const dotsWidth = cols - maxLabelWidth - 1
  const fileIndent = 2
  const fileLabelWidth = maxLabelWidth - fileIndent

  // Determine which packages should break out into files
  // Break out if package has many tests and multiple files
  const fileBreakouts = new Set<string>()
  for (const category of state.categoryOrder) {
    const catStats = state.categoryStats.get(category)
    if (catStats && catStats.testIds.length > dotsWidth && catStats.fileOrder.length > 1) {
      fileBreakouts.add(category)
    }
  }

  return (
    <Box flexDirection="column">
      <DotsLegend options={options} />
      {state.categoryOrder.map((category) => {
        const catStats = state.categoryStats.get(category)
        if (!catStats) return null

        const shouldBreakOut = fileBreakouts.has(category)

        if (shouldBreakOut) {
          // Package with file breakout: show package name as header, files with dots below
          return (
            <Box key={category} flexDirection="column">
              <Text>{term.style().cyan.bold(category)}</Text>
              {catStats.fileOrder.map((file) => {
                const fileStats = catStats.files.get(file)
                if (!fileStats) return null
                const fileName = file.replace(/\.(test|spec)\.(ts|tsx|js|jsx|md)$/, "")
                return (
                  <Box key={file} flexDirection="row">
                    <Text>{"  "}{term.style().dim(fileName.padEnd(fileLabelWidth))}</Text>
                    <Box flexDirection="row" flexWrap="wrap" width={dotsWidth}>
                      {fileStats.testIds.map((id) => (
                        <Dot key={id} testId={id} store={state} options={options} />
                      ))}
                    </Box>
                  </Box>
                )
              })}
            </Box>
          )
        }

        // Render all tests in category together (no file breakout)
        return (
          <Box key={category} flexDirection="row">
            <Text>{term.style().cyan(category.padEnd(maxLabelWidth))}</Text>
            <Box flexDirection="row" flexWrap="wrap" width={dotsWidth}>
              {catStats.testIds.map((id) => (
                <Dot key={id} testId={id} store={state} options={options} />
              ))}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

function Summary({ state }: { state: TestStoreState }) {
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

function PackageTable({ state }: { state: TestStoreState }) {
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

function SlowTests({
  state,
  options,
}: {
  state: TestStoreState
  options: ResolvedOptions
}) {
  const term = useTerm()

  if (!options.showSlow || state.topSlowest.length === 0) return null

  const { symbols, slowThreshold: threshold } = options
  const n = symbols.length
  const rangePerSymbol = 10 / n

  // Build legend
  const legendParts: string[] = []
  for (let i = 1; i < n; i++) {
    const minMult = i * rangePerSymbol
    const sym = symbols[i] ?? "●"
    legendParts.push(
      `${term.style().green.dim(sym)} ${term.style().dim(`≥${fmtMs(Math.round(threshold * minMult))}`)}`,
    )
  }
  legendParts.push(
    `${term.style().green(symbols[n - 1] ?? "●")} ${term.style().dim(`≥${fmtMs(threshold * 10)}`)}`,
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

function Failures({ state }: { state: TestStoreState }) {
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
          <Text>{"  "}{term.style().dim(err.file)}</Text>
          {err.errors.map((e, j) => (
            <Box key={j} flexDirection="column">
              <Text>{"  "}{e.message}</Text>
              {e.stack?.split("\n").map((line, k) => (
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
// Reporter Class (minimal - just Vitest lifecycle)
// =============================================================================

// Module-level cache for package name lookups
const packageNameCache = new Map<string, string>()

// App handle type from inkx render()
interface AppHandle {
  unmount: () => void
  waitUntilExit: () => Promise<void>
}

export class DotzReporter implements Reporter {
  private ctx!: Vitest
  private store: TestStore
  private options: ResolvedOptions
  private finishedTests = new Set<string>()
  private finishedCalled = false
  private app: AppHandle | null = null
  private term: { [Symbol.dispose]: () => void } | null = null
  private isTTY: boolean
  private prevActEnv: boolean | undefined

  constructor(options: ReporterOptions = {}) {
    this.options = {
      slowThreshold: options.slowThreshold ?? 100,
      perfOutput: options.perfOutput ?? "",
      showSlow: options.showSlow ?? true,
      symbols: options.symbols ?? DEFAULT_SYMBOLS,
    }
    this.store = createTestStore(this.options.slowThreshold)
    this.isTTY = process.stdout.isTTY === true
    debug("reporter initialized with options: %O, isTTY: %s", this.options, this.isTTY)
  }

  onInit(ctx: Vitest) {
    debug("onInit called")
    this.ctx = ctx
  }

  async onTestRunStart(_specs: readonly TestSpecification[]) {
    debug("onTestRunStart called with %d specs", _specs.length)
    this.store.reset()
    this.store.setRunning(true)
    this.finishedTests.clear()
    this.finishedCalled = false

    // Start streaming render for TTY
    if (this.isTTY && !this.app) {
      await this.startStreaming()
    }
  }

  private async startStreaming() {
    // Tell React we're not in a test - we're the reporter, not under test
    // Save and disable for entire streaming duration
    // @ts-expect-error - React internal flag
    this.prevActEnv = globalThis.IS_REACT_ACT_ENVIRONMENT
    // @ts-expect-error - React internal flag
    globalThis.IS_REACT_ACT_ENVIRONMENT = false

    const { render, createTerm } = await import("inkx")
    this.term = createTerm()
    this.app = await render(
      this.term,
      <Report store={this.store} options={this.options} />,
      { mode: "inline" },
    )
  }

  onTestModuleCollected(module: TestModule) {
    debug("onTestModuleCollected: %s", getModuleId(module))
    for (const test of module.children.allTests()) this.onTestCaseReady(test)
  }

  onTestSuiteReady(suite: TestSuite) {
    debug("onTestSuiteReady: %s", suite.name)
    for (const test of suite.children.allTests()) this.onTestCaseReady(test)
  }

  onTestCaseReady(testCase: TestCase) {
    if (this.finishedTests.has(testCase.id)) return
    const moduleId = getModuleId(testCase.module)
    this.store.addTest(
      testCase.id,
      extractCategory(moduleId),
      extractFileName(moduleId),
    )
  }

  onTestCaseResult(testCase: TestCase) {
    const result = testCase.result()
    if (!result) return

    const id = testCase.id
    const diagnostic = testCase.diagnostic()
    const duration = diagnostic?.duration ?? 0
    const moduleId = getModuleId(testCase.module)

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
    const loc = (testCase as { location?: { line?: number } }).location
    const line = meta.mdtestLocation?.line ?? loc?.line

    this.store.updateTest(id, testState, duration, errors, isNoisy)
    this.store.updateSlowest(
      testCase.name,
      relativePath(moduleId),
      line,
      duration,
      this.options.slowThreshold,
    )
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

  // Deprecated in vitest 3+, kept for compatibility
  onFinished(_files?: unknown[], _errors?: unknown[]) {
    debug("onFinished called")
    void this.finishRun()
  }

  private async finishRun() {
    if (this.finishedCalled) return
    this.finishedCalled = true
    this.store.setRunning(false)

    if (this.app) {
      // Streaming mode: wait a tick for final render, then unmount
      await new Promise((resolve) => {
        setTimeout(resolve, 50)
      })
      this.app.unmount()
      this.term?.[Symbol.dispose]()
      this.app = null
      this.term = null
      // Restore React act environment flag
      // @ts-expect-error - React internal flag
      globalThis.IS_REACT_ACT_ENVIRONMENT = this.prevActEnv
    } else {
      // Non-TTY: render static summary
      await printSummary(this.store, this.options)
    }

    if (this.options.perfOutput) {
      exportPerformance(this.store.getSnapshot(), this.options)
    }
  }
}

export default DotzReporter

// =============================================================================
// Helpers
// =============================================================================

function getModuleId(module: unknown): string {
  return (module as { moduleId?: string }).moduleId ?? "unknown"
}

function relativePath(path: string): string {
  const cwd = process.cwd()
  return path.startsWith(cwd) ? path.slice(cwd.length + 1) : path
}

function extractFileName(moduleId: string): string {
  return relativePath(moduleId).split("/").pop() || "unknown"
}

function extractCategory(moduleId: string): string {
  const rel = relativePath(moduleId)
  const parts = rel.split("/")
  const cwd = process.cwd()

  for (let i = parts.length - 1; i >= 0; i--) {
    const dirPath = parts.slice(0, i + 1).join("/")
    const cached = packageNameCache.get(dirPath)
    if (cached !== undefined) return cached

    try {
      const pkgPath = `${cwd}/${dirPath}/package.json`
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
          name?: string
        }
        const name = pkg.name ?? dirPath
        packageNameCache.set(dirPath, name)
        return name
      }
    } catch {}
  }

  const groupingDirs = ["packages", "apps", "vendor", "tests"]
  const fallback =
    parts.length >= 2 && parts[0] && groupingDirs.includes(parts[0])
      ? `${parts[0]}/${parts[1]}`
      : parts[0] || "root"
  packageNameCache.set(fallback, fallback)
  return fallback
}

async function printSummary(
  store: TestStore,
  options: ResolvedOptions,
): Promise<void> {
  const cols = process.stdout.columns || 80
  const { renderString } = await import("inkx")
  const output = await renderString(
    <Report store={store} options={options} />,
    { width: cols },
  )
  console.log(output)
}

function exportPerformance(
  state: TestStoreState,
  options: ResolvedOptions,
): void {
  const allTests = [...state.testDurations.entries()].map(([id, duration]) => ({
    id,
    duration,
    state: state.testStates.get(id) ?? "pending",
    file: state.testToFile.get(id) ?? "unknown",
  }))

  fs.writeFileSync(
    options.perfOutput,
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
          .filter((t) => t.duration >= options.slowThreshold)
          .sort((a, b) => b.duration - a.duration),
        allTests,
      },
      null,
      2,
    ),
  )
}

const DOT_CHARS = {
  fail: "x",
  skip: "-",
  pending: "*",
  noisy: "!",
} as const

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`
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
