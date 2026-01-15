/**
 * km Node Types
 * Core type definitions for the event-sourced data model
 */

// Node type hierarchy
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
  | "board";

// Task status workflow
// Status answers: "Can I work on this?" and "What's the current state?"
export type TaskStatus =
  | "todo" // [ ] — available to work on
  | "wip" // [/] — actively being worked on
  | "blocked" // [!] — waiting on something/someone
  | "done" // [x] — completed
  | "dropped"; // [-] — cancelled, won't do

// Task checkbox marks
export type TaskMark = " " | "x" | "X" | "!" | "-" | "/";

// Column/section rules (parsed from inline attributes like add="..." sync=...)
export interface NodeRules {
  add?: string; // Query to auto-pull matching tasks
  sync?: string; // Bidirectional field sync (e.g., "status:blocked")
  collapse?: boolean; // Start collapsed
  limit?: number; // WIP limit
  default?: boolean; // Default column for new items
}

/**
 * Core Node interface - everything is a node
 */
export interface Node {
  id: string; // ULID
  type: NodeType;
  parent_id: string | null;
  parent_idx: number;
  symlink_to: string | null; // Reference to another node

  // Filesystem mapping (for folder/file)
  fs_path?: string;
  fs_ino?: number; // Inode for rename detection

  // Markdown mapping (for sections/blocks)
  md_pos?: number; // Byte offset in file
  md_line?: number; // Line number in file (0-indexed)
  md_slug?: string; // Heading slug (for sections)

  // Task properties
  task_status?: TaskStatus;
  task_mark?: TaskMark;
  assigned_to?: string;
  due_date?: string; // YYYY-MM-DD
  scheduled_date?: string;
  priority?: number; // 1-5
  recurrence?: string; // iCal RRULE format
  recur_prev?: string; // Previous recurrence instance ID

  // Content
  content?: string; // Text content (inline for small)
  content_hash?: string; // CAS reference for large content
  title?: string; // Display title (for sections: heading without rules)

  // Column/section rules (parsed from inline attributes)
  rules?: NodeRules;

  // Metadata
  data: Record<string, unknown>;
  created_at: number;
  updated_at: number;
  version: string; // Last event ID that modified this
}

// Event types
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
  | "conflict_created";

/**
 * Event structure - immutable record of a change
 */
export interface Event {
  id: string; // ULID (globally unique, sortable)
  type: EventType;
  actor: string; // Who caused this (user, agent, 'system', 'fs-watch')
  target?: string; // What it affects (node ID)
  data: Record<string, unknown>;
  ts: number; // Unix milliseconds
}

// Event data types for type safety
export interface NodeCreatedData {
  id: string;
  type: NodeType;
  parent_id?: string | null;
  parent_idx?: number;
  symlink_to?: string | null;
  fs_path?: string;
  fs_ino?: number;
  md_pos?: number;
  md_line?: number;
  md_slug?: string;
  task_status?: TaskStatus;
  task_mark?: TaskMark;
  assigned_to?: string;
  due_date?: string;
  scheduled_date?: string;
  priority?: number;
  content?: string;
  content_hash?: string;
  title?: string;
  rules?: NodeRules;
  data?: Record<string, unknown>;
}

export interface NodeUpdatedData {
  [key: string]: unknown;
}

export interface NodeMovedData {
  parent_id: string | null;
  parent_idx?: number;
}

export interface SessionStartedData {
  session_id: string;
  model: string;
  system_prompt_hash?: string;
}

export interface SessionMessageData {
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokens?: number;
}

export interface SessionToolCallData {
  session_id: string;
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  tokens?: number;
}

export interface SessionEndedData {
  session_id: string;
  status: "success" | "error" | "cancelled";
  total_tokens?: number;
  cost_usd?: number;
  files_modified?: string[];
  summary?: string;
  error?: string;
}

// Dependency types (for tasks)
export interface Dependency {
  type: "blocks" | "blocked_by" | "parent" | "related" | "waits_for";
  target_id: string;
}

// Config types
export interface KmConfig {
  watch: {
    debounce_fs: number;
    debounce_apply: number;
    ignore: string[];
    conflict_strategy: "last_write_wins" | "fs_wins" | "db_wins" | "merge";
    folder_content: string[];
  };
  defaults: {
    list_sort: string;
    list_status: string[];
    tree_depth: number;
    board_columns: string[];
  };
  tui: {
    theme: "dark" | "light";
    icons: boolean;
    vim_keys: boolean;
  };
  editor: string;
}
