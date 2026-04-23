/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
/**
 * Per-Node Reactive State — alien-signals backed.
 *
 * Each node gets a stable set of signals (selected, edit, foldOverride, etc.).
 * React components subscribe via useSignal() from hooks/use-signal.ts.
 * Global cursor state (cursor, cursorCardNodeId, etc.) lives on the NodeStore.
 */

import { signal } from "alien-signals"
import { createTree, type Traversal, type TreeStore } from "alien-trees"
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
  return createTree(
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

  /**
   * Collect all descendant IDs of a node into the target set.
   *
   * Uses an iterative walk (stack + `target` as the visited set) rather than
   * recursion. Guards against two failure modes:
   *
   * 1. **Stack overflow on deep trees** — a recursive walk of a 5000-level-deep
   *    subtree blows the JS stack. Iterative walk handles any depth.
   * 2. **Infinite loops on parent_id cycles** — if a repo mutation (e.g. a
   *    rename race with concurrent edits) produces `A → B → A` in `getChildren`,
   *    a naive recursion would stack-overflow and a naive iteration would loop
   *    forever. The `target` set doubles as a visited guard: we only enqueue a
   *    child once, so cycles terminate cleanly.
   *
   * See bead `km-tui.zoom-stack-overflow` — prior RangeError in the zoom-out
   * path after a rename was most likely caused by this function's previous
   * recursive form hitting a transient cycle during the rename cascade.
   */
  function collectDescendantsInto(
    repo: { getChildren(parentId: string | null): { id: string }[] },
    nodeId: string,
    target: Set<string>,
  ): void {
    // Iterative DFS. Start with the direct children of nodeId; push each
    // child's children onto the stack after adding them to `target`. A node
    // already in `target` is skipped, so a `parent_id` cycle cannot re-enter
    // a node we've already processed.
    const stack: string[] = []
    for (const child of repo.getChildren(nodeId)) {
      if (!target.has(child.id)) {
        target.add(child.id)
        stack.push(child.id)
      }
    }
    while (stack.length > 0) {
      const id = stack.pop()!
      for (const child of repo.getChildren(id)) {
        if (target.has(child.id)) continue // cycle guard
        target.add(child.id)
        stack.push(child.id)
      }
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

  // ── Internal prev-tracking state for store write API ─────────────────
  let prevCursorId: string | null = null
  let prevExpandedSelection = new Set<string>()
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

  /** Replace entire selection — diffs against current, writes per-node selected signals.
   * Expands to include all descendants for visual selection (e.g., card selected →
   * all sub-items visually highlighted). Single source of truth: one expanded set,
   * one diff pass, one prev-tracking variable. */
  function setSelection(
    ids: ReadonlySet<string>,
    repo: { getChildren(parentId: string | null): { id: string }[] },
  ): void {
    const newExpanded = expandSelectionWithDescendants(repo, ids)
    // Diff: clear deselected, set newly selected
    for (const key of prevExpandedSelection) {
      if (!newExpanded.has(key)) reduced.get(key).selected(false)
    }
    for (const key of newExpanded) {
      if (!prevExpandedSelection.has(key)) reduced.get(key).selected(true)
    }
    prevExpandedSelection = newExpanded
  }

  /** Begin editing a node — sets edit + editing signals, clears any previous edit. */
  function beginEdit(nodeId: string, blockIndex = 0, hints?: Partial<NodeEditState>): void {
    const prev = prevEditNodeId
    if (prev && prev !== nodeId) {
      reduced.get(prev).edit(null)
      reduced.get(prev).editing(false)
    }
    reduced.get(nodeId).edit({ blockIndex, ...hints })
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
        if (card.embed_of && !repo.getNode(card.embed_of)) {
          log.debug?.(`Broken symlink: node ${card.id} → missing target ${card.embed_of}`)
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
