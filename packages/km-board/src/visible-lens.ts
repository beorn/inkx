/**
 * VisibleLens — TreeLens filtered by collapse and property/text filters.
 *
 * Wraps a parent TreeLens (typically a ViewLens) and further restricts
 * which nodes are visible:
 *
 *   visible = createVisibleLens(view, { collapsed, filter })
 *
 * Collapsed columns: column header stays visible but its card children
 * are excluded from walkOrder. Navigation skips into collapsed columns
 * (lands on header, not cards).
 *
 * Property/text filters: cards not matching the predicate are excluded.
 *
 * The cursor should live in visible.walkOrder — this ensures navigation
 * only visits nodes the user can see.
 */

import type { KNode, NodeRules } from "@km/core"
import { getStatusForMarker } from "@km/core"
import type { TreeLens, ViewType } from "./tree-lens.ts"

// =============================================================================
// Types
// =============================================================================

export interface VisibleLensOptions {
  /** Column node IDs that are collapsed (cards hidden, header visible) */
  collapsedNodes?: Set<string>
  /** Predicate: return false to hide a card from the visible tree */
  cardFilter?: (node: KNode) => boolean
  /** Set of task statuses to SHOW. When non-empty, cards with a task status NOT in this set are hidden. */
  taskStatusFilter?: ReadonlySet<string>
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a VisibleLens that wraps a parent lens with collapse + filter.
 *
 * The visible lens delegates all get/role/isBody/resolvedEmbed/rules to
 * the parent lens. It only modifies children() and walkOrder to exclude
 * collapsed cards and filtered cards.
 *
 * **Layering**: this returns a {@link TreeLens} (data layer). React components
 * should NOT consume the returned lens directly — use `createViewTree`
 * (in `view-tree-projection.ts`) which wraps it with per-node signal bags
 * for incremental rendering. Use this factory only from non-React code:
 * reducers, selectors, navigation helpers, store, pane-signals reactive graph.
 */
export function createVisibleLens(parent: TreeLens, options: VisibleLensOptions = {}): TreeLens {
  const { collapsedNodes, cardFilter, taskStatusFilter } = options
  const hasTaskFilter = taskStatusFilter != null && taskStatusFilter.size > 0

  // Cache filtered children
  const childrenCache = new Map<string, readonly string[]>()
  let _walkOrder: readonly string[] | null = null

  /** Check if a node passes the task status filter. */
  function passesTaskStatusFilter(childId: string): boolean {
    if (!hasTaskFilter) return true
    const node = parent.get(childId)
    if (!node) return false
    // For embeds, resolve to target node for status check
    const filterNode = node.embed_of ? (parent.get(node.embed_of) ?? node) : node
    const status = filterNode.item?.task?.status ?? getStatusForMarker(filterNode.item?.task?.marker)
    // Non-task nodes (no status) always pass — only tasks are filtered
    return !status || taskStatusFilter!.has(status)
  }

  function getFilteredChildren(id: string): readonly string[] {
    const cached = childrenCache.get(id)
    if (cached) return cached

    const parentChildren = parent.children(id)

    // If no filters active, pass through
    if (!collapsedNodes?.size && !cardFilter && !hasTaskFilter) {
      childrenCache.set(id, parentChildren)
      return parentChildren
    }

    const parentRole = parent.role(id)

    // Collapsed columns: exclude card children (header stays visible)
    if (collapsedNodes?.has(id) && (parentRole === "column" || parentRole === "body-column")) {
      const filtered: string[] = []
      childrenCache.set(id, filtered)
      return filtered
    }

    // Determine which filters apply at this level
    const applyCardFilter = cardFilter && (parentRole === "column" || parentRole === "body-column")
    const needsFiltering = applyCardFilter || hasTaskFilter

    if (needsFiltering) {
      const filtered = parentChildren.filter((childId) => {
        // Card filter: applies only to column children
        if (applyCardFilter) {
          const node = parent.get(childId)
          if (!node) return false
          if (!cardFilter(node)) return false
        }
        // Task status filter: applies at ALL depths
        if (hasTaskFilter && !passesTaskStatusFilter(childId)) return false
        return true
      })
      childrenCache.set(id, filtered)
      return filtered
    }

    childrenCache.set(id, parentChildren)
    return parentChildren
  }

  // DFS walk helper — delegates filtered children to parent lens
  function computeNextInWalk(id: string): string | null {
    const ch = getFilteredChildren(id)
    if (ch.length > 0) return ch[0]!
    // Walk up to find next sibling
    let current: string | null = id
    while (current) {
      const p = lens.parent(current)
      if (!p) return null
      const siblings = getFilteredChildren(p)
      const idx = siblings.indexOf(current)
      if (idx >= 0 && idx < siblings.length - 1) return siblings[idx + 1]!
      current = p
    }
    return null
  }

  function computePrevInWalk(id: string): string | null {
    const p = lens.parent(id)
    if (!p) return null
    const siblings = getFilteredChildren(p)
    const idx = siblings.indexOf(id)
    if (idx > 0) {
      // Previous sibling's deepest last descendant
      let prev = siblings[idx - 1]!
      let prevChildren = getFilteredChildren(prev)
      while (prevChildren.length > 0) {
        prev = prevChildren[prevChildren.length - 1]!
        prevChildren = getFilteredChildren(prev)
      }
      return prev
    }
    // No previous sibling — parent (unless root)
    const rootId = parent.rootId
    if (p === rootId) return null
    return p
  }

  const lens: TreeLens = {
    rootId: parent.rootId,

    get(id: string): KNode | undefined {
      return parent.get(id)
    },

    children(id: string): readonly string[] {
      return getFilteredChildren(id)
    },

    parent(id: string): string | null {
      return parent.parent(id)
    },

    nextInWalk(id: string): string | null {
      return computeNextInWalk(id)
    },

    prevInWalk(id: string): string | null {
      return computePrevInWalk(id)
    },

    get walkOrder(): readonly string[] {
      if (_walkOrder === null) {
        const ids: string[] = []
        const rootId = parent.rootId
        // Include root itself if it has an ID
        if (rootId) {
          // Start from root's children (root is "board", not navigable)
          const rootChildren = getFilteredChildren(rootId)
          const stack = [...rootChildren].reverse()
          while (stack.length > 0) {
            const id = stack.pop()!
            ids.push(id)
            const ch = getFilteredChildren(id)
            for (let i = ch.length - 1; i >= 0; i--) stack.push(ch[i]!)
          }
        }
        _walkOrder = ids
      }
      return _walkOrder
    },

    role(id: string): ViewType | undefined {
      return parent.role(id)
    },

    isBody(id: string): boolean {
      return parent.isBody(id)
    },

    resolvedEmbed(id: string): KNode | undefined {
      return parent.resolvedEmbed(id)
    },

    rules(id: string): NodeRules | undefined {
      return parent.rules(id)
    },
  }

  return lens
}
