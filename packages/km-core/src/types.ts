/**
 * km Node Types
 * Core type definitions for the unified node model
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
// Node Type Hierarchy
// =============================================================================

export type NodeType =
  // Items (have children, navigable)
  | "folder"
  | "file"
  | "section"
  // Blocks (content leaves)
  | "paragraph"
  | "quote"
  | "code"
  | "ul"
  | "ol"
  | "task"
  | "table"
  | "hr"
  | "html"
  // Special
  | "agent"
  | "board"
  | "embed"

// =============================================================================
// Task Status and Marks
// =============================================================================

export type TaskStatus =
  | "todo" // [ ] — available to work on
  | "wip" // [/] — actively being worked on
  | "blocked" // [!] — waiting on something/someone
  | "done" // [x] — completed
  | "dropped" // [-] — cancelled, won't do

export type TaskMark = " " | "x" | "X" | "!" | "-" | "/"

export const CUSTOM_TASK_MARKS = ["/", "-", "!"] as const
export const TASK_MARK_REGEX_CLASS = "[ xX/\\-!]"

/**
 * Get the markdown checkbox mark for a task status.
 * Maps TaskStatus → TaskMark for markdown rendering.
 */
export function getMarkForStatus(status: TaskStatus): TaskMark {
  switch (status) {
    case "done":
      return "x"
    case "wip":
      return "/"
    case "blocked":
      return "!"
    case "dropped":
      return "-"
    default:
      return " "
  }
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
// Node Rules
// =============================================================================

export interface NodeRules {
  add?: string // Query to auto-pull matching tasks
  sync?: string // Bidirectional field sync (e.g., "status:blocked")
  collapse?: boolean // Start collapsed
  limit?: number // WIP limit
  default?: boolean // Default column for new items
  color?: string // Board/section color (cyan, yellow, magenta, etc.)
}

// =============================================================================
// KNode - Unified Node Type
// =============================================================================

/**
 * KNode - the unified node type for km
 *
 * This is the single node type used across all layers:
 * - Storage: stored in SQLite with snake_case columns
 * - Tree: extended with `children[]` and `depth` as TNode
 * - Board: used directly with foldedNodes/selectedNodes Sets for UI state
 *
 * ## Task Definition
 *
 * A node is considered a "task" (for querying and workflow purposes) if it has
 * a `task_status` property set, regardless of its `type`. This means:
 *
 * - `type: "task"` - checkbox-originated items (e.g., `- [ ] item`)
 * - Any other type with `task_status` - can participate in task workflows
 *
 * Query behavior:
 * - `type:task` - only checkbox-originated nodes
 * - `status:todo` or `task_status:todo` - any node with that status
 */
export interface KNode {
  id: string // ULID
  type: NodeType
  parent_id: string | null
  parent_idx: number
  link_to: string | null // Target node ID for embeddings (![[...]])
  link_alias?: string // Optional display alias from |alias syntax

  // Filesystem mapping (for folder/file)
  fs_path?: string
  fs_ino?: number // Inode for rename detection
  fs_mtime?: number // File modification time at last sync (milliseconds)

  // Identity
  name?: string // Slug/identifier (filename without .md, or md_slug for sections)

  // Markdown mapping (for sections/blocks)
  md_pos?: number // Byte offset in file
  md_line?: number // Line number in file (0-indexed)
  md_slug?: string // Heading slug (for sections) - DEPRECATED: use name instead

  // Task properties (can be set on any node type, not just type: "task")
  // A node with task_status is considered a "task" for workflow purposes
  task_status?: TaskStatus
  task_mark?: TaskMark // Only meaningful for type: "task" (checkbox nodes)
  assigned_to?: string
  due_date?: string // YYYY-MM-DD
  scheduled_date?: string
  priority?: number // 1-5
  recurrence?: string // iCal RRULE format
  recur_prev?: string // Previous recurrence instance ID

  // Content
  content?: string // Text content (inline for small)
  content_hash?: string // CAS reference for large content
  title?: string // Display title (for sections: heading without rules)

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
  isTask: boolean // Computed: task_status !== undefined

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
  link_to?: string | null
  link_alias?: string
  fs_path?: string
  fs_ino?: number
  fs_mtime?: number
  name?: string
  md_pos?: number
  md_line?: number
  md_slug?: string
  task_status?: TaskStatus
  task_mark?: TaskMark
  assigned_to?: string
  due_date?: string
  scheduled_date?: string
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

// Dependency types (for tasks)
export interface Dependency {
  type: "blocks" | "blocked_by" | "parent" | "related" | "waits_for"
  target_id: string
}

// Config types
export interface KmConfig {
  watch: {
    debounce_fs: number
    debounce_apply: number
    ignore: string[]
    conflict_strategy: "last_write_wins" | "fs_wins" | "db_wins" | "merge"
    folder_content: string[]
  }
  defaults: {
    list_sort: string
    list_status: string[]
    tree_depth: number
    board_columns: string[]
  }
  tui: {
    theme: "dark" | "light"
    icons: boolean
    vim_keys: boolean
  }
  editor: string
}
