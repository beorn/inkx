/**
 * Per-Node Reactive State — alien-signals backed.
 *
 * Each node gets a stable set of signals (selected, edit, foldOverride, etc.).
 * React components subscribe via useSignal() from hooks/use-signal.ts.
 * Global cursor state (cursor, cursorCardNodeId, etc.) lives on the NodeStore.
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
// NodeStore Factory
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

/** Empty traversal — rebound on first hydrate */
const emptyTraversal: Traversal = { parent: () => null, children: () => [] }

export function createNodeStore() {
  let knownNodeIds = new Set<string>()

  // ── Reactive tree — computed-based engine ──────────────────────────────
  const reduced = createReducedStore(emptyTraversal)

  // ── Cursor state (written directly by Board.tsx) ──
  const cursor = signal<string | null>(null)
  const cursorCardNodeId = signal<string | null>(null)
  const cursorColumnNodeId = signal<string | null>(null)
  const cursorDepth = signal<"board" | "column" | "card">("board")

  // ── Hover state (centralized, coalesced across I/O events) ──
  let hoveredNodeId: string | null = null
  let pendingHover: string | null | undefined = undefined // undefined = no pending
  let hoverScheduled = false

  /** Set the hovered node. Coalesced: rapid mouseEnter/mouseLeave events
   * across multiple I/O callbacks batch into one update. setTimeout(0)
   * fires after all pending I/O, so only the last hover target renders. */
  function setHovered(nodeId: string | null): void {
    pendingHover = nodeId
    if (!hoverScheduled) {
      hoverScheduled = true
      setTimeout(() => {
        hoverScheduled = false
        const target = pendingHover
        pendingHover = undefined
        if (target === undefined) return
        const prev = hoveredNodeId
        if (prev === target) return
        if (prev) reduced.get(prev).hovered(false)
        if (target) reduced.get(target).hovered(true)
        hoveredNodeId = target
      }, 0)
    }
  }

  /** Get cursorDescendant reduced signal for a node.
   * Returns a boolean getter: true when any descendant of this node has cursor. */
  function cursorDescendant(nodeId: string): () => boolean {
    return reduced.get(nodeId).cursorDescendant as () => boolean
  }

  function selectedAncestor(nodeId: string): () => boolean {
    return reduced.get(nodeId).selectedAncestor as () => boolean
  }

  function editingDescendant(nodeId: string): () => boolean {
    return reduced.get(nodeId).editingDescendant as () => boolean
  }

  function doneAncestor(nodeId: string): () => boolean {
    return reduced.get(nodeId).doneAncestor as () => boolean
  }

  function excludedSigils(nodeId: string): () => string[] {
    return reduced.get(nodeId).excludedSigils as () => string[]
  }

  /** Collect all descendant IDs of a node into the target set. */
  function collectDescendantsInto(
    repo: { getChildren(parentId: string | null): { id: string }[] },
    nodeId: string,
    target: Set<string>,
  ): void {
    const children = repo.getChildren(nodeId)
    for (const child of children) {
      target.add(child.id)
      collectDescendantsInto(repo, child.id, target)
    }
  }

  /** Expand a set of node IDs to include all their descendants. */
  function expandSelectionWithDescendants(
    repo: { getChildren(parentId: string | null): { id: string }[] },
    ids: ReadonlySet<string>,
  ): Set<string> {
    if (ids.size === 0) return new Set()
    const expanded = new Set<string>(ids)
    for (const id of ids) {
      collectDescendantsInto(repo, id, expanded)
    }
    return expanded
  }

  /** Mark all descendants of a selected node as visually selected during hydration. */
  function hydrateDescendantSelection(repo: Repo, parentId: string): void {
    const markDescendants = (nodeId: string): void => {
      for (const child of repo.getChildren(nodeId)) {
        reduced.get(child.id).selected(true)
        markDescendants(child.id)
      }
    }
    markDescendants(parentId)
  }

  // ── Internal prev-tracking state for store write API ─────────────────
  let prevCursorId: string | null = null
  let prevSelectedExpanded = new Set<string>()
  let prevSelectedDirect = new Set<string>()
  let prevEditNodeId: string | null = null
  let prevFoldOverrides = new Map<string, number>()
  let prevStickyFolds = new Map<string, "folded" | "unfolded">()

  // ── Centralized store write API ──────────────────────────────────────

  /** Set cursor — clears old per-node cursor boolean, sets new one.
   * Also writes the store-level cursor signal. */
  function setCursor(nodeId: string | null): void {
    const prev = prevCursorId
    if (prev === nodeId) return
    if (prev) reduced.get(prev).cursor(false)
    if (nodeId) reduced.get(nodeId).cursor(true)
    cursor(nodeId)
    prevCursorId = nodeId
  }

  /** Replace entire selection — diffs against current, writes selected signals.
   * Expands to include descendants for visual selection. */
  function setSelection(ids: ReadonlySet<string>, repo: { getChildren(parentId: string | null): { id: string }[] }): void {
    const newExpanded = expandSelectionWithDescendants(repo, ids)
    // Clear nodes that were expanded-selected but no longer are
    for (const key of prevSelectedExpanded) {
      if (!newExpanded.has(key)) reduced.get(key).selected(false)
    }
    // Set newly expanded-selected nodes
    for (const key of newExpanded) {
      if (!prevSelectedExpanded.has(key)) reduced.get(key).selected(true)
    }
    // Write DIRECT selections — selectedAncestor auto-propagates via computeds
    for (const key of prevSelectedDirect) {
      if (!ids.has(key)) reduced.get(key).selected(false)
    }
    for (const key of ids) {
      if (!prevSelectedDirect.has(key)) reduced.get(key).selected(true)
    }
    prevSelectedExpanded = newExpanded
    prevSelectedDirect = new Set(ids)
  }

  /** Begin editing a node — sets edit + editing signals, clears any previous edit. */
  function beginEdit(nodeId: string, blockIndex = 0): void {
    const prev = prevEditNodeId
    if (prev && prev !== nodeId) {
      reduced.get(prev).edit(null)
      reduced.get(prev).editing(false)
    }
    reduced.get(nodeId).edit({ blockIndex })
    reduced.get(nodeId).editing(true)
    prevEditNodeId = nodeId
  }

  /** End editing — clears edit + editing signals on the currently editing node. */
  function endEdit(): void {
    const prev = prevEditNodeId
    if (prev) {
      reduced.get(prev).edit(null)
      reduced.get(prev).editing(false)
      prevEditNodeId = null
    }
  }

  /** Replace all fold overrides — clears removed, sets changed. */
  function replaceFoldOverrides(overrides: Map<string, number>): void {
    const prev = prevFoldOverrides
    for (const [id] of prev) {
      if (!overrides.has(id)) reduced.get(id).foldOverride(undefined)
    }
    for (const [id, depth] of overrides) {
      if (prev.get(id) !== depth) reduced.get(id).foldOverride(depth)
    }
    prevFoldOverrides = overrides
  }

  /** Replace all sticky folds — clears removed, sets changed. */
  function replaceStickyFolds(folds: Map<string, "folded" | "unfolded">): void {
    const prev = prevStickyFolds
    for (const [id] of prev) {
      if (!folds.has(id)) reduced.get(id).sticky(null)
    }
    for (const [id, state] of folds) {
      if (prev.get(id) !== state) reduced.get(id).sticky(state)
    }
    prevStickyFolds = folds
  }

  /**
   * Hydrate node state for the current board view.
   * Sets parent links, own sigils, excluded sigils, fold depths, sticky folds,
   * multi-selection.
   */
  function hydrate(
    repo: Repo,
    rootId: string | null,
    foldDepths: Map<string, number>,
    selected: Set<string>,
    stickyFolds: Map<string, "folded" | "unfolded"> = new Map(),
  ): void {
    // Clean up old nodes and rebind reactive tree to repo traversal
    if (knownNodeIds.size > 0) {
      // Reactive tree handles its own cleanup via rebind()
    }
    knownNodeIds = new Set<string>()

    if (!rootId) return

    // Rebind reactive tree to repo traversal
    reduced.rebind({
      parent: (id) => repo.getNode(id)?.parent_id ?? null,
      children: (id) => repo.getChildren(id).map((n) => n.id),
    })

    // Hydrate fold depths
    for (const [id, depth] of foldDepths) {
      reduced.get(id).foldOverride(depth)
    }
    const rootSigils = deriveExcludedSigils(repo, rootId)
    knownNodeIds.add(rootId)

    // Hydrate columns
    const columns = repo.getChildren(rootId)
    for (const col of columns) {
      knownNodeIds.add(col.id)
      const cards = repo.getChildren(col.id)
      for (const card of cards) {
        if (card.symlink_to && !repo.getNode(card.symlink_to)) {
          log.debug?.(`Broken symlink: node ${card.id} → missing target ${card.symlink_to}`)
        }
        // Multi-selection — mark the card and all its descendants
        if (selected.has(card.id)) {
          reduced.get(card.id).selected(true)
          hydrateDescendantSelection(repo, card.id)
        }
        knownNodeIds.add(card.id)
      }
    }

    // Set ownSigils — excludedSigils auto-propagates via computed
    if (rootSigils.length > 0) reduced.get(rootId).ownSigils(rootSigils)
    for (const col of columns) {
      const colName = getNodeDisplayName(repo, col)
      const colSigils = deriveColumnExcludedSigils(colName, col.id, col.fs_path)
      if (colSigils.length > 0) reduced.get(col.id).ownSigils(colSigils)
    }

    // Hydrate sticky fold signals — flip the `sticky` signal for any node
    // that the caller says is currently pinned. Covers columns, cards, and
    // sub-items since sticky folds are not tied to any hierarchy level.
    for (const [id, state] of stickyFolds) {
      reduced.get(id).sticky(state)
    }
  }

  return {
    reduced,
    cursor,
    cursorCardNodeId,
    cursorColumnNodeId,
    cursorDepth,
    setHovered,
    cursorDescendant,
    selectedAncestor,
    editingDescendant,
    doneAncestor,
    excludedSigils,
    hydrate,
    // Centralized store write API (Phase 9)
    setCursor,
    setSelection,
    beginEdit,
    endEdit,
    replaceFoldOverrides,
    replaceStickyFolds,
  }
}

/** Type of the reactive node store returned by createNodeStore(). */
export type NodeStore = ReturnType<typeof createNodeStore>

// =============================================================================
// React Context
// =============================================================================

export const NodeStoreContext = createContext<NodeStore | null>(null)

export const NodeStoreProvider = NodeStoreContext.Provider

/** Get the NodeStore from context. Throws if not in a provider. */
export function useNodeStore(): NodeStore {
  const store = useContext(NodeStoreContext)
  if (!store) throw new Error("useNodeStore: not inside NodeStoreProvider")
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
