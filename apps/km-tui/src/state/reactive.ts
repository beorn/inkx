/**
 * Per-Node Reactive State — alien-signals backed.
 *
 * Each node gets a stable set of signals (selected, edit, foldOverride, etc.).
 * React components subscribe via useSignal() from hooks/use-signal.ts.
 * Global cursor state (cursor, cursorCardNodeId, etc.) lives on ReactiveNodeStore.
 */

import { signal } from "alien-signals"
import { createReactiveTree, tree, primary, type TreeAccess, type ReactiveTreeStore } from "./reduced-signals.ts"
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
    hovered: signal(false),
    sticky: signal<"folded" | "unfolded" | null>(null),
  }
}

// =============================================================================
// ReactiveNodeStore
// =============================================================================

/** Shallow array equality for excludedSigils */
function arrayShallowEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** Concat sigil arrays (reducer for excludedSigils) */
function concatSigils(acc: string[], value: unknown): string[] {
  const arr = value as string[]
  return arr.length === 0 ? acc : [...acc, ...arr]
}

/** State definition for per-node reduced signals */
const reducedStateDef = {
  // Primary signals — writable per-node state
  cursor: primary(false),
  selected: primary(false),
  editing: primary(false),
  isDone: primary(false),
  ownSigils: primary(() => [] as string[]),

  // Reduced signals — cached tree aggregates
  cursorDescendant: tree.descendants((s: { cursor: unknown }) => s.cursor).some(),
  selectedAncestor: tree.ancestors((s: { selected: unknown }) => s.selected).some(),
  editingDescendant: tree.descendants((s: { editing: unknown }) => s.editing).some(),
  doneAncestor: tree.ancestors((s: { isDone: unknown }) => s.isDone).some(),
  excludedSigils: tree.ancestors((s: { ownSigils: unknown }) => s.ownSigils).reduce(
    concatSigils,
    () => [] as string[],
    { includeSelf: true, equals: arrayShallowEqual },
  ),
}

export class ReactiveNodeStore {
  private nodes = new Map<string, NodeReactiveState>()
  private knownNodeIds = new Set<string>()

  // ── Reduced signal store — typed function-accessor API ──────────────────
  readonly reduced: ReactiveTreeStore<typeof reducedStateDef>

  // ── Cursor state (synced from Board.tsx via syncCursor) ──
  cursor = signal<string | null>(null)
  cursorCardNodeId = signal<string | null>(null)
  cursorColumnNodeId = signal<string | null>(null)
  cursorDepth = signal<"board" | "column" | "card">("board")

  // ── Edit expansion state ──
  /** Card node ID that should expand because a descendant is being edited */
  expandedEditCardId = signal<string | null>(null)

  // ── Hover state (centralized, coalesced across I/O events) ──
  private hoveredNodeId: string | null = null
  private pendingHover: string | null | undefined = undefined // undefined = no pending
  private hoverScheduled = false

  constructor() {
    this.reduced = createReactiveTree(reducedStateDef)
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

    // Update reduced signals: cursorDescendant propagates up from cursor node
    if (treeAccess) {
      this.reduced.batch(treeAccess, () => {
        if (prevCursor) this.reduced.get(prevCursor).cursor(false)
        if (cursorState.cursor) this.reduced.get(cursorState.cursor).cursor(true)
      })
    }
  }

  /** Get cursorDescendant reduced signal for a node.
   * Returns a boolean getter: true when any descendant of this node has cursor. */
  cursorDescendant(nodeId: string): () => boolean {
    return this.reduced.get(nodeId).cursorDescendant
  }

  /** Get selectedAncestor reduced signal for a node.
   * Returns a boolean getter: true when any ancestor of this node is selected. */
  selectedAncestor(nodeId: string): () => boolean {
    return this.reduced.get(nodeId).selectedAncestor
  }

  /** Get editingDescendant reduced signal for a node.
   * Returns a boolean getter: true when any descendant of this node is being edited. */
  editingDescendant(nodeId: string): () => boolean {
    return this.reduced.get(nodeId).editingDescendant
  }

  /** Get doneAncestor reduced signal for a node.
   * Returns a boolean getter: true when any ancestor of this node is done/dropped. */
  doneAncestor(nodeId: string): () => boolean {
    return this.reduced.get(nodeId).doneAncestor
  }

  /** Get excludedSigils reduced signal for a node.
   * Returns a string[] getter: accumulated sigils from all ancestors (includes self). */
  excludedSigils(nodeId: string): () => string[] {
    return this.reduced.get(nodeId).excludedSigils as () => string[]
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
    // Clean up old nodes and reset reduced signal store (topology changed)
    if (this.knownNodeIds.size > 0) {
      this.cleanup(this.knownNodeIds)
    }
    this.reduced.clear()
    this.knownNodeIds = new Set<string>()

    if (!rootId) return

    // Build a TreeAccess adapter from the repo for reduced signal propagation
    const repoTree: TreeAccess = {
      parent: (id) => repo.getNode(id)?.parent_id ?? null,
      children: (id) => repo.getChildren(id).map((n) => n.id),
    }

    // Root board
    const rootState = this.getOrCreate(rootId)
    const rootSigils = deriveExcludedSigils(repo, rootId)
    rootState.parent = null
    rootState.ownSigils = rootSigils
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

        if (card.symlink_to && !repo.getNode(card.symlink_to)) {
          log.debug?.(`Broken symlink: node ${card.id} → missing target ${card.symlink_to}`)
        }

        const cardFold = foldDepths.get(card.id)
        if (cardFold !== undefined) {
          cardState.foldOverride(cardFold)
        }

        // Multi-selection — mark the card and all its descendants
        if (selected.has(card.id)) {
          cardState.selected(true)
          this.hydrateDescendantSelection(repo, card.id)
        }

        this.knownNodeIds.add(card.id)
      }
    }

    // Set ownSigils on the reduced store and let .reduce() propagate excludedSigils
    this.reduced.batch(repoTree, () => {
      if (rootSigils.length > 0) this.reduced.get(rootId).ownSigils(rootSigils)
      for (const col of columns) {
        const colName = getNodeDisplayName(repo, col)
        const colSigils = deriveColumnExcludedSigils(colName, col.id, col.fs_path)
        if (colSigils.length > 0) this.reduced.get(col.id).ownSigils(colSigils)
      }
    })

    // Bridge: sync reduced excludedSigils → old NodeReactiveState.excludedSigils for readers
    // that haven't migrated yet (TreeNode.tsx). Remove when all readers use nodeStore.excludedSigils().
    for (const id of this.knownNodeIds) {
      const sigils = this.reduced.get(id).excludedSigils() as string[]
      if (sigils.length > 0) this.getOrCreate(id).excludedSigils(sigils)
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

    // Update reduced signals with DIRECT selections only (not expanded descendants).
    // selectedAncestor propagates down automatically via the reduced engine.
    // Using expanded descendants would be semantically wrong (descendants aren't
    // actually selected) and quadratically expensive.
    if (treeAccess) {
      this.reduced.batch(treeAccess, () => {
        for (const key of oldSelected) {
          if (!newSelected.has(key)) this.reduced.get(key).selected(false)
        }
        for (const key of newSelected) {
          if (!oldSelected.has(key)) this.reduced.get(key).selected(true)
        }
      })
    }
  }

  /** Sync inline edit state. When a sub-item is edited, sets editingDescendant
   * via reduced signals so the parent card can expand to show all children. */
  syncEdit(
    oldNodeId: string | null,
    newNodeId: string | null,
    newState: {
      blockIndex: number
      initialCursorPos?: "start" | "end" | number
      stickyX?: number
    } | null,
    cardNodeId?: string,
    treeAccess?: TreeAccess,
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
    // Update expandedEditCardId for parent card expansion (legacy — kept until readers migrate)
    this.expandedEditCardId(cardNodeId ?? null)

    // Update reduced signals: editingDescendant propagates up from editing node
    if (treeAccess) {
      this.reduced.batch(treeAccess, () => {
        if (oldNodeId) this.reduced.get(oldNodeId).editing(false)
        if (newNodeId && newState) this.reduced.get(newNodeId).editing(true)
      })
    }
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
