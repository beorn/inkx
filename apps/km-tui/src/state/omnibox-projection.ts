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
 * Narrow Repo subset consumed by `nodeResultsForOmnibox`. Defining a minimal
 * surface here keeps the projection pure and testable with a tiny mock —
 * tests don't need to spin up a real bun:sqlite repo to verify ranking.
 *
 * In production this is satisfied by the full `Repo` from `@km/storage`.
 */
export interface NodeSearchRepo {
  rawQuery<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[]
  getNode(id: string): KNode | null
  getChildren(parentId: string | null): KNode[]
}

/** Cap on the number of node rows returned to the omnibox dropdown. */
const NODE_RESULT_LIMIT = 12

/**
 * Project the repo's node list to OmniboxRowData for the unified omnibox,
 * dispatched by sigil mode. Mirrors `commandResultsForOmnibox` for the
 * non-`:` half of the omnibox.
 *
 * Modes:
 * - `project` (`+foo`): nodes whose title starts with `+`, or any node when
 *   the user has typed something specific enough to match by other fields.
 * - `context` (`@foo`): nodes whose title starts with `@` (assignee/people
 *   convention in km), plus nodes that contain `@mention`-style references.
 * - `tag` (`#foo`): nodes whose title contains the `#tag` literal or whose
 *   content is a tag reference.
 * - `node` (`[foo`): any node, matched fuzzily against its display text.
 * - `local_find`: empty (Phase 9 owns the in-pane find surface).
 * - `command`: empty (caller is expected to use `commandResultsForOmnibox`).
 * - `universal`: empty for v1 (Phase 7d). Recents land in a later phase.
 *
 * Ranking uses the shared tiered `fuzzyScore` from `search-utils.ts`. The
 * **full query** (including the leading sigil) is passed to the scorer so
 * Tier 2 (prefix) handles cases like "`+ta` starts with `+ta`" correctly —
 * that's the picker-rank-subpath fix applied to the unified surface.
 *
 * Results are capped at 12 rows so the dropdown never blows up the UI.
 */
export function nodeResultsForOmnibox(repo: NodeSearchRepo, query: string, sigilMode: OmniboxMode): OmniboxRowData[] {
  // Modes the node projection deliberately doesn't handle. Caller routes
  // these elsewhere (commands → commandResultsForOmnibox; local_find → the
  // Phase 9 in-pane find chrome; universal empty buffer → recents later).
  if (sigilMode === "command" || sigilMode === "local_find" || sigilMode === "universal") {
    return []
  }

  // Pull the candidate set. We use `rawQuery` to match the existing picker
  // loaders' approach — it returns the full node table without the read-side
  // overhead of building TNode trees. For a typical km vault this is a few
  // thousand rows and the fuzzy scorer is the bottleneck, not the read.
  const allNodes = repo.rawQuery<KNode>("SELECT * FROM nodes")

  // Per-mode candidate filter. The filter is generous on purpose — the
  // tiered fuzzy scorer handles ranking, and we'd rather show too many
  // candidates than miss a match the user expected.
  const candidates = allNodes.filter((n) => modeFilter(n, sigilMode))

  // Multi-field scoring (see scoreNodeForOmnibox for the weights). The
  // full query — sigil included — is passed through so the tiered scorer's
  // prefix tier handles "`+ta` starts with `+ta`" correctly.
  const scored: { node: KNode; score: number }[] = []
  for (const n of candidates) {
    const score = scoreNodeForOmnibox(n, query)
    if (score > 0) scored.push({ node: n, score })
  }
  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, NODE_RESULT_LIMIT).map((s) => nodeToRow(s.node))
}

/**
 * Display text for a node, used as the row title and as the **fallback**
 * scoring field (see `scoreNodeForOmnibox`). Falls back to the node ID so
 * nothing is ever undefined.
 *
 * Uses `||` (not `??`) so empty-string content falls through to title/name.
 * Critical for files like `@next.md` whose body is empty — without the
 * fall-through, `displayTitle` would return `""` and the ranker would
 * produce a noisy score for a node that actually has a good name match.
 *
 * NOTE: We don't depend on `getNodeDisplayName` from `state.ts` here — that
 * walks `repo.getChildren` for every file node to find H1 headings, turning
 * an O(n) projection into O(n²). The name/title/content fields are the same
 * values the row would render anyway.
 */
function displayTitle(node: KNode): string {
  return node.content || node.title || node.name || node.id
}

// =============================================================================
// Multi-field node scoring (name > title > content, with depth boost)
// =============================================================================

/**
 * Score a KNode against a query using three weighted fields, taking the
 * max. This is the identity-first ranker: a file literally named `@next.md`
 * beats a section titled `@next actions` beats a card with `@next` in body,
 * even when the fuzzy scores are similar.
 *
 *   name  × 2.0  — filename / alias. Strongest signal of identity.
 *   title × 1.0  — H1 / section heading. Medium — often carries sigils as
 *                  tags (km convention uses `@person` / `#topic` in titles
 *                  as metadata markers), which is exactly why we rank it
 *                  lower than name.
 *   display × 0.9 — `displayTitle(node)` fallback (content || title || name).
 *                   Catches cases where the node has meaningful content text
 *                   but no clean name/title.
 *
 * A small additive depth boost promotes shallower nodes (ones higher in
 * the repo tree). `fs_path` slash count is used as the depth proxy — files
 * at the vault root get a +50 bonus decaying to 0 at depth 5.
 *
 * The shared `fuzzyScore` is tiered (exact > prefix > segment-boundary >
 * substring > fuzzy), so a tier-1 name match is ~10000 and a tier-2 title
 * prefix match is ~5000. With the 2× name weight that's 20000 vs 5000 —
 * the root file wins even when the title match is strong.
 */
export function scoreNodeForOmnibox(node: KNode, query: string): number {
  if (!query) return 0
  const nameScore = fuzzyScore(query, node.name ?? "") * 2.0
  const titleScore = fuzzyScore(query, node.title ?? "") * 1.0
  const displayScore = fuzzyScore(query, displayTitle(node)) * 0.9
  const best = Math.max(nameScore, titleScore, displayScore)
  if (best <= 0) return 0
  // Depth proxy: fs_path slash count. "@next.md" → 0, "inbox/next.md" → 1,
  // "inbox/things/next.md" → 2. Nodes without fs_path (in-memory, items,
  // sub-blocks) inherit depth 0 for the boost — their fs_path is typically
  // either unset or the containing file's path, which is OK.
  const fsPath = node.fs_path ?? ""
  const depth = fsPath.length === 0 ? 0 : fsPath.split("/").length - 1
  const depthBoost = Math.max(0, 50 - depth * 10)
  return best + depthBoost
}

/**
 * Mode-specific candidate filter. Generous by design — see the comment
 * inside `nodeResultsForOmnibox`. The fuzzy scorer is the discriminator.
 */
function modeFilter(node: KNode, mode: OmniboxMode): boolean {
  const title = displayTitle(node)
  if (!title) return false
  switch (mode) {
    case "project":
      // `+project` convention: pass anything that starts with `+`, plus
      // any node so the ranker can still catch subpath matches like
      // `Work / +infra / migration`. Exclude embed targets — the user
      // wants the source.
      if (node.embed_of) return false
      return true
    case "context":
      // `@context` convention: people / assignees. Pass anything that
      // contains `@` so we catch both `@delei` titles and `@delei.co`-
      // style mentions in content. Embed targets excluded.
      if (node.embed_of) return false
      return true
    case "tag":
      // Tags are extracted both from titles (`#urgent` literal) and node
      // content (`do laundry #urgent`). Pass everything; the scorer will
      // rank exact `#tag` matches above content occurrences.
      if (node.embed_of) return false
      return true
    default:
      return false
  }
}
