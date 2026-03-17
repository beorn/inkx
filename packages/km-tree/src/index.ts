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
export type { TAction } from "./actions.ts"
export { isTAction, TActionTypes } from "./actions.ts"

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
  normalizeName,
  namesAreSimilar,
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

// Index file detection (folder-file merge)
export { findIndexFile, isIndexFile, getChildSlotTarget, isSlotNode, extractSlotTargets } from "./index-file.ts"

// Body content utilities
export { extractBody, type BodyExtraction, type ExtractBodyDbOpts } from "./body.ts"

// Block operations (split/merge for outline editing)
export {
  splitNode,
  mergeWithPrevious,
  mergeWithNext,
  getNodeText,
  setNodeText,
  getPreviousSibling,
  getNextSibling,
  detectPrefixConversion,
  backspaceDegradation,
  type TreeMutator,
  type SplitResult,
  type MergeResult,
  type PrefixConversion,
} from "./block-ops.ts"
