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
  SessionStartedData,
  SessionMessageData,
  SessionToolCallData,
  SessionEndedData,
  NotificationLevel,
} from "./types.ts"

// Constants
export { CUSTOM_TASK_MARKS, TASK_MARK_REGEX_CLASS } from "./types.ts"

// Build info (auto-generated)
export {
  VERSION,
  BUILD_INFO,
  BUILD_TIME,
  GIT_COMMIT,
  GIT_BRANCH,
  GIT_DIRTY,
} from "./build-info.gen.ts"
export type { BuildInfo } from "./build-info.gen.ts"

// Task utilities
export { getMarkForStatus } from "./types.ts"

// Query language parser (pure parsing, no DB)
export {
  parseQuery,
  mapFieldName,
  resolveDateQuery,
  isDateShortcut,
  isDateField,
} from "./query/index.ts"
export type {
  QueryAST,
  QueryCondition,
  QueryRef,
  QueryPath,
  QueryOffset,
  QueryText,
  QueryPhrase,
  QueryPropCondition,
  QuerySpecial,
  DateRange,
} from "./query/index.ts"

// Service interface and utilities
export type { Service, ServiceStatus } from "./service.ts"
export { runGenerator, runWithProgress } from "./service.ts"

// Result type for explicit error handling
export type { Result } from "./result.ts"
export {
  Ok,
  Err,
  OkVoid,
  isOk,
  isErr,
  map,
  andThen,
  all,
  tryCatch,
} from "./result.ts"

// Logger (re-export from @beorn/logger)
export {
  createLogger,
  setLogLevel,
  getLogLevel,
  type Logger,
  type LogLevel,
} from "@beorn/logger"

// Event system
export { kmEvents, DisposableStore } from "./events.ts"
export type { KmEvents, Subscription } from "./events.ts"

// Toast notifications
export { toast, toastQueue } from "./toast.ts"
export type { Toast, ToastOptions, ToastAction, ToastQueue } from "./toast.ts"
