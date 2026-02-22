/**
 * km Node Types — km-ast domain model
 *
 * 11 node types in 3 categories:
 * - Block (8): p, h, code, quote, table, hr, html, math — content leaves
 * - Item (2): oi, li — structural nodes with children
 * - Link (1): link — references to other nodes
 *
 * See docs/design/km-ast/model.md for the full specification.
 */

// =============================================================================
// UI Feedback Types
// =============================================================================

/**
 * Notification severity level for status messages and toasts.
 * Used consistently across status bar, toasts, and other feedback UI.
 */
export type NotificationLevel = "info" | "success" | "warning" | "error"

// =============================================================================
// Node Type Hierarchy (km-ast: 11 types, 3 categories)
// =============================================================================

/** Content leaf nodes with a content string */
export type BlockType = "p" | "code" | "quote" | "table" | "hr" | "html" | "math"

/** Structural nodes: outline items and list items */
export type ItemType = "oi" | "li"

/** Reference nodes pointing to other nodes */
export type LinkType = "link"

/** All 11 node types */
export type NodeType = BlockType | ItemType | LinkType

/** Filesystem subtype for oi (outline item) nodes */
export type FsType = "repo" | "folder" | "file" | "mdfile" | "txtfile" | "mdsection"

// =============================================================================
// Type Predicates
// =============================================================================

/** oi — creates outline hierarchy (replaces STRUCTURAL_TYPES / extractBody checks) */
export function isOutline(type: string): boolean {
  return type === "oi"
}

/** li — list/task item in body content */
export function isListItem(type: string): boolean {
  return type === "li"
}

/** oi or li — structural item with children */
export function isItem(type: string): boolean {
  return type === "oi" || type === "li"
}

/** link — reference to another node */
export function isLink(type: string): boolean {
  return type === "link"
}

/** Block — content leaf (p, h, code, quote, table, hr, html, math) */
export function isBlock(type: string): boolean {
  return !isItem(type) && !isLink(type)
}

// =============================================================================
// Task Status and Markers
// =============================================================================

export type TaskStatus =
  | "todo" // [ ] — available to work on
  | "wip" // [/] — actively being worked on
  | "blocked" // [!] — waiting on something/someone
  | "done" // [x] — completed
  | "dropped" // [-] — cancelled, won't do

/**
 * Task marker — full bracket string stored on item nodes.
 * Stores the complete checkbox notation for round-trip fidelity.
 */
export type TaskMarker = "[ ]" | "[x]" | "[X]" | "[/]" | "[!]" | "[-]"

/**
 * Regex character class matching any task mark inner character.
 * Used by extractTitleTaskMarker() for heading task mark detection.
 */
export const TASK_MARK_REGEX_CLASS = "[ xX/\\-!]"

/**
 * Get the task marker (full bracket string) for a task status.
 * Maps TaskStatus → TaskMarker for storage and serialization.
 *
 * @example getMarkerForStatus("done") // "[x]"
 * @example getMarkerForStatus("todo") // "[ ]"
 */
export function getMarkerForStatus(status: TaskStatus): TaskMarker {
  switch (status) {
    case "done":
      return "[x]"
    case "wip":
      return "[/]"
    case "blocked":
      return "[!]"
    case "dropped":
      return "[-]"
    default:
      return "[ ]"
  }
}

/**
 * Get task status from a marker string.
 * Accepts both full bracket markers "[x]" and single characters "x".
 * Returns undefined if marker is undefined (not a task).
 *
 * @example getStatusForMarker("[x]")  // "done"
 * @example getStatusForMarker("x")    // "done" (backwards compat)
 * @example getStatusForMarker(undefined) // undefined
 */
export function getStatusForMarker(marker: string | undefined): TaskStatus | undefined {
  if (marker === undefined) return undefined
  // Extract inner character: "[x]" → "x", "x" → "x"
  const inner = marker.length === 3 && marker[0] === "[" && marker[2] === "]" ? marker[1] : marker
  switch (inner) {
    case "x":
    case "X":
      return "done"
    case "!":
      return "blocked"
    case "-":
      return "dropped"
    case "/":
      return "wip"
    default:
      return "todo"
  }
}

/**
 * Convert a single mark character to a full task marker.
 * Used by the parser after extracting the inner character from markdown.
 *
 * @example markToMarker("x") // "[x]"
 * @example markToMarker(" ") // "[ ]"
 */
export function markToMarker(mark: string): TaskMarker {
  return `[${mark}]` as TaskMarker
}

/** Task marker regex for matching [x] in title text */
const TITLE_TASK_MARKER_REGEX = new RegExp(`^\\[(${TASK_MARK_REGEX_CLASS})\\]\\s*`)

/**
 * Extract task marker from title text.
 * Returns the full marker and the cleaned text without the marker prefix.
 *
 * @example extractTitleTaskMarker("[ ] Todo task") // { marker: "[ ]", cleanText: "Todo task" }
 * @example extractTitleTaskMarker("[x] Done task") // { marker: "[x]", cleanText: "Done task" }
 * @example extractTitleTaskMarker("Regular text")  // { marker: undefined, cleanText: "Regular text" }
 */
export function extractTitleTaskMarker(text: string): {
  marker: TaskMarker | undefined
  cleanText: string
} {
  const match = text.match(TITLE_TASK_MARKER_REGEX)

  if (match) {
    return {
      marker: `[${match[1]}]` as TaskMarker,
      cleanText: text.slice(match[0].length),
    }
  }

  return {
    marker: undefined,
    cleanText: text,
  }
}

// =============================================================================
// Implicit Task Detection
// =============================================================================

/**
 * Check if a node has task-related properties set, indicating it should be
 * treated as an implicit task even without an explicit task_status.
 *
 * Properties checked: due_at, priority (1-4), start_at, assigned_to, recurrence.
 *
 * @example hasTaskProperties({ due_at: "2026-02-20" } as KNode) // true
 * @example hasTaskProperties({ priority: 2 } as KNode) // true
 * @example hasTaskProperties({} as KNode) // false
 */
export function hasTaskProperties(
  node: Pick<KNode, "due_at" | "priority" | "start_at" | "assigned_to" | "recurrence">,
): boolean {
  return !!(
    node.due_at ||
    (node.priority && node.priority >= 1 && node.priority <= 4) ||
    node.start_at ||
    node.assigned_to ||
    node.recurrence
  )
}

/**
 * Check if a node is a task (explicit task_status OR implicit task properties).
 * Single source of truth for task detection — use this instead of inline checks.
 */
export function isTask(
  node: Pick<KNode, "task_status" | "due_at" | "priority" | "start_at" | "assigned_to" | "recurrence">,
): boolean {
  return node.task_status != null || hasTaskProperties(node)
}

// =============================================================================
// Source Type - Where a node comes from
// =============================================================================

/**
 * Source indicates where a node originates.
 * Full path is derived from tree structure via `name` fields - no redundant storage.
 */
export type Source =
  | { type: "folder"; ino?: number } // Directory
  | { type: "file"; ino?: number } // File (binary or md root)
  | { type: "md"; line: number; pos?: number } // Position within markdown file
// Future: { type: "sync"; uri: string; etag?: string }  // CalDAV/CardDAV
// Future: { type: "api"; endpoint: string; id: string } // External API

// =============================================================================
// Reminder Type
// =============================================================================

export interface Reminder {
  minutes_before: number // Relative to due datetime (negative = after)
}

// =============================================================================
// Node Rules
// =============================================================================

export interface NodeRules {
  add?: string | string[] // Query to auto-pull matching tasks (multiple allowed)
  sync?: string // Bidirectional field sync (e.g., "status:blocked")
  collapse?: boolean // Start collapsed
  hidden?: boolean // Hide section from view entirely
  limit?: number // WIP limit
  default?: boolean // Default column for new items
  removed?: boolean // Items dismissed from the board (km add skips these)
  color?: string // Board/section color (cyan, yellow, magenta, etc.)
}

// =============================================================================
// KNode - Unified Node Type
// =============================================================================

/**
 * KNode - the unified node type for km (km-ast model)
 *
 * Flat record stored in SQLite. Extended with `children[]` as TNode for tree ops.
 *
 * ## Node Categories
 *
 * - **Blocks** (p, h, code, quote, table, hr, html, math): content leaves
 * - **Items** (oi, li): structural nodes with children
 * - **Links** (link): references to other nodes
 *
 * ## Task Definition
 *
 * Any item (oi or li) with `task_marker` set is a task.
 * `task_status` is derived from `task_marker`.
 */
export interface KNode {
  id: string // ULID
  type: NodeType
  parent_id: string | null
  parent_idx: number

  // km-ast: subtype and marker fields
  fstype?: FsType // For oi: repo, folder, file, mdfile, mdsection
  list_marker?: string // For li: "-", "*", "+", "1.", "1)", "[^1]", etc.
  task_marker?: TaskMarker // For oi/li: "[ ]", "[x]", "[/]", "[!]", "[-]"

  // Link fields (meaningful for type: "link")
  link_to: string | null // Target node ID
  link_alias?: string // Display alias from |alias syntax
  embed?: boolean // true = transclude, false = reference

  // Filesystem mapping (for oi with fstype folder/file/mdfile)
  fs_path?: string
  fs_ino?: number // Inode for rename detection
  fs_mtime?: number // File modification time at last sync (milliseconds)

  // Identity
  name?: string // Slug/identifier (filename without .md, heading slug)
  block_id?: string // On-demand block identifier (^block-id) for stable embed references

  // Markdown source mapping
  md_pos?: number // Byte offset in file
  md_line?: number // Line number in file (0-indexed)

  // Task properties (set on items with task_marker)
  task_status?: TaskStatus // Derived from task_marker
  assigned_to?: string
  due_at?: string // ISO 8601: "2026-02-20" or "2026-02-20T14:00:00-08:00"
  start_at?: string // ISO 8601: same format as due_at
  priority?: number // 1-4 (P1=critical, P4=backlog)
  recurrence?: string // iCal RRULE format
  recur_prev?: string // Previous recurrence instance ID
  completed_at?: number // Unix ms — when task was marked done (stored in data blob)
  reminders?: Reminder[] // [{minutes_before: 15}] (stored in data blob)

  // Content
  content?: string // Text content (inline for small)
  content_hash?: string // CAS reference for large content
  title?: string // Materialized display title (from blocks[0].content or name)

  // Column/section rules (parsed from inline attributes)
  rules?: NodeRules

  // Metadata
  data: Record<string, unknown>
  created_at: number
  updated_at: number
  version: string // Last event ID that modified this
}

// =============================================================================
// TNode - KNode with recursive children (tree structure)
// =============================================================================

/**
 * TNode - KNode extended with tree structure for navigation and display.
 * Used in @km/tree and @km/board layers.
 *
 * UI state (selection, folding) is NOT stored on nodes - it's in BoardState Sets.
 */
export interface TNode extends KNode {
  children: TNode[]
  depth: number // Depth from current view root (0 = top level)

  // Computed display properties
  childCount: number // Total children (may exceed loaded children.length)
  isTask: boolean // Computed: task_marker !== undefined

  // Lazy loading state
  childrenLoaded: boolean // true = children array is populated, false = only childCount known
}

// =============================================================================
// Event Types
// =============================================================================

export type EventType =
  // Node lifecycle
  | "node_created"
  | "node_updated"
  | "node_moved"
  | "node_deleted"
  // Task lifecycle
  | "task_claimed"
  | "task_released"
  | "task_completed"
  // Session events (for agents)
  | "session_started"
  | "session_message"
  | "session_tool_call"
  | "session_ended"
  // Messaging
  | "message"
  // Sync events
  | "conflict_created"

/**
 * Event structure - immutable record of a change
 */
export interface Event {
  id: string // ULID (globally unique, sortable)
  type: EventType
  actor: string // Who caused this (user, agent, 'system', 'fs-watch')
  target?: string // What it affects (node ID)
  data: Record<string, unknown>
  ts: number // Unix milliseconds
}

// Event data types for type safety
export interface NodeCreatedData {
  id: string
  type: NodeType
  parent_id?: string | null
  parent_idx?: number
  fstype?: FsType
  list_marker?: string
  task_marker?: TaskMarker
  link_to?: string | null
  link_alias?: string
  embed?: boolean
  fs_path?: string
  fs_ino?: number
  fs_mtime?: number
  name?: string
  block_id?: string
  md_pos?: number
  md_line?: number
  task_status?: TaskStatus
  assigned_to?: string
  due_at?: string
  start_at?: string
  priority?: number
  title?: string
  content?: string
  content_hash?: string
  rules?: NodeRules
  data?: Record<string, unknown>
}

export interface NodeUpdatedData {
  [key: string]: unknown
}

export interface NodeMovedData {
  parent_id: string | null
  parent_idx?: number
}

export interface SessionStartedData {
  session_id: string
  model: string
  system_prompt_hash?: string
}

export interface SessionMessageData {
  session_id: string
  role: "user" | "assistant" | "system"
  content: string
  tokens?: number
}

export interface SessionToolCallData {
  session_id: string
  tool: string
  args: Record<string, unknown>
  result?: unknown
  tokens?: number
}

export interface SessionEndedData {
  session_id: string
  status: "success" | "error" | "cancelled"
  total_tokens?: number
  cost_usd?: number
  files_modified?: string[]
  summary?: string
  error?: string
}
