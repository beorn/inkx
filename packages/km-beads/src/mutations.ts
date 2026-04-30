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
import { normalizePriority } from "./priority.ts"

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

  // Generate short ID — prefix from repo config (.km/config.yaml beads.prefix)
  // or "km" default for callers without config in scope.
  const prefix = options.prefix
  let shortId: string
  if (options.customId) {
    shortId = generateCustomId(options.customId, prefix)
  } else if (options.parentId) {
    // For sub-issues, we'd need to query existing children
    // For now, use timestamp-based suffix
    const childNum = Math.floor(Date.now() % 1000)
    shortId = generateSubId(options.parentId, childNum)
  } else {
    shortId = generateShortId(prefix)
  }

  // Build content with metadata
  let content = title

  // Add type tag
  if (options.type) {
    content += ` #${options.type}`
  }

  // Add priority tag.
  //
  // Normalize to canonical `P0`..`P4` form regardless of input shape:
  //   --priority 0   → "P0"
  //   --priority P0  → "P0"
  //   --priority p0  → "P0"
  // Without this, `bd create --priority 0` wrote tag `#0` while peer beads
  // had `#P0`, and `bd list --priority 0` (query `#0`) would miss the
  // canonical-form ones (and vice versa). Both `nodeToIssue` (read) and
  // queryIssues (filter) normalize input, but the on-disk tag stays in
  // whatever form was first written — so we canonicalize at the boundary.
  const priority = normalizePriority(options.priority) ?? "P2"
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
  /**
   * Full current `data` blob from the node. Required when `priority` or
   * `type` change — without it, the partial-replace semantics of the
   * storage `updateNode` path would wipe sibling keys (`id`, `aliases`,
   * `short_id`, `mentions`, …). Pass `node.data` from the caller.
   */
  currentData?: Record<string, unknown>
}

export function updateIssueFields(issue: Issue, changes: UpdateIssueChanges): Partial<KNode> {
  const updates: Partial<KNode> = {
    updated_at: Date.now(),
  }

  if (changes.status !== undefined) {
    updates.item = { task: { status: changes.status, marker: getMarkerForStatus(changes.status) } }
  }

  // Canonicalize priority on update the same way create does — without
  // this, `bd update --priority P0` on a `priority="0"` bead leaves the
  // `#0` tag in content and adds `P0` separately (yields ["0","P0"]).
  // Falsy normalize result preserves caller's literal value (caller is
  // free to set non-canonical priority strings if they really want).
  const normalizedPriority =
    changes.priority !== undefined ? (normalizePriority(changes.priority) ?? changes.priority) : undefined
  if (normalizedPriority !== undefined) {
    updates.priority = normalizedPriority
  }

  if (changes.title !== undefined) {
    updates.content = changes.title
  }

  if (changes.assignee !== undefined) {
    updates.assigned_to = changes.assignee
  }

  // Sync the derived `data.tags` blob when priority/type change so the
  // markdown round-trip (`#P1`, `#feature`) stays consistent with the
  // structural `node.priority` column. Storage's updateNode path treats
  // `data: {...}` as a full replacement, so we MUST merge with the
  // node's existing data blob to preserve `id`, `aliases`, `short_id`,
  // `mentions`, etc. Assignee no longer mirrors into `data.mentions` —
  // `node.assigned_to` is the authoritative source.
  if (normalizedPriority !== undefined || changes.type !== undefined) {
    const currentTags =
      changes.currentTags ??
      (changes.currentData?.tags as string[] | undefined) ??
      [issue.type, issue.priority].filter((t): t is string => typeof t === "string" && t.length > 0)
    const nextTags = rewriteTypeAndPriorityTags(currentTags, {
      priority: normalizedPriority,
      type: changes.type,
    })
    updates.data = { ...changes.currentData, tags: nextTags }
  }

  return updates
}

/**
 * Replace any existing P0–P4 (or bare 0–4) tag and/or the current type
 * tag with the new values. Preserves unrelated tags (e.g. `frontend`,
 * `urgent`) unchanged. Stripping bare-digit tags too prevents
 * accumulation: a bead with legacy `#0` getting --priority P1 should
 * end up with just `[P1]`, not `[0, P1]`.
 */
function rewriteTypeAndPriorityTags(tags: string[], next: { priority?: string; type?: string }): string[] {
  const typeKeywords = new Set(["bug", "feature", "epic", "task", "docs", "question"])
  const filtered = tags.filter((t) => {
    if (next.priority !== undefined && (/^P[0-4]$/i.test(t) || /^[0-4]$/.test(t))) return false
    if (next.type !== undefined && typeKeywords.has(t.toLowerCase())) return false
    return true
  })
  if (next.type !== undefined) filtered.push(next.type)
  if (next.priority !== undefined) filtered.push(next.priority)
  return filtered
}

/**
 * Close an issue (mark as done).
 *
 * Pass the node's full `data` blob via `currentData` when a `reason` is
 * provided — storage's `updateNode` treats `data: {...}` as a full
 * replacement, so we MUST merge with the existing data to preserve
 * sibling keys (`id`, `aliases`, `short_id`, `mentions`, `tags`, …).
 * Without `currentData`, a `bd close <id> --reason "x"` silently wipes
 * the canonical id and aliases — the issue stays addressable by its
 * ULID but vanishes from `bd list` / short-id resolution.
 *
 * Bead: km-beads.close-drop-data-wipe.
 */
export function closeIssueFields(reason?: string, currentData?: Record<string, unknown>): Partial<KNode> {
  const updates: Partial<KNode> = {
    item: { task: { status: "done", marker: getMarkerForStatus("done") } },
    updated_at: Date.now(),
  }

  if (reason) {
    updates.data = { ...currentData, closeReason: reason }
  }

  return updates
}

/**
 * Drop an issue (mark as won't do).
 *
 * Same `currentData` discipline as `closeIssueFields`. See its docstring
 * for the rationale.
 *
 * Bead: km-beads.close-drop-data-wipe.
 */
export function dropIssueFields(reason?: string, currentData?: Record<string, unknown>): Partial<KNode> {
  const updates: Partial<KNode> = {
    item: { task: { status: "dropped", marker: getMarkerForStatus("dropped") } },
    updated_at: Date.now(),
  }

  if (reason) {
    updates.data = { ...currentData, dropReason: reason }
  }

  return updates
}
