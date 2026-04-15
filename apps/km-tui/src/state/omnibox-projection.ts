/**
 * Omnibox command projection.
 *
 * Turns the @km/commands registry into OmniboxRowData for the unified
 * omnibox. Pure adapter: registry + query + context → rows.
 *
 * Filtering gates on both `def.modes` (coarse) and `def.when` (precise)
 * via `isCommandAvailable` — a single function call that honors both the
 * legacy Phase 4 mode list and the Phase 8 predicate. Callers must supply
 * a `KeybindingContext`; tests use a permissive stub.
 */
import type { CommandDef, CommandMode, KeybindingContext } from "@km/commands"
import { isCommandAvailable } from "@km/commands"
import type { KNode } from "@km/core"
import { fuzzyScore } from "../views/search-utils.ts"
import { commandToRow, nodeToRow } from "../views/omnibox-row-adapters.ts"
import type { OmniboxRowData } from "../views/OmniboxRow.tsx"
import type { OmniboxMode } from "./omnibox.ts"

/**
 * Project a command list to row descriptors. Pure adapter — no filtering,
 * no ranking. Use `commandResultsForOmnibox` for the full filter → rank →
 * project pipeline.
 */
export function projectCommands(cmds: readonly CommandDef[]): OmniboxRowData[] {
  return cmds.map((cmd) => commandToRow(cmd))
}

/**
 * Filter a command list by availability: both the coarse `def.modes` gate
 * and the precise `def.when` predicate, composed through `isCommandAvailable`.
 * Commands with neither set always pass.
 */
export function filterAvailableCommands(
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
 *
 * Why fuzzyScore instead of BM25? Commands are a small in-memory registry
 * (~200 entries) with short identifiers. BM25's term frequency and length
 * normalization add nothing over a direct tier-based match. The shared
 * tiered scorer (exact > prefix > segment-boundary > substring > fuzzy)
 * is the right tool for this shape.
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
 * End-to-end: filter (by ctx.modes + ctx.when) → rank → project → rows.
 *
 * Callers MUST supply a `KeybindingContext`. In production this comes from
 * `buildKeybindingContextFromOpCtx` in `command-bridge.ts`. Tests use a
 * permissive stub that satisfies all built-in predicates.
 */
export function commandResultsForOmnibox(
  cmds: readonly CommandDef[],
  ctx: KeybindingContext,
  query: string,
  mode: CommandMode = "normal",
): OmniboxRowData[] {
  const available = filterAvailableCommands(cmds, ctx, mode)
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
export function nodeResultsForOmnibox(repo: NodeSearchRepo, query: string, sigilMode: OmniboxMode): OmniboxRowData[] {
  // Modes the node projection deliberately doesn't handle.
  if (sigilMode === "command" || sigilMode === "local_find" || sigilMode === "universal") {
    return []
  }
  if (!query) return []

  // FTS5 does the ranking. We just forward and project.
  const nodes = repo.search(query, NODE_RESULT_LIMIT)
  return nodes.map((n) => nodeToRow(n))
}
