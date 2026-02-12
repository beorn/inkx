/**
 * Beads Mutation Functions
 *
 * Create, update, and close issues.
 */

import { ulid } from "ulid"
import type { KNode } from "@km/core"
import type { Issue, CreateIssueOptions } from "./types.ts"
import { generateShortId, generateCustomId, generateSubId } from "./short-ids.ts"

/**
 * Create a new issue
 *
 * Note: This creates an in-memory node structure.
 * Actual persistence requires integration with km-storage.
 */
export function createIssueNode(title: string, options: CreateIssueOptions = {}): { node: KNode; shortId: string } {
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
  const priority = options.priority ?? 2
  content += ` #P${priority}`

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
    type: "task",
    parent_id: null, // Will be set based on path
    parent_idx: 0,
    link_to: null,
    content,
    task_status: "todo",
    task_mark: " ",
    priority,
    data: {
      short_id: shortId,
      tags: [options.type, `P${priority}`, ...(options.labels || [])].filter(Boolean),
      mentions: options.assignee ? [options.assignee] : [],
    },
    created_at: now,
    updated_at: now,
    version: "",
  }

  return { node, shortId }
}

/**
 * Update issue fields
 *
 * Returns a partial node with updated fields.
 */
export function updateIssueFields(
  issue: Issue,
  changes: {
    status?: Issue["status"]
    priority?: number
    assignee?: string
    title?: string
  },
): Partial<KNode> {
  const updates: Partial<KNode> = {
    updated_at: Date.now(),
  }

  if (changes.status !== undefined) {
    switch (changes.status) {
      case "done":
        updates.task_status = "done"
        updates.task_mark = "x"
        break
      case "wip":
        updates.task_status = "wip"
        updates.task_mark = "/"
        break
      case "blocked":
        updates.task_status = "blocked"
        updates.task_mark = "!"
        break
      case "dropped":
        updates.task_status = "dropped"
        updates.task_mark = "-"
        break
      case "todo":
        updates.task_status = "todo"
        updates.task_mark = " "
        break
    }
  }

  if (changes.priority !== undefined) {
    updates.priority = changes.priority
  }

  if (changes.title !== undefined) {
    updates.content = changes.title
  }

  return updates
}

/**
 * Close an issue (mark as done)
 */
export function closeIssueFields(reason?: string): Partial<KNode> {
  const updates: Partial<KNode> = {
    task_status: "done",
    task_mark: "x",
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
    task_status: "dropped",
    task_mark: "-",
    updated_at: Date.now(),
  }

  if (reason) {
    updates.data = { dropReason: reason }
  }

  return updates
}
