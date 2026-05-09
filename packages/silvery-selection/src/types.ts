/**
 * @silvery/selection — Types
 *
 * All types for the selection state machine. Pure data shapes — no behavior.
 */

// Branded string for type-safe node IDs
export type ID = string & { readonly __brand: "ID" }

/**
 * An occurrence path through a host's visible tree.
 *
 * **Why path identity is required.** A single source node id can be rendered
 * in multiple visual occurrences when the host's tree includes embeds /
 * symlinks / portals / virtualized lists with sticky duplicates. `id`-shaped
 * cursor identity cannot disambiguate which occurrence the cursor lives in,
 * so render and navigation matching must compare the full path from the
 * visible-tree root down to the leaf.
 *
 * The selection store treats the path as opaque: each element is just an
 * `ID`, and the host defines what the sequence means (board → column →
 * card → sub-item, detail-pane → section → item, virtual-list → row →
 * column, etc.). The leaf id (`path.at(-1)`) is the cursor target node;
 * upstream consumers that only need an id can read `cursor` directly.
 *
 * Empty array means "root visible-tree itself"; null means "no cursor".
 *
 * See @km/tui/cursor-is-path-no-global-subscriptions (P0 #bug).
 */
export type OccurrencePath = readonly ID[]

// --- Selection state ---

export type SelectionSnapshot<Sub = DefaultSubSelection> = {
  /**
   * Leaf id of the cursor occurrence — derived from `cursorPath.at(-1)`.
   * Kept on the snapshot for cheap id-shaped reads (storage lookups,
   * serialization, log output). NEVER write this directly; write a path
   * via the selection apply* functions and let `cursor` be re-derived.
   */
  readonly cursor: ID | null
  /**
   * The visible-tree occurrence path that owns the cursor. This will become
   * the authoritative cursor identity — `cursor` is `cursorPath.at(-1)`.
   *
   * Currently optional during the additive migration (phase 1 of
   * @km/tui/cursor-is-path-no-global-subscriptions). When unset, callers
   * should treat it as "host hasn't migrated yet" and fall back to `cursor`.
   * Phase 2 will tighten this to required (`OccurrencePath | null`) once
   * every writer in this package supplies a path.
   *
   * See OccurrencePath for why path identity (not bare id) is required.
   */
  readonly cursorPath?: OccurrencePath | null
  readonly anchor: ID | null
  readonly ids: readonly ID[] // plain array (serializable). OrderedSet is a computed view.
  readonly sub: Sub | null
  readonly root: ID | null
}

// --- Sub-selection variants ---

/** Base constraint for all sub-selections: must have nodeId for reconciliation. */
export type SubSelectionBase = {
  readonly kind: string
  readonly nodeId: ID
}

/** Built-in sub-selection union. Apps can define their own via the generic param. */
export type DefaultSubSelection = TextSelection | PathSelection | CropSelection

export type TextSelection = {
  readonly kind: "text"
  readonly nodeId: ID
  readonly cursor: number
  readonly anchor?: number
}

export type PathSelection = {
  readonly kind: "path"
  readonly nodeId: ID
  readonly pointIds: readonly ID[]
}

export type CropSelection = {
  readonly kind: "crop"
  readonly nodeId: ID
  readonly rect: Rect
}

export type Rect = {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

// --- Pointer ---

export type PressHit =
  | { readonly kind: "empty" }
  | { readonly kind: "node"; readonly nodeId: ID }
  | { readonly kind: "text"; readonly nodeId: ID; readonly offset: number }

export type PointerOrigin = { readonly x: number; readonly y: number }

export type PointerState =
  | { readonly phase: "idle" }
  | {
      readonly phase: "pointing-empty"
      readonly hit: PressHit
      readonly origin: PointerOrigin
    }
  | {
      readonly phase: "pointing-node"
      readonly hit: PressHit
      readonly origin: PointerOrigin
    }
  | {
      readonly phase: "pointing-selection"
      readonly hit: PressHit
      readonly origin: PointerOrigin
    }
  | {
      readonly phase: "pointing-text"
      readonly hit: PressHit
      readonly origin: PointerOrigin
    }
  | {
      readonly phase: "dragging-area"
      readonly hit: PressHit
      readonly origin: PointerOrigin
    }
  | {
      readonly phase: "dragging-text"
      readonly hit: PressHit
      readonly origin: PointerOrigin
    }

// --- Effects emitted by the pointer state machine ---

export type SelectionEffect =
  | { readonly type: "node.select"; readonly ids: ID[]; readonly toggle?: boolean }
  | { readonly type: "node.extend"; readonly cursor: ID }
  | { readonly type: "node.collapse" }
  | { readonly type: "node.remove"; readonly id: ID }
  | { readonly type: "deselect" }
  | { readonly type: "text.edit"; readonly nodeId: ID; readonly offset: number }
  | {
      readonly type: "text.select"
      readonly cursor?: number
      readonly anchor?: number
    }
  | { readonly type: "sub.clear" }
  | {
      readonly type: "drag.start"
      readonly hit: PressHit
      readonly origin: PointerOrigin
    }
  | { readonly type: "drag.end" }
  | { readonly type: "drag.cancel" }
  | {
      readonly type: "manipulation-drag"
      readonly hit: PressHit
      readonly origin: PointerOrigin
    }

// --- Modifiers ---

export type Modifiers = {
  readonly shift: boolean
  readonly cmd: boolean
  readonly opt: boolean
}

// --- Pointer events (input to the pointer state machine) ---

export type PointerEvent =
  | {
      readonly type: "pointerDown"
      readonly hit: PressHit
      readonly origin: PointerOrigin
      readonly modifiers: Modifiers
      readonly isSelected: boolean
    }
  | {
      readonly type: "pointerMove"
      readonly x: number
      readonly y: number
      readonly modifiers: Modifiers
    }
  | { readonly type: "pointerUp"; readonly modifiers: Modifiers }
  | { readonly type: "escape" }
  | { readonly type: "doubleClick"; readonly hit: PressHit }

// --- Helpers interface for pointer state machine (injected, not imported) ---

export type PointerHelpers = {
  readonly hitTest: (x: number, y: number) => PressHit
  readonly nodesInRect: (origin: PointerOrigin, current: PointerOrigin) => ID[]
  readonly dragThreshold: number
}

// --- Drag state ---

export type DragState<Sub = DefaultSubSelection> = {
  readonly hit: PressHit
  readonly origin: PointerOrigin
  readonly startState: SelectionSnapshot<Sub>
}

// --- Store types ---

/** Minimal interface the store needs from the app's tree. */
export type SelectionApp = {
  readonly tree: {
    walkOrder(root: ID | null): readonly ID[]
    parent(id: ID): ID | undefined
    children(id: ID): readonly ID[]
    /**
     * O(1) existence check: does `id` refer to a real, selectable node?
     *
     * Hot path for `store.select()` — replaces the old O(visible) walkOrder
     * filter. On large vaults (500k+ nodes), walking the tree on every
     * keystroke blocked the main thread for 3+ seconds; an O(1) `contains`
     * (backed by a repo-level hash) makes selection validation free.
     *
     * Implementations should return true for any id that the app would
     * accept as a selection target — typically "exists in the tree" (which
     * for km means `repo.getNode(id) !== null`).
     */
    contains(id: ID): boolean
  }
}

/** The kind of selection currently active. */
export type SelectionKind = "idle" | "node" | "text" | "path" | "crop"
