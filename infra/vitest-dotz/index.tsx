/**
 * DotzReporter - React TUI Vitest Reporter
 *
 * Renders test progress as colored dots with live updates.
 * Uses inkx render() for flicker-free differential updates.
 */

import fs from "node:fs"
import type { Reporter, TestCase, TestModule, TestSpecification, TestSuite, Vitest } from "vitest/node"
import { Box, Text, createFlexxEngine, setLayoutEngine, isLayoutEngineInitialized, useTerm, createTerm, renderSync, type Term, type Instance } from "inkx"
import { useSyncExternalStore, useMemo } from "react"
import Debug from "debug"

import { createTestStore, type TestStore, type TestError, type TestStoreState } from "./store.js"

const debug = Debug("km:vitest-dotz")

// =============================================================================
// Constants & Types
// =============================================================================

const DOT = {
  pass: "·", slow2x: "•", slow5x: "●", slow10x: "⬤",
  fail: "x", skip: "-", pending: "*", noisy: "!", cross: "✗",
} as const

const SLOW = { x2: 2, x5: 5, x10: 10 } as const
const LAYOUT = { labelWidth: 20, dotsMargin: 22 } as const

export interface ReporterOptions {
  slowThreshold?: number
  perfOutput?: string
  showSlow?: boolean
  maxSlow?: number
}

type TestState = "pending" | "passed" | "failed" | "skipped"
type SlowLevel = "normal" | "2x" | "5x" | "10x"

// =============================================================================
// Hooks
// =============================================================================

function useStore(store: TestStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

// =============================================================================
// Components
// =============================================================================

function ReporterView({ store, options, version, cwd }: {
  store: TestStore
  options: Required<ReporterOptions>
  version: string
  cwd: string
}) {
  const t = useTerm()
  const state = useStore(store)
  const elapsed = Date.now() - state.startTime
  const testDuration = useMemo(() => [...state.testDurations.values()].reduce((a, b) => a + b, 0), [state.testDurations])
  const maxDots = (t.cols ?? 80) - LAYOUT.dotsMargin

  return (
    <Box flexDirection="column">
      <Header version={version} cwd={cwd} />
      <TestOutput state={state} threshold={options.slowThreshold} maxDots={maxDots} />
      <Summary state={state} elapsed={elapsed} testDuration={testDuration} />
      {state.categoryOrder.length > 1 && <StatsTable state={state} />}
      {options.showSlow && state.topSlowest.length > 0 && (
        <SlowestList tests={state.topSlowest.slice(0, options.maxSlow)} threshold={options.slowThreshold} />
      )}
      <Failures errors={state.testErrors} />
    </Box>
  )
}

function Header({ version, cwd }: { version: string; cwd: string }) {
  const t = useTerm()
  return (
    <Box flexDirection="column">
      <Text>{t.bold.inverse.cyan(" DOTZ ")} {t.cyan(`v${version}`)} {t.dim(cwd)}</Text>
      <Text>
        {t.dim("Legend:")} {t.green(DOT.pass)} {t.dim("pass")}  {t.green(DOT.slow2x)} {t.dim("slow")}  {t.red(DOT.fail)} {t.dim("fail")}  {t.magenta(DOT.noisy)} {t.dim("noisy")}  {t.gray(DOT.skip)} {t.dim("skip")}
      </Text>
    </Box>
  )
}

function TestOutput({ state, threshold, maxDots }: { state: TestStoreState; threshold: number; maxDots: number }) {
  if (state.categoryOrder.length === 0) return null
  return (
    <Box flexDirection="column">
      {state.categoryOrder.map(cat => {
        const stats = state.categoryStats.get(cat)
        return stats ? <PackageRow key={cat} name={cat} testIds={stats.testIds} state={state} threshold={threshold} maxDots={maxDots} /> : null
      })}
    </Box>
  )
}

function PackageRow({ name, testIds, state, threshold, maxDots }: {
  name: string
  testIds: string[]
  state: TestStoreState
  threshold: number
  maxDots: number
}) {
  const t = useTerm()
  const label = t.bold.white(truncate(name, LAYOUT.labelWidth))

  const dots = useMemo(() => testIds.map(id =>
    dot(t, state.testStates.get(id) ?? "pending", state.testDurations.get(id) ?? 0, threshold, state.noisyTestIds.has(id))
  ), [t, testIds, state.testStates, state.testDurations, state.noisyTestIds, threshold])

  const lines = chunk(dots, maxDots)
  const indent = " ".repeat(LAYOUT.labelWidth)

  return (
    <Box flexDirection="column">
      <Text>{label}{lines[0]?.join("") ?? ""}</Text>
      {lines.slice(1).map((line, i) => <Text key={i}>{indent}{line.join("")}</Text>)}
    </Box>
  )
}

function Summary({ state, elapsed, testDuration }: { state: TestStoreState; elapsed: number; testDuration: number }) {
  const t = useTerm()
  const { passed, failed, skipped } = state
  const total = passed + failed + skipped

  if (total === 0) return null

  const counts = useMemo(() => {
    const p: string[] = []
    if (failed > 0) p.push(t.bold.red(`${failed} failed`), t.dim(" | "))
    if (passed > 0) p.push(t.bold.green(`${passed} passed`))
    if (skipped > 0) p.push(t.dim(" | "), t.yellow(`${skipped} skipped`))
    return p.join("")
  }, [t, passed, failed, skipped])

  return (
    <Text>
      {t.dim("Tests")} {counts}{t.gray(` (${total})`)}  {t.dim("Time")} {formatDuration(elapsed)}{t.gray(` (sum ${formatDuration(testDuration)})`)}
    </Text>
  )
}

function StatsTable({ state }: { state: TestStoreState }) {
  const t = useTerm()
  const { categoryOrder, categoryStats } = state
  const w = Math.max(...categoryOrder.map(c => c.length), 12)

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>{t.bold(`${"PACKAGE".padEnd(w)}  TESTS     TIME   SLOW`)}</Text>
      {categoryOrder.map(cat => {
        const s = categoryStats.get(cat)
        if (!s) return null
        const n = s.passed + s.failed + s.skipped
        return (
          <Text key={cat}>
            {s.failed > 0 ? t.red(cat.padEnd(w)) : t.dim(cat.padEnd(w))}  {n.toString().padStart(5)}  {formatDuration(s.duration).padStart(8)}  {s.slowCount > 0 ? s.slowCount.toString().padStart(6) : "     -"}
          </Text>
        )
      })}
    </Box>
  )
}

function SlowestList({ tests, threshold }: { tests: Array<{ name: string; file: string; duration: number }>; threshold: number }) {
  const t = useTerm()
  const legend = `${t.green.dim(DOT.slow2x)} ${t.dim(`≥${threshold * SLOW.x2}ms`)}  ${t.green.dim(DOT.slow5x)} ${t.dim(`≥${threshold * SLOW.x5}ms`)}  ${t.green(DOT.slow10x)} ${t.dim(`≥${threshold * SLOW.x10}ms`)}`

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>{t.bold("SLOW TESTS")}  {legend}</Text>
      {tests.map((test, i) => (
        <Text key={i}>{slowDot(t, getSlowLevel(test.duration, threshold))} {t.yellow(formatDuration(test.duration).padStart(6))}  {t.gray(test.file + " >")} {test.name}</Text>
      ))}
    </Box>
  )
}

function Failures({ errors }: { errors: Map<string, TestError> }) {
  const t = useTerm()
  if (errors.size === 0) return null

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>{t.bold.red("FAILURES")}</Text>
      {[...errors.values()].map((err, i) => (
        <Box key={i} flexDirection="column">
          <Text> {t.bold.red(DOT.cross + " FAIL")} {err.file}{t.gray(" >")} {err.name}</Text>
          {err.errors.map((e, j) => <Text key={j}>   {t.red(e.message)}</Text>)}
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
  private term: Term | null = null
  private app: Instance | null = null
  private store: TestStore
  private options: Required<ReporterOptions>
  private timings: Array<{ name: string; file: string; duration: number; state: TestState }> = []
  private packageNameCache = new Map<string, string>()
  private finishedTests = new Set<string>()

  constructor(options: ReporterOptions = {}) {
    this.options = {
      slowThreshold: options.slowThreshold ?? 100,
      perfOutput: options.perfOutput ?? "",
      showSlow: options.showSlow ?? true,
      maxSlow: options.maxSlow ?? 10,
    }
    this.store = createTestStore(this.options.slowThreshold)
    debug("reporter initialized with options: %O", this.options)
  }

  onInit(ctx: Vitest) {
    debug("onInit called")
    this.ctx = ctx
    this.term = createTerm()
    if (!isLayoutEngineInitialized()) setLayoutEngine(createFlexxEngine())

    // Start the live React app in inline mode (not fullscreen)
    this.app = renderSync(this.term, (
      <ReporterView
        store={this.store}
        options={this.options}
        version={ctx.version}
        cwd={process.cwd()}
      />
    ), { mode: "inline" })
  }

  onTestRunStart(_specs: readonly TestSpecification[]) {
    debug("onTestRunStart called with %d specs", _specs.length)
    this.store.reset()
    this.store.setRunning(true)
    this.timings = []
    this.finishedTests.clear()
  }

  onTestModuleCollected(module: TestModule) {
    debug("onTestModuleCollected: %s", (module as { moduleId?: string }).moduleId)
    for (const test of module.children.allTests()) this.onTestCaseReady(test)
  }

  onTestSuiteReady(suite: TestSuite) {
    debug("onTestSuiteReady: %s", suite.name)
    for (const test of suite.children.allTests()) this.onTestCaseReady(test)
  }

  onTestCaseReady(testCase: TestCase) {
    if (this.finishedTests.has(testCase.id)) return
    const moduleId = (testCase.module as { moduleId?: string }).moduleId ?? "unknown"
    this.store.addTest(testCase.id, this.extractCategory(moduleId), this.extractFileName(moduleId))
  }

  onTestCaseResult(testCase: TestCase) {
    const result = testCase.result()
    if (!result) return

    const id = testCase.id
    const diagnostic = testCase.diagnostic()
    const duration = diagnostic?.duration ?? 0
    const moduleId = (testCase.module as { moduleId?: string }).moduleId ?? "unknown"
    const testState: TestState = result.state === "passed" ? "passed" : result.state === "failed" ? "failed" : "skipped"

    this.timings.push({ name: testCase.name, file: moduleId, duration, state: testState })
    this.finishedTests.add(id)

    const errors = testState === "failed" && result.errors?.length
      ? result.errors.map(e => ({ message: e.message ?? "Unknown error", stack: e.stack }))
      : undefined

    const logs = diagnostic as { stdout?: string; stderr?: string } | undefined
    const isNoisy = Boolean(logs?.stdout || logs?.stderr)

    this.store.updateTest(id, testState, duration, errors, isNoisy)
    this.store.updateSlowest(testCase.name, this.relativePath(moduleId), duration, this.options.slowThreshold)
    // React auto-rerenders via useSyncExternalStore subscription
  }

  onTestModuleEnd(_: TestModule) {}

  onTestRunEnd() {
    debug("onTestRunEnd called")
    this.store.setRunning(false)
    // Final state is rendered automatically

    // Clean up
    this.app?.unmount()
    this.app = null
    this.term?.[Symbol.dispose]()
    this.term = null

    if (this.options.perfOutput) this.exportPerformance()
  }

  private relativePath(path: string) {
    const cwd = process.cwd()
    return path.startsWith(cwd) ? path.slice(cwd.length + 1) : path
  }

  private extractCategory(moduleId: string) {
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
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { name?: string }
          const name = pkg.name ?? dirPath
          this.packageNameCache.set(dirPath, name)
          return name
        }
      } catch {}
    }

    const groupingDirs = ["packages", "apps", "vendor", "tests"]
    const fallback = parts.length >= 2 && parts[0] && groupingDirs.includes(parts[0])
      ? `${parts[0]}/${parts[1]}`
      : parts[0] || "root"
    this.packageNameCache.set(fallback, fallback)
    return fallback
  }

  private extractFileName(moduleId: string) {
    return this.relativePath(moduleId).split("/").pop() || "unknown"
  }

  private exportPerformance() {
    const state = this.store.getSnapshot()
    fs.writeFileSync(this.options.perfOutput, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        passed: state.passed, failed: state.failed, skipped: state.skipped,
        elapsed: Date.now() - state.startTime,
        testDuration: this.timings.reduce((sum, t) => sum + t.duration, 0),
      },
      slowTests: this.timings.filter(t => t.duration >= this.options.slowThreshold).sort((a, b) => b.duration - a.duration),
      allTests: this.timings,
    }, null, 2))
  }
}

export default DotzReporter

// =============================================================================
// Helpers
// =============================================================================

function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`
}

function getSlowLevel(duration: number, threshold: number): SlowLevel {
  if (duration >= threshold * SLOW.x10) return "10x"
  if (duration >= threshold * SLOW.x5) return "5x"
  if (duration >= threshold * SLOW.x2) return "2x"
  return "normal"
}

function slowDot(term: Term, level: SlowLevel) {
  const styles = { "10x": term.green, "5x": term.green.dim, "2x": term.green.dim, normal: term.green.dim }
  const dots = { "10x": DOT.slow10x, "5x": DOT.slow5x, "2x": DOT.slow2x, normal: DOT.pass }
  return styles[level](dots[level])
}

function dot(term: Term, state: TestState, duration: number, threshold: number, noisy: boolean) {
  if (noisy && state !== "failed") return term.magenta(DOT.noisy)
  if (state === "passed") return slowDot(term, getSlowLevel(duration, threshold))
  if (state === "failed") return term.red(DOT.fail)
  if (state === "skipped") return term.gray.dim(DOT.skip)
  return term.yellow(DOT.pending)
}

function truncate(s: string, w: number) {
  return s.length > w - 1 ? s.slice(0, w - 2) + "…" : s.padEnd(w)
}

function chunk<T>(arr: T[], size: number) {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}
