/**
 * Custom Vitest Reporter with inkx
 *
 * Uses inkx inline mode for clean, live-updating terminal output with React components.
 * Falls back to simple text output in non-TTY mode (no cursor positioning codes).
 *
 * SYMBOLS:
 *   · (green dim) = passed (fast or slow, <2x threshold)
 *   ● (green)     = passed but very slow (>=2x threshold)
 *   x (red)       = failed
 *   ! (magenta)   = noisy (test with console output)
 *   ⠋ (cyan)      = running (animated spinner in TTY mode)
 *   * (yellow)    = pending/queued
 *   - (gray)      = skipped
 */

import fs from "node:fs"
import React, { useState, useEffect } from "react"
import type { Reporter, TestCase, TestModule, TestSpecification, TestSuite, Vitest } from "vitest/node"
import { render, Box, Text } from "@beorn/inkx"
import { chalk } from "@beorn/chalkx"
import Debug from "debug"

const debug = Debug("km:vitest-reporter")

// Spinner frames for running tests (TTY only)
const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

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

interface ReporterOptions {
  slowThreshold?: number
  perfOutput?: string
  showSlow?: boolean
  maxSlow?: number
  groupByPackage?: boolean
  groupByFile?: boolean
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
// React Components
// ============================================================================

function Header({ version, cwd }: { version: string; cwd: string }) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold inverse color="cyan"> RUN </Text>
        <Text> </Text>
        <Text color="cyan">v{version}</Text>
        <Text> </Text>
        <Text dimColor>{cwd}</Text>
      </Box>
      <Box>
        <Text dimColor>Legend:</Text>
        <Text> </Text>
        <Text color="green">{sym.pass}</Text>
        <Text> </Text>
        <Text dimColor>pass</Text>
        <Text>  </Text>
        <Text color="green">{sym.passSlow2}</Text>
        <Text> </Text>
        <Text dimColor>slow</Text>
        <Text>  </Text>
        <Text color="red">{sym.fail}</Text>
        <Text> </Text>
        <Text dimColor>fail</Text>
        <Text>  </Text>
        <Text color="magenta">{sym.noisy}</Text>
        <Text> </Text>
        <Text dimColor>noisy</Text>
        <Text>  </Text>
        <Text color="gray">{sym.skip}</Text>
        <Text> </Text>
        <Text dimColor>skip</Text>
      </Box>
      <Text> </Text>
    </Box>
  )
}

function Dot({
  state,
  duration,
  isRunning,
  isNoisy,
  threshold,
  spinnerFrame,
  isTTY,
}: {
  state: "pending" | "passed" | "failed" | "skipped"
  duration: number
  isRunning: boolean
  isNoisy: boolean
  threshold: number
  spinnerFrame: number
  isTTY: boolean
}) {
  if (isNoisy && state !== "failed") {
    return <Text color="magenta">{sym.noisy}</Text>
  }

  switch (state) {
    case "passed":
      if (duration >= threshold * 2) {
        return <Text color="green">{sym.passSlow2}</Text>
      }
      return <Text color="green" dimColor>{sym.pass}</Text>
    case "failed":
      return <Text color="red">{sym.fail}</Text>
    case "skipped":
      return <Text color="gray" dimColor>{sym.skip}</Text>
    case "pending":
      if (isRunning && isTTY) {
        return <Text color="cyan">{spinnerFrames[spinnerFrame]}</Text>
      }
      return <Text color="yellow">{sym.pending}</Text>
  }
}

function CategoryRow({
  name,
  testIds,
  testStates,
  testDurations,
  runningTests,
  noisyTestIds,
  threshold,
  spinnerFrame,
  maxDots,
  isTTY,
}: {
  name: string
  testIds: string[]
  testStates: Map<string, "pending" | "passed" | "failed" | "skipped">
  testDurations: Map<string, number>
  runningTests: Set<string>
  noisyTestIds: Set<string>
  threshold: number
  spinnerFrame: number
  maxDots: number
  isTTY: boolean
}) {
  const labelWidth = 20
  const label = name.length > labelWidth - 1 ? name.slice(0, labelWidth - 2) + "…" : name

  const visibleDots = testIds.slice(0, maxDots)
  const truncated = testIds.length > maxDots

  return (
    <Box>
      <Text dimColor>{label.padEnd(labelWidth)}</Text>
      {visibleDots.map((id, i) => (
        <Dot
          key={i}
          state={testStates.get(id) ?? "pending"}
          duration={testDurations.get(id) ?? 0}
          isRunning={runningTests.has(id)}
          isNoisy={noisyTestIds.has(id)}
          threshold={threshold}
          spinnerFrame={spinnerFrame}
          isTTY={isTTY}
        />
      ))}
      {truncated && <Text>…</Text>}
    </Box>
  )
}

function StatsTableLive({
  categories,
  categoryStats,
}: {
  categories: string[]
  categoryStats: Map<string, CategoryStats>
}) {
  const nameWidth = Math.max(...categories.map((c) => c.length), 12)

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>{`${"Package".padEnd(nameWidth)}  Tests     Time   Slow`}</Text>
      {categories.map((category) => {
        const stats = categoryStats.get(category)
        if (!stats) return null

        const finished = stats.passed + stats.failed + stats.skipped
        const total = stats.testIds.length
        const tests = `${finished}/${total}`.padStart(7)
        const time = formatDuration(stats.duration).padStart(8)
        const slow = stats.slowCount > 0 ? stats.slowCount.toString().padStart(6) : "     -"

        let color: string | undefined
        if (stats.failed > 0) color = "red"
        else if (finished === total) color = "green"

        return (
          <Box key={category}>
            <Text color={color} dimColor={!color}>{category.padEnd(nameWidth)}</Text>
            <Text>  {tests}  {time}  {slow}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

function SlowestListLive({
  tests,
  threshold,
  maxShow,
}: {
  tests: SlowestTest[]
  threshold: number
  maxShow: number
}) {
  if (tests.length === 0) return null

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>{`Slowest (>${threshold}ms):`}</Text>
      {tests.slice(0, maxShow).map((t, i) => (
        <Box key={i}>
          <Text>  </Text>
          <Text color="yellow">{formatDuration(t.duration).padStart(8)}</Text>
          <Text>  </Text>
          <Text dimColor>{t.file} {">"}</Text>
          <Text> {t.name}</Text>
        </Box>
      ))}
    </Box>
  )
}

function Summary({
  passed,
  failed,
  skipped,
  total,
  elapsed,
  testDuration,
}: {
  passed: number
  failed: number
  skipped: number
  total: number
  elapsed: number
  testDuration: number
}) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text dimColor>Test Files</Text>
        <Text>  </Text>
        {failed > 0 && (
          <>
            <Text bold color="red">{failed} failed</Text>
            <Text dimColor> | </Text>
          </>
        )}
        {passed > 0 && (
          <>
            <Text bold color="green">{passed} passed</Text>
            {skipped > 0 && <Text dimColor> | </Text>}
          </>
        )}
        {skipped > 0 && <Text color="yellow">{skipped} skipped</Text>}
        <Text color="gray"> ({total})</Text>
      </Box>
      <Box>
        <Text dimColor>  Duration</Text>
        <Text>  </Text>
        <Text>{formatDuration(elapsed)}</Text>
        <Text color="gray"> (tests {formatDuration(testDuration)})</Text>
      </Box>
    </Box>
  )
}

function StatsTableFinal({
  categories,
  categoryStats,
}: {
  categories: string[]
  categoryStats: Map<string, CategoryStats>
}) {
  const nameWidth = Math.max(...categories.map((c) => c.length), 12)

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>By package:</Text>
      <Text dimColor>   {`${"Package".padEnd(nameWidth)}  Tests     Time   Slow`}</Text>
      {categories.map((category) => {
        const stats = categoryStats.get(category)
        if (!stats) return null

        const testCount = stats.passed + stats.failed + stats.skipped
        const name = category.padEnd(nameWidth)
        const tests = testCount.toString().padStart(5)
        const time = formatDuration(stats.duration).padStart(8)
        const slow = stats.slowCount > 0 ? stats.slowCount.toString().padStart(6) : "     -"

        return (
          <Box key={category}>
            <Text>   </Text>
            <Text color={stats.failed > 0 ? "red" : undefined} dimColor={stats.failed === 0}>{name}</Text>
            <Text>  {tests}  {time}  {slow}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

function SlowestListFinal({
  tests,
  threshold,
}: {
  tests: SlowestTest[]
  threshold: number
}) {
  if (tests.length === 0) return null

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>Slow tests ({">"}{threshold}ms):</Text>
      {tests.map((t, i) => (
        <Box key={i}>
          <Text>   </Text>
          <Text color="yellow">{formatDuration(t.duration).padStart(8)}</Text>
          <Text>  </Text>
          <Text color="gray">{t.file} {">"}</Text>
          <Text> {t.name}</Text>
        </Box>
      ))}
    </Box>
  )
}

function Failures({ errors }: { errors: Map<string, TestError> }) {
  if (errors.size === 0) return null

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="red">Failures:</Text>
      <Text> </Text>
      {Array.from(errors.values()).map((errInfo, i) => (
        <Box key={i} flexDirection="column">
          <Box>
            <Text> </Text>
            <Text bold color="red">{sym.cross} FAIL</Text>
            <Text> {errInfo.file}</Text>
            <Text color="gray"> {">"}</Text>
            <Text> {errInfo.name}</Text>
          </Box>
          {errInfo.errors.map((err, j) => (
            <Box key={j} flexDirection="column">
              <Text>   </Text>
              <Text color="red">{err.message}</Text>
              {err.stack && (
                <Box flexDirection="column">
                  {err.stack
                    .split("\n")
                    .filter((line) => line.trim().startsWith("at "))
                    .slice(0, 5)
                    .map((line, k) => (
                      <Text key={k} dimColor>   {line.trim()}</Text>
                    ))}
                </Box>
              )}
            </Box>
          ))}
          <Text> </Text>
        </Box>
      ))}
    </Box>
  )
}

// ============================================================================
// Plain Text Rendering (non-TTY)
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

function plainTextCategoryRow(
  name: string,
  testIds: string[],
  testStates: Map<string, "pending" | "passed" | "failed" | "skipped">,
  testDurations: Map<string, number>,
  noisyTestIds: Set<string>,
  threshold: number,
  maxDots: number,
): string {
  const labelWidth = 20
  const label = name.length > labelWidth - 1 ? name.slice(0, labelWidth - 2) + "…" : name

  const visibleDots = testIds.slice(0, maxDots)
  const truncated = testIds.length > maxDots

  const dots = visibleDots
    .map((id) =>
      plainTextDot(
        testStates.get(id) ?? "pending",
        testDurations.get(id) ?? 0,
        noisyTestIds.has(id),
        threshold,
      ),
    )
    .join("")

  return `${chalk.dim(label.padEnd(labelWidth))}${dots}${truncated ? "…" : ""}\n`
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

  result += chalk.dim("Test Files") + "  "
  if (failed > 0) result += chalk.bold.red(`${failed} failed`) + chalk.dim(" | ")
  if (passed > 0) result += chalk.bold.green(`${passed} passed`)
  if (skipped > 0) result += chalk.dim(" | ") + chalk.yellow(`${skipped} skipped`)
  result += chalk.gray(` (${total})`) + "\n"

  result += chalk.dim("  Duration") + "  "
  result += formatDuration(elapsed)
  result += chalk.gray(` (tests ${formatDuration(testDuration)})`) + "\n"

  return result
}

function plainTextStatsTable(categories: string[], categoryStats: Map<string, CategoryStats>): string {
  if (categories.length <= 1) return ""

  const nameWidth = Math.max(...categories.map((c) => c.length), 12)
  let result = "\n" + chalk.dim("By package:") + "\n"
  result += chalk.dim(`   ${"Package".padEnd(nameWidth)}  Tests     Time   Slow`) + "\n"

  for (const category of categories) {
    const stats = categoryStats.get(category)
    if (!stats) continue

    const testCount = stats.passed + stats.failed + stats.skipped
    const name = category.padEnd(nameWidth)
    const tests = testCount.toString().padStart(5)
    const time = formatDuration(stats.duration).padStart(8)
    const slow = stats.slowCount > 0 ? stats.slowCount.toString().padStart(6) : "     -"

    const nameText = stats.failed > 0 ? chalk.red(name) : chalk.dim(name)
    result += `   ${nameText}  ${tests}  ${time}  ${slow}\n`
  }

  return result
}

function plainTextSlowestList(tests: SlowestTest[], threshold: number): string {
  if (tests.length === 0) return ""

  let result = "\n" + chalk.dim(`Slow tests (>${threshold}ms):`) + "\n"
  for (const t of tests) {
    result += `   ${chalk.yellow(formatDuration(t.duration).padStart(8))}  ${chalk.gray(t.file + " >")} ${t.name}\n`
  }

  return result
}

function plainTextFailures(errors: Map<string, TestError>): string {
  if (errors.size === 0) return ""

  let result = "\n" + chalk.bold.red("Failures:") + "\n\n"

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
// State Management
// ============================================================================

interface ReporterState {
  phase: "init" | "running" | "done"
  version: string
  cwd: string
  categories: string[]
  categoryStats: Map<string, CategoryStats>
  testStates: Map<string, "pending" | "passed" | "failed" | "skipped">
  testDurations: Map<string, number>
  runningTests: Set<string>
  noisyTestIds: Set<string>
  topSlowest: SlowestTest[]
  spinnerFrame: number
  passed: number
  failed: number
  skipped: number
  elapsed: number
  testDuration: number
  testErrors: Map<string, TestError>
}

type StateListener = (state: ReporterState) => void

class StateStore {
  private state: ReporterState
  private listeners: StateListener[] = []

  constructor() {
    this.state = this.createInitialState()
  }

  private createInitialState(): ReporterState {
    return {
      phase: "init",
      version: "",
      cwd: "",
      categories: [],
      categoryStats: new Map(),
      testStates: new Map(),
      testDurations: new Map(),
      runningTests: new Set(),
      noisyTestIds: new Set(),
      topSlowest: [],
      spinnerFrame: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      elapsed: 0,
      testDuration: 0,
      testErrors: new Map(),
    }
  }

  getState(): ReporterState {
    return this.state
  }

  setState(partial: Partial<ReporterState>) {
    this.state = { ...this.state, ...partial }
    this.notify()
  }

  reset() {
    this.state = this.createInitialState()
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }
}

// Main component that renders everything
function ReporterUI({
  store,
  options,
  columns,
  isTTY,
}: {
  store: StateStore
  options: Required<ReporterOptions>
  columns: number
  isTTY: boolean
}) {
  const [state, setState] = useState(store.getState())

  useEffect(() => {
    return store.subscribe(setState)
  }, [store])

  const labelWidth = 20
  const maxDots = columns - labelWidth - 2

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Header version={state.version} cwd={state.cwd} />

      {/* Grouped dots */}
      {state.categories.map((category) => {
        const stats = state.categoryStats.get(category)
        if (!stats) return null

        return (
          <CategoryRow
            key={category}
            name={category}
            testIds={stats.testIds}
            testStates={state.testStates}
            testDurations={state.testDurations}
            runningTests={state.runningTests}
            noisyTestIds={state.noisyTestIds}
            threshold={options.slowThreshold}
            spinnerFrame={state.spinnerFrame}
            maxDots={maxDots}
            isTTY={isTTY}
          />
        )
      })}

      {/* Live stats table (during run) */}
      {state.phase === "running" && options.showLiveStats && state.categories.length > 1 && (
        <StatsTableLive categories={state.categories} categoryStats={state.categoryStats} />
      )}

      {/* Live slowest list (during run) */}
      {state.phase === "running" && options.showLiveStats && state.topSlowest.length > 0 && (
        <SlowestListLive tests={state.topSlowest} threshold={options.slowThreshold} maxShow={5} />
      )}

      {/* Final output (after run) */}
      {state.phase === "done" && (
        <>
          <Summary
            passed={state.passed}
            failed={state.failed}
            skipped={state.skipped}
            total={state.passed + state.failed + state.skipped}
            elapsed={state.elapsed}
            testDuration={state.testDuration}
          />

          {state.categories.length > 1 && (
            <StatsTableFinal categories={state.categories} categoryStats={state.categoryStats} />
          )}

          {options.showSlow && state.topSlowest.length > 0 && (
            <SlowestListFinal tests={state.topSlowest} threshold={options.slowThreshold} />
          )}

          <Failures errors={state.testErrors} />
        </>
      )}
    </Box>
  )
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
  private topSlowest: SlowestTest[] = []
  private packageNameCache = new Map<string, string>()

  private inkInstance: { unmount: () => void; waitUntilExit: () => Promise<void> } | null = null
  private store = new StateStore()
  private spinnerInterval: NodeJS.Timeout | null = null
  private spinnerFrame = 0

  private get isTTY(): boolean {
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
      groupByFile: options.groupByFile ?? false,
      showLiveStats: options.showLiveStats ?? true,
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
    this.topSlowest = []
    this.packageNameCache.clear()
    this.store.reset()
    this.spinnerFrame = 0
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval)
      this.spinnerInterval = null
    }
  }

  async onTestRunStart(_specs: TestSpecification[]) {
    debug("onTestRunStart called with %d specs, isTTY=%s", _specs.length, this.isTTY)

    // Initialize store with header info
    this.store.setState({
      phase: "running",
      version: this.ctx.version,
      cwd: process.cwd(),
    })

    // Non-TTY mode: Write header immediately (no live updates)
    if (!this.isTTY) {
      process.stdout.write(plainTextHeader(this.ctx.version, process.cwd()))
      return
    }

    // TTY mode: Use inkx for live updates
    // Hide cursor
    process.stdout.write(cursor.hide)

    // Start inkx inline rendering
    if (this.options.groupByPackage) {
      this.inkInstance = await render(
        <ReporterUI store={this.store} options={this.options} columns={this.columns} isTTY={this.isTTY} />,
        { mode: "inline" }
      ) as { unmount: () => void; waitUntilExit: () => Promise<void> }

      // Start spinner animation
      this.spinnerInterval = setInterval(() => {
        this.spinnerFrame = (this.spinnerFrame + 1) % spinnerFrames.length
        if (this.runningTests.size > 0) {
          this.updateStore()
        }
      }, 80)
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

    if (this.options.groupByPackage) {
      const category = this.extractCategory(moduleId)
      const fileName = this.extractFileName(moduleId)
      this.testToCategory.set(id, category)
      this.testToFile.set(id, fileName)

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

        if (this.options.groupByFile) {
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
          const fileStats = stats.files.get(fileName)
          if (fileStats) fileStats.testIds.push(id)
        }
      }
    }

    this.updateStore()
  }

  onTestCaseResult(testCase: TestCase) {
    const result = testCase.result()
    if (!result) return

    const id = testCase.id
    const diagnostic = testCase.diagnostic()
    const duration = diagnostic.duration ?? 0
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

    if (this.options.groupByPackage) {
      const category = this.testToCategory.get(id)
      const fileName = this.testToFile.get(id)
      const stats = category ? this.categoryStats.get(category) : undefined
      if (stats) {
        stats.duration += duration
        if (testState === "passed") stats.passed++
        else if (testState === "failed") stats.failed++
        else if (testState === "skipped") stats.skipped++
        if (duration >= this.options.slowThreshold) stats.slowCount++

        if (this.options.groupByFile && fileName) {
          const fileStats = stats.files.get(fileName)
          if (fileStats) {
            fileStats.duration += duration
            if (testState === "passed") fileStats.passed++
            else if (testState === "failed") fileStats.failed++
            else if (testState === "skipped") fileStats.skipped++
            if (duration >= this.options.slowThreshold) fileStats.slowCount++
          }
        }
      }
    }

    this.updateTopSlowest(testCase.name, moduleId, duration)
    this.updateStore()
  }

  private updateTopSlowest(name: string, file: string, duration: number) {
    if (duration < this.options.slowThreshold) return
    this.topSlowest.push({ name, file: this.relativePath(file), duration })
    this.topSlowest.sort((a, b) => b.duration - a.duration)
    this.topSlowest = this.topSlowest.slice(0, this.options.maxSlow)
  }

  private updateStore() {
    if (!this.options.groupByPackage) return

    this.store.setState({
      categories: [...this.categoryOrder],
      categoryStats: new Map(this.categoryStats),
      testStates: new Map(this.testStates),
      testDurations: new Map(this.testDurations),
      runningTests: new Set(this.runningTests),
      noisyTestIds: new Set(this.noisyTestIds),
      topSlowest: [...this.topSlowest],
      spinnerFrame: this.spinnerFrame,
    })
  }

  onTestModuleEnd(_testModule: TestModule) {}

  onTestRunEnd() {
    debug("onTestRunEnd called, passed=%d failed=%d skipped=%d", this.passed, this.failed, this.skipped)

    const elapsed = Date.now() - this.startTime
    const testDuration = this.timings.reduce((sum, t) => sum + t.duration, 0)
    const total = this.passed + this.failed + this.skipped

    // Stop animation
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval)
      this.spinnerInterval = null
    }

    // Non-TTY mode: Write everything at the end using plain text
    if (!this.isTTY) {
      const maxDots = this.columns - 22

      // Write grouped dots
      for (const category of this.categoryOrder) {
        const stats = this.categoryStats.get(category)
        if (!stats) continue

        process.stdout.write(
          plainTextCategoryRow(
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

      // Write summary and details
      process.stdout.write(plainTextSummary(this.passed, this.failed, this.skipped, total, elapsed, testDuration))
      process.stdout.write(plainTextStatsTable(this.categoryOrder, this.categoryStats))
      if (this.options.showSlow) {
        process.stdout.write(plainTextSlowestList(this.topSlowest, this.options.slowThreshold))
      }
      process.stdout.write(plainTextFailures(this.testErrors))
      process.stdout.write("\n")

      if (this.options.perfOutput) {
        this.exportPerformance(elapsed)
      }
      return
    }

    // TTY mode: Update store with final state
    this.store.setState({
      phase: "done",
      passed: this.passed,
      failed: this.failed,
      skipped: this.skipped,
      elapsed,
      testDuration,
      testErrors: new Map(this.testErrors),
      categories: [...this.categoryOrder],
      categoryStats: new Map(this.categoryStats),
      testStates: new Map(this.testStates),
      testDurations: new Map(this.testDurations),
      topSlowest: [...this.topSlowest],
    })

    // Give React a moment to render the final state, then unmount
    setTimeout(() => {
      if (this.inkInstance) {
        this.inkInstance.unmount()
        this.inkInstance = null
      }

      // Show cursor
      process.stdout.write(cursor.show)
      process.stdout.write("\n")

      if (this.options.perfOutput) {
        this.exportPerformance(elapsed)
      }
    }, 50)
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
          const pkg: { name?: string } = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
          const name = pkg.name ?? dirPath
          this.packageNameCache.set(dirPath, name)
          return name
        }
      } catch {}
    }

    const groupingDirs = ["packages", "apps", "vendor", "tests"]
    if (parts.length >= 2 && groupingDirs.includes(parts[0])) {
      const fallback = `${parts[0]}/${parts[1]}`
      this.packageNameCache.set(fallback, fallback)
      return fallback
    }

    const fallback = parts[0] || "root"
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
