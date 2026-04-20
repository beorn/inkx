/**
 * Beads Mutation Functions
 *
 * Create, update, and close issues.
 */

import { ulid } from "ulid"
import type { KNode } from "@km/core"
import { getMarkerForStatus } from "@km/core"
import type { Issue, CreateIssueOptions } from "./types.ts"
import { generateShortId, generateCustomId, generateSubId } from "./short-ids.ts"

/**
 * Create a new issue.
 *
 * Returns a detached KNode tree (node + optional description/notes children).
 * Callers pass the node to `repo.addNode(parentId, node)` which persists
 * through the `@km/storage` emitter down to the markdown file.
 */
export function createIssueNode(
  title: string,
  options: CreateIssueOptions = {},
): { node: KNode; shortId: string; children: KNode[] } {
  const now = Date.now()
  const id = ulid()

  // Generate short ID
  let shortId: string
  if (options.customId) {
    shortId = generateCustomId(options.customId)
  } else if (options.parentId) {
    // For sub-issues, we'd need to query existing children
    // For now, use timestamp-based suffix
    const childNum = Math.floor(Date.now() % 1000)
    shortId = generateSubId(options.parentId, childNum)
  } else {
    shortId = generateShortId()
  }

  // Build content with metadata
  let content = title

  // Add type tag
  if (options.type) {
    content += ` #${options.type}`
  }

  // Add priority tag
  const priority = options.priority ?? "P2"
  content += ` #${priority}`

  // Add assignee
  if (options.assignee) {
    content += ` @${options.assignee}`
  }

  // Add additional labels
  if (options.labels) {
    for (const label of options.labels) {
      content += ` #${label}`
    }
  }

  // Add @issue marker for queryability
  content += " @issue"

  const node: KNode = {
    id,
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    parent_id: null, // Will be set based on path
    parent_idx: 0,
    content,
    priority,
    data: {
      short_id: shortId,
      tags: [options.type, priority, ...(options.labels || [])].filter(Boolean),
      mentions: options.assignee ? [options.assignee] : [],
    },
    created_at: now,
    updated_at: now,
    version: "",
  }

  // Build child nodes for description and notes
  const children: KNode[] = []
  if (options.description) {
    children.push({
      id: ulid(),
      type: "p",
      parent_id: id,
      parent_idx: 0,
      content: options.description,
      data: {},
      created_at: now,
      updated_at: now,
      version: "",
    })
  }
  if (options.notes) {
    children.push({
      id: ulid(),
      type: "p",
      parent_id: id,
      parent_idx: children.length,
      content: options.notes,
      data: {},
      created_at: now,
      updated_at: now,
      version: "",
    })
  }

  return { node, shortId, children }
}

/**
 * Update issue fields
 *
 * Returns a partial node with updated fields. Callers merge this via
 * repo.updateNode(id, updates) — which routes columns (content,
 * priority, item, assigned_to) to the SQL schema and patches the `data`
 * blob for sigil-mirrored tags/mentions.
 */
export interface UpdateIssueChanges {
  status?: Issue["status"]
  priority?: string
  assignee?: string
  title?: string
  type?: string
  /** Current sigil tags from the node's data blob (for in-place update). */
  currentTags?: string[]
  /** Current @mentions from the node's data blob. */
  currentMentions?: string[]
}

export function updateIssueFields(issue: Issue, changes: UpdateIssueChanges): Partial<KNode> {
  const updates: Partial<KNode> = {
    updated_at: Date.now(),
  }

  if (changes.status !== undefined) {
    updates.item = { task: { status: changes.status, marker: getMarkerForStatus(changes.status) } }
  }

  if (changes.priority !== undefined) {
    updates.priority = changes.priority
  }

  if (changes.title !== undefined) {
    updates.content = changes.title
  }

  if (changes.assignee !== undefined) {
    updates.assigned_to = changes.assignee
  }

  // Sync the derived `data` blob so stale sigil tags / mentions don't out-vote
  // the authoritative column values on the next read. We only emit a `data`
  // patch when something actually changed — otherwise other fields in the
  // blob (short_id, props, propsRaw, …) would be erased by this partial write.
  const dataPatch: Record<string, unknown> = {}
  if (changes.priority !== undefined || changes.type !== undefined) {
    // `currentTags` is mandatory for priority/type updates — the caller must
    // read the node's `data.tags` and pass them through. Defaults to a
    // best-guess from the Issue's known fields when not supplied.
    const currentTags =
      changes.currentTags ??
      [issue.type, issue.priority].filter((t): t is string => typeof t === "string" && t.length > 0)
    const nextTags = rewriteTypeAndPriorityTags(currentTags, {
      priority: changes.priority,
      type: changes.type,
    })
    dataPatch.tags = nextTags
  }
  if (changes.assignee !== undefined) {
    const currentMentions = changes.currentMentions ?? (issue.assignee ? [issue.assignee] : [])
    dataPatch.mentions = rewriteAssigneeMentions(currentMentions, issue.assignee, changes.assignee)
  }
  if (Object.keys(dataPatch).length > 0) {
    updates.data = dataPatch
  }

  return updates
}

/**
 * Replace any existing P0–P4 tag and/or the current type tag with the new
 * values. Preserves unrelated tags (e.g. `frontend`, `urgent`) unchanged.
 */
function rewriteTypeAndPriorityTags(tags: string[], next: { priority?: string; type?: string }): string[] {
  const typeKeywords = new Set(["bug", "feature", "epic", "task", "docs", "question"])
  const filtered = tags.filter((t) => {
    if (next.priority !== undefined && /^P[0-4]$/i.test(t)) return false
    if (next.type !== undefined && typeKeywords.has(t.toLowerCase())) return false
    return true
  })
  if (next.type !== undefined) filtered.push(next.type)
  if (next.priority !== undefined) filtered.push(next.priority)
  return filtered
}

/** Swap the old assignee for the new one, leaving other mentions intact. */
function rewriteAssigneeMentions(mentions: string[], oldAssignee: string | undefined, newAssignee: string): string[] {
  const kept = oldAssignee ? mentions.filter((m) => m !== oldAssignee) : [...mentions]
  if (!kept.includes(newAssignee)) kept.push(newAssignee)
  return kept
}

/**
 * Close an issue (mark as done)
 */
export function closeIssueFields(reason?: string): Partial<KNode> {
  const updates: Partial<KNode> = {
    item: { task: { status: "done", marker: getMarkerForStatus("done") } },
    updated_at: Date.now(),
  }

  if (reason) {
    // Store close reason in data
    updates.data = { closeReason: reason }
  }

  return updates
}

/**
 * Drop an issue (mark as won't do)
 */
export function dropIssueFields(reason?: string): Partial<KNode> {
  const updates: Partial<KNode> = {
    item: { task: { status: "dropped", marker: getMarkerForStatus("dropped") } },
    updated_at: Date.now(),
  }

  if (reason) {
    updates.data = { dropReason: reason }
  }

  return updates
}
