/**
 * @silvery/selection — Pure selection state machine
 *
 * Node selection, text sub-selection, pointer gestures.
 * Pure transitions + ordered sets. Reactive store via alien-signals.
 */

// Types
export type {
  DefaultSubSelection,
  DragState,
  ID,
  Modifiers,
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
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- barrel re-export of deprecated alias preserved for external consumers; removed when SubSelection is deleted upstream
  SubSelection,
  SubSelectionBase,
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
  assertInvariants,
  SelectionInvariantError,
  EMPTY_STATE,
} from "./apply.ts"

// Tree op transform (SlateJS pattern)
export { transformSelection } from "./transform.ts"
export type { SelectionTree, TreeOp } from "./transform.ts"

// Pointer state machine
export { applyPointerEvent } from "./pointer.ts"

// Reactive store
export { createSelection } from "./store.ts"
export type { DragAccessor, NodeAccessor, RootAccessor, SelectionOptions, SelectionStore } from "./store.ts"

// Sub-selection accessors
export type { TextAccessor } from "./sub-text.ts"

// op() proxy — operations as data
export { op } from "./op-proxy.ts"
export type { OpDescriptor, OpApply } from "./op-proxy.ts"
