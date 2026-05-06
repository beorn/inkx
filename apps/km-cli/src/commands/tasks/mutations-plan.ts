/**
 * Pure planning logic for `tasks --new`.
 *
 * Extracted from `mutations.ts` so unit tests can import it without
 * triggering the program.ts → doctor.ts → silvery progress
 * chain at module-load time. The action handler in `mutations.ts`
 * re-exports + drives this.
 */

import { parseTaskMetadata, extractTags } from "@km/storage"
import type { KNode } from "@km/core"
import { parseDate } from "../../utils/parse-date.ts"

/**
 * Options that flow into the `tasks --new` planner. Only the fields the
 * planner reads are listed here; the action handler sees the full
 * `CreateTaskOptions` shape (including `--parent`, `--json`, etc.).
 */
export interface PlanNewTaskOptions {
  /** Bead-style type tag (bug, feature, epic, …). `task` stays untagged. */
  type?: string
  /** Explicit canonical id (path-form or bare scope/slug). */
  id?: string
  /** Comma-separated alias list. */
  aliases?: string
  /** Priority tag (P0..P4 / 0..4). Mirrored into `data.tags`. */
  priority?: string
  /** Initial assignee written to `node.assigned_to`. */
  owner?: string
  /** Natural-language due date (`tmrw`, `friday`, `+2w`, ISO). Wins over
   * any due date already in the content. Parsed via `parseDate`. */
  due?: string
  /** Natural-language start/scheduled date. Same parsing as `due`. */
  start?: string
}

/** Result of planning. The action handler hands this straight to addNode. */
export interface PlannedTaskNode {
  node: Partial<KNode>
  /** Field-format errors (e.g. unparseable date). When non-empty, the
   * caller should abort before mutating. Empty array on success. */
  errors: string[]
}

/**
 * Plan the partial node payload for `tasks --new` from the parsed
 * content + the user's flags. Pure — no I/O, no repo.
 *
 * Tag merging:
 *   - Author-supplied `#P[0-4]` in content stays.
 *   - `--priority P1` adds `#P1` if absent (flag wins over content).
 *   - `--type bug` adds `#bug` (skipping the implicit `task` default).
 *   - `--id` and `--aliases` flow to `data.id` and `data.aliases`.
 */
export function planNewTask(content: string, options: PlanNewTaskOptions): PlannedTaskNode {
  const metadata = parseTaskMetadata(content)
  const tags = extractTags(content)
  const errors: string[] = []

  // Parse natural-language --due / --start. Flag wins over content
  // metadata; unparseable input is a hard error (we don't silently fall
  // back, that would mask typos like "tomorow").
  let dueAt: string | undefined = metadata.dueAt
  if (options.due) {
    const parsed = parseDate(options.due)
    if ("error" in parsed) errors.push(`--due: ${parsed.error}`)
    else dueAt = parsed.iso
  }
  let startAt: string | undefined = metadata.startAt
  if (options.start) {
    const parsed = parseDate(options.start)
    if ("error" in parsed) errors.push(`--start: ${parsed.error}`)
    else startAt = parsed.iso
  }

  // Priority: prefer explicit flag over the in-content tag, but seed the
  // tag list either way so getNodePriority() resolves before round-trip.
  const explicitPriority = options.priority?.trim() || undefined
  const inheritedPriority = metadata.priority
  let resolvedPriority: string | undefined
  if (explicitPriority) {
    // Normalize "1" → "P1", "p1" → "P1"; bd CLI accepts either.
    const m = explicitPriority.match(/^p?([0-4])$/i)
    resolvedPriority = m ? `P${m[1]}` : explicitPriority
  } else {
    resolvedPriority = inheritedPriority
  }

  const allTags: string[] = [...tags]
  if (resolvedPriority && !allTags.some((t) => /^P[0-4]$/i.test(t))) {
    allTags.push(resolvedPriority)
  }
  if (options.type) {
    const typeLower = options.type.toLowerCase()
    if (typeLower !== "task" && !allTags.some((t) => t.toLowerCase() === typeLower)) {
      allTags.push(options.type)
    }
  }

  const data: Record<string, unknown> = {}
  if (allTags.length > 0) data.tags = allTags
  if (options.id) {
    // Strip a leading `@<prefix>/` sigil if present so resolveTaskNode's
    // path-1 arm (`data.id` exact match) and path-2 arm (sigil-stripped
    // `@km/x/y` → `x/y`) both hit. Without the strip, `data.id` would
    // contain the sigil and only path-2 resolution from typed input would
    // work. Mirrors `normalizeBdRef`'s sigil-strip but keeps slash form.
    const trimmed = options.id.trim()
    let canonical = trimmed
    if (trimmed.startsWith("@")) {
      const slashIdx = trimmed.indexOf("/")
      if (slashIdx > 0) canonical = trimmed.slice(slashIdx + 1)
    }
    data.id = canonical
  }
  if (options.aliases) {
    data.aliases = options.aliases
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  }

  const node: Partial<KNode> = {
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    content: content,
    due_at: dueAt,
    start_at: startAt,
    data: Object.keys(data).length > 0 ? data : {},
  }
  if (options.owner) {
    node.assigned_to = options.owner
  }

  return { node, errors }
}
