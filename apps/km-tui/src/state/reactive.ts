/**
 * Per-Node Reactive State — alien-signals backed.
 *
 * Each node gets a stable set of signals (selected, edit, foldOverride, etc.).
 * React components subscribe via useSignal() from hooks/use-signal.ts.
 * Global cursor state (cursor, cursorCardNodeId, etc.) lives on ReactiveNodeStore.
 */

import { signal } from "alien-signals"
import { ReducedSignalStore, tree, type TreeAccess } from "./reduced-signals.ts"
import { createContext, useContext } from "react"
import type { Repo } from "../repo-context.tsx"
import { deriveExcludedSigils, deriveColumnExcludedSigils } from "./ui-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { createLogger } from "loggily"

const log = createLogger("km:tui:hydrate")

/** Writable alien-signal — call with no args to read, with arg to write. */
type Signal<T> = ReturnType<typeof signal<T>>

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

  // Reactive (subscribed by components via useSignal)
  selected: Signal<boolean>
  foldOverride: Signal<number | undefined>
  edit: Signal<NodeEditState | null>
  excludedSigils: Signal<string[]>
  /** True when cursor is in this card but on a descendant (not this node).
   * Used by card title TreeNode to show yellow fg instead of inverse bg. */
  cursorInDescendant: Signal<boolean>
  /** True when mouse is hovering over this node's card. Per-node signal so
   * only the entering/leaving card re-renders (not all cards). */
  hovered: Signal<boolean>
  /** Sticky fold state for this node (km-tui.sticky-fold).
   * `"folded"` | `"unfolded"` = pinned, immune to fold-all/unfold-all.
   * `null` = not sticky. Used by fold-marker rendering to show the inverse
   * visual cue on sticky nodes. */
  sticky: Signal<"folded" | "unfolded" | null>
}

function createNodeState(): NodeReactiveState {
  return {
    parent: null,
    ownSigils: [],
    selected: signal(false),
    foldOverride: signal<number | undefined>(undefined),
    edit: signal<NodeEditState | null>(null),
    excludedSigils: signal<string[]>([]),
    cursorInDescendant: signal(false),
    hovered: signal(false),
    sticky: signal<"folded" | "unfolded" | null>(null),
  }
}

// =============================================================================
// ReactiveNodeStore
// =============================================================================

export class ReactiveNodeStore {
  private nodes = new Map<string, NodeReactiveState>()
  private knownNodeIds = new Set<string>()

  // ── Reduced signal store (shadow — Phase 1) ──────────────────────────────
  readonly reduced: ReducedSignalStore

  // ── Cursor state (synced from Board.tsx via syncCursor) ──
  cursor = signal<string | null>(null)
  cursorCardNodeId = signal<string | null>(null)
  cursorColumnNodeId = signal<string | null>(null)
  cursorDepth = signal<"board" | "column" | "card">("board")
  /** Track which card had cursorInDescendant=true so we can clear it on change */
  private prevDescendantCardId: string | null = null

  // ── Edit expansion state ──
  /** Card node ID that should expand because a descendant is being edited */
  expandedEditCardId = signal<string | null>(null)

  // ── Hover state (centralized, coalesced across I/O events) ──
  private hoveredNodeId: string | null = null
  private pendingHover: string | null | undefined = undefined // undefined = no pending
  private hoverScheduled = false

  constructor() {
    this.reduced = new ReducedSignalStore()
    this.reduced.defineReduced("cursorDescendant", tree.descendants("cursor").some())
    this.reduced.defineReduced("selectedAncestor", tree.ancestors("selected").some())
  }

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
        if (prev) this.getOrCreate(prev).hovered(false)
        if (target) this.getOrCreate(target).hovered(true)
        this.hoveredNodeId = target
      }, 0)
    }
  }

  /** Sync cursor state to signals (called by Board.tsx).
   * @param treeAccess Optional tree for reduced signal shadow computation */
  syncCursor(
    cursorState: {
      cursor: string | null
      cursorCardNodeId: string | null
      cursorColumnNodeId: string | null
      cursorDepth: "board" | "column" | "card"
    },
    treeAccess?: TreeAccess,
  ): void {
    const prevCursor = this.cursor()
    this.cursor(cursorState.cursor)
    this.cursorCardNodeId(cursorState.cursorCardNodeId)
    this.cursorColumnNodeId(cursorState.cursorColumnNodeId)
    this.cursorDepth(cursorState.cursorDepth)

    // Update per-card cursorInDescendant: true when cursor is in this card
    // but on a sub-item (not the card title). Only the affected card's
    // TreeNode at depth 0 subscribes, so only 1-2 components re-render.
    const cardId = cursorState.cursorCardNodeId
    const isInDescendant = cardId != null && cursorState.cursor !== cardId

    // Clear previous card's flag (if it changed)
    if (this.prevDescendantCardId && this.prevDescendantCardId !== cardId) {
      this.getOrCreate(this.prevDescendantCardId).cursorInDescendant(false)
    }

    // Set current card's flag
    if (cardId) {
      this.getOrCreate(cardId).cursorInDescendant(isInDescendant)
    }

    this.prevDescendantCardId = isInDescendant ? cardId : null

    // ── Shadow: update reduced signals ──
    if (treeAccess) {
      this.reduced.batch(treeAccess, () => {
        if (prevCursor) this.reduced.setPrimary(prevCursor, "cursor", false)
        if (cursorState.cursor) this.reduced.setPrimary(cursorState.cursor, "cursor", true)
      })
    }
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
   * Sets parent links, own sigils, excluded sigils, fold depths, sticky folds,
   * multi-selection.
   */
  hydrate(
    repo: Repo,
    rootId: string | null,
    foldDepths: Map<string, number>,
    selected: Set<string>,
    stickyFolds: Map<string, "folded" | "unfolded"> = new Map(),
  ): void {
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
    rootState.excludedSigils(rootSigils)
    const rootFold = foldDepths.get(rootId)
    if (rootFold !== undefined) {
      rootState.foldOverride(rootFold)
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
      const parentExcluded = rootState.excludedSigils()
      colState.excludedSigils(
        colSigils.length === 0
          ? parentExcluded
          : parentExcluded.length === 0
            ? colSigils
            : [...parentExcluded, ...colSigils],
      )

      const colFold = foldDepths.get(col.id)
      if (colFold !== undefined) {
        colState.foldOverride(colFold)
      }
      this.knownNodeIds.add(col.id)

      // Cards (children of columns)
      const cards = repo.getChildren(col.id)
      for (const card of cards) {
        const cardState = this.getOrCreate(card.id)
        cardState.parent = col.id

        // Log broken symlinks
        if (card.symlink_to && !repo.getNode(card.symlink_to)) {
          log.debug?.(`Broken symlink: node ${card.id} → missing target ${card.symlink_to}`)
        }

        // Card fold depth
        const cardFold = foldDepths.get(card.id)
        if (cardFold !== undefined) {
          cardState.foldOverride(cardFold)
        }

        // Multi-selection — mark the card and all its descendants
        if (selected.has(card.id)) {
          cardState.selected(true)
          this.hydrateDescendantSelection(repo, card.id)
        }

        // Excluded sigils — inherit from column (cards don't add own sigils)
        cardState.excludedSigils(colState.excludedSigils())

        this.knownNodeIds.add(card.id)
      }
    }

    // Hydrate sticky fold signals — flip the `sticky` signal for any node
    // that the caller says is currently pinned. Covers columns, cards, and
    // sub-items since sticky folds are not tied to any hierarchy level.
    for (const [id, state] of stickyFolds) {
      this.getOrCreate(id).sticky(state)
    }
  }

  /** Sync fold depth changes incrementally. */
  syncFoldDepths(oldDepths: Map<string, number>, newDepths: Map<string, number>): void {
    for (const [id] of oldDepths) {
      if (!newDepths.has(id)) {
        this.getOrCreate(id).foldOverride(undefined)
      }
    }
    for (const [id, depth] of newDepths) {
      if (oldDepths.get(id) !== depth) {
        this.getOrCreate(id).foldOverride(depth)
      }
    }
  }

  /** Sync sticky-fold changes incrementally. Flips per-node `sticky` signals so
   * that the affected TreeNodes re-render (and only them). */
  syncStickyFolds(oldSticky: Map<string, "folded" | "unfolded">, newSticky: Map<string, "folded" | "unfolded">): void {
    for (const [id] of oldSticky) {
      if (!newSticky.has(id)) {
        this.getOrCreate(id).sticky(null)
      }
    }
    for (const [id, state] of newSticky) {
      if (oldSticky.get(id) !== state) {
        this.getOrCreate(id).sticky(state)
      }
    }
  }

  /** Sync multi-selection changes. Marks selected nodes AND their descendants as visually selected.
   * @param treeAccess Optional tree for reduced signal shadow computation */
  syncSelected(oldSelected: Set<string>, newSelected: Set<string>, repo?: Repo, treeAccess?: TreeAccess): void {
    const oldExpanded = repo ? expandWithDescendants(repo, oldSelected) : oldSelected
    const newExpanded = repo ? expandWithDescendants(repo, newSelected) : newSelected

    for (const key of oldExpanded) {
      if (!newExpanded.has(key)) {
        this.getOrCreate(key).selected(false)
      }
    }
    for (const key of newExpanded) {
      if (!oldExpanded.has(key)) {
        this.getOrCreate(key).selected(true)
      }
    }

    // ── Shadow: update reduced signals ──
    if (treeAccess) {
      this.reduced.batch(treeAccess, () => {
        for (const key of oldExpanded) {
          if (!newExpanded.has(key)) this.reduced.setPrimary(key, "selected", false)
        }
        for (const key of newExpanded) {
          if (!oldExpanded.has(key)) this.reduced.setPrimary(key, "selected", true)
        }
      })
    }
  }

  /** Sync inline edit state. When cardNodeId is present (sub-item editing),
   *  sets expandedEditCardId so the parent card can expand to show all children. */
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
      this.getOrCreate(oldNodeId).edit(null)
    }
    if (newNodeId && newState) {
      this.getOrCreate(newNodeId).edit({
        blockIndex: newState.blockIndex,
        initialCursorPos: newState.initialCursorPos,
        stickyX: newState.stickyX,
      })
    }
    // Update expandedEditCardId for parent card expansion
    this.expandedEditCardId(cardNodeId ?? null)
  }

  /** Mark all descendants of a selected node as visually selected during hydration. */
  private hydrateDescendantSelection(repo: Repo, parentId: string): void {
    const expanded = expandWithDescendants(repo, new Set([parentId]))
    for (const id of expanded) {
      if (id !== parentId) {
        this.getOrCreate(id).selected(true)
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
// Tree expansion helper
// =============================================================================

/** Expand a set of node IDs to include all descendants. */
function expandWithDescendants(repo: Repo, ids: ReadonlySet<string>): Set<string> {
  if (ids.size === 0) return new Set()
  const expanded = new Set<string>(ids)
  for (const id of ids) {
    collectDescendants(repo, id, expanded)
  }
  return expanded
}

/** Recursively collect all descendants of a node into the target set. */
function collectDescendants(repo: Repo, nodeId: string, target: Set<string>): void {
  const children = repo.getChildren(nodeId)
  for (const child of children) {
    target.add(child.id)
    collectDescendants(repo, child.id, target)
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
