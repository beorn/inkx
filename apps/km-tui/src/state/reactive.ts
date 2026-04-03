/**
 * Reactive<T> — Signal primitive replacing Jotai atoms.
 *
 * A lightweight value holder with change notification via subscribers.
 * Writing .value notifies subscribers only if value changed (Object.is).
 * useReactive(r) hook integrates with React via useSyncExternalStore.
 */

import { createContext, useContext, useSyncExternalStore } from "react"
import type { Repo } from "../repo-context.tsx"
import { deriveExcludedSigils, deriveColumnExcludedSigils } from "./ui-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { createLogger } from "loggily"
import { createSelectionEngine } from "./selection-engine.ts"

const log = createLogger("km:tui:hydrate")

// =============================================================================
// Core Reactive<T>
// =============================================================================

export class Reactive<T> {
  private _value: T
  private _listeners = new Set<() => void>()

  constructor(initial: T) {
    this._value = initial
  }

  get value(): T {
    return this._value
  }

  set value(next: T) {
    if (!Object.is(this._value, next)) {
      this._value = next
      for (const listener of this._listeners) listener()
    }
  }

  subscribe(listener: () => void): () => void {
    this._listeners.add(listener)
    return () => this._listeners.delete(listener)
  }
}

/** React hook: subscribe to a Reactive<T> value */
export function useReactive<T>(reactive: Reactive<T>): T {
  return useSyncExternalStore(
    (cb) => reactive.subscribe(cb),
    () => reactive.value,
  )
}

// =============================================================================
// Types
// =============================================================================

export interface NodeEditState {
  blockIndex: number
  initialCursorPos?: "start" | "end" | number
  stickyX?: number
}

// =============================================================================
// Per-Node Reactive State
// =============================================================================

interface NodeReactiveState {
  // Plain data (set during hydration, not subscribed by components directly)
  parent: string | null
  ownSigils: string[]

  // Reactive (subscribed by components via useReactive)
  multiSelected: Reactive<boolean>
  foldOverride: Reactive<number | undefined>
  edit: Reactive<NodeEditState | null>
  excludedSigils: Reactive<string[]>
  /** True when cursor is in this card but on a descendant (not this node).
   * Used by card title TreeNode to show yellow fg instead of inverse bg. */
  cursorInDescendant: Reactive<boolean>
  /** True when mouse is hovering over this node's card. Per-node signal so
   * only the entering/leaving card re-renders (not all cards). */
  hovered: Reactive<boolean>
}

function createNodeState(): NodeReactiveState {
  return {
    parent: null,
    ownSigils: [],
    multiSelected: new Reactive(false),
    foldOverride: new Reactive<number | undefined>(undefined),
    edit: new Reactive<NodeEditState | null>(null),
    excludedSigils: new Reactive<string[]>([]),
    cursorInDescendant: new Reactive(false),
    hovered: new Reactive(false),
  }
}

// =============================================================================
// ReactiveNodeStore
// =============================================================================

export class ReactiveNodeStore {
  private nodes = new Map<string, NodeReactiveState>()
  private knownNodeIds = new Set<string>()

  // ── Cursor state (synced from CursorStore by Board.tsx) ──
  cursorNodeId = new Reactive<string | null>(null)
  cursorCardNodeId = new Reactive<string | null>(null)
  cursorColumnNodeId = new Reactive<string | null>(null)
  selectionLevel = new Reactive<"board" | "column" | "card">("board")
  /** Track which card had cursorInDescendant=true so we can clear it on change */
  private prevDescendantCardId: string | null = null

  // ── Edit expansion state ──
  /** Card node ID that should expand because a descendant is being edited */
  expandedEditCardId = new Reactive<string | null>(null)

  // ── Hover state (centralized, coalesced across I/O events) ──
  private hoveredNodeId: string | null = null
  private pendingHover: string | null | undefined = undefined // undefined = no pending
  private hoverScheduled = false

  /** Set the hovered node. Coalesced: rapid mouseEnter/mouseLeave events
   * across multiple I/O callbacks batch into one update. setTimeout(0)
   * fires after all pending I/O, so only the last hover target renders. */
  setHovered(nodeId: string | null): void {
    this.pendingHover = nodeId
    if (!this.hoverScheduled) {
      this.hoverScheduled = true
      setTimeout(() => {
        this.hoverScheduled = false
        const target = this.pendingHover
        this.pendingHover = undefined
        if (target === undefined) return
        const prev = this.hoveredNodeId
        if (prev === target) return
        if (prev) this.getOrCreate(prev).hovered.value = false
        if (target) this.getOrCreate(target).hovered.value = true
        this.hoveredNodeId = target
      }, 0)
    }
  }

  /** Sync cursor state from CursorStore to Reactive fields */
  syncCursor(cursorState: {
    cursorNodeId: string | null
    cursorCardNodeId: string | null
    cursorColumnNodeId: string | null
    selectionLevel: "board" | "column" | "card"
  }): void {
    this.cursorNodeId.value = cursorState.cursorNodeId
    this.cursorCardNodeId.value = cursorState.cursorCardNodeId
    this.cursorColumnNodeId.value = cursorState.cursorColumnNodeId
    this.selectionLevel.value = cursorState.selectionLevel

    // Update per-card cursorInDescendant: true when cursor is in this card
    // but on a sub-item (not the card title). Only the affected card's
    // TreeNode at depth 0 subscribes, so only 1-2 components re-render.
    const cardId = cursorState.cursorCardNodeId
    const isInDescendant = cardId != null && cursorState.cursorNodeId !== cardId

    // Clear previous card's flag (if it changed)
    if (this.prevDescendantCardId && this.prevDescendantCardId !== cardId) {
      this.getOrCreate(this.prevDescendantCardId).cursorInDescendant.value = false
    }

    // Set current card's flag
    if (cardId) {
      this.getOrCreate(cardId).cursorInDescendant.value = isInDescendant
    }

    this.prevDescendantCardId = isInDescendant ? cardId : null
  }

  /** Get or lazily create per-node reactive state. Stable reference per nodeId. */
  getOrCreate(nodeId: string): NodeReactiveState {
    let state = this.nodes.get(nodeId)
    if (!state) {
      state = createNodeState()
      this.nodes.set(nodeId, state)
    }
    return state
  }

  /**
   * Hydrate node state for the current board view.
   * Sets parent links, own sigils, excluded sigils, fold depths, multi-selection.
   * Replaces hydrateNodeAtoms from node-atoms-hydrate.ts.
   */
  hydrate(repo: Repo, rootId: string | null, foldDepths: Map<string, number>, multiSelected: Set<string>): void {
    // Clean up old nodes
    if (this.knownNodeIds.size > 0) {
      this.cleanup(this.knownNodeIds)
    }
    this.knownNodeIds = new Set<string>()

    if (!rootId) return

    // Root board
    const rootState = this.getOrCreate(rootId)
    const rootSigils = deriveExcludedSigils(repo, rootId)
    rootState.parent = null
    rootState.ownSigils = rootSigils
    rootState.excludedSigils.value = rootSigils
    const rootFold = foldDepths.get(rootId)
    if (rootFold !== undefined) {
      rootState.foldOverride.value = rootFold
    }
    this.knownNodeIds.add(rootId)

    // Columns (children of root)
    const columns = repo.getChildren(rootId)
    for (const col of columns) {
      const colState = this.getOrCreate(col.id)
      colState.parent = rootId

      const colName = getNodeDisplayName(repo, col)
      const colSigils = deriveColumnExcludedSigils(colName, col.id, col.fs_path)
      colState.ownSigils = colSigils

      // Excluded sigils = parent's excluded + own
      const parentExcluded = rootState.excludedSigils.value
      colState.excludedSigils.value =
        colSigils.length === 0
          ? parentExcluded
          : parentExcluded.length === 0
            ? colSigils
            : [...parentExcluded, ...colSigils]

      const colFold = foldDepths.get(col.id)
      if (colFold !== undefined) {
        colState.foldOverride.value = colFold
      }
      this.knownNodeIds.add(col.id)

      // Cards (children of columns)
      const cards = repo.getChildren(col.id)
      for (const card of cards) {
        const cardState = this.getOrCreate(card.id)
        cardState.parent = col.id

        // Log broken embed links
        if (card.embed_source && !repo.getNode(card.embed_source)) {
          log.debug?.(`Broken embed: node ${card.id} → missing target ${card.embed_source}`)
        }

        // Card fold depth
        const cardFold = foldDepths.get(card.id)
        if (cardFold !== undefined) {
          cardState.foldOverride.value = cardFold
        }

        // Multi-selection — mark the card and all its descendants
        if (multiSelected.has(card.id)) {
          cardState.multiSelected.value = true
          this.hydrateDescendantSelection(repo, card.id)
        }

        // Excluded sigils — inherit from column (cards don't add own sigils)
        cardState.excludedSigils.value = colState.excludedSigils.value

        this.knownNodeIds.add(card.id)
      }
    }
  }

  /** Sync fold depth changes incrementally. Replaces syncFoldDepthsToAtoms. */
  syncFoldDepths(oldDepths: Map<string, number>, newDepths: Map<string, number>): void {
    for (const [id] of oldDepths) {
      if (!newDepths.has(id)) {
        this.getOrCreate(id).foldOverride.value = undefined
      }
    }
    for (const [id, depth] of newDepths) {
      if (oldDepths.get(id) !== depth) {
        this.getOrCreate(id).foldOverride.value = depth
      }
    }
  }

  /** Sync multi-selection changes. Marks selected nodes AND their descendants as visually selected.
   *  When a parent is selected, all children appear highlighted in the UI. */
  syncMultiSelected(oldSelected: Set<string>, newSelected: Set<string>, repo?: Repo): void {
    // Expand both sets to include descendants so we diff the full visual selection
    const engine = repo ? createSelectionEngine(repo) : null
    const oldExpanded = engine ? engine.expandWithDescendants(oldSelected) : oldSelected
    const newExpanded = engine ? engine.expandWithDescendants(newSelected) : newSelected

    for (const key of oldExpanded) {
      if (!newExpanded.has(key)) {
        this.getOrCreate(key).multiSelected.value = false
      }
    }
    for (const key of newExpanded) {
      if (!oldExpanded.has(key)) {
        this.getOrCreate(key).multiSelected.value = true
      }
    }
  }

  /** Sync inline edit state. Replaces syncEditToAtoms.
   *  When cardNodeId is present (sub-item editing), sets expandedEditCardId
   *  so the parent card can expand to show all children. */
  syncEdit(
    oldNodeId: string | null,
    newNodeId: string | null,
    newState: {
      blockIndex: number
      initialCursorPos?: "start" | "end" | number
      stickyX?: number
    } | null,
    cardNodeId?: string,
  ): void {
    if (oldNodeId && oldNodeId !== newNodeId) {
      this.getOrCreate(oldNodeId).edit.value = null
    }
    if (newNodeId && newState) {
      this.getOrCreate(newNodeId).edit.value = {
        blockIndex: newState.blockIndex,
        initialCursorPos: newState.initialCursorPos,
        stickyX: newState.stickyX,
      }
    }
    // Update expandedEditCardId for parent card expansion
    this.expandedEditCardId.value = cardNodeId ?? null
  }

  /** Mark all descendants of a selected node as visually selected during hydration. */
  private hydrateDescendantSelection(repo: Repo, parentId: string): void {
    const engine = createSelectionEngine(repo)
    const expanded = engine.expandWithDescendants(new Set([parentId]))
    for (const id of expanded) {
      if (id !== parentId) {
        this.getOrCreate(id).multiSelected.value = true
      }
    }
  }

  /** Remove node entries. Call on zoom/root change. */
  private cleanup(nodeIds: Set<string>): void {
    for (const id of nodeIds) {
      this.nodes.delete(id)
    }
  }
}

// =============================================================================
// React Context
// =============================================================================

const ReactiveNodeStoreContext = createContext<ReactiveNodeStore | null>(null)

export const ReactiveNodeStoreProvider = ReactiveNodeStoreContext.Provider

/** Get the ReactiveNodeStore from context. Throws if not in a provider. */
export function useNodeStore(): ReactiveNodeStore {
  const store = useContext(ReactiveNodeStoreContext)
  if (!store) throw new Error("useNodeStore: not inside ReactiveNodeStoreProvider")
  return store
}
