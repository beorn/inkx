/**
 * @km/tree - Tree Data Model
 *
 * Structural types and queries for tree nodes.
 * NO visual state (cursor, selection, fold) - that's in @km/board.
 */

// Types
export type { TNode, TPath } from "./types.ts"
export type { TaskStatus } from "./types.ts"

// Actions
export type { TAction } from "./ops/actions.ts"
export { isTAction, TActionTypes } from "./ops/actions.ts"

// Queries
export {
  getNodeAtPath,
  getSiblingCount,
  getCurrentIndex,
  collectAllNodeIds,
  getSiblings,
  getParentPath,
  getFirstChildPath,
  countVisibleNodes,
  findPathByNodeId,
} from "./queries.ts"

// Display utilities (moved from @km/tui-core)
export {
  getNodeDisplayName,
  isNodeUntitled,
  getTypeIndicator,
  getCollapsedTypeSuffix,
  collapseRedundantAncestors,
  collapseAncestorsWithTypes,
  getParentContext,
  getParentContextEx,
  stripForDisplay,
  type ParentContextResult,
  type GetChildrenFn,
  type GetNodeFn,
  type CollapsedAncestor,
} from "./display.ts"

// Body content utilities
export { extractBody, type BodyExtraction, type ExtractBodyDbOpts } from "./body.ts"

// Tree namespace — queries + mutations (SlateJS pattern)
export { Tree, type TreeReader, type TreeMover } from "./tree.ts"

// Block operations (split/merge for outline editing)
export {
  split,
  mergeBackward,
  mergeForward,
  detectPrefixConversion,
  degrade,
  type TreeMutator,
  type SplitResult,
  type MergeResult,
  type PrefixConversion,
} from "./ops/block-ops.ts"

// Schema — structural rules for the node model
export { canHaveChildren, canParent, canBecomeBlock } from "./schema.ts"

// Normalization — auto-enforcement of schema rules after mutations
export {
  withNormalization,
  createNormalizer,
  defaultNormalizers,
  type Normalizer,
  type NormalizerEngine,
  type NormalizedTreeMutator,
} from "./ops/normalize.ts"

// Tree walk — configurable DFS traversal and spatial queries
export { KTree, type NodeEntry, type NodeMatch, type NodesOptions } from "./walk.ts"

// Validation — invariant checking after mutations
export { withValidation, withTreeValidation } from "./validation.ts"

// Sort order utilities
export { midpoint } from "./sort-utils.ts"

// Outliner — centralized outliner behavior composition
export {
  withOutliner,
  createOutlinerContext,
  type Outliner,
  type OutlinerContext,
  type OutlinerPolicy,
  type SplitBlockResult,
  type JoinBackwardResult,
  type JoinForwardResult,
} from "./outliner.ts"

// Operations — low-level atomic ops with inverse (SlateJS-inspired, ID-based)
export {
  inverse,
  applyOperation,
  type Operation,
  type InsertNodeOperation,
  type RemoveNodeOperation,
  type SetNodeOperation,
  type MoveNodeOperation,
  type SplitNodeOperation,
  type MergeNodeOperation,
  type SetSelectionOperation,
  type Selection,
} from "./ops/operations.ts"

// History — op-based undo/redo via operation inverse
export { withHistory, type HistoryEditor } from "./ops/history.ts"

// Operation log — records ops for undo/collaboration/replay
export { createOperationLog, replay, type OperationLog, type OperationEntry } from "./ops/operation-log.ts"

// Selection — Point/Range types with auto-adjustment after operations
export { Point, Range, transformPoint, transformRange, transformSelection } from "./selection.ts"

// Outliner Reducer — TEA state machine for outliner operations
export {
  applyTreeAction,
  captureTreeState,
  type TreeAction,
  type TreeEffect,
  type TreeState,
  type TreeNodeSnapshot,
  type TreeActionResult,
} from "./outliner-reducer.ts"
