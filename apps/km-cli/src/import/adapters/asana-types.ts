import TurndownService from "turndown"

export const ASANA_BASE = "https://app.asana.com/api/1.0"
export const TASK_FIELDS = "name,notes,html_notes,completed,completed_at,created_at,modified_at,due_on,due_at,start_on,assignee.name,tags.name,custom_fields,memberships.project.name,memberships.section.name,num_subtasks,permalink_url,resource_subtype"

/** Convert Asana HTML notes to markdown */
export const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" })

/** Asana task shape from API */
export interface AsanaApiTask {
  gid: string
  name: string
  notes?: string
  html_notes?: string
  completed?: boolean
  completed_at?: string
  created_at?: string
  modified_at?: string
  due_on?: string
  due_at?: string
  start_on?: string
  assignee?: { name?: string } | null
  tags?: Array<{ name?: string }>
  custom_fields?: Array<{ name: string; number_value?: number | null }>
  num_subtasks?: number
  permalink_url?: string
  resource_subtype?: string
  memberships?: Array<{
    project?: { gid: string; name?: string }
    section?: { gid: string; name?: string }
  }>
}

export interface FetchOptions {
  token: string
  /** Directory to save per-project JSON files (also used for resume) */
  downloadDir: string
  projectFilter?: string
  includeCompleted?: boolean
  includeComments?: boolean
  includeAttachments?: boolean
  /** Include system/audit-log comments (e.g., "moved this Task", "completed this task") */
  includeCommentLogs?: boolean
  /** Fetch per-user My Tasks lists (orphan tasks not in any project) */
  includeUserTaskLists?: boolean
  /** Fetch per-tag task lists (tasks grouped by tag) */
  includeTagTaskLists?: boolean
  workspace?: string
  /** Record raw API responses for test fixtures */
  record?: boolean
}

export interface FetchResult {
  data: ImportData
  /** Raw API responses (only when record: true) */
  recorded?: RecordedCall[]
}

/** Resolved workspace info from Asana auth */
export interface AsanaWorkspace {
  gid: string
  name: string
  user: { gid: string; name: string; email: string }
  allWorkspaces: Array<{ gid: string; name: string }>
}

/** Project info returned by listAsanaStructure */
export interface AsanaProjectInfo {
  gid: string
  name: string
  archived?: boolean
  team?: string
  owner?: string
  members?: string[]
  notes?: string
}

/** Recorded API call for test fixtures */
export interface RecordedCall {
  path: string
  params?: Record<string, string>
  response: unknown
}

import type { ImportData } from "../types.ts"
