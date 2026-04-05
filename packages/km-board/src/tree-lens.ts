/**
 * TreeLens — Universal interface for navigating tree structures.
 *
 * Three lenses compose to form the full visibility pipeline:
 *
 *   repo         — all nodes, SQLite-backed
 *   view(repo)   — rooted subtree, fold/hidden filtered, roles computed
 *   visible(view) — collapsed/filtered for rendering
 *
 * All three implement TreeLens. Same KNode identity flows through all layers.
 * Enrichments (role, isBody, resolvedEmbed) are lens METHODS, not node properties.
 * Zero object allocation — pure query interface over the underlying repo.
 *
 * Cursor lives in visible.walkOrder. Navigation uses visible.nextInWalk().
 * This makes "cursor on hidden node" structurally impossible.
 */

import type { KNode } from "@km/core"
import type { SectionRules } from "@km/markdown"

// =============================================================================
// Types
// =============================================================================

/** Visual role determined by position in the view tree */
export type ViewRole = "board" | "body-column" | "column" | "card" | "subitem"

/**
 * Universal tree navigation interface.
 *
 * All tree representations (repo, view, visible) implement this.
 * Same KNode, same IDs, different visibility.
 *
 * @example
 * ```ts
 * const view = createViewLens(repo, { rootId, foldDepths, hidden })
 * const visible = createVisibleLens(view, { collapsed, filters })
 *
 * // Same API at every level:
 * visible.get("task-1")           // KNode | undefined
 * visible.children("column-1")    // string[] of visible child IDs
 * visible.nextInWalk("task-1")    // next navigable node ID
 * visible.role("task-1")          // "card" | "column" | etc.
 * ```
 */
export interface TreeLens {
  /** Root node ID for this lens (null = repo root) */
  readonly rootId: string | null

  // === Navigation (core — same at every level) ===

  /** Get a node by ID. Returns undefined if not in this lens. */
  get(id: string): KNode | undefined

  /** Get visible child IDs of a node. Order matches visual layout. */
  children(id: string): readonly string[]

  /** Get the visual parent ID. May differ from node.parent_id for embeds. */
  parent(id: string): string | null

  /** Next node in DFS walk order (O(1) for tree-backed lenses). */
  nextInWalk(id: string): string | null

  /** Previous node in DFS walk order (O(1) for tree-backed lenses). */
  prevInWalk(id: string): string | null

  /** All navigable node IDs in DFS order (lazy, cached). */
  readonly walkOrder: readonly string[]

  // === Computed properties (lens-specific enrichments) ===

  /** Visual role: board, column, card, subitem, body-column */
  role(id: string): ViewRole | undefined

  /** True if this node is body content (non-outline before first heading) */
  isBody(id: string): boolean

  /** Pre-resolved embed target, if this node has embed_source */
  resolvedEmbed(id: string): KNode | undefined

  /** Section rules (WIP limit, color, collapse) parsed from frontmatter */
  rules(id: string): SectionRules | undefined
}
