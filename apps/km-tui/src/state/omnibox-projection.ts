/**
 * Omnibox command projection — Phase 4 (mode filter) + Phase 8 (when filter).
 *
 * Turns the @km/commands registry into OmniboxRowData for the unified
 * omnibox. This is a pure adapter: registry → rows, with optional
 * mode/context filtering.
 *
 * Two filter helpers exist:
 *   - `filterCommandsByMode(cmds, mode)` — Phase 4, gates on `def.modes`
 *     only. Kept for callers that don't yet have a KeybindingContext.
 *   - `filterCommandsByAvailability(cmds, ctx, mode?)` — Phase 8, gates
 *     on both `def.modes` and `def.when` via `isCommandAvailable`.
 *
 * Wiring `filterCommandsByAvailability` into `commandResultsForOmnibox`
 * requires a KeybindingContext at the call site (currently
 * `WorkspaceChrome` / `UnifiedOmniboxConnector`). That wiring lands in
 * a follow-up; until then, both helpers are exported and stable.
 */
import type { CommandDef, CommandMode, KeybindingContext } from "@km/commands"
import { isCommandAvailable } from "@km/commands"
import type { KNode } from "@km/core"
import { fuzzyScore } from "../views/search-utils.ts"
import { commandToRow, nodeToRow } from "../views/omnibox-row-adapters.ts"
import type { OmniboxRowData } from "../views/OmniboxRow.tsx"
import type { OmniboxMode } from "./omnibox.ts"

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
 *
 * Phase 4 helper — gates on `def.modes` only. Use
 * `filterCommandsByAvailability` when a `KeybindingContext` is available
 * so cross-field `def.when` predicates are honored too.
 */
export function filterCommandsByMode(cmds: CommandDef[], mode: CommandMode): CommandDef[] {
  return cmds.filter((cmd) => {
    if (!cmd.modes || cmd.modes.length === 0) return true
    return cmd.modes.includes(mode)
  })
}

/**
 * Filter a command list by full availability — both the coarse `def.modes`
 * gate and the precise `def.when` predicate (Phase 8).
 *
 * Prefer this over `filterCommandsByMode` whenever the caller has a
 * `KeybindingContext` handy. Commands without `modes` and without `when`
 * always pass, so it's a strict superset of `filterCommandsByMode`.
 */
export function filterCommandsByAvailability(
  cmds: readonly CommandDef[],
  ctx: KeybindingContext,
  mode?: CommandMode,
): CommandDef[] {
  return cmds.filter((cmd) => isCommandAvailable(cmd, ctx, mode))
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
 *
 * Phase 4 variant — gates on `def.modes` only. Use
 * `commandResultsForOmniboxWithContext` when a `KeybindingContext` is
 * available so cross-field `def.when` predicates are honored too.
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

/**
 * Context-aware end-to-end projection — Phase 8 variant. Gates commands
 * through `filterCommandsByAvailability` so both `def.modes` AND `def.when`
 * predicates are honored before ranking. The connector calls this at render
 * time with a `KeybindingContext` built from the focused pane's OpCtx, so
 * commands whose `when` predicate returns false (e.g. move commands when
 * there is nothing to move) are omitted from the omnibox result list.
 *
 * Prefer this over `commandResultsForOmnibox` whenever a `KeybindingContext`
 * is available — it's a strict superset of the mode-only filter.
 */
export function commandResultsForOmniboxWithContext(
  cmds: readonly CommandDef[],
  ctx: KeybindingContext,
  query: string,
  mode: CommandMode = "normal",
): OmniboxRowData[] {
  const available = filterCommandsByAvailability(cmds, ctx, mode)
  const ranked = rankCommands(available, query)
  return ranked.map((cmd) => commandToRow(cmd))
}

// =============================================================================
// Node search projection (Phase 7d) — non-`:` sigils dispatch here
// =============================================================================

/**
 * Narrow Repo subset consumed by `nodeResultsForOmnibox`. Exposes exactly
 * what the projection needs from `@km/storage`'s Repo: full-text search.
 *
 * Why not the whole Repo? Defining the minimal surface here keeps the
 * projection pure and testable with a tiny mock, and documents the
 * dependency explicitly.
 */
export interface NodeSearchRepo {
  /**
   * Full-text search. The storage layer applies BM25 column weights
   * (name × 3, title × 2, content × 1) plus a depth tie-break, so the
   * projection doesn't need to re-rank — what comes back is already
   * ordered identity-first. See
   * packages/km-storage/src/db/queries/full-text-search.ts.
   */
  search(query: string, limit?: number): KNode[]
}

/** Cap on the number of node rows returned to the omnibox dropdown. */
const NODE_RESULT_LIMIT = 12

/**
 * Project FTS5 search results to `OmniboxRowData` for the unified omnibox.
 * Thin wrapper over `repo.search()` — all the ranking lives in the SQL
 * query (see the storage module for BM25 column weights and the sigil
 * tokenchars config that make this work).
 *
 * Why so thin? Because FTS5's `bm25(table, ...weights)` already gives us:
 *   - Identity bias (name > title > content via weights)
 *   - Sigil-preserving tokenization (`tokenchars='@#+~'`)
 *   - Depth tie-break (slash count in fs_path, done in SQL)
 *   - BM25 scoring for term frequency / rarity / length normalization
 *
 * Any JS post-pass here would be reimplementing what BM25 already does
 * better, so we don't. Mode dispatch remains: `command` / `local_find` /
 * `universal` are handled elsewhere (or not at all for v1).
 */
export function nodeResultsForOmnibox(
  repo: NodeSearchRepo,
  query: string,
  sigilMode: OmniboxMode,
): OmniboxRowData[] {
  // Modes the node projection deliberately doesn't handle.
  if (sigilMode === "command" || sigilMode === "local_find" || sigilMode === "universal") {
    return []
  }
  if (!query) return []

  // FTS5 does the ranking. We just forward and project.
  const nodes = repo.search(query, NODE_RESULT_LIMIT)
  return nodes.map((n) => nodeToRow(n))
}
