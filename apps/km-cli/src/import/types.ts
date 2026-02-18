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
}

/** A single importable item (task, note, etc.) */
export interface ImportItem {
  sourceId: string
  title: string
  body?: string
  status?: "todo" | "done" | "wip" | "blocked" | "dropped"
  createdAt?: string
  modifiedAt?: string
  completedAt?: string
  dueAt?: string
  startAt?: string
  priority?: number
  assignee?: string
  tags?: string[]
  /** Projects this item belongs to (for multi-project membership) */
  projects?: string[]
  /** Permalink URL from the source system */
  permalink?: string
  /** Whether this item is a milestone (vs a regular task) */
  milestone?: boolean
  comments?: ImportComment[]
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
  metadata?: Record<string, unknown>
}

/** Top-level import data from any source */
export interface ImportData {
  source: string
  fetchedAt: string
  workspace?: string
  projects: ImportProject[]
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
