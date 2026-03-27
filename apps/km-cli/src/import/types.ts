/**
 * Import Pipeline — Shared Types
 *
 * Intermediate format for the 4-stage import pipeline:
 *   Stage 1: Fetch (source → ImportData)
 *   Stage 2: Download attachments (URLs → local files, cached by sourceId)
 *   Stage 3: Convert (ImportData → FileMap)
 *   Stage 4: Write (FileMap → disk)
 */

/** A comment on an item */
export interface ImportComment {
  author?: string
  createdAt: string
  text: string
}

/** An attachment on an item */
export interface ImportAttachment {
  sourceId?: string
  name: string
  url: string
  /** Local path after download (replaces url in markdown output) */
  localPath?: string
  /** "image", "file", "link" */
  type?: string
  /** Original creation timestamp (ISO 8601) from the source system */
  createdAt?: string
  /** Parent item sourceId (for inline images that need re-fetching via parent task) */
  parentSourceId?: string
}

/** A single importable item (task, note, etc.) */
export interface ImportItem {
  sourceId: string
  title: string
  body?: string
  /** Raw HTML from source (for re-conversion with current pipeline) */
  htmlBody?: string
  status?: "todo" | "done" | "wip" | "blocked" | "dropped"
  createdAt?: string
  modifiedAt?: string
  completedAt?: string
  dueAt?: string
  startAt?: string
  priority?: string
  assignee?: string
  tags?: string[]
  /** Projects this item belongs to (for multi-project membership) */
  projects?: string[]
  /** Rich project memberships with section context (e.g., from Asana) */
  projectMemberships?: Array<{ project: string; section?: string }>
  /** Permalink URL from the source system */
  permalink?: string
  /** Whether this item is a milestone (vs a regular task) */
  milestone?: boolean
  /** Recurrence rule: RRULE string with optional FROM=DUE (e.g., "FREQ=WEEKLY;BYDAY=MO;FROM=DUE") */
  rrule?: string
  comments?: ImportComment[]
  /** System activity log entries (e.g., task moved, completed, field changed) */
  activityLog?: ImportComment[]
  attachments?: ImportAttachment[]
  children?: ImportItem[]
  metadata?: Record<string, unknown>
}

/** A section within a project (e.g. Asana section) */
export interface ImportSection {
  sourceId: string
  title: string
  items: ImportItem[]
}

/** A status update on a project (periodic health report) */
export interface ImportStatusUpdate {
  title: string
  text: string
  color: string
  author?: string
  createdAt?: string
  modifiedAt?: string
}

/** A custom field definition on a project */
export interface ImportCustomFieldDef {
  name: string
  type: string
  description?: string
  precision?: number
  enumOptions?: string[]
}

/** A project containing sections and/or loose items */
export interface ImportProject {
  sourceId: string
  title: string
  createdAt?: string
  modifiedAt?: string
  owner?: string
  team?: string
  workspace?: string
  sections?: ImportSection[]
  items?: ImportItem[]
  /** Project status updates (periodic health reports) */
  statusUpdates?: ImportStatusUpdate[]
  /** Custom field definitions (types, enum options, etc.) */
  customFieldSettings?: ImportCustomFieldDef[]
  metadata?: Record<string, unknown>
}

/** Top-level import data from any source */
export interface ImportData {
  source: string
  fetchedAt: string
  workspace?: string
  projects: ImportProject[]
  users?: Array<{ name: string; gid: string; email?: string }>
  teams?: Array<{ name: string; gid: string }>
  /** GID of the user who performed the Asana export (their My Tasks stays at top level) */
  importingUserGid?: string
}

/** Map of relative file paths to markdown content */
export type FileMap = Map<string, string>

/** Config for a specific import source */
export interface ImportConfig {
  asana?: {
    token: string
    defaultWorkspace?: string
  }
}
