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

/**
 * Field-key alias → KNode column for the simple scalar fields shared by
 * `tasks set` (sets the column) and `tasks clear` (nulls the column).
 *
 * Single source of truth — drift between the two subcommands' aliases is
 * impossible because both consume this mapping.
 *
 * Complex fields (`status`, `type`, `parent`, `aliases`) live outside this
 * map: they need extra resolution / data-blob merging and are handled in
 * the per-field switch arms below.
 */
const SCALAR_FIELD_COLUMNS: Record<string, "due_at" | "start_at" | "priority" | "assigned_to"> = {
  due: "due_at",
  due_date: "due_at",
  due_at: "due_at",
  start: "start_at",
  scheduled: "start_at",
  scheduled_date: "start_at",
  start_at: "start_at",
  p: "priority",
  priority: "priority",
  assigned: "assigned_to",
  assigned_to: "assigned_to",
  owner: "assigned_to",
}

/**
 * Merge a single key into `updates.data`, preserving sibling keys.
 *
 * `updateNodeImpl` treats `data:` as a full replacement — a naive
 * `updates.data = { tags: ... }` would wipe `aliases`/`id`/`mentions`/etc.
 * We pre-merge here so the caller hands the storage layer a complete
 * `data` blob. Mirrors `closeBeadFields` in @km/beads.
 *
 * Stacks correctly across multiple field updates: if a prior `type:`
 * already populated `updates.data`, a subsequent `aliases:` reuses that
 * partial blob instead of re-reading the node and discarding the prior
 * key.
 */
function mergeIntoData(
  updates: Record<string, unknown>,
  node: { data?: unknown } | null | undefined,
  key: string,
  value: unknown,
): void {
  const existingData = (node?.data ?? {}) as Record<string, unknown>
  const baseData =
    updates.data && typeof updates.data === "object" ? (updates.data as Record<string, unknown>) : { ...existingData }
  updates.data = { ...baseData, [key]: value }
}

function readTags(data: Record<string, unknown>): string[] {
  const tags = data.tags
  if (!Array.isArray(tags)) return []
  return tags.filter((t): t is string => typeof t === "string")
}

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

    const scalarColumn = SCALAR_FIELD_COLUMNS[key]
    if (scalarColumn) {
      updates[scalarColumn] = value || null
      continue
    }

    switch (key) {
      case "status":
      case "task_status":
        updates.item = { task: { status: value as TaskStatus, marker: getMarkerForStatus(value as TaskStatus) } }
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
        const existingTags = readTags((node?.data ?? {}) as Record<string, unknown>)
        const filtered = existingTags.filter((t) => {
          const stripped = t.startsWith("#") ? t.slice(1) : t
          return !KNOWN_TYPES.has(stripped.toLowerCase())
        })
        if (value && value.toLowerCase() !== "task") {
          filtered.push(value)
        }
        mergeIntoData(updates, node, "tags", filtered)
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
        mergeIntoData(updates, repo.getNode(taskId), "aliases", list)
        break
      }
      default:
        warnings.push(`Unknown field: ${key}`)
    }
  }

  return { updates, newParentId, warnings, errors }
}

/**
 * Plan the per-field side effects of `tasks clear <id> field`.
 *
 * Mirrors `planSetFields` but only handles the scalar columns (the only
 * fields where "clear" has well-defined semantics). Both commands share
 * `SCALAR_FIELD_COLUMNS` so a new alias added there flows to both surfaces
 * automatically.
 */
export interface ClearFieldPlan {
  updates: Record<string, unknown>
  warnings: string[]
}

export function planClearFields(fields: readonly string[]): ClearFieldPlan {
  const updates: Record<string, unknown> = {}
  const warnings: string[] = []
  for (const field of fields) {
    const key = field.toLowerCase()
    const scalarColumn = SCALAR_FIELD_COLUMNS[key]
    if (scalarColumn) {
      updates[scalarColumn] = null
      continue
    }
    warnings.push(`Unknown field: ${key}`)
  }
  return { updates, warnings }
}
