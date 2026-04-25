/**
 * ANSI renderer for `DoctorReport`. Converts a structured report into a
 * stdout-bound string with severity icons and color.
 *
 * No silvery rendering pipeline — `silvercode doctor` exits before any TUI
 * mounts, so we color via `@silvery/ag-react`'s `createTerm` (the same helper
 * `bd-format.ts` uses). Color degrades gracefully on non-TTY (term auto-
 * disables ANSI when stdout isn't a TTY).
 */

import { createTerm, type Term } from "@silvery/ag-react"
import type { DoctorExtra, DoctorItem, DoctorReport, DoctorSection, DoctorSeverity } from "./index.ts"

/**
 * Render a doctor report as ANSI-colored text. Trailing newline included so
 * the caller can `process.stdout.write(text)` without adding one.
 *
 * Pass a custom `term` (e.g., a `createTerm({ caps: { ... } })` with NO_COLOR
 * forced) if you want plain output for tests.
 */
export function renderReport(report: DoctorReport, term?: Term): string {
  const t = term ?? createTerm(process)
  const lines: string[] = []
  lines.push(t.bold(`silvercode doctor`))
  lines.push(t.dim(`cwd: ${report.cwd}`))
  lines.push("")

  for (const section of report.sections) {
    lines.push(...renderSection(section, t))
    lines.push("")
  }

  // Summary footer mimics `bd doctor` aesthetic.
  const counts = summarize(report)
  const summary = formatSummary(counts, t)
  lines.push(summary)

  return lines.join("\n") + "\n"
}

function renderSection(section: DoctorSection, t: Term): string[] {
  const lines: string[] = []
  const icon = severityIcon(section.severity, t)
  const title = sectionTitle(section.severity, section.title, t)
  lines.push(`${icon} ${title}`)

  for (const item of section.items) {
    lines.push(...renderItem(item, t))
  }

  if (section.extras) {
    for (const extra of section.extras) {
      lines.push("")
      lines.push(...renderExtra(extra, t))
    }
  }

  return lines
}

function renderItem(item: DoctorItem, t: Term): string[] {
  const icon = severityIcon(item.severity, t)
  const color =
    item.severity === "error" ? t.red : item.severity === "warn" ? t.yellow : item.severity === "ok" ? t.green : t.dim
  const lines: string[] = []
  lines.push(`  ${icon} ${color(item.message)}`)
  if (item.detail) lines.push(`    ${t.dim(item.detail)}`)
  return lines
}

function renderExtra(extra: DoctorExtra, t: Term): string[] {
  if (extra.kind === "autolinks-cascade") {
    if (extra.rows.length === 0) return [`  ${t.dim("(no rules effective)")}`]
    const headers = ["pattern", "source", "resolves_to", "preview"] as const
    const rows: string[][] = [[...headers], ...extra.rows.map((r) => [r.pattern, r.source, r.resolvesTo, r.preview])]
    const widths = computeColumnWidths(rows)
    const lines: string[] = []
    lines.push(`  ${t.bold(`cascade (${extra.rows.length} rule${extra.rows.length === 1 ? "" : "s"} effective)`)}`)
    lines.push(`  ${t.dim(divider(widths))}`)
    lines.push(`  ${formatRow(rows[0]!, widths, t.dim)}`)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]!
      const colorize = row[1] === "WS→VAULT" ? t.yellow : (s: string) => s
      lines.push(`  ${formatRow(row, widths, colorize)}`)
    }
    return lines
  }
  if (extra.kind === "autolinks-mcp") {
    if (extra.rows.length === 0) return []
    const lines: string[] = []
    lines.push(`  ${t.bold("mcp stubs (loaded but inert)")}`)
    for (const r of extra.rows) {
      lines.push(`    ${t.dim("·")} ${r.pattern} → ${r.resolvesTo}`)
    }
    return lines
  }
  if (extra.kind === "autolinks-handlers") {
    const lines: string[] = []
    const schemeList = extra.schemes.join(", ")
    lines.push(
      `  ${t.bold(`handlers (${extra.schemes.length} scheme${extra.schemes.length === 1 ? "" : "s"}: ${schemeList})`)}`,
    )
    if (extra.bindings.length > 0) {
      for (const b of extra.bindings) {
        const status = b.status === "ok" ? t.green("✓") : t.yellow("⚠")
        lines.push(`    ${status} ${b.pattern} → ${b.inferredScheme}: (${b.resolvesTo})`)
      }
    }
    return lines
  }
  // Exhaustive check.
  const _exhaustive: never = extra
  return [String(_exhaustive)]
}

function severityIcon(severity: DoctorSeverity, t: Term): string {
  switch (severity) {
    case "ok":
      return t.green("✓")
    case "warn":
      return t.yellow("⚠")
    case "error":
      return t.red("✗")
  }
}

function sectionTitle(severity: DoctorSeverity, title: string, t: Term): string {
  const colored =
    severity === "error" ? t.red(t.bold(title)) : severity === "warn" ? t.yellow(t.bold(title)) : t.bold(title)
  return colored
}

function summarize(report: DoctorReport): { ok: number; warn: number; error: number } {
  const counts = { ok: 0, warn: 0, error: 0 }
  for (const section of report.sections) {
    for (const item of section.items) counts[item.severity]++
  }
  return counts
}

function formatSummary(counts: { ok: number; warn: number; error: number }, t: Term): string {
  const parts: string[] = []
  if (counts.error > 0) parts.push(t.red(`${counts.error} error${counts.error === 1 ? "" : "s"}`))
  if (counts.warn > 0) parts.push(t.yellow(`${counts.warn} warning${counts.warn === 1 ? "" : "s"}`))
  if (counts.error === 0 && counts.warn === 0) {
    return t.green(`all checks passed (${counts.ok} ok)`)
  }
  return parts.join(", ")
}

function computeColumnWidths(rows: readonly string[][]): number[] {
  if (rows.length === 0) return []
  const colCount = rows[0]!.length
  const widths = new Array(colCount).fill(0)
  for (const row of rows) {
    for (let i = 0; i < colCount; i++) {
      const len = (row[i] ?? "").length
      if (len > widths[i]) widths[i] = len
    }
  }
  return widths
}

function formatRow(row: readonly string[], widths: readonly number[], colorize: (s: string) => string): string {
  const parts: string[] = []
  for (let i = 0; i < widths.length; i++) {
    const cell = row[i] ?? ""
    const padded = i === widths.length - 1 ? cell : cell.padEnd(widths[i]!)
    parts.push(padded)
  }
  return colorize(parts.join("  "))
}

function divider(widths: readonly number[]): string {
  return widths.map((w) => "─".repeat(w)).join("  ")
}
