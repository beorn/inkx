import TurndownService from "turndown"

export const ASANA_BASE = "https://app.asana.com/api/1.0"
export const TASK_FIELDS =
  "name,notes,html_notes,completed,completed_at,created_at,modified_at,due_on,due_at,start_on,assignee.name,tags.name,custom_fields,memberships.project.name,memberships.section.name,num_subtasks,permalink_url,resource_subtype,assignee_section.name,parent.gid,parent.name,dependencies,dependents,is_rendered_as_separator,external"

/** Convert Asana HTML notes to markdown */
export const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
})

// Turndown's built-in escape handles CommonMark special chars (*, [, ], _, `, #, >, \)
// but NOT GFM strikethrough (~~). Since km's parser uses GFM extensions, we need to
// also escape tildes so `~~text~~` in plain HTML text doesn't become strikethrough.
const originalEscape = turndown.escape.bind(turndown)
turndown.escape = function (str: string): string {
  // First apply Turndown's built-in CommonMark escaping
  const escaped = originalEscape(str)
  // Then escape GFM strikethrough: ~~ → \~\~
  return escaped.replace(/~~/g, "\\~\\~")
}

// Asana html_notes uses <h1>/<h2>/etc. tags. Turndown's default ATX conversion
// produces `# Heading` markdown, which km's parser interprets as new sections —
// splitting one task's description into multiple items on re-parse.
// Convert heading tags to **bold text** instead to preserve the visual emphasis
// without creating structural headings.
turndown.addRule("headings-to-bold", {
  filter: ["h1", "h2", "h3", "h4", "h5", "h6"],
  replacement: (content) => {
    const trimmed = content.trim()
    if (!trimmed) return ""
    return `\n\n**${trimmed}**\n\n`
  },
})

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
  custom_fields?: Array<{
    name: string
    number_value?: number | null
    text_value?: string | null
    display_value?: string | null
    enum_value?: { name?: string } | null
    multi_enum_values?: Array<{ name?: string }> | null
  }>
  num_subtasks?: number
  permalink_url?: string
  resource_subtype?: string
  memberships?: Array<{
    project?: { gid: string; name?: string }
    section?: { gid: string; name?: string }
  }>
  /** Section in the assignee's My Tasks list (only returned for the authenticated user's tasks) */
  assignee_section?: { gid: string; name?: string }
  /** Parent task (if this is a subtask) */
  parent?: { gid: string; name?: string } | null
  /** Tasks this task depends on */
  dependencies?: Array<{ gid: string; name?: string }>
  /** Tasks that depend on this task */
  dependents?: Array<{ gid: string; name?: string }>
  /** Whether this task is rendered as a section separator in Asana */
  is_rendered_as_separator?: boolean
  /** External integration data */
  external?: { gid?: string; data?: string } | null
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
