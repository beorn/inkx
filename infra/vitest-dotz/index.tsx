/**
 * DotzReporter - React TUI Vitest Reporter
 *
 * Uses React components with renderSync from inkx for terminal output.
 * All imports come from inkx: Box, Text, renderSync, createTerm, useTerm, etc.
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
import { Box, Text, renderSync, createFlexxEngine, setLayoutEngine, isLayoutEngineInitialized, TermContext, useTerm, createTerm, type Term } from "inkx"
import { type ReactElement, useMemo } from "react"
import Debug from "debug"

import { createTestStore, type TestStore, type TestError, type TestStoreState } from "./store.js"

const debug = Debug("km:vitest-dotz")

// =============================================================================
// Types
// =============================================================================

export interface ReporterOptions {
  slowThreshold?: number
  perfOutput?: string
  showSlow?: boolean
  maxSlow?: number
  targetLineCount?: number
  significantDuration?: number
}

interface TestTiming {
  name: string
  file: string
  duration: number
  state: "passed" | "failed" | "skipped"
}

// =============================================================================
// Symbols
// =============================================================================

const sym = {
  pass: "·",
  slow2x: "•",
  slow5x: "●",
  slow10x: "⬤",
  fail: "x",
  skip: "-",
  pending: "*",
  noisy: "!",
  check: "✓",
  cross: "✗",
}

// =============================================================================
// Components (idiomatic React with hooks)
// =============================================================================

type TestState = "pending" | "passed" | "failed" | "skipped"

interface ReporterViewProps {
  state: TestStoreState
  options: Required<ReporterOptions>
  version: string
  cwd: string
}

/**
 * Main reporter view - uses useTerm() instead of prop drilling
 */
function ReporterView({ state, options, version, cwd }: ReporterViewProps): ReactElement {
  const term = useTerm()

  // Memoize derived values
  const { elapsed, testDuration, total, maxDots } = useMemo(() => ({
    elapsed: Date.now() - state.startTime,
    testDuration: [...state.testDurations.values()].reduce((sum, d) => sum + d, 0),
    total: state.passed + state.failed + state.skipped,
    maxDots: (term.cols ?? 80) - 22,
  }), [state.startTime, state.testDurations, state.passed, state.failed, state.skipped, term.cols])

  return (
    <Box flexDirection="column">
      <Header version={version} cwd={cwd} />
      <TestOutput state={state} threshold={options.slowThreshold} maxDots={maxDots} />
      {!state.isRunning && (
        <>
          <Summary passed={state.passed} failed={state.failed} skipped={state.skipped} total={total} elapsed={elapsed} testDuration={testDuration} />
          {state.categoryOrder.length > 1 && (
            <StatsTable categories={state.categoryOrder} categoryStats={state.categoryStats} />
          )}
          {options.showSlow && (
            <SlowestList tests={state.topSlowest.slice(0, options.maxSlow)} threshold={options.slowThreshold} />
          )}
          <Failures errors={state.testErrors} />
        </>
      )}
    </Box>
  )
}

function Header({ version, cwd }: { version: string; cwd: string }): ReactElement {
  const term = useTerm()

  const legend = useMemo(() => (
    `${term.green(sym.pass)} ${term.dim("pass")}  ${term.green(sym.slow2x)} ${term.dim("slow")}  ${term.red(sym.fail)} ${term.dim("fail")}  ${term.magenta(sym.noisy)} ${term.dim("noisy")}  ${term.gray(sym.skip)} ${term.dim("skip")}`
  ), [term])

  return (
    <Box flexDirection="column">
      <Text>{term.bold.inverse.cyan(" DOTZ ")} {term.cyan(`v${version}`)} {term.dim(cwd)}</Text>
      <Text>{term.dim("Legend:")} {legend}</Text>
      <Text> </Text>
    </Box>
  )
}

function TestOutput({ state, threshold, maxDots }: {
  state: TestStoreState
  threshold: number
  maxDots: number
}): ReactElement {
  const labelWidth = 20

  return (
    <Box flexDirection="column">
      {state.categoryOrder.map((category) => {
        const stats = state.categoryStats.get(category)
        if (!stats) return null

        return (
          <PackageRow
            key={category}
            name={category}
            testIds={stats.testIds}
            testStates={state.testStates}
            testDurations={state.testDurations}
            noisyTestIds={state.noisyTestIds}
            threshold={threshold}
            maxDots={maxDots}
            labelWidth={labelWidth}
          />
        )
      })}
    </Box>
  )
}

/**
 * Pure function to render a single dot - no hooks, term passed as arg
 */
function renderDot(term: Term, testState: TestState, duration: number, threshold: number, isNoisy: boolean): string {
  if (isNoisy && testState !== "failed") {
    return term.magenta(sym.noisy)
  }

  switch (testState) {
    case "passed":
      if (duration >= threshold * 10) return term.green(sym.slow10x)
      if (duration >= threshold * 5) return term.green.dim(sym.slow5x)
      if (duration >= threshold * 2) return term.green.dim(sym.slow2x)
      return term.green.dim(sym.pass)
    case "failed":
      return term.red(sym.fail)
    case "skipped":
      return term.gray.dim(sym.skip)
    case "pending":
      return term.yellow(sym.pending)
  }
}

/**
 * Row of dots for a package (renders as bold white label)
 */
function PackageRow({ name, testIds, testStates, testDurations, noisyTestIds, threshold, maxDots, labelWidth }: {
  name: string
  testIds: string[]
  testStates: Map<string, TestState>
  testDurations: Map<string, number>
  noisyTestIds: Set<string>
  threshold: number
  maxDots: number
  labelWidth: number
}): ReactElement {
  const term = useTerm()

  const label = useMemo(() => {
    const truncated = name.length > labelWidth - 1 ? name.slice(0, labelWidth - 2) + "…" : name.padEnd(labelWidth)
    return term.bold.white(truncated)
  }, [term, name, labelWidth])

  const dots = useMemo(() =>
    testIds.map((id) => renderDot(
      term,
      testStates.get(id) ?? "pending",
      testDurations.get(id) ?? 0,
      threshold,
      noisyTestIds.has(id),
    ))
  , [term, testIds, testStates, testDurations, noisyTestIds, threshold])

  const lines = useMemo(() => {
    const result: string[][] = []
    for (let i = 0; i < dots.length; i += maxDots) {
      result.push(dots.slice(i, i + maxDots))
    }
    return result
  }, [dots, maxDots])

  return (
    <Box flexDirection="column">
      <Text>{label}{lines[0]?.join("") ?? ""}</Text>
      {lines.slice(1).map((line, i) => (
        <Text key={i}>{" ".repeat(labelWidth)}{line.join("")}</Text>
      ))}
    </Box>
  )
}

function Summary({ passed, failed, skipped, total, elapsed, testDuration }: {
  passed: number
  failed: number
  skipped: number
  total: number
  elapsed: number
  testDuration: number
}): ReactElement {
  const term = useTerm()

  const parts = useMemo(() => {
    const result: string[] = []
    if (failed > 0) result.push(term.bold.red(`${failed} failed`), term.dim(" | "))
    if (passed > 0) result.push(term.bold.green(`${passed} passed`))
    if (skipped > 0) result.push(term.dim(" | "), term.yellow(`${skipped} skipped`))
    return result
  }, [term, passed, failed, skipped])

  return (
    <Box flexDirection="column">
      <Text> </Text>
      <Text>
        {term.dim("Test Files")}  {parts.join("")}{term.gray(` (${total})`)}  {term.dim("Duration")} {formatDuration(elapsed)}{term.gray(` (tests ${formatDuration(testDuration)})`)}
      </Text>
    </Box>
  )
}

function StatsTable({ categories, categoryStats }: {
  categories: string[]
  categoryStats: Map<string, { passed: number; failed: number; skipped: number; duration: number; slowCount: number }>
}): ReactElement {
  const term = useTerm()
  const nameWidth = useMemo(() => Math.max(...categories.map((c) => c.length), 12), [categories])

  return (
    <Box flexDirection="column">
      <Text> </Text>
      <Text>{term.bold(`${"PACKAGE".padEnd(nameWidth)}  TESTS     TIME   SLOW`)}</Text>
      {categories.map((category) => {
        const stats = categoryStats.get(category)
        if (!stats) return null
        const testCount = stats.passed + stats.failed + stats.skipped
        const name = category.padEnd(nameWidth)
        const tests = testCount.toString().padStart(5)
        const time = formatDuration(stats.duration).padStart(8)
        const slow = stats.slowCount > 0 ? stats.slowCount.toString().padStart(6) : "     -"
        const nameText = stats.failed > 0 ? term.red(name) : term.dim(name)
        return <Text key={category}>{nameText}  {tests}  {time}  {slow}</Text>
      })}
    </Box>
  )
}

function SlowestList({ tests, threshold }: {
  tests: Array<{ name: string; file: string; duration: number }>
  threshold: number
}): ReactElement {
  const term = useTerm()

  if (tests.length === 0) return <Text />

  const { t5x, t10x, legend } = useMemo(() => {
    const t2x = threshold * 2, t5x = threshold * 5, t10x = threshold * 10
    return {
      t5x, t10x,
      legend: `${term.green.dim(sym.slow2x)} ${term.dim(`≥${t2x}ms`)}  ${term.green.dim(sym.slow5x)} ${term.dim(`≥${t5x}ms`)}  ${term.green(sym.slow10x)} ${term.dim(`≥${t10x}ms`)}`,
    }
  }, [term, threshold])

  return (
    <Box flexDirection="column">
      <Text> </Text>
      <Text>{term.bold("SLOW TESTS")}  {legend}</Text>
      {tests.map((t, i) => {
        const dot = t.duration >= t10x ? term.green(sym.slow10x) : t.duration >= t5x ? term.green.dim(sym.slow5x) : term.green.dim(sym.slow2x)
        return <Text key={i}>{dot} {term.yellow(formatDuration(t.duration).padStart(6))}  {term.gray(t.file + " >")} {t.name}</Text>
      })}
    </Box>
  )
}

function Failures({ errors }: { errors: Map<string, TestError> }): ReactElement {
  const term = useTerm()

  if (errors.size === 0) return <Text />

  const errorList = useMemo(() => [...errors.values()], [errors])

  return (
    <Box flexDirection="column">
      <Text> </Text>
      <Text>{term.bold.red("FAILURES")}</Text>
      <Text> </Text>
      {errorList.map((err, i) => (
        <Box key={i} flexDirection="column">
          <Text> {term.bold.red(sym.cross + " FAIL")} {err.file}{term.gray(" >")} {err.name}</Text>
          {err.errors.map((e, j) => (
            <Text key={j}>   {term.red(e.message)}</Text>
          ))}
          <Text> </Text>
        </Box>
      ))}
    </Box>
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  const mins = Math.floor(ms / 60000)
  const secs = ((ms % 60000) / 1000).toFixed(0)
  return `${mins}m ${secs}s`
}

// =============================================================================
// DotzReporter Class
// =============================================================================

export class DotzReporter implements Reporter {
  private ctx!: Vitest
  private term: Term | null = null
  private store: TestStore
  private options: Required<ReporterOptions>
  private timings: TestTiming[] = []
  private packageNameCache = new Map<string, string>()
  private finishedTests = new Set<string>()

  constructor(options: ReporterOptions = {}) {
    this.options = {
      slowThreshold: options.slowThreshold ?? 100,
      perfOutput: options.perfOutput ?? "",
      showSlow: options.showSlow ?? true,
      maxSlow: options.maxSlow ?? 10,
      targetLineCount: options.targetLineCount ?? 30,
      significantDuration: options.significantDuration ?? 3000,
    }
    this.store = createTestStore(this.options.slowThreshold)
    debug("reporter initialized with options: %O", this.options)
  }

  onInit(ctx: Vitest) {
    debug("onInit called")
    this.ctx = ctx
    this.term = createTerm()

    // Initialize layout engine
    if (!isLayoutEngineInitialized()) {
      const engine = createFlexxEngine()
      setLayoutEngine(engine)
    }
  }

  onTestRunStart(_specs: readonly TestSpecification[]) {
    debug("onTestRunStart called with %d specs", _specs.length)

    this.store.reset()
    this.store.setRunning(true)
    this.timings = []
    this.finishedTests.clear()

    this.renderFrame()
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

    const moduleId = (testCase.module as { moduleId?: string }).moduleId ?? "unknown"
    const category = this.extractCategory(moduleId)
    const fileName = this.extractFileName(moduleId)
    this.store.addTest(id, category, fileName)
  }

  onTestCaseResult(testCase: TestCase) {
    const result = testCase.result()
    if (!result) return

    const id = testCase.id
    const diagnostic = testCase.diagnostic()
    const duration = diagnostic?.duration ?? 0
    const state = result.state
    const moduleId = (testCase.module as { moduleId?: string }).moduleId ?? "unknown"
    const testState = state === "passed" ? "passed" : state === "failed" ? "failed" : "skipped"

    this.timings.push({ name: testCase.name, file: moduleId, duration, state: testState })
    this.finishedTests.add(id)

    let errors: TestError["errors"] | undefined
    if (testState === "failed" && result.errors?.length) {
      errors = result.errors.map((e) => ({
        message: e.message ?? "Unknown error",
        stack: e.stack,
      }))
    }

    let isNoisy = false
    if (diagnostic) {
      const logs = diagnostic as { stdout?: string; stderr?: string }
      if (logs.stdout || logs.stderr) isNoisy = true
    }

    this.store.updateTest(id, testState, duration, errors, isNoisy)
    this.store.updateSlowest(testCase.name, this.relativePath(moduleId), duration, this.options.slowThreshold)

    this.renderFrame()
  }

  onTestModuleEnd(_testModule: TestModule) {}

  onTestRunEnd() {
    debug("onTestRunEnd called")
    this.store.setRunning(false)
    this.renderFrame()

    this.term?.write("\n")
    this.term?.[Symbol.dispose]()
    this.term = null

    if (this.options.perfOutput) {
      this.exportPerformance()
    }
  }

  private renderFrame() {
    if (!this.term) return

    const state = this.store.getSnapshot()

    let output = ""
    const mockStdout = {
      columns: this.term.cols ?? 80,
      rows: 24,
      isTTY: false,
      write(data: string | Uint8Array) {
        output += typeof data === "string" ? data : new TextDecoder().decode(data)
        return true
      },
      on: () => mockStdout,
      off: () => mockStdout,
      once: () => mockStdout,
      removeListener: () => mockStdout,
      addListener: () => mockStdout,
    } as unknown as NodeJS.WriteStream

    const mockStdin = {
      isTTY: false,
      setRawMode: () => mockStdin,
      on: () => mockStdin,
      off: () => mockStdin,
      once: () => mockStdin,
      removeListener: () => mockStdin,
      addListener: () => mockStdin,
      setEncoding: () => mockStdin,
      read: () => null,
      ref: () => mockStdin,
      unref: () => mockStdin,
    } as unknown as NodeJS.ReadStream

    const element = (
      <TermContext.Provider value={this.term}>
        <ReporterView
          state={state}
          options={this.options}
          version={this.ctx?.version ?? "0.0.0"}
          cwd={process.cwd()}
        />
      </TermContext.Provider>
    )

    const instance = renderSync(element, {
      stdout: mockStdout,
      stdin: mockStdin,
      exitOnCtrlC: false,
      nonTTYMode: "line-by-line",
    })
    instance.unmount()

    // Clear screen and write output
    this.term.write("\x1b[H\x1b[2J")
    this.term.write(output)
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

  private exportPerformance() {
    const state = this.store.getSnapshot()
    const elapsed = Date.now() - state.startTime
    const data = {
      timestamp: new Date().toISOString(),
      summary: {
        passed: state.passed,
        failed: state.failed,
        skipped: state.skipped,
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

export default DotzReporter
