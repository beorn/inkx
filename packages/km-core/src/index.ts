/**
 * @km/core - Base types and pure utilities
 *
 * Contains type definitions and pure functions (no DB dependencies).
 * For DB-related functionality:
 * - Event emission, recurrence → @km/storage
 * - Query execution → @km/storage
 * - Tree queries → @km/tree
 */

// Types
export type {
  KNode,
  TNode,
  Source,
  NodeType,
  NodeRules,
  TaskStatus,
  TaskMark,
  Event,
  EventType,
  NodeCreatedData,
  NodeUpdatedData,
  NodeMovedData,
} from "./types.ts";

// Constants
export { CUSTOM_TASK_MARKS, TASK_MARK_REGEX_CLASS } from "./types.ts";

// Query language parser (pure parsing, no DB)
export {
  parseQuery,
  mapFieldName,
  resolveDateQuery,
  isDateShortcut,
  isDateField,
} from "./query/index.ts";
export type {
  QueryAST,
  QueryCondition,
  QueryRef,
  QueryPath,
  QueryOffset,
  QueryText,
  QueryPhrase,
  DateRange,
} from "./query/index.ts";
