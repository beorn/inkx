/**
 * Per-Node Reactive State — alien-signals backed.
 *
 * Each node gets a stable set of signals (selected, edit, foldOverride, etc.).
 * React components subscribe via useSignal() from hooks/use-signal.ts.
 * Global cursor state (cursor, cursorCardNodeId, etc.) lives on ReactiveNodeStore.
 */

import { signal } from "alien-signals"
import { reactiveTree, type Traversal, type ReactiveTree } from "./reactive-graph.ts"
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

/** Schema factory for per-node reactive state */
function createReducedStore(traversal: Traversal) {
  return reactiveTree(
    (tree) => ({
      // Signals — writable per node
      cursor: signal(false),
      selected: signal(false),
      editing: signal(false),
      isDone: signal(false),
      hovered: signal(false),
      foldOverride: signal(undefined as number | undefined),
      edit: signal(null as NodeEditState | null),
      sticky: signal(null as "folded" | "unfolded" | null),
      ownSigils: signal([] as string[]),

      // Computeds — derived from tree walks, cached
      cursorDescendant: tree.descendants((s: { cursor: unknown }) => s.cursor).some(),
      selectedAncestor: tree.ancestors((s: { selected: unknown }) => s.selected).some(),
      editingDescendant: tree.descendants((s: { editing: unknown }) => s.editing).some(),
      doneAncestor: tree.ancestors((s: { isDone: unknown }) => s.isDone).some(),
      excludedSigils: tree
        .ancestors((s: { ownSigils: unknown }) => s.ownSigils)
        .reduce(concatSigils, () => [] as string[], { includeSelf: true, equals: arrayShallowEqual }),
    }),
    traversal,
  )
}

export class ReactiveNodeStore {
  private knownNodeIds = new Set<string>()

  // ── Reactive tree — computed-based engine ──────────────────────────────
  readonly reduced: ReturnType<typeof createReducedStore>

  // ── Cursor state (written directly by Board.tsx) ──
  cursor = signal<string | null>(null)
  cursorCardNodeId = signal<string | null>(null)
  cursorColumnNodeId = signal<string | null>(null)
  cursorDepth = signal<"board" | "column" | "card">("board")

  // ── Hover state (centralized, coalesced across I/O events) ──
  private hoveredNodeId: string | null = null
  private pendingHover: string | null | undefined = undefined // undefined = no pending
  private hoverScheduled = false

  /** Empty traversal — rebound on first hydrate */
  private static emptyTraversal: Traversal = { parent: () => null, children: () => [] }

  constructor() {
    this.reduced = createReducedStore(ReactiveNodeStore.emptyTraversal)
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
        if (prev) this.reduced.get(prev).hovered(false)
        if (target) this.reduced.get(target).hovered(true)
        this.hoveredNodeId = target
      }, 0)
    }
  }

  /** Get cursorDescendant reduced signal for a node.
   * Returns a boolean getter: true when any descendant of this node has cursor. */
  cursorDescendant(nodeId: string): () => boolean {
    return this.reduced.get(nodeId).cursorDescendant as () => boolean
  }

  selectedAncestor(nodeId: string): () => boolean {
    return this.reduced.get(nodeId).selectedAncestor as () => boolean
  }

  editingDescendant(nodeId: string): () => boolean {
    return this.reduced.get(nodeId).editingDescendant as () => boolean
  }

  doneAncestor(nodeId: string): () => boolean {
    return this.reduced.get(nodeId).doneAncestor as () => boolean
  }

  excludedSigils(nodeId: string): () => string[] {
    return this.reduced.get(nodeId).excludedSigils as () => string[]
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
    // Clean up old nodes and rebind reactive tree to repo traversal
    if (this.knownNodeIds.size > 0) {
      this.cleanup(this.knownNodeIds)
    }
    this.knownNodeIds = new Set<string>()

    if (!rootId) return

    // Rebind reactive tree to repo traversal
    this.reduced.rebind({
      parent: (id) => repo.getNode(id)?.parent_id ?? null,
      children: (id) => repo.getChildren(id).map((n) => n.id),
    })

    // Hydrate fold depths
    for (const [id, depth] of foldDepths) {
      this.reduced.get(id).foldOverride(depth)
    }
    const rootSigils = deriveExcludedSigils(repo, rootId)
    this.knownNodeIds.add(rootId)

    // Hydrate columns
    const columns = repo.getChildren(rootId)
    for (const col of columns) {
      this.knownNodeIds.add(col.id)
      const cards = repo.getChildren(col.id)
      for (const card of cards) {
        if (card.symlink_to && !repo.getNode(card.symlink_to)) {
          log.debug?.(`Broken symlink: node ${card.id} → missing target ${card.symlink_to}`)
        }
        // Multi-selection — mark the card and all its descendants
        if (selected.has(card.id)) {
          this.reduced.get(card.id).selected(true)
          this.hydrateDescendantSelection(repo, card.id)
        }
        this.knownNodeIds.add(card.id)
      }
    }

    // Set ownSigils — excludedSigils auto-propagates via computed
    if (rootSigils.length > 0) this.reduced.get(rootId).ownSigils(rootSigils)
    for (const col of columns) {
      const colName = getNodeDisplayName(repo, col)
      const colSigils = deriveColumnExcludedSigils(colName, col.id, col.fs_path)
      if (colSigils.length > 0) this.reduced.get(col.id).ownSigils(colSigils)
    }

    // Hydrate sticky fold signals — flip the `sticky` signal for any node
    // that the caller says is currently pinned. Covers columns, cards, and
    // sub-items since sticky folds are not tied to any hierarchy level.
    for (const [id, state] of stickyFolds) {
      this.reduced.get(id).sticky(state)
    }
  }

  /** Sync fold depth changes incrementally. */
  syncFoldDepths(oldDepths: Map<string, number>, newDepths: Map<string, number>): void {
    for (const [id] of oldDepths) {
      if (!newDepths.has(id)) {
        this.reduced.get(id).foldOverride(undefined)
      }
    }
    for (const [id, depth] of newDepths) {
      if (oldDepths.get(id) !== depth) {
        this.reduced.get(id).foldOverride(depth)
      }
    }
  }

  /** Sync sticky-fold changes incrementally. Flips per-node `sticky` signals so
   * that the affected TreeNodes re-render (and only them). */
  syncStickyFolds(oldSticky: Map<string, "folded" | "unfolded">, newSticky: Map<string, "folded" | "unfolded">): void {
    for (const [id] of oldSticky) {
      if (!newSticky.has(id)) {
        this.reduced.get(id).sticky(null)
      }
    }
    for (const [id, state] of newSticky) {
      if (oldSticky.get(id) !== state) {
        this.reduced.get(id).sticky(state)
      }
    }
  }

  /** Mark all descendants of a selected node as visually selected during hydration. */
  private hydrateDescendantSelection(repo: Repo, parentId: string): void {
    const markDescendants = (nodeId: string): void => {
      for (const child of repo.getChildren(nodeId)) {
        this.reduced.get(child.id).selected(true)
        markDescendants(child.id)
      }
    }
    markDescendants(parentId)
  }

  /** Remove node entries. Call on zoom/root change. */
  private cleanup(_nodeIds: Set<string>): void {
    // Reactive tree handles its own cleanup via rebind()
  }
}

// =============================================================================
// React Context
// =============================================================================

export const ReactiveNodeStoreContext = createContext<ReactiveNodeStore | null>(null)

export const ReactiveNodeStoreProvider = ReactiveNodeStoreContext.Provider

/** Get the ReactiveNodeStore from context. Throws if not in a provider. */
export function useNodeStore(): ReactiveNodeStore {
  const store = useContext(ReactiveNodeStoreContext)
  if (!store) throw new Error("useNodeStore: not inside ReactiveNodeStoreProvider")
  return store
}

/** Per-node typed accessor for the reduced signal store.
 * Returns the typed accessor from store.get(nodeId) — use with useSignal
 * for React subscription. Reads like pseudocode:
 *
 * ```tsx
 * const n = useTreeNode(nodeId)
 * const cursor = useSignal(n.cursor)
 * const breadcrumb = n.cursorDescendant()
 * const dim = n.doneAncestor()
 * ```
 */
export function useTreeNode(nodeId: string) {
  const store = useNodeStore()
  return store.reduced.get(nodeId)
}
