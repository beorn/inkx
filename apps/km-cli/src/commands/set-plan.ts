/**
 * Pure planner for the generic `km set <id...> field:value...` verb.
 *
 * Wave 4 of `@km/cli/task-bd-collapse`: the top-level `km set` is the
 * generic node-graph mutator. `task set` becomes a thin alias on top
 * (validates against task-only fields, then delegates here).
 *
 * This planner is the single source of truth for parsing field:value
 * tokens, resolving parent references, and producing a per-id
 * `updateNode` patch + an optional reparent target. It must NOT import
 * from `@silvery/{commander,ag-react}`, `program.ts`, `load-repo.ts`,
 * or `createTerm` — chain-immune by construction so tests can run even
 * when the silvery dist is mid-flight.
 *
 * Field schema (validation):
 *   priority   — P0..P4 (regex `^P?[0-4]$`)
 *   due/start  — date string (ISO or pass-through; chrono-node parsing
 *                deferred to Wave 7)
 *   owner      — username
 *   assigned   — alias of owner
 *   status     — todo|wip|blocked|done|dropped
 *   type       — bead-style hashtag, validated against
 *                BEAD_TYPE_KEYWORDS (km-beads ships the canonical list)
 *   parent     — id/path/name (resolved via repo.resolveNode/resolveByName)
 *   aliases    — comma-separated list
 *
 * Mirrors the legacy `tasks/set-clear-plan.ts` semantics; the legacy
 * file remains in place (used by `task set` for back-compat) until the
 * task-set wrapper can be rewritten on top of this planner without
 * regressing any of the existing tests.
 */

import { getMarkerForStatus, type TaskStatus } from "@km/core"
import type { Repo } from "@km/storage"
import { BEAD_TYPE_KEYWORD_SET } from "@km/beads"
import { suggestField } from "../utils/levenshtein.ts"

export interface SetFieldPlan {
  /** Per-id updateNode patches. */
  updates: Record<string, unknown>
  /** Resolved new parent node id when `parent:<ref>` was given. */
  newParentId?: string
  /** Unknown field keys (warned, not errored). */
  warnings: string[]
  /** Field-format errors (each aborts the command). */
  errors: string[]
}

const VALID_TASK_STATUSES = new Set<TaskStatus>(["todo", "wip", "blocked", "done", "dropped"])
const PRIORITY_RE = /^P?[0-4]$/i

/**
 * Field-key alias → KNode column for the simple scalar fields shared by
 * `set` (sets the column) and `clear` (nulls the column). Single source
 * of truth; both surfaces consume this mapping so drift is impossible.
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
 * Canonical field keys for the typo-suggestion hint. Union of every
 * scalar alias + the structurally-handled keys (status, type, parent,
 * aliases). Used to translate `prioirty:P0` → "Did you mean
 * `priority`?".
 *
 * Order is the canonical-name-first ordering: aliases come last so the
 * Levenshtein tie-break prefers the canonical name when distances are
 * equal (e.g. `priorit` is closer to `priority` than to `p`, so this
 * doesn't matter; but if a tie ever occurs, canonical wins).
 */
const ALL_FIELD_KEYS: readonly string[] = [
  "priority",
  "due",
  "start",
  "owner",
  "status",
  "type",
  "parent",
  "aliases",
  "due_at",
  "due_date",
  "start_at",
  "scheduled",
  "scheduled_date",
  "assigned",
  "assigned_to",
  "task_status",
  "task_type",
  "alias",
  "p",
]

/**
 * Merge a single key into `updates.data`, preserving sibling keys.
 * Mirrors `mergeIntoData` in `tasks/set-clear-plan.ts` — see that file
 * for the rationale (`updateNodeImpl` treats `data` as full-replacement,
 * so we pre-merge before handing to storage).
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

/**
 * Normalize a priority value: strip an optional leading P, return the
 * canonical `P<n>` form. Caller validates with PRIORITY_RE first.
 */
function normalizePriority(value: string): string {
  const stripped = value.replace(/^P/i, "")
  return `P${stripped}`
}

/**
 * Plan the per-field side effects of `km set <id> field:value...`.
 *
 * The function is pure — it reads from `repo` (for parent resolution
 * and tag merging) but does not mutate. The action handler is
 * responsible for calling `repo.updateNode` / `repo.moveNode` based on
 * the returned plan.
 */
// oxlint-disable-next-line complexity/complexity -- field-key dispatch with documented arms
export function planSet(repo: Repo, nodeId: string, fields: readonly string[]): SetFieldPlan {
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
      if (scalarColumn === "priority" && value) {
        if (!PRIORITY_RE.test(value)) {
          errors.push(`Invalid priority: ${value} (expected P0..P4)`)
          continue
        }
        updates[scalarColumn] = normalizePriority(value)
      } else {
        updates[scalarColumn] = value || null
      }
      continue
    }

    switch (key) {
      case "status":
      case "task_status": {
        if (!VALID_TASK_STATUSES.has(value as TaskStatus)) {
          errors.push(`Invalid status: ${value} (expected todo|wip|blocked|done|dropped)`)
          break
        }
        updates.item = { task: { status: value as TaskStatus, marker: getMarkerForStatus(value as TaskStatus) } }
        break
      }
      case "type":
      case "task_type": {
        if (value && !BEAD_TYPE_KEYWORD_SET.has(value.toLowerCase())) {
          warnings.push(`Unknown type: ${value} (expected ${[...BEAD_TYPE_KEYWORD_SET].join("|")})`)
        }
        const node = repo.getNode(nodeId)
        const existingTags = readTags((node?.data ?? {}) as Record<string, unknown>)
        const filtered = existingTags.filter((t) => {
          const stripped = t.startsWith("#") ? t.slice(1) : t
          return !BEAD_TYPE_KEYWORD_SET.has(stripped.toLowerCase())
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
        mergeIntoData(updates, repo.getNode(nodeId), "aliases", list)
        break
      }
      default: {
        // Smart hint — suggest the canonical key when the user typed
        // a near-miss (e.g. `prioirty:P0` → "Did you mean `priority`?").
        // Levenshtein distance ≤ 2 catches single-char typos and
        // adjacent-key swaps without false-positives on unrelated input.
        const suggestion = suggestField(key, ALL_FIELD_KEYS)
        warnings.push(suggestion ? `Unknown field: ${key} (did you mean \`${suggestion}\`?)` : `Unknown field: ${key}`)
      }
    }
  }

  return { updates, newParentId, warnings, errors }
}
