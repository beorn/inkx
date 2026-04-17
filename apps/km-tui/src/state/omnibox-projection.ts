/**
 * Omnibox command projection — single-owner adapter (Phase 3 TEA shim).
 *
 * Turns the @km/commands registry into OmniboxRowData for the unified
 * omnibox. Pure adapter: registry + query + context → rows.
 *
 * ## Single-owner principle
 *
 * Exactly ONE module owns the command → row projection: the
 * `commandToRow` adapter in `../views/omnibox-row-adapters.ts`, invoked
 * from here. The row renderer (`OmniboxRow`), the ranker (`rankCommands`
 * below; future shared `rankResults` per km-tui.omnibox-ranker), and the
 * query-syntax parser (km-tui.omnibox-query-syntax) all consume the
 * registry through this module — no consumer imports `CommandDef`
 * directly for display purposes.
 *
 * When TEA lands, this module retargets at `app.commands.*` without any
 * consumer needing to change.
 *
 * ## Row-view shape, not KNode
 *
 * The unified row shape is `OmniboxRowData` (a view-model), not `KNode`.
 * Commands are a registry, not user content: they have no `parent_id`,
 * `created_at`, `data` blob, or `BlockType`. Forcing a `KNode` envelope
 * would require fabricating structural fields the rest of the system
 * would then have to ignore. The row view-model is the honest shape for
 * "thing the omnibox displays" — commands and nodes both flow through
 * it via `commandToRow` / `nodeToRow` adapters that own the domain-
 * specific conversions.
 *
 * ## Availability filtering
 *
 * Filtering gates on both `def.modes` (coarse) and `def.when` (precise)
 * via `isCommandAvailable` — a single function call that honors both the
 * legacy Phase 4 mode list and the Phase 8 predicate. Callers must supply
 * a `KeybindingContext`; tests use a permissive stub.
 */
import type { CommandDef, CommandMode, KeybindingContext } from "@km/commands"
import { isCommandAvailable } from "@km/commands"
import type { KNode } from "@km/core"
import { commandToRow, nodeToRow } from "../views/omnibox-row-adapters.ts"
import type { OmniboxRowData } from "../views/OmniboxRow.tsx"
import type { OmniboxMode } from "./omnibox.ts"
import { parseQuery } from "./omnibox-query-parser.ts"
import { scoreTextFields } from "./omnibox-ranker.ts"
import type { RecencyBoost } from "./recents-store.ts"

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
 * Rank a command list against a query string using the shared omnibox ranker.
 * Parses the query through `parseQuery`, then scores each command across three
 * fields: name (primary, 1.0×), description (secondary, 0.8×), id (tertiary,
 * 0.6×). Returns commands sorted by total score desc, filtering out non-matches.
 *
 * Empty query: when `recencyBoost` is supplied, returns commands sorted by MRU
 * bonus (desc) so the palette surfaces recents first; otherwise returns the
 * input order. Typed queries always apply `recencyBoost` additively so a
 * recent-AND-matching command wins ties against a non-recent match.
 *
 * Shares `scoreTextFields` with node ranking so every omnibox result set uses
 * identical match rules (exact > prefix > segment-boundary > substring > fuzzy,
 * plus negation, plus phrase/prefix/suffix kinds).
 */
export function rankCommands(cmds: CommandDef[], query: string, recencyBoost?: RecencyBoost): CommandDef[] {
  if (!query) {
    if (!recencyBoost) return cmds
    const withBoost = cmds.map((cmd) => ({ cmd, score: recencyBoost(cmd.id) }))
    withBoost.sort((a, b) => b.score - a.score)
    return withBoost.map((s) => s.cmd)
  }
  const parsed = parseQuery(query)
  const scored = cmds
    .map((cmd) => {
      const textScore = scoreTextFields(parsed, {
        primary: cmd.name,
        secondary: cmd.description,
        tertiary: cmd.id,
      })
      if (textScore <= 0) return { cmd, score: 0 }
      const boost = recencyBoost ? recencyBoost(cmd.id) : 0
      return { cmd, score: textScore + boost }
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
  recencyBoost?: RecencyBoost,
): OmniboxRowData[] {
  const available = filterAvailableCommands(cmds, ctx, mode)
  const ranked = rankCommands(available, query, recencyBoost)
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
 * Thin wrapper over `repo.search()` — all the text ranking lives in the
 * SQL query (BM25 column weights + sigil-aware tokenization). JS-side we
 * do only post-filters that FTS doesn't express:
 *
 *   - `[`-sigil (node mode) → drop tasks (`node.item?.task != null`)
 *   - bracket task-filter (`[]`, `[x]`, `[ ]`, `[/]`, `[!]`, `[-]`) →
 *     keep only tasks with the matching status
 *
 * Modes this function does NOT handle (caller dispatches elsewhere):
 *   - `command` — commandResultsForOmnibox owns the registry projection
 *   - `local_find` — Phase 9's in-pane find chrome owns that surface
 *
 * Universal mode (no sigil, non-empty buffer) does unrestricted FTS —
 * the caller typically merges these rows with command-search results to
 * produce the "search everything" experience.
 */
export function nodeResultsForOmnibox(repo: NodeSearchRepo, query: string, sigilMode: OmniboxMode): OmniboxRowData[] {
  if (sigilMode === "command" || sigilMode === "local_find") return []
  if (!query) return []

  const parsed = parseQuery(query)

  // FTS query string: drop the leading sigil + any bracket-task prefix the
  // parser consumed. Whatever's left is the free-text that FTS should match.
  // For pure sigil buffers (e.g. `[`, `@`, `[]`), fall back to the raw
  // buffer so FTS still has something to tokenize (BM25 on "[" alone is
  // empty — we instead return all nodes when the only content is the sigil).
  let fts: KNode[]
  const trimmed = parsed.raw.trim()
  const hasSearchText = parsed.terms.length > 0
  if (hasSearchText) {
    // Join positive terms for FTS. Phrase terms get quoted; negated and v1.1
    // kinds fall back to the raw value.
    const ftsQuery = parsed.terms
      .filter((t) => !t.negated)
      .map((t) => (t.kind === "phrase" ? `"${t.value}"` : t.value))
      .join(" ")
    fts = ftsQuery ? repo.search(ftsQuery, NODE_RESULT_LIMIT * 2) : []
  } else if (parsed.sigil || parsed.taskFilter) {
    // Sigil/task-filter only (e.g. `[`, `[]`, `[x]`) — we need every
    // candidate the post-filter can keep. Ask FTS for a fat slice.
    fts = repo.search(trimmed || "", NODE_RESULT_LIMIT * 4)
  } else {
    fts = []
  }

  const filtered = fts.filter((n) => {
    // `[`-sigil: exclude tasks
    if (parsed.sigil === "[" && n.item?.task != null) return false
    // Other sigils (@#+): prefix-match display text
    if (parsed.sigil && parsed.sigil !== "[") {
      const txt = n.name ?? n.content ?? ""
      if (!txt.startsWith(parsed.sigil)) return false
    }
    // Bracket task filter: keep only tasks with matching status
    if (parsed.taskFilter) {
      const status = n.item?.task?.status
      if (status === undefined) return false
      if (parsed.taskFilter !== "any" && status !== parsed.taskFilter) return false
    }
    return true
  })

  return filtered.slice(0, NODE_RESULT_LIMIT).map((n) => nodeToRow(n))
}
