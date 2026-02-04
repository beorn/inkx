/**
 * DotzReporter - inkx-based Vitest Reporter
 *
 * Renders test results using inkx React components.
 * All output goes through inkx - layout, colors, everything.
 */

import * as fs from "node:fs"
import React, {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import type {
  Reporter,
  TestCase,
  TestModule,
  TestSpecification,
  TestSuite,
  Vitest,
} from "vitest/node"
import {
  Box,
  Text,
  Console,
  useTerm,
  useContentRect,
  patchConsole,
  type Instance,
  type Term,
  type PatchedConsole,
} from "inkx"
import Debug from "debug"

import {
  createTestStore,
  type TestState,
  type TestStore,
  type TestStoreState,
} from "./store.js"

// =============================================================================
// Style Context (for testing DI)
// =============================================================================

/** Style function type - returns a Term (which IS the style chain) */
export type StyleFn = () => Term

/**
 * StyleContext allows injecting a style function for testing.
 * When null, components fall back to useTerm().
 */
const StyleContext = createContext<StyleFn | null>(null)

/**
 * Hook to get the style chain - uses StyleContext if provided, otherwise useTerm().
 * Note: Term IS the style chain (no  method needed).
 */
function useStyle(): Term {
  const styleFromContext = useContext(StyleContext)
  if (styleFromContext) {
    return styleFromContext()
  }
  return useTerm()
}

const debug = Debug("km:vitest-dotz")

// =============================================================================
// Constants & Types (exported for testing)
// =============================================================================

export const MAX_SLOW_TESTS = 20
export const DURATION_MULTIPLIER = 10 // Symbol range: 0x to 10x threshold
export const UNMOUNT_DELAY_MS = 50
export const DEFAULT_SYMBOLS = ["·", "•", "●"]

/** Status dot definitions: char, color method, legend label */
export const STATUS_DOTS = {
  failed: { char: "x", color: "red", label: "fail" },
  skipped: { char: "-", color: "gray.dim", label: "skip" },
  pending: { char: "*", color: "yellow", label: "pending" },
  noisy: { char: "!", color: "magenta", label: "noisy" },
} as const

export type StatusKey = keyof typeof STATUS_DOTS

export interface ReporterOptions {
  slowThreshold?: number
  perfOutput?: string
  showSlow?: boolean
  symbols?: string[]
}

export type Options = Required<ReporterOptions>

// =============================================================================
// Core Algorithm: Duration → Symbol (exported for testing)
// =============================================================================

/** Apply a dot-path color (e.g. "gray.dim") to text */
export function applyColor(
  term: ReturnType<typeof useTerm>,
  color: string,
  text: string,
) {
  const parts = color.split(".")
  let result = term as unknown as Record<string, unknown>
  for (const p of parts) result = result[p] as Record<string, unknown>
  return (result as unknown as (s: string) => string)(text)
}

/**
 * Maps test duration to a symbol index and brightness.
 * Duration range [0, threshold * DURATION_MULTIPLIER] maps to symbol indices [0, n-1].
 * Tests exceeding the range get the last symbol with bright styling.
 */
export function durationToSymbol(
  duration: number,
  threshold: number,
  symbols: string[],
) {
  const stage = Math.floor(
    ((duration / threshold) * symbols.length) / DURATION_MULTIPLIER,
  )
  const maxIndex = symbols.length - 1
  return {
    char: symbols[Math.min(stage, maxIndex)] ?? "●",
    bright: stage > maxIndex,
  }
}

// =============================================================================
// React Components
// =============================================================================

function useStore(store: TestStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

export interface ReportProps {
  store: TestStore
  options: Options
  /** Override width for testing (bypasses useContentRect) */
  width?: number
  /** Patched console for capturing output */
  console?: PatchedConsole
}

export function Report({
  store,
  options,
  width,
  console: patched,
}: ReportProps) {
  const state = useStore(store)
  return (
    <Box id="report" flexDirection="column">
      {patched && <Console console={patched} />}
      <DotsSection state={state} options={options} width={width} />
      <Summary state={state} />
      <PackageTable state={state} />
      <SlowTests state={state} options={options} />
      <Failures state={state} />
    </Box>
  )
}

// --- Dot rendering ---

type DotProps =
  | { testId: string; store: TestStoreState; options: Options }
  | { status: "passed"; duration: number; options: Options }
  | { status: StatusKey }

export function StatusDot({ status }: { status: StatusKey }) {
  const s = useStyle()
  const { char, color } = STATUS_DOTS[status]
  return <Text>{applyColor(s, color, char)}</Text>
}

export function Dot(props: DotProps) {
  const s = useStyle()

  // Static status dots (legend use)
  if ("status" in props && props.status !== "passed") {
    return <StatusDot status={props.status} />
  }

  // Determine state and duration from store or props
  const [testState, duration, isNoisy, options] =
    "testId" in props
      ? [
          props.store.testStates.get(props.testId) ?? "pending",
          props.store.testDurations.get(props.testId) ?? 0,
          props.store.noisyTestIds.has(props.testId),
          props.options,
        ]
      : ["passed" as TestState, props.duration, false, props.options]

  // Noisy tests show ! (unless failed)
  if (isNoisy && testState !== "failed") return <StatusDot status="noisy" />

  // Non-passed states
  if (testState in STATUS_DOTS) {
    return <StatusDot status={testState as StatusKey} />
  }

  // Passed: duration-based symbol
  const { char, bright } = durationToSymbol(
    duration,
    options.slowThreshold,
    options.symbols,
  )
  return <Text>{bright ? s.green(char) : s.green.dim(char)}</Text>
}

export function DurationSymbol({
  duration,
  options,
}: {
  duration: number
  options: Options
}) {
  const s = useStyle()
  const { char, bright } = durationToSymbol(
    duration,
    options.slowThreshold,
    options.symbols,
  )
  return <Text>{bright ? s.green(char) : s.green.dim(char)}</Text>
}

// --- Layout components ---

function LegendItem({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  const s = useStyle()
  return (
    <Box flexDirection="row" gap={1}>
      {children}
      <Text>{s.dim(label)}</Text>
    </Box>
  )
}

export function DotsLegend({ options }: { options: Options }) {
  const s = useStyle()
  return (
    <Box flexDirection="row" gap={2} marginBottom={1}>
      <Text>{s.dim("Legend:")}</Text>
      <LegendItem label="fast">
        <Dot status="passed" duration={0} options={options} />
      </LegendItem>
      <LegendItem label="slow">
        <Dot
          status="passed"
          duration={options.slowThreshold * DURATION_MULTIPLIER}
          options={options}
        />
      </LegendItem>
      {(Object.keys(STATUS_DOTS) as StatusKey[]).map((status) => (
        <LegendItem key={status} label={STATUS_DOTS[status].label}>
          <Dot status={status} />
        </LegendItem>
      ))}
    </Box>
  )
}

export interface DotsSectionProps {
  state: TestStoreState
  options: Options
  /** Override width for testing (bypasses useContentRect) */
  width?: number
}

/** Wrapper that uses useContentRect when width is not provided */
export function DotsSection({ width, ...props }: DotsSectionProps) {
  if (width !== undefined) {
    return <DotsSectionInner {...props} width={width} />
  }
  return <DotsSectionWithLayout {...props} />
}

function DotsSectionWithLayout(props: Omit<DotsSectionProps, "width">) {
  const contentRect = useContentRect()
  return <DotsSectionInner {...props} width={contentRect.width ?? 80} />
}

function DotsSectionInner({
  state,
  options,
  width: cols,
}: Omit<DotsSectionProps, "width"> & { width: number }) {
  const s = useStyle()

  const maxLabelWidth = useMemo(
    () =>
      Math.min(
        Math.max(...state.categoryOrder.map((c) => c.length), 12) + 1,
        24,
      ),
    [state.categoryOrder],
  )
  const dotsWidth = cols - maxLabelWidth - 1

  // Break out files if category has many tests across multiple files
  const fileBreakouts = useMemo(() => {
    const set = new Set<string>()
    for (const cat of state.categoryOrder) {
      const stats = state.categoryStats.get(cat)
      if (
        stats &&
        stats.testIds.length > dotsWidth &&
        stats.fileOrder.length > 1
      ) {
        set.add(cat)
      }
    }
    return set
  }, [state.categoryOrder, state.categoryStats, dotsWidth])

  return (
    <Box id="dots" flexDirection="column">
      <DotsLegend options={options} />
      {state.categoryOrder.map((category) => {
        const catStats = state.categoryStats.get(category)
        if (!catStats) return null

        if (fileBreakouts.has(category)) {
          return (
            <Box key={category} flexDirection="column">
              <Text>{s.cyan.bold(category)}</Text>
              {catStats.fileOrder.map((file) => {
                const fileStats = catStats.files.get(file)
                if (!fileStats) return null
                const name = file.replace(
                  /\.(test|spec)\.(ts|tsx|js|jsx|md)$/,
                  "",
                )
                return (
                  <Box key={file} flexDirection="row">
                    <Text>
                      {"  "}
                      {s.dim(name.padEnd(maxLabelWidth - 2))}
                    </Text>
                    <Box flexDirection="row" flexWrap="wrap" width={dotsWidth}>
                      {fileStats.testIds.map((id) => (
                        <Dot
                          key={id}
                          testId={id}
                          store={state}
                          options={options}
                        />
                      ))}
                    </Box>
                  </Box>
                )
              })}
            </Box>
          )
        }

        return (
          <Box key={category} flexDirection="row">
            <Text>{s.cyan(category.padEnd(maxLabelWidth))}</Text>
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

export function Summary({ state }: { state: TestStoreState }) {
  const s = useStyle()
  const { passed, failed, skipped } = state
  const total = passed + failed + skipped
  const elapsed = Date.now() - state.startTime
  const sum = [...state.testDurations.values()].reduce((a, b) => a + b, 0)

  const counts = [
    failed > 0 && s.bold.red(`${failed} failed`),
    passed > 0 && s.bold.green(`${passed} passed`),
    skipped > 0 && s.yellow(`${skipped} skipped`),
  ].filter(Boolean)

  return (
    <Box id="summary" flexDirection="column" marginTop={1}>
      <Text>
        {s.dim("Tests")}{" "}
        {counts.length ? counts.join(s.dim(" | ")) : s.dim("0")}
        {s.gray(` (${total})`)}
        {"  "}
        {s.dim("Time")} {fmtDuration(elapsed)}
        {s.gray(` (sum ${fmtDuration(sum)})`)}
      </Text>
    </Box>
  )
}

export function PackageTable({ state }: { state: TestStoreState }) {
  const s = useStyle()
  const w = useMemo(
    () => Math.max(...state.categoryOrder.map((c) => c.length), 12),
    [state.categoryOrder],
  )

  if (state.categoryOrder.length <= 1) return null

  const header = `${"PACKAGE".padEnd(w)}  ${"TESTS".padStart(5)}  ${"TIME".padStart(8)}  ${"SLOW".padStart(6)}`
  return (
    <Box id="package-table" flexDirection="column" marginTop={1}>
      <Text>{s.bold.white(header)}</Text>
      {state.categoryOrder.map((cat) => {
        const st = state.categoryStats.get(cat)
        if (!st) return null
        const n = st.passed + st.failed + st.skipped
        const slow =
          st.slowCount > 0 ? String(st.slowCount).padStart(6) : "     -"
        const row = `${cat.padEnd(w)}  ${String(n).padStart(5)}  ${fmtDuration(st.duration).padStart(8)}  ${slow}`
        return <Text key={cat}>{st.failed > 0 ? s.red(row) : s.dim(row)}</Text>
      })}
    </Box>
  )
}

export function SlowTests({
  state,
  options,
}: {
  state: TestStoreState
  options: Options
}) {
  const s = useStyle()
  if (!options.showSlow || state.topSlowest.length === 0) return null

  const { symbols, slowThreshold } = options
  const rangePerSymbol = DURATION_MULTIPLIER / symbols.length

  // Legend: show threshold for each symbol level
  const legend = symbols.slice(1).map((sym, i) => {
    const minMs = Math.round(slowThreshold * (i + 1) * rangePerSymbol)
    return `${s.green.dim(sym)} ${s.dim(`≥${fmtMs(minMs)}`)}`
  })
  legend.push(
    `${s.green(symbols.at(-1) ?? "●")} ${s.dim(`≥${fmtMs(slowThreshold * DURATION_MULTIPLIER)}`)}`,
  )

  return (
    <Box id="slow-tests" flexDirection="column" marginTop={1}>
      <Text>
        {s.bold("SLOW TESTS")} {legend.join("  ")}
      </Text>
      {state.topSlowest.slice(0, MAX_SLOW_TESTS).map((test, i) => {
        const loc = test.line ? `${test.file}:${test.line}` : test.file
        return (
          <Box key={i} flexDirection="row">
            <DurationSymbol duration={test.duration} options={options} />
            <Text>
              {" "}
              {s.green(fmtDuration(test.duration).padStart(6))}{" "}
              {s.gray(loc + " >")} {test.name}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

export function Failures({ state }: { state: TestStoreState }) {
  const s = useStyle()
  if (state.testErrors.size === 0) return null

  return (
    <Box id="failures" flexDirection="column" marginTop={1}>
      <Text>{s.bold.red("FAILURES")}</Text>
      {[...state.testErrors.values()].map((err, i) => (
        <Box key={i} flexDirection="column" marginTop={1}>
          <Text>
            {s.red("✗")} {s.bold(err.name)}
          </Text>
          <Text>
            {"  "}
            {s.dim(err.file)}
          </Text>
          {err.errors.map((e, j) => (
            <Box key={j} flexDirection="column">
              <Text>
                {"  "}
                {e.message}
              </Text>
              {e.stack?.split("\n").map((line, k) => (
                <Text key={k}>{s.dim(line)}</Text>
              ))}
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )
}

// =============================================================================
// Reporter Class
// =============================================================================

const packageNameCache = new Map<string, string>()

class DotzReporter implements Reporter {
  private store: TestStore
  private options: Options
  private finishedTests = new Set<string>()
  private finishedCalled = false
  private app: Instance | null = null
  private term: Term | null = null
  private patchedConsole: PatchedConsole | null = null
  private isTTY = process.stdout.isTTY === true
  private prevActEnv: boolean | undefined

  constructor(opts: ReporterOptions = {}) {
    this.options = {
      slowThreshold: opts.slowThreshold ?? 100,
      perfOutput: opts.perfOutput ?? "",
      showSlow: opts.showSlow ?? true,
      symbols: opts.symbols ?? DEFAULT_SYMBOLS,
    }
    this.store = createTestStore(this.options.slowThreshold)
    debug("reporter initialized: %O, isTTY: %s", this.options, this.isTTY)
  }

  onInit(_ctx: Vitest) {
    debug("onInit")
  }

  async onTestRunStart(_specs: readonly TestSpecification[]) {
    debug("onTestRunStart: %d specs", _specs.length)
    this.store.reset()
    this.store.setRunning(true)
    this.finishedTests.clear()
    this.finishedCalled = false
    if (this.isTTY && !this.app) await this.startStreaming()
  }

  private async startStreaming() {
    const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    this.prevActEnv = g.IS_REACT_ACT_ENVIRONMENT
    g.IS_REACT_ACT_ENVIRONMENT = false

    const { render, createTerm } = await import("inkx")
    this.term = createTerm()
    this.patchedConsole = patchConsole(console)
    this.app = await render(
      <Report
        store={this.store}
        options={this.options}
        console={this.patchedConsole}
      />,
      this.term,
      {
        mode: "inline",
        alternateScreen: false,
      },
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

    const { id, name, module } = testCase
    const diagnostic = testCase.diagnostic()
    const duration = diagnostic?.duration ?? 0
    const moduleId = getModuleId(module)

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
    const line = extractLineNumber(testCase)

    this.store.updateTest(id, testState, duration, errors, isNoisy)
    this.store.updateSlowest(
      name,
      relativePath(moduleId),
      line,
      duration,
      this.options.slowThreshold,
    )
  }

  onTestModuleEnd(_: TestModule) {}

  async onTestRunEnd(
    testModules?: Iterable<TestModule>,
    errors?: readonly unknown[],
  ) {
    debug("onTestRunEnd", {
      testModules: !!testModules,
      errors: (errors as unknown[])?.length,
    })
    await this.finishRun()
  }

  async onFinished() {
    debug("onFinished")
    await this.finishRun()
  }

  private async finishRun() {
    if (this.finishedCalled) return
    this.finishedCalled = true
    this.store.setRunning(false)

    if (this.app) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, UNMOUNT_DELAY_MS)
      })
      this.app.unmount()
      this.patchedConsole?.[Symbol.dispose]()
      this.term?.[Symbol.dispose]()
      this.app = null
      this.term = null
      this.patchedConsole = null
      ;(
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
      ).IS_REACT_ACT_ENVIRONMENT = this.prevActEnv
    } else {
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

function getModuleId(module: unknown) {
  return (module as { moduleId?: string }).moduleId ?? "unknown"
}

function relativePath(path: string) {
  const cwd = process.cwd()
  return path.startsWith(cwd) ? path.slice(cwd.length + 1) : path
}

function extractFileName(moduleId: string) {
  return relativePath(moduleId).split("/").pop() || "unknown"
}

function extractCategory(moduleId: string) {
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

function extractLineNumber(testCase: TestCase) {
  const meta = testCase.meta() as
    | { mdtestLocation?: { line?: number } }
    | undefined
  const loc = (testCase as { location?: { line?: number } }).location
  return meta?.mdtestLocation?.line ?? loc?.line
}

async function printSummary(store: TestStore, options: Options) {
  const { renderStatic } = await import("inkx")
  const width = process.stdout.columns || 80
  // Use large height to avoid truncation - static output doesn't need fixed height
  const output = await renderStatic(
    <Report store={store} options={options} width={width} />,
    { width, height: 1000 },
  )
  // Trim trailing empty lines from the buffer output
  console.log(output.replace(/\n+$/, ""))
}

function exportPerformance(state: TestStoreState, options: Options) {
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

export function fmtDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`
}

export function fmtMs(ms: number) {
  return ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`
}
