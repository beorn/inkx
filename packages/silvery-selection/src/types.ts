/**
 * @silvery/selection — Types
 *
 * All types for the selection state machine. Pure data shapes — no behavior.
 */

// Branded string for type-safe node IDs
export type ID = string & { readonly __brand: "ID" }

// --- Selection state ---

export type SelectionSnapshot = {
  readonly cursor: ID | null
  readonly anchor: ID | null
  readonly ids: readonly ID[] // plain array (serializable). OrderedSet is a computed view.
  readonly sub: SubSelection | null
  readonly root: ID | null
}

// --- Sub-selection variants ---

export type SubSelection = TextSelection | PathSelection | CropSelection

export type TextSelection = {
  readonly kind: "text"
  readonly nodeId: ID
  readonly cursor: number
  readonly anchor?: number
}

export type PathSelection = {
  readonly kind: "path"
  readonly shapeId: ID
  readonly pointIds: readonly ID[]
}

export type CropSelection = {
  readonly kind: "crop"
  readonly objectId: ID
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
