export interface Issue {
  id: string // Full node ID (ULID)
  shortId: string // Short ID (km-xxxx)
  title: string
  description?: string // Full description/content
  status: "todo" | "wip" | "blocked" | "done" | "dropped"
  priority: string // Free-form string (e.g., "P0"-"P4", "high", "A")
  type?: string // bug, feature, epic, task, docs (issue_type in bd)
  assignee?: string
  blockedBy?: string[] // Short IDs of blockers
  createdAt: number
  updatedAt: number
  // Path/context fields for bd compatibility
  path?: string // File path (from fs_path or parent's fs_path)
  parentContext?: string // Parent section/file name for embedded nodes
  // bd-compatible fields
  createdBy?: string // Author
  dependencyCount?: number // Number of issues this depends on
  dependentCount?: number // Number of issues that depend on this
}

/**
 * Minimal filesystem interface for DI.
 *
 * Consumers inject this so km-beads never imports node:fs directly,
 * keeping filesystem access in the storage layer (or test doubles).
 */
export interface BeadsFs {
  existsSync(path: string): boolean
  readFileSync(path: string, encoding: "utf-8"): string
  writeFileSync(path: string, content: string, encoding: "utf-8"): void
  mkdirSync(path: string, options: { recursive: boolean }): void
}

export interface IssueFilter {
  status?: string | string[]
  priority?: string
  type?: string
  assignee?: string
  blocked?: boolean
}

export interface CreateIssueOptions {
  type?: string
  priority?: string
  assignee?: string
  labels?: string[]
  customId?: string // Custom short ID
  parentId?: string // For sub-issues
  path?: string // Where to create
  description?: string // Body text (created as child paragraph)
  notes?: string // Additional notes (created as child paragraph after description)
}
