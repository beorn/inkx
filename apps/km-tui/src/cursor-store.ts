import { KNode } from "@km/core"

/**
 * CursorStore — Lightweight pub/sub for cursor state.
 *
 * Separate from Zustand to allow cursor changes without triggering
 * Board re-renders. Only components that subscribe via useSyncExternalStore
 * (useIsCursorAtNode, useIsColumnSelectedByNode) re-render on cursor moves.
 *
 * This enables ~3ms j/k presses: only 2 Cards re-render instead of the
 * entire Board → Column → Card cascade.
 *
 * CursorState holds cursorNodeId plus derived ancestor IDs (card, column).
 * Ancestors are computed when the cursor changes — components use them
 * for self-selection without needing layout derivation.
 */

export interface CursorState {
  cursorNodeId: string | null
  /** The card-level ancestor of cursorNodeId (grandchild of rootId), or null */
  cursorCardNodeId: string | null
  /** The column-level ancestor of cursorNodeId (child of rootId), or null */
  cursorColumnNodeId: string | null
  /** Selection level: where in the tree hierarchy the cursor sits */
  selectionLevel: "board" | "column" | "card"
}

export interface CursorStore {
  getState(): CursorState
  setState(state: CursorState): void
  /** Subscribe to cursor changes. Returns unsubscribe function. */
  subscribe(listener: () => void): () => void
  /** Version counter for useSyncExternalStore — increments on each setState */
  getSnapshot(): number
}

/** Virtual body column ID prefix. Body cards (non-outline direct children of root)
 * belong to a virtual column with ID `__body__<rootId>`. */
const BODY_COL_PREFIX = "__body__"

/**
 * Derive cursor ancestor IDs by walking up the tree from cursorNodeId.
 *
 * Returns the card-level node (grandchild of root), column-level node (child of root),
 * and selection level based on where cursorNodeId sits in the hierarchy.
 *
 * Handles virtual body columns: non-outline direct children of root that appear
 * BEFORE the first outline sibling are body cards, grouped under a virtual column
 * `__body__<rootId>`. Non-outline nodes that appear AFTER the first outline sibling are
 * structural items (treated as columns), matching extractBody's logic.
 *
 * @param getNode - Lookup function returning { parent_id, type } (repo.getNode)
 * @param rootId - Current zoom root
 * @param cursorNodeId - The cursor's current node
 * @param getChildren - Lookup function returning children of a node (repo.getChildren).
 *   Required for distinguishing body cards from structural non-outline nodes.
 *   When omitted, all non-outline direct children of root are treated as body cards.
 */
export function deriveCursorAncestors(
  getNode: (id: string) => { parent_id: string | null; type: string; item?: boolean } | null | undefined,
  rootId: string | null,
  cursorNodeId: string | null,
  getChildren?: (parentId: string | null) => { id: string; type: string; item?: boolean }[],
): { cursorCardNodeId: string | null; cursorColumnNodeId: string | null; selectionLevel: "board" | "column" | "card" } {
  if (!cursorNodeId) {
    return { cursorCardNodeId: null, cursorColumnNodeId: null, selectionLevel: "board" }
  }

  // Virtual body column header: __body__<rootId> is a column-level selection
  if (cursorNodeId.startsWith(BODY_COL_PREFIX)) {
    return { cursorCardNodeId: null, cursorColumnNodeId: cursorNodeId, selectionLevel: "column" }
  }

  // Walk up the tree collecting ancestors until we hit rootId or null
  // ancestors[0] = cursorNodeId, ancestors[1] = parent, ancestors[2] = grandparent, ...
  const ancestors: string[] = [cursorNodeId]
  let current = cursorNodeId
  const maxDepth = 100 // safety limit
  for (let i = 0; i < maxDepth; i++) {
    const node = getNode(current)
    if (!node || node.parent_id === rootId || node.parent_id === null) break
    ancestors.push(node.parent_id)
    current = node.parent_id
  }

  // ancestors array: [cursor, ..., childOfRoot]
  // The last element is the child of rootId (column or body card)
  // The second-to-last is the grandchild of rootId (card level)
  const depth = ancestors.length
  const childOfRootId = ancestors[depth - 1]
  if (!childOfRootId) {
    return { cursorCardNodeId: null, cursorColumnNodeId: null, selectionLevel: "board" }
  }
  const childOfRootNode = getNode(childOfRootId)

  if (!childOfRootNode || (childOfRootNode.parent_id !== rootId && childOfRootNode.parent_id !== null)) {
    // Not actually a child of root — shouldn't happen but handle gracefully
    return { cursorCardNodeId: null, cursorColumnNodeId: null, selectionLevel: "board" }
  }

  // Determine if the child-of-root is a body card or structural item.
  // Body cards are non-outline nodes that appear BEFORE the first outline sibling
  // (matching extractBody's logic). Non-outline nodes AFTER the first outline are structural.
  const isBodyCard = !KNode.isOutline(childOfRootNode) && isInBodyRegion(childOfRootId, rootId, getChildren)

  if (isBodyCard) {
    // Body cards are direct children of root but displayed as cards in a virtual body column.
    // The virtual column ID is __body__<rootId>.
    const virtualColId = `${BODY_COL_PREFIX}${rootId ?? "root"}`

    if (depth === 1) {
      // Cursor IS the body card
      return { cursorCardNodeId: cursorNodeId, cursorColumnNodeId: virtualColId, selectionLevel: "card" }
    }
    // Cursor is deeper within the body card — body card is the card ancestor
    return { cursorCardNodeId: childOfRootId, cursorColumnNodeId: virtualColId, selectionLevel: "card" }
  }

  // Structural node: either outline, or non-outline that appears after the first outline sibling.
  // Both are treated as columns at the board level.
  if (depth === 1) {
    // Cursor IS the column/structural node → column level
    return { cursorCardNodeId: null, cursorColumnNodeId: cursorNodeId, selectionLevel: "column" }
  }

  // depth >= 2: childOfRoot = column, ancestors[depth-2] = card
  const cardNodeId = ancestors[depth - 2] ?? null
  return { cursorCardNodeId: cardNodeId, cursorColumnNodeId: childOfRootId, selectionLevel: "card" }
}

/**
 * Check if a non-outline child of root is in the "body" region (before the first outline sibling).
 * Matches extractBody's logic: body = non-outline nodes before first outline.
 * When getChildren is not available, defaults to true (conservative: treat as body).
 */
function isInBodyRegion(
  nodeId: string,
  rootId: string | null,
  getChildren?: (parentId: string | null) => { id: string; type: string; item?: boolean }[],
): boolean {
  if (!getChildren) return true // Conservative default: no children → assume body
  const siblings = getChildren(rootId)
  for (const sibling of siblings) {
    if (KNode.isOutline(sibling)) return false // Found an outline item before this node → structural region
    if (sibling.id === nodeId) return true // Found our node before any outline item → body region
  }
  return true // Node not found in siblings (shouldn't happen) → default to body
}

/**
 * Create a CursorStore from a repo + root/cursor IDs, deriving ancestors automatically.
 * Eliminates boilerplate of manually calling deriveCursorAncestors at each call site.
 */
export function createCursorStoreFromRepo(
  repo: {
    getNode(id: string): { parent_id: string | null; type: string; item?: boolean } | null | undefined
    getChildren(parentId: string | null): { id: string; type: string; item?: boolean }[]
  },
  rootId: string | null,
  cursorNodeId: string | null,
): CursorStore {
  return createCursorStore({
    cursorNodeId,
    ...deriveCursorAncestors(
      (id) => repo.getNode(id),
      rootId,
      cursorNodeId,
      (pid) => repo.getChildren(pid),
    ),
  })
}

/**
 * Create a lightweight cursor store with pub/sub.
 */
export function createCursorStore(initial: CursorState): CursorStore {
  let state = initial
  let version = 0
  const listeners = new Set<() => void>()

  return {
    getState() {
      return state
    },
    setState(next: CursorState) {
      state = next
      version++
      for (const listener of listeners) {
        listener()
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot() {
      return version
    },
  }
}
