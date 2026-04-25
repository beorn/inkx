/**
 * silvercode doctor — config + integration health check.
 *
 * Industry analogues: `bd doctor`, `gh extension doctor`, `npm doctor`,
 * `bun --revision`. Sectioned output with severity icons. Exit code reflects
 * worst severity in the report.
 *
 * V1 surfaces only the autolinks subsystem (see
 * `./checkers/autolinks.ts`). New subsystems plug in by exporting a
 * `runChecker(opts) → DoctorSection` function and registering it in
 * `runDoctor()`.
 *
 * Slash-command path (TODO, see bead km-silvercode.doctor): inside the
 * running TUI, `/doctor` should invoke this same engine and render the
 * resulting report in a popover. The engine returns a structured
 * `DoctorReport` precisely so the TUI can render it without re-running
 * the checks. CLI-only for v1.
 */

import { runAutolinksChecker } from "./checkers/autolinks.ts"

/**
 * Severity ordering: `ok < warn < error`. A section's severity is the max of
 * its items' severities; the report's severity is the max of its sections'.
 */
export type DoctorSeverity = "ok" | "warn" | "error"

/**
 * One row inside a doctor section. `severity` controls the icon. `detail` is
 * optional secondary text rendered indented under `message`.
 */
export type DoctorItem = {
  readonly severity: DoctorSeverity
  readonly message: string
  readonly detail?: string
}

/**
 * Free-form structured payload a checker can attach to a section so the
 * renderer can display tabular data (e.g., the cascade-introspection table).
 * Renderers are responsible for narrowing on `kind`.
 */
export type DoctorExtra =
  | {
      readonly kind: "autolinks-cascade"
      readonly rows: ReadonlyArray<{
        readonly pattern: string
        readonly source: "WORKSPACE" | "VAULT" | "WS→VAULT"
        readonly resolvesTo: string
        readonly preview: string
      }>
    }
  | {
      readonly kind: "autolinks-mcp"
      readonly rows: ReadonlyArray<{ readonly pattern: string; readonly resolvesTo: string }>
    }

export type DoctorSection = {
  readonly title: string
  /** Severity rolled up across `items`. Renderer uses this for the section header. */
  readonly severity: DoctorSeverity
  readonly items: readonly DoctorItem[]
  readonly extras?: readonly DoctorExtra[]
}

export type DoctorReport = {
  readonly cwd: string
  readonly severity: DoctorSeverity
  readonly sections: readonly DoctorSection[]
}

/** Map a severity to its CLI exit code: ok=0, warn=1, error=2. */
export function severityToExitCode(s: DoctorSeverity): 0 | 1 | 2 {
  return s === "ok" ? 0 : s === "warn" ? 1 : 2
}

/** Promote `a` to `b` if `b` is more severe. Stable for equal inputs. */
export function maxSeverity(a: DoctorSeverity, b: DoctorSeverity): DoctorSeverity {
  if (a === "error" || b === "error") return "error"
  if (a === "warn" || b === "warn") return "warn"
  return "ok"
}

/** Compute a section's severity from its items. */
export function rollupItems(items: readonly DoctorItem[]): DoctorSeverity {
  let s: DoctorSeverity = "ok"
  for (const item of items) s = maxSeverity(s, item.severity)
  return s
}

export type RunDoctorOptions = {
  readonly cwd: string
  /** When set, only the named checkers run (e.g., `["autolinks"]`). */
  readonly only?: readonly string[]
  /**
   * Test seam: per-checker overrides. Production callers omit this. The
   * autolinks checker reads `autolinks.{workspaceConfigPath, vaultConfigPath}`
   * to redirect filesystem lookups away from the user's real `~/.km`.
   */
  readonly autolinks?: {
    readonly workspaceConfigPath?: string
    readonly vaultConfigPath?: string
  }
}

/**
 * Run all (or the requested subset of) checkers and return the aggregated
 * report. Pure-ish: filesystem reads are real, but no global mutation.
 */
export function runDoctor(opts: RunDoctorOptions): DoctorReport {
  const sections: DoctorSection[] = []
  const wantsAll = !opts.only || opts.only.length === 0
  const wants = (name: string) => wantsAll || opts.only?.includes(name)

  if (wants("autolinks")) {
    sections.push(runAutolinksChecker(opts.cwd, opts.autolinks ?? {}))
  }

  let severity: DoctorSeverity = "ok"
  for (const section of sections) severity = maxSeverity(severity, section.severity)
  return { cwd: opts.cwd, severity, sections }
}

/** Names of registered checkers. Useful for `silvercode doctor --help`. */
export const CHECKER_NAMES = ["autolinks"] as const
