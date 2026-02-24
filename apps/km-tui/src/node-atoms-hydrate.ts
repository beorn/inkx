/**
 * Hydration — Populate Jotai Atoms from Repo
 *
 * Called on board load and zoom to set parent links and own sigils
 * for visible nodes. Cards hydrate lazily when VirtualList renders them.
 */

import type { WritableAtom } from "jotai"
import type { Repo } from "./repo-context.tsx"
import {
  nodeParentAtom,
  nodeOwnSigilsAtom,
  nodeFoldOverrideAtom,
  nodeMultiSelectedAtom,
  nodeEditAtom,
  cleanupNodeAtoms,
  cursorNodeIdAtom,
  cursorCardNodeIdAtom,
  cursorColumnNodeIdAtom,
  cursorSelectionLevelAtom,
  boardFocusedAtom,
} from "./node-atoms.ts"
import { deriveExcludedSigils, deriveColumnExcludedSigils } from "./ui-context.tsx"
import { getNodeDisplayName } from "./state.ts"
import type { CursorState } from "./cursor-store.ts"
import type { SelectionKey } from "./types.ts"
import { makeSelectionKey } from "./types.ts"

// =============================================================================
// Types
// =============================================================================

/** Minimal Jotai store interface for hydration (avoids importing full jotai types) */
export interface JotaiStore {
  get<V>(atom: WritableAtom<V, [V], void>): V
  set<V>(atom: WritableAtom<V, [V], void>, value: V): void
}

// =============================================================================
// Hydration
// =============================================================================

/** Track known node IDs for cleanup on re-hydration */
let knownNodeIds = new Set<string>()

/**
 * Hydrate node atoms for the current board view.
 * Sets parent links and own sigils for root + columns.
 * Cards are hydrated lazily via hydrateCardAtom when VirtualList renders them.
 */
export function hydrateNodeAtoms(
  store: JotaiStore,
  repo: Repo,
  rootId: string | null,
  foldDepths: Map<string, number>,
  multiSelected: Set<SelectionKey>,
): void {
  // Clean up old atoms
  if (knownNodeIds.size > 0) {
    cleanupNodeAtoms(knownNodeIds)
  }
  knownNodeIds = new Set<string>()

  if (!rootId) return

  // Root board sigils
  const rootSigils = deriveExcludedSigils(repo, rootId)
  store.set(nodeOwnSigilsAtom(rootId), rootSigils)
  store.set(nodeParentAtom(rootId), null)

  // Root fold depth
  const rootFold = foldDepths.get(rootId)
  if (rootFold !== undefined) {
    store.set(nodeFoldOverrideAtom(rootId), rootFold)
  }

  knownNodeIds.add(rootId)

  // Hydrate columns (children of root)
  const columns = repo.getChildren(rootId)
  for (const col of columns) {
    store.set(nodeParentAtom(col.id), rootId)

    const colName = getNodeDisplayName(repo, col)
    const colSigils = deriveColumnExcludedSigils(colName, col.id, col.fs_path)
    store.set(nodeOwnSigilsAtom(col.id), colSigils)

    // Column fold depth
    const colFold = foldDepths.get(col.id)
    if (colFold !== undefined) {
      store.set(nodeFoldOverrideAtom(col.id), colFold)
    }

    knownNodeIds.add(col.id)

    // Eagerly hydrate card parent links (cards are children of columns)
    const cards = repo.getChildren(col.id)
    for (const card of cards) {
      store.set(nodeParentAtom(card.id), col.id)

      // Card fold depth
      const cardFold = foldDepths.get(card.id)
      if (cardFold !== undefined) {
        store.set(nodeFoldOverrideAtom(card.id), cardFold)
      }

      // Multi-selection
      if (multiSelected.has(makeSelectionKey(card.id))) {
        store.set(nodeMultiSelectedAtom(card.id), true)
      }

      knownNodeIds.add(card.id)
    }
  }
}

/**
 * Hydrate a single card's parent link.
 * Called lazily from VirtualList renderItem when a card becomes visible.
 * Idempotent — safe to call multiple times for the same card.
 */
export function hydrateCardAtom(
  store: JotaiStore,
  cardId: string,
  columnId: string,
): void {
  store.set(nodeParentAtom(cardId), columnId)
  knownNodeIds.add(cardId)
}

/**
 * Sync cursor state from CursorStore to Jotai atoms.
 * Called when CursorStore state changes.
 */
export function syncCursorToAtoms(
  store: JotaiStore,
  cursorState: CursorState,
  boardFocused: boolean,
): void {
  store.set(cursorNodeIdAtom, cursorState.cursorNodeId)
  store.set(cursorCardNodeIdAtom, cursorState.cursorCardNodeId)
  store.set(cursorColumnNodeIdAtom, cursorState.cursorColumnNodeId)
  store.set(cursorSelectionLevelAtom, cursorState.selectionLevel)
  store.set(boardFocusedAtom, boardFocused)
}

/**
 * Sync multi-selected state: sets the atom for toggled node(s).
 * Called from mutation handlers when multiSelected changes.
 */
export function syncMultiSelectedToAtoms(
  store: JotaiStore,
  oldSelected: Set<SelectionKey>,
  newSelected: Set<SelectionKey>,
): void {
  // Clear nodes that were deselected
  for (const key of oldSelected) {
    if (!newSelected.has(key)) {
      store.set(nodeMultiSelectedAtom(key), false)
    }
  }
  // Set nodes that were newly selected
  for (const key of newSelected) {
    if (!oldSelected.has(key)) {
      store.set(nodeMultiSelectedAtom(key), true)
    }
  }
}

/**
 * Sync fold depths: update atoms for changed entries.
 */
export function syncFoldDepthsToAtoms(
  store: JotaiStore,
  oldDepths: Map<string, number>,
  newDepths: Map<string, number>,
): void {
  // Handle removed entries (reset to undefined = inherit)
  for (const [id] of oldDepths) {
    if (!newDepths.has(id)) {
      store.set(nodeFoldOverrideAtom(id), undefined)
    }
  }
  // Handle added/changed entries
  for (const [id, depth] of newDepths) {
    if (oldDepths.get(id) !== depth) {
      store.set(nodeFoldOverrideAtom(id), depth)
    }
  }
}

/**
 * Sync inline edit state: clear old, set new.
 */
export function syncEditToAtoms(
  store: JotaiStore,
  oldNodeId: string | null,
  newNodeId: string | null,
  newState: { blockIndex: number; initialCursorPos?: "start" | "end"; stickyX?: number } | null,
): void {
  if (oldNodeId && oldNodeId !== newNodeId) {
    store.set(nodeEditAtom(oldNodeId), null)
  }
  if (newNodeId && newState) {
    store.set(nodeEditAtom(newNodeId), {
      blockIndex: newState.blockIndex,
      initialCursorPos: newState.initialCursorPos,
      stickyX: newState.stickyX,
    })
  } else if (newNodeId === null && oldNodeId) {
    // Edit ended — already cleared above
  }
}
