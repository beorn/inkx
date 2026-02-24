/**
 * Per-Node Jotai Atoms — Reactive State for Individual Nodes
 *
 * Replaces Zustand global selectors with per-node subscriptions.
 * When a node's state changes, only that node's subscribed components re-render.
 *
 * Architecture:
 * - Base atoms: writable, set by actions (multiSelected, foldOverride, editState)
 * - Derived atoms: read-only, computed from ancestry chain (excludedSigils, effectiveFold)
 * - Parent links: enable ancestry traversal for derived computations
 *
 * Jotai's dependency tracking means when a parent's sigils change, only
 * descendants' derived atoms recompute — no manual propagation needed.
 */

import { atom } from "jotai"
import { atomFamily } from "jotai-family"

// =============================================================================
// Types
// =============================================================================

export interface NodeEditState {
  blockIndex: number
  initialCursorPos?: "start" | "end"
  stickyX?: number
}

// =============================================================================
// Base Atoms (writable, set by actions)
// =============================================================================

/** Parent link — for ancestry chain traversal */
export const nodeParentAtom = atomFamily((_id: string) => atom<string | null>(null))

/** Per-node own sigils (derived from node name/fs_path, e.g. "@next", "#project") */
export const nodeOwnSigilsAtom = atomFamily((_id: string) => atom<string[]>([]))

/** Per-node multi-selection state */
export const nodeMultiSelectedAtom = atomFamily((_id: string) => atom(false))

/** Per-node fold depth override (undefined = inherit from parent) */
export const nodeFoldOverrideAtom = atomFamily((_id: string) => atom<number | undefined>(undefined))

/** Per-node inline edit state (null = not editing) */
export const nodeEditAtom = atomFamily((_id: string) => atom<NodeEditState | null>(null))

// =============================================================================
// Derived Atoms (read-only, computed from ancestry)
// =============================================================================

/**
 * Excluded sigils: own + all ancestors'.
 * When a parent's sigils change, only descendants recompute.
 */
export const nodeExcludedSigilsAtom = atomFamily((nodeId: string) =>
  atom((get) => {
    const parentId = get(nodeParentAtom(nodeId))
    const parentSigils = parentId ? get(nodeExcludedSigilsAtom(parentId)) : []
    const ownSigils = get(nodeOwnSigilsAtom(nodeId))
    if (ownSigils.length === 0) return parentSigils
    if (parentSigils.length === 0) return ownSigils
    return [...parentSigils, ...ownSigils]
  }),
)

/**
 * Effective fold depth: own override or inherited (parent - 1).
 * Enables fold depth to cascade down the tree automatically.
 */
export const nodeEffectiveFoldAtom = atomFamily((nodeId: string) =>
  atom((get) => {
    const override = get(nodeFoldOverrideAtom(nodeId))
    if (override !== undefined) return override
    const parentId = get(nodeParentAtom(nodeId))
    if (!parentId) return Infinity
    const parentFold = get(nodeEffectiveFoldAtom(parentId))
    return Math.max(0, parentFold - 1)
  }),
)

// =============================================================================
// Cursor Atoms (Phase 6: unify cursor with Jotai)
// =============================================================================

/** Global cursor node ID — single source of truth for cursor position */
export const cursorNodeIdAtom = atom<string | null>(null)

/** Global cursor card-level ancestor (grandchild of root) */
export const cursorCardNodeIdAtom = atom<string | null>(null)

/** Global cursor column-level ancestor (child of root) */
export const cursorColumnNodeIdAtom = atom<string | null>(null)

/** Selection level derived from cursor depth */
export const cursorSelectionLevelAtom = atom<"board" | "column" | "card">("board")

/** Board focus state — true when the board pane has focus */
export const boardFocusedAtom = atom(true)

/**
 * Per-node cursor check: is this node the current cursor node?
 * Derived from cursorNodeIdAtom — only nodes matching the cursor re-render.
 */
export const nodeIsCursorAtom = atomFamily((nodeId: string) =>
  atom((get) => get(cursorNodeIdAtom) === nodeId),
)

/**
 * Per-node column check: is this node's column selected?
 * Derived from cursorColumnNodeIdAtom.
 */
export const nodeIsColumnSelectedAtom = atomFamily((nodeId: string) =>
  atom((get) => get(cursorColumnNodeIdAtom) === nodeId),
)

// =============================================================================
// Atom Family Cleanup
// =============================================================================

/**
 * Remove all atom family entries for a set of node IDs.
 * Call on zoom/root change or node deletion to prevent accumulation.
 */
export function cleanupNodeAtoms(nodeIds: Iterable<string>): void {
  for (const id of nodeIds) {
    nodeParentAtom.remove(id)
    nodeOwnSigilsAtom.remove(id)
    nodeMultiSelectedAtom.remove(id)
    nodeFoldOverrideAtom.remove(id)
    nodeEditAtom.remove(id)
    nodeExcludedSigilsAtom.remove(id)
    nodeEffectiveFoldAtom.remove(id)
    nodeIsCursorAtom.remove(id)
    nodeIsColumnSelectedAtom.remove(id)
  }
}
