/**
 * createSelection — Reactive selection store.
 *
 * ONE state atom. All reads are computed signals. All writes go through
 * apply* pure functions from apply.ts. No-op check: if apply returns same
 * ref, skip signal write (no notifications).
 *
 * Drag: during drag, reads show preview (computed from startState + operations).
 * On end, preview becomes committed. On cancel, revert to startState.
 */

import { computed, signal, startBatch, endBatch } from "alien-signals"
import {
  applyCollapse,
  applyDeselect,
  applyExtend,
  applyExitSub,
  applyReconcile,
  applyRemove,
  applyRootUp,
  applySelect,
  applySelectAll,
  applySetRoot,
  applyTextEdit,
  applyTextSelect,
  EMPTY_STATE,
} from "./apply.ts"
import { createOrderedSet, EMPTY_ORDERED_SET } from "./ordered-set.ts"
import type { OrderedSet } from "./ordered-set.ts"
import { createTextAccessor } from "./sub-text.ts"
import { createPathAccessor } from "./sub-path.ts"
import { createCropAccessor } from "./sub-crop.ts"
import type {
  DragState,
  ID,
  PressHit,
  PointerOrigin,
  SelectionApp,
  SelectionKind,
  SelectionSnapshot,
  SubSelection,
} from "./types.ts"

// --- Internal state ---

type StoreState = {
  readonly committed: SelectionSnapshot
  readonly drag: DragState | null
}

// --- Store interface ---

export type NodeAccessor = {
  /** Computed: current cursor node ID */
  readonly cursor: () => ID | null
  /** Computed: current anchor node ID */
  readonly anchor: () => ID | null
  /** Computed: selected node IDs as an OrderedSet */
  readonly ids: () => OrderedSet<ID>
  /** Replace or toggle selection */
  select(ids: readonly ID[], toggle?: boolean): void
  /** Extend range from anchor to cursor */
  extend(cursor: ID): void
  /** Collapse multi-selection to cursor only */
  collapse(): void
  /** Remove a single ID from selection */
  remove(id: ID): void
  /** Walk up tree from id to find first selectable ancestor in current walkOrder */
  selectableAncestor(id: ID): ID | undefined
}

export type RootAccessor = {
  /** Computed: current root ID */
  readonly id: () => ID | null
  /** Set root to a specific ID */
  set(id: ID | null): void
  /** Pop root to parent */
  up(): void
}

export type DragAccessor = {
  /** Computed: current drag state, or null */
  (): DragState | null
  /** Start a drag gesture */
  start(hit: PressHit, origin: PointerOrigin): void
  /** End drag — commit preview to committed state */
  end(): void
  /** Cancel drag — revert to pre-drag state */
  cancel(): void
}

export type SelectionStore = {
  /** Node-level selection accessor */
  readonly node: NodeAccessor
  /** Sub-selection read/write (writable signal) */
  sub: SubSelection | null
  /** Sub-selection getter (for computed reads) */
  readonly subComputed: () => SubSelection | null
  /** Text sub-selection accessor */
  readonly text: ReturnType<typeof createTextAccessor>
  /** Path sub-selection accessor (stub) */
  readonly path: ReturnType<typeof createPathAccessor>
  /** Crop sub-selection accessor (stub) */
  readonly crop: ReturnType<typeof createCropAccessor>
  /** Drag accessor */
  readonly drag: DragAccessor
  /** Root accessor */
  readonly root: RootAccessor
  /** Computed: current selection kind */
  readonly kind: () => SelectionKind
  /** Deselect everything */
  deselect(): void
  /** Select all nodes at a given level */
  selectAll(parent?: ID | null): void
  /** Read the full effective snapshot (committed or drag preview) */
  readonly snapshot: () => SelectionSnapshot
  /** Reconcile selection against current valid nodes */
  reconcile(): void
}

// --- Factory ---

export function createSelection(app: SelectionApp): SelectionStore {
  // ONE state atom
  const $state = signal<StoreState>({
    committed: EMPTY_STATE,
    drag: null,
  })

  // --- Helpers ---

  function getWalkOrder(): readonly ID[] {
    return app.tree.walkOrder(effective().root)
  }

  /** Read the effective snapshot: drag preview or committed */
  function effective(): SelectionSnapshot {
    const s = $state()
    return s.drag !== null ? s.committed : s.committed
  }

  /** Write to committed, with no-op check */
  function commitUpdate(next: SelectionSnapshot): void {
    const s = $state()
    if (next === s.committed) return
    $state({ committed: next, drag: s.drag })
  }

  // --- Computed signals ---

  const $effective = computed<SelectionSnapshot>(() => {
    const s = $state()
    // During drag, the committed state IS the preview — drag operations
    // write directly to committed. startState is kept for cancel.
    return s.committed
  })

  const $cursor = computed<ID | null>(() => $effective().cursor)
  const $anchor = computed<ID | null>(() => $effective().anchor)
  const $ids = computed<OrderedSet<ID>>(() => {
    const ids = $effective().ids
    if (ids.length === 0) return EMPTY_ORDERED_SET as OrderedSet<ID>
    return createOrderedSet(ids)
  })
  const $sub = computed<SubSelection | null>(() => $effective().sub)
  const $root = computed<ID | null>(() => $effective().root)

  const $kind = computed<SelectionKind>(() => {
    const snap = $effective()
    if (snap.cursor === null) return "idle"
    if (snap.sub !== null) return snap.sub.kind
    return "node"
  })

  const $drag = computed<DragState | null>(() => $state().drag)

  // --- Node accessor ---

  const node: NodeAccessor = {
    cursor: $cursor,
    anchor: $anchor,
    ids: $ids,

    select(ids: readonly ID[], toggle?: boolean): void {
      const order = getWalkOrder()
      const s = $state()
      const next = applySelect(s.committed, ids, order, toggle)
      if (next !== s.committed) {
        $state({ committed: next, drag: s.drag })
      }
    },

    extend(cursor: ID): void {
      const order = getWalkOrder()
      const s = $state()
      const next = applyExtend(s.committed, cursor, order)
      if (next !== s.committed) {
        $state({ committed: next, drag: s.drag })
      }
    },

    collapse(): void {
      const s = $state()
      const next = applyCollapse(s.committed)
      if (next !== s.committed) {
        $state({ committed: next, drag: s.drag })
      }
    },

    remove(id: ID): void {
      const order = getWalkOrder()
      const s = $state()
      const next = applyRemove(s.committed, id, order)
      if (next !== s.committed) {
        $state({ committed: next, drag: s.drag })
      }
    },

    selectableAncestor(id: ID): ID | undefined {
      const order = getWalkOrder()
      const orderSet = new Set(order)
      let current: ID | undefined = id
      while (current !== undefined) {
        if (orderSet.has(current)) return current
        current = app.tree.parent(current)
      }
      return undefined
    },
  }

  // --- Root accessor ---

  const rootAccessor: RootAccessor = {
    id: $root,

    set(id: ID | null): void {
      const s = $state()
      const next = applySetRoot(s.committed, id)
      if (next !== s.committed) {
        $state({ committed: next, drag: s.drag })
      }
    },

    up(): void {
      const s = $state()
      const next = applyRootUp(s.committed, (id) => app.tree.parent(id) ?? null)
      if (next !== s.committed) {
        $state({ committed: next, drag: s.drag })
      }
    },
  }

  // --- Drag accessor ---

  function dragRead(): DragState | null {
    return $drag()
  }

  dragRead.start = function start(hit: PressHit, origin: PointerOrigin): void {
    const s = $state()
    $state({
      committed: s.committed,
      drag: { hit, origin, startState: s.committed },
    })
  }

  dragRead.end = function end(): void {
    const s = $state()
    if (s.drag === null) return
    // committed already has the preview state — just clear drag
    $state({ committed: s.committed, drag: null })
  }

  dragRead.cancel = function cancel(): void {
    const s = $state()
    if (s.drag === null) return
    // Revert committed to pre-drag state
    $state({ committed: s.drag.startState, drag: null })
  }

  // --- Sub-selection r/w ---

  function writeSub(value: SubSelection | null): void {
    const s = $state()
    if (value === null) {
      const next = applyExitSub(s.committed)
      if (next !== s.committed) {
        $state({ committed: next, drag: s.drag })
      }
    } else {
      // Write sub directly
      const snap = s.committed
      if (snap.sub === value) return
      $state({
        committed: {
          cursor: snap.cursor,
          anchor: snap.anchor,
          ids: snap.ids,
          sub: value,
          root: snap.root,
        },
        drag: s.drag,
      })
    }
  }

  // --- Sub-selection accessors ---

  const textAccessor = createTextAccessor(
    $sub,
    (nodeId, offset) => {
      startBatch()
      try {
        // Ensure the node is selected
        const ancestor = node.selectableAncestor(nodeId)
        if (ancestor !== undefined) {
          const ids = $ids()
          if (!ids.has(ancestor)) {
            node.select([ancestor])
          }
        }
        // Enter text mode
        const s = $state()
        const next = applyTextEdit(s.committed, nodeId, offset)
        if (next !== s.committed) {
          $state({ committed: next, drag: s.drag })
        }
      } finally {
        endBatch()
      }
    },
    (cursor, anchor) => {
      const s = $state()
      const next = applyTextSelect(s.committed, cursor, anchor)
      if (next !== s.committed) {
        $state({ committed: next, drag: s.drag })
      }
    },
    () => {
      const s = $state()
      const next = applyExitSub(s.committed)
      if (next !== s.committed) {
        $state({ committed: next, drag: s.drag })
      }
    },
  )

  const pathAccessor = createPathAccessor(
    $sub,
    () => {
      // stub — no-op
    },
    () => {
      // stub — no-op
    },
    () => {
      const s = $state()
      const next = applyExitSub(s.committed)
      if (next !== s.committed) {
        $state({ committed: next, drag: s.drag })
      }
    },
  )

  const cropAccessor = createCropAccessor(
    $sub,
    () => {
      // stub — no-op
    },
    () => {
      // stub — no-op
    },
    () => {
      const s = $state()
      const next = applyExitSub(s.committed)
      if (next !== s.committed) {
        $state({ committed: next, drag: s.drag })
      }
    },
  )

  // --- Store object ---

  const store: SelectionStore = {
    node,

    get sub(): SubSelection | null {
      return $sub()
    },
    set sub(value: SubSelection | null) {
      writeSub(value)
    },
    subComputed: $sub,

    text: textAccessor,
    path: pathAccessor,
    crop: cropAccessor,
    drag: dragRead as DragAccessor,
    root: rootAccessor,
    kind: $kind,

    deselect(): void {
      const s = $state()
      const next = applyDeselect(s.committed)
      if (next !== s.committed) {
        $state({ committed: next, drag: s.drag })
      }
    },

    selectAll(parent?: ID | null): void {
      const parentId = parent ?? $root()
      const children = parentId !== null ? app.tree.children(parentId) : getWalkOrder()
      const s = $state()
      const next = applySelectAll(s.committed, parentId ?? null, children)
      if (next !== s.committed) {
        $state({ committed: next, drag: s.drag })
      }
    },

    snapshot: $effective,

    reconcile(): void {
      const order = getWalkOrder()
      const validSet = new Set(order)
      const s = $state()
      const next = applyReconcile(s.committed, validSet, order)
      if (next !== s.committed) {
        $state({ committed: next, drag: s.drag })
      }
    },
  }

  return store
}
