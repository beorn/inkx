/**
 * Omnibox command projection — Phase 4.
 *
 * Turns the @km/commands registry into OmniboxRowData for the unified
 * omnibox. This is a pure adapter: registry → rows, with optional
 * mode/context filtering.
 *
 * Command availability filtering is minimal in v1 — we gate on the
 * existing `modes?: CommandMode[]` field. Full predicate-based `when?`
 * filtering lands in Phase 8.
 */
import type { CommandDef, CommandMode } from "@km/commands"
import { fuzzyScore } from "../views/search-utils.ts"
import { commandToRow } from "../views/omnibox-row-adapters.ts"
import type { OmniboxRowData } from "../views/OmniboxRow.tsx"

/**
 * Project a command list to row descriptors. The caller supplies the
 * command list (usually `registry.getAll()` or `allCommands`) so this
 * function is independent of which registry instance the app uses.
 */
export function projectCommands(cmds: readonly CommandDef[]): OmniboxRowData[] {
  return cmds.map((cmd) => commandToRow(cmd))
}

/**
 * Filter a command list by the current km-tui mode (normal / move /
 * search / input). Commands without a `modes` list are considered
 * available in every mode.
 */
export function filterCommandsByMode(cmds: CommandDef[], mode: CommandMode): CommandDef[] {
  return cmds.filter((cmd) => {
    if (!cmd.modes || cmd.modes.length === 0) return true
    return cmd.modes.includes(mode)
  })
}

/**
 * Rank a command list against a query string using the shared fuzzyScore.
 * Scores against command name (weight 1.0), description (0.5), id (0.3);
 * takes the best field score. Returns commands sorted by score desc,
 * filtering out non-matches. Empty query returns the input as-is.
 */
export function rankCommands(cmds: CommandDef[], query: string): CommandDef[] {
  if (!query) return cmds
  const scored = cmds
    .map((cmd) => {
      const nameScore = fuzzyScore(query, cmd.name)
      const descScore = fuzzyScore(query, cmd.description) * 0.5
      const idScore = fuzzyScore(query, cmd.id) * 0.3
      const best = Math.max(nameScore, descScore, idScore)
      return { cmd, score: best }
    })
    .filter((s) => s.score > 0)
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.cmd)
}

/**
 * End-to-end: filter → rank → project → rows. The caller supplies the
 * command list explicitly; this keeps the function pure and registry-
 * agnostic so the TUI can use `registry.getAll()` and tests can use
 * the static `allCommands` export.
 */
export function commandResultsForOmnibox(
  cmds: readonly CommandDef[],
  query: string,
  mode: CommandMode = "normal",
): OmniboxRowData[] {
  const available = filterCommandsByMode([...cmds], mode)
  const ranked = rankCommands(available, query)
  return ranked.map((cmd) => commandToRow(cmd))
}
