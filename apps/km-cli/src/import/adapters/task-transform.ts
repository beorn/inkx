import type { AsanaClient } from "./asana-client.ts"
import type { AsanaApiTask } from "./asana-types.ts"
import { TASK_FIELDS, turndown } from "./asana-types.ts"
import { fetchComments } from "./comment-filter.ts"
import type { ImportItem, ImportAttachment } from "../types.ts"

/** Convert Asana task to ImportItem */
export function toImportItem(task: AsanaApiTask): ImportItem {
  const item: ImportItem = {
    sourceId: task.gid,
    title: task.name,
    status: task.completed ? "done" : "todo",
  }

  // Prefer html_notes (rich text) over plain notes
  if (task.html_notes?.trim()) {
    const md = turndown.turndown(task.html_notes).trim()
    if (md) item.body = md
  } else if (task.notes?.trim()) {
    item.body = task.notes.trim()
  }
  if (task.created_at) item.createdAt = task.created_at
  if (task.modified_at) item.modifiedAt = task.modified_at
  if (task.completed_at) item.completedAt = task.completed_at
  if (task.permalink_url) item.permalink = task.permalink_url
  if (task.resource_subtype === "milestone") item.milestone = true
  if (task.due_on) item.dueAt = task.due_on
  else if (task.due_at) item.dueAt = task.due_at
  if (task.start_on) item.startAt = task.start_on
  if (task.assignee?.name) item.assignee = task.assignee.name.replace(/\s+/g, "-").toLowerCase()
  if (task.tags?.length) {
    item.tags = task.tags.filter((t) => t.name).map((t) => t.name!.replace(/\s+/g, "-").toLowerCase())
    if (item.tags.length === 0) delete item.tags
  }

  // Multi-project membership -> projects list
  if (task.memberships && task.memberships.length > 0) {
    const projectNames = task.memberships
      .map((m) => m.project?.name)
      .filter((n): n is string => !!n)
    if (projectNames.length > 0) {
      item.projects = [...new Set(projectNames)]
    }
  }

  const priorityField = task.custom_fields?.find(
    (f) => f.name.toLowerCase() === "priority" && f.number_value != null,
  )
  if (priorityField?.number_value) {
    item.priority = Math.max(1, Math.min(4, priorityField.number_value))
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
    }>
  >(`/tasks/${taskGid}/attachments`, { opt_fields: "name,download_url,permanent_url,view_url,host" })

  return attachments.map((a) => ({
    sourceId: a.gid,
    name: a.name,
    url: a.download_url ?? a.permanent_url ?? a.view_url ?? "",
    type: isImageName(a.name) ? "image" : a.host === "asana" ? "file" : "link",
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

/** Enrich a single task with comments, attachments, subtasks (all parallel) */
export async function enrichItem(
  client: AsanaClient,
  task: AsanaApiTask,
  opts?: EnrichOpts,
): Promise<ImportItem> {
  const item = toImportItem(task)
  const [comments, attachments, children] = await Promise.all([
    opts?.comments ? fetchComments(client, task.gid, { includeLogs: opts.commentLogs }) : undefined,
    opts?.attachments ? fetchAttachments(client, task.gid) : undefined,
    task.num_subtasks && task.num_subtasks > 0 ? fetchSubtasks(client, task.gid, opts) : undefined,
  ])
  if (comments?.length) item.comments = comments
  if (attachments?.length) item.attachments = attachments
  if (children) item.children = children
  return item
}

/** Recursively fetch subtasks with optional comments/attachments */
export async function fetchSubtasks(
  client: AsanaClient,
  taskGid: string,
  opts?: EnrichOpts,
): Promise<ImportItem[]> {
  const subtasks = await client.get<AsanaApiTask[]>(
    `/tasks/${taskGid}/subtasks`,
    { opt_fields: TASK_FIELDS },
  )

  return Promise.all(subtasks.map((sub) => enrichItem(client, sub, opts)))
}
