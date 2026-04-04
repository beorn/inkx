/**
 * @silvery/selection — Pure selection state machine
 *
 * Node selection, sub-selection (text/path/crop), pointer gestures.
 * Pure transitions + ordered sets. No framework dependencies.
 */

// Types
export type {
  CropSelection,
  ID,
  Modifiers,
  PathSelection,
  PointerEvent,
  PointerHelpers,
  PointerOrigin,
  PointerState,
  PressHit,
  Rect,
  SelectionEffect,
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
