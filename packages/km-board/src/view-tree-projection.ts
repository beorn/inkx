/**
 * ViewTree — Per-node projected view of the repo tree.
 *
 * Combines a TreeLens (structural computation) with a ProjectedMap
 * (per-node signal bags) to provide reactive, per-node view state.
 *
 * React components subscribe via useNode(id) — re-renders only when
 * THAT specific node's view state changes. Navigation uses tree-wide
 * methods (next, prev, nodes).
 *
 * Architecture:
 *   signals → createViewLens → createVisibleLens → ViewTree.sync()
 *                                                    ↓
 *                                              ProjectedMap<string, ViewNodeState>
 *                                                    ↓
 *                                              useNode(id) → ViewNode
 */

import type { KNode } from "@km/core"
import type { SectionRules } from "@km/markdown"
import type { TreeLens } from "./tree-lens.ts"
import { createProjectedMap, type ProjectedMap, type Projected } from "./projected-map.ts"

// =============================================================================
// Types
// =============================================================================

/** Visual type determined by position in the view tree. */
export type ViewType = "board" | "body-column" | "column" | "card" | "subitem"

/** The projected state for one node — each field backed by a signal. */
export interface ViewNodeState {
  viewType: ViewType | undefined
  childIds: readonly string[]
  parentId: string | null
  display: KNode | undefined
  isBody: boolean
  isSymlink: boolean
  isBrokenSymlink: boolean
  hasBody: boolean
  rules: SectionRules | undefined
  data: KNode | undefined
}

/** What useNode(id) returns — read-only view of a projected node. */
export interface ViewNode {
  readonly id: string
  readonly viewType: ViewType | undefined
  readonly childIds: readonly string[]
  readonly parentId: string | null
  readonly display: KNode | undefined
  readonly isBody: boolean
  readonly isSymlink: boolean
  readonly isBrokenSymlink: boolean
  readonly hasBody: boolean
  readonly rules: SectionRules | undefined
  readonly data: KNode | undefined
}

/** The ViewTree — per-node projection + tree-wide navigation. */
export interface ViewTree {
  /** Get or create the projected signal bag for a node (for useNode). */
  getProjected(id: string): Projected<ViewNodeState> | undefined

  /** Track a node — ensures it has a signal bag. Call from useNode. */
  track(id: string): Projected<ViewNodeState> | undefined

  /** Sync all tracked nodes against the current lens. Call from effect. */
  sync(lens: TreeLens): void

  // === Tree-wide navigation ===

  /** Next node in DFS walk order. */
  next(id: string): string | null

  /** Previous node in DFS walk order. */
  prev(id: string): string | null

  /** Walk visible nodes. */
  nodes(opts?: { from?: string; reverse?: boolean }): IterableIterator<string>

  /** All visible node IDs (lazy, cached). */
  readonly walkOrder: readonly string[]

  /** Current root ID. */
  readonly rootId: string | null

  /** Node lookup (delegates to lens). */
  node(id: string): KNode | undefined

  /** Visible children (delegates to lens). */
  children(id: string): readonly string[]

  /** Visual parent (delegates to lens). */
  parent(id: string): string | null
}

// =============================================================================
// Fields tracked by the projection
// =============================================================================

const VIEW_NODE_FIELDS: readonly (keyof ViewNodeState & string)[] = [
  "viewType",
  "childIds",
  "parentId",
  "display",
  "isBody",
  "isSymlink",
  "isBrokenSymlink",
  "hasBody",
  "rules",
  "data",
]

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a ViewTree — per-node projection + tree-wide navigation.
 *
 * Call sync(lens) whenever the lens changes (from an alien-signals effect).
 * Components call track(id) via useNode to start receiving updates.
 */
export function createViewTree(): ViewTree {
  const projection: ProjectedMap<string, ViewNodeState> = createProjectedMap(VIEW_NODE_FIELDS)
  let currentLens: TreeLens | null = null

  /** Compute ViewNodeState from the current lens for a given ID. */
  function computeNodeState(lens: TreeLens, id: string): ViewNodeState | undefined {
    const knode = lens.get(id)
    if (!knode) return undefined

    const role = lens.role(id)
    const embed = lens.resolvedEmbed(id)

    const childIds = lens.children(id)
    const displayNode = embed ?? knode
    // hasBody: first child is non-outline (body content before first heading)
    const firstChildId = childIds[0]
    const firstChild = firstChildId ? lens.get(firstChildId) : undefined
    const hasBody = firstChild != null && firstChild.type !== "h"

    return {
      viewType: role as ViewType | undefined,
      childIds,
      parentId: lens.parent(id),
      display: displayNode,
      isBody: lens.isBody(id),
      isSymlink: embed !== undefined,
      isBrokenSymlink: knode.symlink_to != null && embed === undefined,
      hasBody,
      rules: lens.rules(id),
      data: knode,
    }
  }

  const tree: ViewTree = {
    getProjected(id: string): Projected<ViewNodeState> | undefined {
      return projection.get(id)
    },

    track(id: string): Projected<ViewNodeState> | undefined {
      if (!currentLens) return undefined
      const existing = projection.get(id)
      if (existing) return existing
      const state = computeNodeState(currentLens, id)
      if (!state) return undefined
      return projection.track(id, state)
    },

    sync(lens: TreeLens): void {
      currentLens = lens
      projection.sync((id) => computeNodeState(lens, id))
    },

    // === Navigation (delegates to current lens) ===

    next(id: string): string | null {
      return currentLens?.nextInWalk(id) ?? null
    },

    prev(id: string): string | null {
      return currentLens?.prevInWalk(id) ?? null
    },

    *nodes(opts?: { from?: string; reverse?: boolean }): IterableIterator<string> {
      if (!currentLens) return

      if (opts?.from) {
        const step = opts.reverse
          ? (id: string) => currentLens!.prevInWalk(id)
          : (id: string) => currentLens!.nextInWalk(id)
        let current: string | null = step(opts.from)
        while (current) {
          yield current
          current = step(current)
        }
      } else if (opts?.reverse) {
        // Walk backward from last node
        const wo = currentLens.walkOrder
        for (let i = wo.length - 1; i >= 0; i--) yield wo[i]!
      } else {
        yield* currentLens.walkOrder
      }
    },

    get walkOrder(): readonly string[] {
      return currentLens?.walkOrder ?? []
    },

    get rootId(): string | null {
      return currentLens?.rootId ?? null
    },

    node(id: string): KNode | undefined {
      return currentLens?.get(id)
    },

    children(id: string): readonly string[] {
      return currentLens?.children(id) ?? []
    },

    parent(id: string): string | null {
      return currentLens?.parent(id) ?? null
    },
  }

  return tree
}
