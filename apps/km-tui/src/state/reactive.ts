/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
/**
 * Per-Node Reactive State — alien-signals backed.
 *
 * Each node gets a stable set of signals (selected, edit, foldOverride, etc.).
 * React components subscribe via useSignal() from hooks/use-signal.ts.
 * Global cursor state (cursor, cursorCardNodeId, etc.) lives on the NodeStore.
 */

import { signal } from "alien-signals"
import { createTree, type Traversal } from "alien-trees"
import { createContext, useContext } from "react"
import type { Repo } from "../repo-context.tsx"
import { deriveExcludedSigils, deriveColumnExcludedSigils } from "./ui-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { createLogger } from "loggily"

const log = createLogger("km:tui:hydrate")

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
      cursorChild: signal(false),
      selected: signal(false),
      editing: signal(false),
      isDone: signal(false),
      hovered: signal(false),
      cursorPathChildId: signal(null as string | null),
      foldOverride: signal(undefined as number | undefined),
      edit: signal(null as NodeEditState | null),
      sticky: signal(null as "folded" | "unfolded" | null),
      ownSigils: signal([] as string[]),

      // Computeds — derived from tree walks, cached
      cursorDescendant: tree.descendants((s: { cursor: unknown }) => s.cursor).some(),
      cursorAncestor: tree.ancestors((s: { cursor: unknown }) => s.cursor).some(),
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
  const hasCursor = signal(false)
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

  /** Get cursorAncestor reduced signal for a node.
   * Returns a boolean getter: true when any ancestor of this node has cursor. */
  function cursorAncestor(nodeId: string): () => boolean {
    return reduced.get(nodeId).cursorAncestor as () => boolean
  }

  /** Get cursorChild signal for a node.
   * Returns true when the current cursor node is a direct child of this node. */
  function cursorChild(nodeId: string): () => boolean {
    return reduced.get(nodeId).cursorChild as () => boolean
  }

  /** Get the immediate child id on the active cursor path for this node. */
  function cursorPathChildId(nodeId: string): () => string | null {
    return reduced.get(nodeId).cursorPathChildId as () => string | null
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
  let prevCursorParentId: string | null = null
  let prevCursorPathChildren = new Map<string, string>()
  let getParentId: (nodeId: string) => string | null = () => null
  let prevExpandedSelection = new Set<string>()
  let prevEditNodeId: string | null = null
  let prevFoldOverrides = new Map<string, number>()
  let prevStickyFolds = new Map<string, "folded" | "unfolded">()

  // ── Centralized store write API ──────────────────────────────────────

  function syncCursorParentMarker(nodeId: string | null): void {
    const nextParentId = nodeId ? getParentId(nodeId) : null
    if (prevCursorParentId === nextParentId) return
    if (prevCursorParentId) reduced.get(prevCursorParentId).cursorChild(false)
    if (nextParentId) reduced.get(nextParentId).cursorChild(true)
    prevCursorParentId = nextParentId
  }

  /**
   * Update each parent's `cursorPathChildId` signal so it points at the
   * immediate child on the active cursor path.
   *
   * When a `visiblePath` is supplied (phase 3 of
   * @km/tui/cursor-is-path-no-global-subscriptions), it walks that
   * occurrence path — root, column, card, sub-item, ... leaf — and
   * marks each segment's `cursorPathChildId` with the next segment.
   * This is the only correct walk for embedded-card cursors: the
   * storage parent chain leaves the embed source card's
   * `cursorPathChildId` unset because the source isn't a storage parent
   * of the embedded leaf, so any per-node renderer that looks up
   * "which of my children is on the cursor path?" finds nothing.
   *
   * When no `visiblePath` is supplied, falls back to the storage
   * parent walk (legacy behavior — still correct for non-embedded
   * cursor moves).
   */
  function syncCursorPathMarkers(nodeId: string | null, visiblePath?: readonly string[] | null): void {
    const next = new Map<string, string>()

    if (visiblePath && visiblePath.length > 0) {
      // Path-based: each path[i] marks path[i+1] as its cursor child.
      // The leaf has no child to mark; that's the cursor itself.
      for (let i = 0; i < visiblePath.length - 1; i++) {
        const parent = visiblePath[i]
        const child = visiblePath[i + 1]
        if (parent && child) next.set(parent, child)
      }
    } else {
      // Legacy: storage parent walk.
      let childId = nodeId
      let parentId = childId ? getParentId(childId) : null
      while (childId && parentId) {
        next.set(parentId, childId)
        childId = parentId
        parentId = getParentId(childId)
      }
    }

    for (const [parentId, prevChildId] of prevCursorPathChildren) {
      if (next.get(parentId) !== prevChildId) {
        reduced.get(parentId).cursorPathChildId(null)
      }
    }
    for (const [parentId, nextChildId] of next) {
      if (prevCursorPathChildren.get(parentId) !== nextChildId) {
        reduced.get(parentId).cursorPathChildId(nextChildId)
      }
    }
    prevCursorPathChildren = next
  }

  /** Set cursor — clears old per-node cursor boolean, sets new one.
   * Also writes the store-level cursor signal.
   *
   * `visiblePath` (phase 3 of cursor-is-path-no-global-subscriptions):
   * the visible-tree occurrence path that owns the cursor. Required
   * for correct cursor-path-child marking under embedded cards;
   * optional for back-compat. The leaf must equal `nodeId`. */
  function setCursor(nodeId: string | null, visiblePath?: readonly string[] | null): void {
    const prev = prevCursorId
    const active = nodeId != null
    if (hasCursor() !== active) hasCursor(active)
    if (prev === nodeId) {
      syncCursorParentMarker(nodeId)
      syncCursorPathMarkers(nodeId, visiblePath)
      return
    }
    if (prev) reduced.get(prev).cursor(false)
    if (nodeId) reduced.get(nodeId).cursor(true)
    syncCursorParentMarker(nodeId)
    syncCursorPathMarkers(nodeId, visiblePath)
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

    if (!rootId) {
      getParentId = () => null
      syncCursorParentMarker(prevCursorId)
      syncCursorPathMarkers(prevCursorId)
      return
    }

    // Rebind reactive tree to repo traversal
    getParentId = (id) => repo.getNode(id)?.parent_id ?? null
    reduced.rebind({
      parent: getParentId,
      children: (id) => repo.getChildren(id).map((n) => n.id),
    })
    syncCursorParentMarker(prevCursorId)
    syncCursorPathMarkers(prevCursorId)

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
    hasCursor,
    cursorCardNodeId,
    cursorColumnNodeId,
    cursorDepth,
    setHovered,
    cursorDescendant,
    cursorAncestor,
    cursorChild,
    cursorPathChildId,
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
 * const inCursorCard = n.cursorAncestor()
 * const dim = n.doneAncestor()
 * ```
 */
export function useTreeNode(nodeId: string) {
  const store = useNodeStore()
  return store.reduced.get(nodeId)
}
