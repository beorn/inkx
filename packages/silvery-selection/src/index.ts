/**
 * @silvery/selection — Pure selection state machine
 *
 * Node selection, sub-selection (text/path/crop), pointer gestures.
 * Pure transitions + ordered sets. Reactive store via alien-signals.
 */

// Types
export type {
  CropSelection,
  DragState,
  ID,
  Modifiers,
  PathSelection,
  PointerEvent,
  PointerHelpers,
  PointerOrigin,
  PointerState,
  PressHit,
  Rect,
  SelectionApp,
  SelectionEffect,
  SelectionKind,
  SelectionSnapshot,
  SubSelection,
  TextSelection,
} from "./types.ts"

// OrderedSet
export { createOrderedSet, EMPTY_ORDERED_SET } from "./ordered-set.ts"
export type { OrderedSet } from "./ordered-set.ts"

// Pure transitions
export {
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

// Pointer state machine
export { applyPointerEvent } from "./pointer.ts"

// Reactive store
export { createSelection } from "./store.ts"
export type { DragAccessor, NodeAccessor, RootAccessor, SelectionStore } from "./store.ts"

// Sub-selection accessors
export type { TextAccessor } from "./sub-text.ts"
export type { PathAccessor } from "./sub-path.ts"
export type { CropAccessor } from "./sub-crop.ts"
