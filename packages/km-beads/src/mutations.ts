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
 * Create a new issue
 *
 * Note: This creates an in-memory node structure.
 * Actual persistence requires integration with km-storage.
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
 * Returns a partial node with updated fields.
 */
export interface UpdateIssueChanges {
  status?: Issue["status"]
  priority?: string
  assignee?: string
  title?: string
  type?: string
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

  return updates
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
