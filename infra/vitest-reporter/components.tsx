/**
 * React Components for Vitest Reporter
 *
 * Accept term from useTerm() for styling.
 */

import type { ReactElement } from "react"
import { Box, Text, useTerm } from "inkx"

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
// Utilities
// =============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  const mins = Math.floor(ms / 60000)
  const secs = ((ms % 60000) / 1000).toFixed(0)
  return `${mins}m ${secs}s`
}

/**
 * Get the styled dot for a slow test based on duration thresholds.
 * All green, with increasing size and brightness:
 * - 20x threshold: large circle green bright
 * - 10x threshold: large circle green dim
 * - 5x threshold: medium circle green dim
 * - 2x threshold: small bullet green dim
 */
function getSlowDot(
  term: ReturnType<typeof useTerm>,
  duration: number,
  threshold: number,
): string {
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

// =============================================================================
// Header Component
// =============================================================================

export interface HeaderProps {
  version: string
  cwd: string
}

export function Header({ version, cwd }: HeaderProps): ReactElement {
  const term = useTerm()

  return (
    <Box flexDirection="column">
      <Text>
        {term.style().bold.inverse.cyan(" RUN ")}{" "}
        {term.style().cyan(`v${version}`)} {term.style().dim(cwd)}
      </Text>
      <Text>
        {term.style().dim("Legend:")} {term.style().green(sym.pass)}{" "}
        {term.style().dim("pass")} {term.style().green(sym.slow2x)}{" "}
        {term.style().dim("slow")} {term.style().red(sym.fail)}{" "}
        {term.style().dim("fail")} {term.style().magenta(sym.noisy)}{" "}
        {term.style().dim("noisy")} {term.style().gray(sym.skip)}{" "}
        {term.style().dim("skip")}
      </Text>
      <Text> </Text>
    </Box>
  )
}

// =============================================================================
// Dot Component
// =============================================================================

export interface DotProps {
  state: "pending" | "passed" | "failed" | "skipped"
  duration: number
  isNoisy: boolean
  threshold: number
}

export function Dot({
  state,
  duration,
  isNoisy,
  threshold,
}: DotProps): ReactElement {
  const term = useTerm()

  if (isNoisy && state !== "failed") {
    return <Text>{term.style().magenta(sym.noisy)}</Text>
  }

  switch (state) {
    case "passed":
      if (duration >= threshold * 2) {
        return <Text>{getSlowDot(term, duration, threshold)}</Text>
      }
      return <Text>{term.style().green.dim(sym.pass)}</Text>
    case "failed":
      return <Text>{term.style().red(sym.fail)}</Text>
    case "skipped":
      return <Text>{term.style().gray.dim(sym.skip)}</Text>
    case "pending":
      return <Text>{term.style().yellow(sym.pending)}</Text>
  }
}

// =============================================================================
// FileRow Component
// =============================================================================

export interface FileRowProps {
  name: string
  testIds: string[]
  testStates: Map<string, "pending" | "passed" | "failed" | "skipped">
  testDurations: Map<string, number>
  noisyTestIds: Set<string>
  threshold: number
  maxDots: number
  indent?: string
  labelWidth?: number
  isPackage?: boolean
}

export function FileRow({
  name,
  testIds,
  testStates,
  testDurations,
  noisyTestIds,
  threshold,
  maxDots,
  indent = "",
  labelWidth = 20,
  isPackage = false,
}: FileRowProps): ReactElement {
  const term = useTerm()

  const effectiveLabelWidth = labelWidth - indent.length
  const label =
    name.length > effectiveLabelWidth - 1
      ? name.slice(0, effectiveLabelWidth - 2) + "…"
      : name

  // Generate all dots
  const allDots: string[] = []
  for (const id of testIds) {
    const state = testStates.get(id) ?? "pending"
    const duration = testDurations.get(id) ?? 0
    const isNoisy = noisyTestIds.has(id)

    if (isNoisy && state !== "failed") {
      allDots.push(term.style().magenta(sym.noisy))
    } else {
      switch (state) {
        case "passed":
          if (duration >= threshold * 2) {
            allDots.push(getSlowDot(term, duration, threshold))
          } else {
            allDots.push(term.style().green.dim(sym.pass))
          }
          break
        case "failed":
          allDots.push(term.style().red(sym.fail))
          break
        case "skipped":
          allDots.push(term.style().gray.dim(sym.skip))
          break
        case "pending":
          allDots.push(term.style().yellow(sym.pending))
          break
      }
    }
  }

  // Split dots into lines that fit within maxDots
  const lines: string[] = []
  for (let i = 0; i < allDots.length; i += maxDots) {
    lines.push(allDots.slice(i, i + maxDots).join(""))
  }

  // Build styled label
  const paddedLabel = label.padEnd(effectiveLabelWidth)
  const styledLabel = isPackage
    ? term.style().bold.white(paddedLabel)
    : term.style().dim(paddedLabel)

  // First line has label, subsequent lines are indented to align
  const labelPadding = " ".repeat(effectiveLabelWidth)

  return (
    <Box flexDirection="column">
      <Text>
        {indent}
        {styledLabel}
        {lines[0] ?? ""}
      </Text>
      {lines.slice(1).map((line, i) => (
        <Text key={i}>
          {indent}
          {labelPadding}
          {line}
        </Text>
      ))}
    </Box>
  )
}

// =============================================================================
// Summary Component
// =============================================================================

export interface SummaryProps {
  passed: number
  failed: number
  skipped: number
  total: number
  elapsed: number
  testDuration: number
}

export function Summary({
  passed,
  failed,
  skipped,
  total,
  elapsed,
  testDuration,
}: SummaryProps): ReactElement {
  const term = useTerm()

  const parts: string[] = []

  if (failed > 0) {
    parts.push(term.style().bold.red(`${failed} failed`))
    parts.push(term.style().dim(" | "))
  }
  if (passed > 0) {
    parts.push(term.style().bold.green(`${passed} passed`))
  }
  if (skipped > 0) {
    parts.push(term.style().dim(" | "))
    parts.push(term.style().yellow(`${skipped} skipped`))
  }

  return (
    <Box flexDirection="column">
      <Text> </Text>
      <Text>
        {term.style().dim("Test Files")} {parts.join("")}
        {term.style().gray(` (${total})`)} {term.style().dim("Duration")}{" "}
        {formatDuration(elapsed)}
        {term.style().gray(` (tests ${formatDuration(testDuration)})`)}
      </Text>
    </Box>
  )
}

// =============================================================================
// StatsTable Component
// =============================================================================

export interface CategoryStats {
  passed: number
  failed: number
  skipped: number
  duration: number
  slowCount: number
}

export interface StatsTableProps {
  categories: string[]
  categoryStats: Map<string, CategoryStats>
}

export function StatsTable({
  categories,
  categoryStats,
}: StatsTableProps): ReactElement {
  const term = useTerm()

  if (categories.length <= 1) {
    return <Text />
  }

  const nameWidth = Math.max(...categories.map((c) => c.length), 12)
  const header = term
    .style()
    .bold(`${"PACKAGE".padEnd(nameWidth)}  TESTS     TIME   SLOW`)

  const rows: string[] = []
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
    rows.push(`${nameText}  ${tests}  ${time}  ${slow}`)
  }

  return (
    <Box flexDirection="column">
      <Text> </Text>
      <Text>{header}</Text>
      {rows.map((row, i) => (
        <Text key={i}>{row}</Text>
      ))}
    </Box>
  )
}

// =============================================================================
// Failures Component
// =============================================================================

export interface TestError {
  name: string
  file: string
  errors: Array<{ message: string; stack?: string }>
}

export interface FailuresProps {
  errors: Map<string, TestError>
}

export function Failures({ errors }: FailuresProps): ReactElement {
  const term = useTerm()

  if (errors.size === 0) {
    return <Text />
  }

  const failureBlocks: ReactElement[] = []

  for (const [id, errInfo] of errors) {
    const errorLines: ReactElement[] = []

    for (const err of errInfo.errors) {
      errorLines.push(
        <Text key={`${id}-msg-${errorLines.length}`}>
          {" "}
          {term.style().red(err.message)}
        </Text>,
      )

      if (err.stack) {
        const stackLines = err.stack
          .split("\n")
          .filter((line) => line.trim().startsWith("at "))
          .slice(0, 5)

        for (const line of stackLines) {
          errorLines.push(
            <Text key={`${id}-stack-${errorLines.length}`}>
              {" "}
              {term.style().dim(line.trim())}
            </Text>,
          )
        }
      }
    }

    failureBlocks.push(
      <Box key={id} flexDirection="column">
        <Text>
          {" "}
          {term.style().bold.red(sym.cross + " FAIL")} {errInfo.file}
          {term.style().gray(" >")} {errInfo.name}
        </Text>
        {errorLines}
        <Text> </Text>
      </Box>,
    )
  }

  return (
    <Box flexDirection="column">
      <Text> </Text>
      <Text>{term.style().bold.red("FAILURES")}</Text>
      <Text> </Text>
      {failureBlocks}
    </Box>
  )
}

// =============================================================================
// SlowestList Component
// =============================================================================

export interface SlowestTest {
  name: string
  file: string
  duration: number
}

export interface SlowestListProps {
  tests: SlowestTest[]
  threshold: number
}

export function SlowestList({
  tests,
  threshold,
}: SlowestListProps): ReactElement {
  const term = useTerm()

  if (tests.length === 0) {
    return <Text />
  }

  // Build legend showing the slow tiers (all green, increasing size/brightness)
  const t2x = threshold * 2
  const t5x = threshold * 5
  const t10x = threshold * 10
  const t20x = threshold * 20

  const legend =
    term.style().green.dim(sym.slow2x) +
    term.style().dim(` >=${t2x}ms  `) +
    term.style().green.dim(sym.slow5x) +
    term.style().dim(` >=${t5x}ms  `) +
    term.style().green.dim(sym.slow10x) +
    term.style().dim(` >=${t10x}ms  `) +
    term.style().green(sym.slow10x) +
    term.style().dim(` >=${t20x}ms`)

  const rows = tests.map((t, i) => (
    <Text key={i}>
      {getSlowDot(term, t.duration, threshold)}{" "}
      {term.style().yellow(formatDuration(t.duration).padStart(6))}
      {"  "}
      {term.style().gray(t.file + " >")} {t.name}
    </Text>
  ))

  return (
    <Box flexDirection="column">
      <Text> </Text>
      <Text>
        {term.style().bold("SLOW TESTS")} {legend}
      </Text>
      {rows}
    </Box>
  )
}
