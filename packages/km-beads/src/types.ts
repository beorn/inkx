export interface Issue {
  id: string // Full node ID (ULID)
  shortId: string // Short ID (km-xxxx)
  title: string
  description?: string // Full description/content
  status: "todo" | "wip" | "blocked" | "done" | "dropped"
  priority: number // 0-4 (P0=critical to P4=backlog)
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

export interface IssueFilter {
  status?: string | string[]
  priority?: number
  type?: string
  assignee?: string
  blocked?: boolean
}

export interface CreateIssueOptions {
  type?: string
  priority?: number
  assignee?: string
  labels?: string[]
  customId?: string // Custom short ID
  parentId?: string // For sub-issues
  path?: string // Where to create
}
