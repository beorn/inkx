/**
 * Pure planning logic for `tasks set <id> field:value`.
 *
 * Extracted from `set-clear.ts` so unit tests can import it without
 * triggering the program.ts → doctor.ts → @silvery/ag-react/ui/progress
 * import chain (which is heavy at module-load time and trips the
 * workspace state when silvery dist is in flux). The action handler in
 * `set-clear.ts` re-exports + consumes this.
 */

import { getMarkerForStatus, type TaskStatus } from "@km/core"
import type { Repo } from "@km/storage"

/**
 * Plan the per-field side effects of `tasks set <id> field:value`.
 *
 * Most fields lower to a `repo.updateNode` patch (collected in `updates`).
 * `parent` and `aliases` need extra steps:
 *   - `parent` resolves a parent ref via `repo.resolveNode` and queues a
 *     `repo.moveNode` call; we surface the resolved id so the caller can
 *     fail fast before mutating anything.
 *   - `aliases` merges with the node's existing `data.aliases` array (the
 *     storage layer treats `data:` as a full replacement, so a naive set
 *     would wipe the rest of the data blob — we hand back a complete data
 *     object instead, mirroring `closeBeadFields` in @km/beads).
 *
 * Returns a parsed plan so the action handler stays linear and testable.
 */
export interface SetFieldPlan {
  updates: Record<string, unknown>
  /** Resolved new parent node id when `parent:<ref>` was given. */
  newParentId?: string
  /** Unknown field keys (warned, not errored). */
  warnings: string[]
  /** Field-format errors (each aborts the command). */
  errors: string[]
}

const KNOWN_TYPES = new Set(["bug", "feature", "epic", "task", "docs", "chore"])

// oxlint-disable-next-line complexity/complexity -- field-key switch with documented branches
export function planSetFields(repo: Repo, taskId: string, fields: readonly string[]): SetFieldPlan {
  const updates: Record<string, unknown> = {}
  const warnings: string[] = []
  const errors: string[] = []
  let newParentId: string | undefined

  for (const field of fields) {
    const colonIndex = field.indexOf(":")
    if (colonIndex === -1) {
      errors.push(`Invalid field format: ${field} (expected field:value)`)
      continue
    }

    const key = field.slice(0, colonIndex).toLowerCase()
    const value = field.slice(colonIndex + 1)

    switch (key) {
      case "due":
      case "due_date":
      case "due_at":
        updates.due_at = value || null
        break
      case "start":
      case "scheduled":
      case "scheduled_date":
      case "start_at":
        updates.start_at = value || null
        break
      case "priority":
        updates.priority = value || null
        break
      case "status":
      case "task_status":
        updates.item = { task: { status: value as TaskStatus, marker: getMarkerForStatus(value as TaskStatus) } }
        break
      case "assigned":
      case "assigned_to":
      case "owner":
        updates.assigned_to = value || null
        break
      case "type":
      case "task_type": {
        // Bead-style type: encoded as a `#<type>` hashtag in the H1 (the
        // single source of truth — see docs/future/beads.md "Issue Type
        // Tags") and mirrored on `data.tags`. We rewrite the tags array
        // here; the markdown round-trip rewrites the H1 hashtag the next
        // time the parser sees the content. `task` is the implicit
        // default and stays untagged. Empty value strips type tags.
        const node = repo.getNode(taskId)
        const existingData = (node?.data ?? {}) as Record<string, unknown>
        const existingTags = Array.isArray(existingData.tags)
          ? (existingData.tags as unknown[]).filter((t): t is string => typeof t === "string")
          : []
        const filtered = existingTags.filter((t) => {
          const stripped = t.startsWith("#") ? t.slice(1) : t
          return !KNOWN_TYPES.has(stripped.toLowerCase())
        })
        if (value && value.toLowerCase() !== "task") {
          filtered.push(value)
        }
        // Merge with existing data + any earlier per-field data updates so
        // sibling keys (id, aliases, mentions, props, …) survive the
        // overwrite-style `data:` semantics in updateNodeImpl.
        const baseData =
          updates.data && typeof updates.data === "object"
            ? (updates.data as Record<string, unknown>)
            : { ...existingData }
        updates.data = { ...baseData, tags: filtered }
        break
      }
      case "parent": {
        if (!value) {
          errors.push(`Empty parent value`)
          break
        }
        const parent = repo.resolveNode(value) ?? repo.resolveByName(value)
        if (!parent) {
          errors.push(`Parent not found: ${value}`)
          break
        }
        newParentId = parent.id
        break
      }
      case "aliases":
      case "alias": {
        const list = value
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
        // Merge with the node's existing data so we don't wipe sibling
        // keys (data: replaces, doesn't patch — see updateNodeImpl).
        const node = repo.getNode(taskId)
        const existingData = (node?.data ?? {}) as Record<string, unknown>
        const baseData =
          updates.data && typeof updates.data === "object"
            ? (updates.data as Record<string, unknown>)
            : { ...existingData }
        updates.data = { ...baseData, aliases: list }
        break
      }
      default:
        warnings.push(`Unknown field: ${key}`)
    }
  }

  return { updates, newParentId, warnings, errors }
}
