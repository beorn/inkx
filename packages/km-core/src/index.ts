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
  BlockType,
  FsType,
  NodeRules,
  TaskStatus,
  TaskMarker,
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
  Reminder,
} from "./types.ts"

// Build info (auto-generated)
export { VERSION, BUILD_INFO, BUILD_TIME, GIT_COMMIT, GIT_BRANCH, GIT_DIRTY } from "./build-info.gen.ts"
export type { BuildInfo } from "./build-info.gen.ts"

// Type predicates (km-ast v2)
export { isOutline, isListItem, isItem, isEmbed, isBlock, validateNode } from "./types.ts"
export type { ValidationError } from "./types.ts"

// Task utilities (new names)
export {
  getMarkerForStatus,
  getStatusForMarker,
  markToMarker,
  extractTitleTaskMarker,
  hasTaskProperties,
  isTask,
} from "./types.ts"

// Date utilities (due_at / start_at ↔ date/time/tz)
export { composeDatetime, decomposeDatetime, dateOnly, timeOnly } from "./date-utils.ts"
export type { DateParts } from "./date-utils.ts"

// Task metadata (shared between parser, serializer, and TUI editor)
export { extractTaskMetadata, stringifyTaskMetadata, parseTaskMetadataFromText } from "./task-metadata.ts"
export type { ExtractedTaskMetadata } from "./task-metadata.ts"

// Unified inline metadata (key:: value format)
export { extractMetadata, stringifyMetadata, splitMultiValue } from "./metadata.ts"
export type { MetadataEntries, ExtractedMetadata } from "./metadata.ts"

// Query language parser (pure parsing, no DB)
export {
  parseQuery,
  mapFieldName,
  resolveDateQuery,
  resolveRelativeDate,
  formatDate,
  formatTime,
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
  ResolvedDate,
} from "./query/index.ts"

// Service interface and utilities
export type { Service, ServiceStatus } from "./service.ts"
export { runGenerator, runWithProgress } from "./service.ts"

// Result type for explicit error handling
export type { Result } from "./result.ts"
export { Ok, Err, OkVoid, isOk, isErr, map, andThen, all, tryCatch } from "./result.ts"

// Logger (re-export from @beorn/logger)
export { createLogger, setLogLevel, getLogLevel, type Logger, type LogLevel } from "loggily"

// Event system
export { kmEvents, DisposableStore } from "./events.ts"
export type { KmEvents, Subscription } from "./events.ts"

// Toast notifications
export { createToastQueue } from "./toast.ts"
export type { Toast, ToastOptions, ToastAction, ToastQueue } from "./toast.ts"

// Job runner
export { createJobRunner } from "./job.ts"
export type { JobSpec, JobHandle, JobRunner } from "./job.ts"
