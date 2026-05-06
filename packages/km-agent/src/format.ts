/**
 * Agent output formatting
 *
 * Shared formatters used by `km agent ls` and `km bd agent ls` (and any
 * future surfaces that need to render an Agent in a list).
 *
 * The CLI surfaces pass a small `AgentColorizer` so the formatter stays
 * UI-framework-agnostic — `@km/agent` does not depend on `@silvery/ag-react`.
 * Pass an identity colorizer for plain text (e.g. tests, logs, JSON-adjacent
 * output).
 */

import type { Agent, AgentStatus } from "./types.ts"

/**
 * Minimal colorizer surface. Each fn wraps a string in ANSI codes (or
 * returns the string unchanged for plain output).
 */
export interface AgentColorizer {
  cyan: (s: string) => string
  dim: (s: string) => string
  green: (s: string) => string
  yellow: (s: string) => string
  gray: (s: string) => string
  red: (s: string) => string
}

/**
 * Identity colorizer — returns its input unchanged. Useful for tests and
 * non-TTY contexts.
 */
export const plainColorizer: AgentColorizer = {
  cyan: (s) => s,
  dim: (s) => s,
  green: (s) => s,
  yellow: (s) => s,
  gray: (s) => s,
  red: (s) => s,
}

/**
 * Format an agent's status as a single-character glyph.
 */
export function formatAgentStatus(status: AgentStatus, c: AgentColorizer = plainColorizer): string {
  switch (status) {
    case "idle":
      return c.dim("○")
    case "running":
      return c.green("●")
    case "paused":
      return c.yellow("◐")
    case "stopped":
      return c.gray("○")
    case "error":
      return c.red("✗")
  }
}

/**
 * Options for `formatAgentBrief`. Defaults match `km bd agent ls` (no second
 * line). Pass `withModelHarness: true` for the `km agent ls` shape.
 */
export interface FormatAgentBriefOptions {
  /** Include a second line with `<model> / <harness>` (km agent ls). */
  withModelHarness?: boolean
}

/**
 * Format a single agent for list rendering. Returns an array of lines so the
 * caller can `console.log` each (or join with `\n`).
 *
 * Line 1: `<status-glyph> <shortId> <name>[ → <currentTaskId>]`
 * Line 2 (when `withModelHarness`): `   <model> / <harness>`
 */
export function formatAgentBrief(
  agent: Agent,
  c: AgentColorizer = plainColorizer,
  opts: FormatAgentBriefOptions = {},
): string[] {
  const status = formatAgentStatus(agent.status, c)
  const task = agent.currentTaskId ? c.dim(` → ${agent.currentTaskId}`) : ""
  const lines = [`${status} ${c.cyan(agent.shortId)} ${agent.name}${task}`]
  if (opts.withModelHarness) {
    lines.push(c.dim(`   ${agent.model} / ${agent.harness}`))
  }
  return lines
}
