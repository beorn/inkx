import type { AsanaClient } from "./asana-client.ts"
import type { AsanaApiTask } from "./asana-types.ts"
import { TASK_FIELDS, turndown } from "./asana-types.ts"
import { fetchComments } from "./comment-filter.ts"
import type { FetchCommentsResult } from "./comment-filter.ts"
import type { ImportItem, ImportAttachment } from "../../types.ts"

/** Pattern matching `→ ^numericId` at end of string (Asana recurring task parent ref) */
const BLOCKREF_SUFFIX_RE = /\s*→\s*\^(\d+)\s*$/

/** Strip `→ ^numericId` pattern from text (can appear anywhere in body content) */
const BLOCKREF_INLINE_RE = /\s*→\s*\^\d+/g

/** Fix escaped underscores in URLs. Turndown escapes _ to \_ in text nodes,
 * which breaks URLs when they appear as link display text or bare URLs. */
function unescapeUrlUnderscores(md: string): string {
  // Fix in markdown link text: [url\_with\_underscores](url) → [url_with_underscores](url)
  let result = md.replace(/\[([^\]]*\\\_[^\]]*)\]\(/g, (match, text) => {
    return `[${text.replace(/\\_/g, "_")}](`
  })
  // Fix in bare URLs: https://...\_... → https://..._...
  result = result.replace(/(https?:\/\/\S*)\\_/g, (match) => match.replace(/\\_/g, "_"))
  return result
}

/** Convert Asana task to ImportItem */
export function toImportItem(task: AsanaApiTask): ImportItem {
  // Strip → ^numericId suffix from task name (Asana recurring task parent reference)
  const blockRefMatch = task.name.match(BLOCKREF_SUFFIX_RE)
  const cleanName = blockRefMatch ? task.name.replace(BLOCKREF_SUFFIX_RE, "") : task.name

  const item: ImportItem = {
    sourceId: task.gid,
    title: cleanName,
    status: task.completed ? "done" : "todo",
  }

  // Store the referenced parent task GID if found
  if (blockRefMatch) {
    item.metadata = { ...item.metadata, parentTaskGid: blockRefMatch[1] }
  }

  // Prefer html_notes (rich text) over plain notes
  if (task.html_notes?.trim()) {
    let md = turndown.turndown(preprocessAsanaHtml(task.html_notes)).trim()
    md = unescapeUrlUnderscores(md)
    if (md) item.body = md.replace(BLOCKREF_INLINE_RE, "")
  } else if (task.notes?.trim()) {
    item.body = task.notes.trim().replace(BLOCKREF_INLINE_RE, "")
  }
  if (task.created_at) item.createdAt = task.created_at
  if (task.modified_at) item.modifiedAt = task.modified_at
  if (task.completed_at) item.completedAt = task.completed_at
  if (task.permalink_url) item.permalink = task.permalink_url
  if (task.resource_subtype === "milestone") item.milestone = true
  if (task.due_on) item.dueAt = task.due_on
  else if (task.due_at) item.dueAt = task.due_at
  if (task.start_on) item.startAt = task.start_on
  if (task.assignee?.name) {
    item.assignee = task.assignee.name.replace(/\s+/g, "-").toLowerCase()
  }
  if (task.tags?.length) {
    item.tags = [
      ...new Set(
        task.tags
          .map((t) => t.name)
          .filter((name): name is string => !!name)
          .map((name) =>
            name
              .replace(/^@\s*/, "") // Strip Asana GTD context prefix (e.g. "@ US" → "US")
              .replace(/\s+/g, "-")
              .toLowerCase(),
          ),
      ),
    ]
    if (item.tags.length === 0) delete item.tags
  }

  // Multi-project membership -> projects list + rich memberships with section context
  if (task.memberships && task.memberships.length > 0) {
    const projectNames = task.memberships.map((m) => m.project?.name).filter((n): n is string => !!n)
    if (projectNames.length > 0) {
      item.projects = [...new Set(projectNames)]
    }
    const memberships = task.memberships
      .filter((m) => m.project?.name)
      .map((m) => ({
        project: m.project!.name!,
        ...(m.section?.name ? { section: m.section.name } : {}),
      }))
    if (memberships.length > 0) {
      item.projectMemberships = memberships
    }
  }

  // Extract priority from custom fields
  const priorityField = task.custom_fields?.find((f) => f.name.toLowerCase() === "priority" && f.number_value != null)
  if (priorityField?.number_value) {
    item.priority = Math.max(1, Math.min(4, priorityField.number_value))
  }

  // Store all custom fields with values in metadata
  if (task.custom_fields?.length) {
    const customFields: Record<string, string | number> = {}
    for (const cf of task.custom_fields) {
      if (cf.display_value != null) {
        customFields[cf.name] = cf.display_value
      } else if (cf.number_value != null) {
        customFields[cf.name] = cf.number_value
      } else if (cf.text_value) {
        customFields[cf.name] = cf.text_value
      } else if (cf.enum_value?.name) {
        customFields[cf.name] = cf.enum_value.name
      } else if (cf.multi_enum_values?.length) {
        customFields[cf.name] = cf.multi_enum_values
          .map((v) => v.name)
          .filter(Boolean)
          .join(", ")
      }
    }
    if (Object.keys(customFields).length > 0) {
      item.metadata = { ...item.metadata, customFields }
    }
  }

  // Parent task info
  if (task.parent?.gid) {
    item.metadata = {
      ...item.metadata,
      parentGid: task.parent.gid,
      parentName: task.parent.name,
    }
  }

  // Dependencies and dependents
  if (task.dependencies?.length) {
    item.metadata = {
      ...item.metadata,
      dependencies: task.dependencies.map((d) => ({
        gid: d.gid,
        name: d.name,
      })),
    }
  }
  if (task.dependents?.length) {
    item.metadata = {
      ...item.metadata,
      dependents: task.dependents.map((d) => ({ gid: d.gid, name: d.name })),
    }
  }

  // Section separator — store flag so TUI can render as HR
  if (task.is_rendered_as_separator) {
    item.metadata = { ...item.metadata, isSeparator: true }
  }

  // Assignee section (for My Tasks grouping)
  if (task.assignee_section?.name) {
    item.metadata = { ...item.metadata, assigneeSectionName: task.assignee_section.name }
  }

  // External integration data
  if (task.external) {
    item.metadata = { ...item.metadata, external: task.external }
  }

  return item
}

/** Fetch attachments for a task */
export async function fetchAttachments(client: AsanaClient, taskGid: string): Promise<ImportAttachment[]> {
  const attachments = await client.get<
    Array<{
      gid: string
      name: string
      download_url?: string
      permanent_url?: string
      view_url?: string
      host?: string
      created_at?: string
    }>
  >(`/tasks/${taskGid}/attachments`, {
    opt_fields: "name,download_url,permanent_url,view_url,host,created_at",
  })

  return attachments.map((a) => ({
    sourceId: a.gid,
    name: a.name,
    url: a.download_url ?? a.permanent_url ?? a.view_url ?? "",
    type: isImageName(a.name) ? "image" : a.host === "asana" ? "file" : "link",
    createdAt: a.created_at,
  }))
}

function isImageName(name: string): boolean {
  return /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(name)
}

export interface EnrichOpts {
  comments?: boolean
  attachments?: boolean
  commentLogs?: boolean
}

/** Enrich a single task with comments, activity log, attachments, subtasks (all parallel) */
export async function enrichItem(client: AsanaClient, task: AsanaApiTask, opts?: EnrichOpts): Promise<ImportItem> {
  const item = toImportItem(task)
  const [commentsResult, attachments, children] = await Promise.all([
    opts?.comments
      ? fetchComments(client, task.gid, {
          includeLogs: opts.commentLogs,
          includeActivity: true,
        })
      : undefined,
    opts?.attachments ? fetchAttachments(client, task.gid) : undefined,
    task.num_subtasks && task.num_subtasks > 0 ? fetchSubtasks(client, task.gid, opts) : undefined,
  ])
  if (commentsResult) {
    const result = commentsResult as FetchCommentsResult
    if (result.comments?.length) item.comments = result.comments
    if (result.activityLog?.length) item.activityLog = result.activityLog
  }
  if (attachments?.length) item.attachments = attachments
  if (children) item.children = children
  return item
}

/** Recursively fetch subtasks with optional comments/attachments */
export async function fetchSubtasks(client: AsanaClient, taskGid: string, opts?: EnrichOpts): Promise<ImportItem[]> {
  const subtasks = await client.get<AsanaApiTask[]>(`/tasks/${taskGid}/subtasks`, { opt_fields: TASK_FIELDS })

  return Promise.all(subtasks.map((sub) => enrichItem(client, sub, opts)))
}

/**
 * Preprocess Asana html_notes before turndown conversion.
 * Asana uses bare \n for line breaks in html_notes, but HTML spec treats \n as
 * insignificant whitespace. Turndown correctly collapses them, losing line breaks.
 * Fix: convert \n to <br> while preserving structural whitespace between tags.
 */
function preprocessAsanaHtml(html: string): string {
  let result = html.replace(/\n/g, "<br>\n")
  // Remove <br> between tags (structural whitespace, e.g. </li>\n<li>)
  result = result.replace(/><br>\n</g, ">\n<")
  // Collapse double <br> from existing <br>\n -> <br><br>\n
  result = result.replace(/<br><br>/g, "<br>")
  return result
}
