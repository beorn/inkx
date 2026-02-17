/**
 * Task Metadata — Shared stringify/parse helpers
 *
 * Used by both the markdown serializer (nodes2md.ts) and the TUI editor
 * (TreeNode.tsx) to ensure consistent text-based metadata format.
 *
 * Canonical output format (todo.txt-style key:value):
 *   due:2024-01-15  start:2024-01-10  p:1  recur:FREQ=WEEKLY
 *
 * Emoji formats (📅 ⏳ ⏫🔼🔽 🔁) are accepted on input but never written.
 */

import type { KNode } from "./types.ts"
import { decomposeDatetime } from "./date-utils.ts"

// =============================================================================
// Detection regexes — check if metadata is already present in content
// =============================================================================

/** Matches due date in either text or emoji form */
const HAS_DUE = /\bdue:(\d{4}-\d{2}-\d{2})\b|📅/

/** Matches start/scheduled date in either text or emoji form */
const HAS_START = /\bstart:(\d{4}-\d{2}-\d{2})\b|⏳/

/** Matches priority in either text or emoji form */
const HAS_PRIORITY = /\bp:[1-9]\b|[⏫🔼🔽]/

/** Matches recurrence in either text or emoji form */
const HAS_RECURRENCE = /\brecur:\S|🔁/

// =============================================================================
// stringifyTaskMetadata — append field-only metadata as text key:value tags
// =============================================================================

/**
 * Append task metadata from node fields to content string, using text-based
 * key:value format. Only appends metadata that isn't already present in the
 * content (in either text or emoji form).
 *
 * Used by:
 * - nodes2md.ts serializer (appendTaskMetadata)
 * - TreeNode.tsx TUI editor (composeRawEditContent)
 *
 * @param content - The node's raw content string
 * @param node - The node to extract metadata fields from
 * @param options.includeAssignedTo - Also append @assigned_to if missing (TUI editor only)
 * @returns Content with metadata appended
 */
export function stringifyTaskMetadata(
  content: string,
  node: KNode,
  options?: { includeAssignedTo?: boolean },
): string {
  const metadata: string[] = []

  // Due date: due:2024-01-15 or due:2024-01-15T14:30
  const dueParts =
    decomposeDatetime(node.due_at) ?? (node.due_date ? { date: node.due_date, time: node.due_time } : undefined)
  if (dueParts?.date && !HAS_DUE.test(content)) {
    const timeSuffix = dueParts.time ? `T${dueParts.time}` : ""
    metadata.push(`due:${dueParts.date}${timeSuffix}`)
  }

  // Start/scheduled date: start:2024-01-10 or start:2024-01-10T09:00
  const startParts =
    decomposeDatetime(node.start_at) ??
    (node.scheduled_date ? { date: node.scheduled_date, time: node.scheduled_time } : undefined)
  if (startParts?.date && !HAS_START.test(content)) {
    const timeSuffix = startParts.time ? `T${startParts.time}` : ""
    metadata.push(`start:${startParts.date}${timeSuffix}`)
  }

  // Priority: p:1, p:2, p:3
  if (node.priority && !HAS_PRIORITY.test(content)) {
    metadata.push(`p:${node.priority}`)
  }

  // Recurrence: recur:FREQ=WEEKLY
  const recurrence = node.recurrence ?? (node.data?.recurrence as string | undefined)
  if (recurrence && !HAS_RECURRENCE.test(content)) {
    metadata.push(`recur:${recurrence}`)
  }

  // Assigned to (TUI editor only): @person
  if (options?.includeAssignedTo && node.assigned_to && !content.includes(`@${node.assigned_to}`)) {
    metadata.push(`@${node.assigned_to}`)
  }

  if (metadata.length > 0 && content) content += " " + metadata.join(" ")
  return content
}
