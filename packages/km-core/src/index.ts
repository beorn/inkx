/**
 * @km/core - Base types and pure utilities
 *
 * Contains type definitions and pure functions (no DB dependencies).
 * For DB-related functionality:
 * - Event emission, recurrence → @km/storage
 * - Query execution → @km/storage
 * - Tree queries → @km/tree
 */

// Types (KNode type is re-exported via interfaces/node.ts alongside the KNode namespace)
export type {
  TNode,
  Source,
  NodeType,
  BlockType,
  FsType,
  NodeRules,
  TaskStatus,
  TaskMarker,
  ItemData,
  Change,
  ChangeType,
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

// Domain interfaces — SlateJS namespace pattern (interface + const with same name)
// Position: value (Position.of, .first, .last, .equals) + type ({ parentId, childIdx })
// KNode: value (KNode.isOutline, .isItem, etc.) + type (interface from types.ts via declaration merge)
export { Position, KNode } from "./interfaces/index.ts"

// Tree globs — zsh-style path glob parser with node qualifiers
export { parseTreeGlob } from "./tree-glob.ts"
export type { TreeGlob, GlobQualifier, QualifierType } from "./tree-glob.ts"

// Node validation
export { validateNode } from "./types.ts"
export type { ValidationError } from "./types.ts"

// Task utilities
export { getMarkerForStatus, getStatusForMarker, markToMarker, extractTitleTaskMarker } from "./types.ts"

// Date utilities (due_at / start_at ↔ date/time/tz)
export { composeDatetime, decomposeDatetime, extractTaskDates, dateOnly, timeOnly } from "./date-utils.ts"
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
export { createLogger, type ConditionalLogger, type Logger, type LogLevel } from "loggily"

// Event system
export { kmEvents, DisposableStore } from "./events.ts"
export type { KmEvents, Subscription } from "./events.ts"

// Toast notifications
export { createToastQueue } from "./toast.ts"
export type { Toast, ToastOptions, ToastAction, ToastQueue } from "./toast.ts"

// Index file detection & name utilities (pure KNode functions)
export {
  normalizeName,
  namesAreSimilar,
  findIndexFile,
  isIndexFile,
  getChildSlotTarget,
  isSlotNode,
  extractSlotTargets,
} from "./index-file.ts"

// Job runner
export { createJobRunner } from "./job.ts"
export type { JobSpec, JobHandle, JobRunner } from "./job.ts"

// Heading rules — parse/serialize km.* inline directives (pure text processing)
export { PROP_REGEX, extractKVProperties, parseHeadingRules } from "./heading-rules.ts"
export type { ExtractedProp, ParsedHeading } from "./heading-rules.ts"

// Link model — KLink type + parse/resolve API. See docs/design/links.md.
export type { KLink, KLinkRel, MdForm } from "./klink.ts"
export type { KLinkRef, KAnchor } from "./klink-ref.ts"
export { parseLinkHref, stringifyLinkRef } from "./klink-ref.ts"
export type { KLinkResolver, KResolution, NameIndex } from "./klink-resolver.ts"
export { createLinkResolver } from "./klink-resolver.ts"

// Sigils — name-prefix characters with semantic meaning. See docs/design/links.md.
export type { SigilChar, SigilKind, SigilDefinition } from "./sigils.ts"
export { SIGILS, isSigilChar, hasSigilPrefix, getSigilChar, isInlineSigilStart } from "./sigils.ts"
