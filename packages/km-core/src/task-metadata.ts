/**
 * Task Metadata — Shared stringify/parse/extract helpers
 *
 * Single source of truth for task metadata parsing and formatting.
 * Used by the markdown parser, serializer, and TUI editor.
 *
 * Canonical output format (todo.txt-style key:value):
 *   due:2024-01-15  start:2024-01-10  p:1  recur:FREQ=WEEKLY
 *
 * Emoji formats (📅 ⏳ ⏫🔼🔽 🔁) are accepted on input but never written.
 */

import type { KNode } from "./types.ts"
import { decomposeDatetime } from "./date-utils.ts"

// =============================================================================
// Shared extraction regexes — text-based key:value format
// =============================================================================

/** Matches due:YYYY-MM-DD or due:YYYY-MM-DDTHH:MM */
const DUE_TEXT_REGEX = /\bdue:(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/

/** Matches start:YYYY-MM-DD or start:YYYY-MM-DDTHH:MM */
const START_TEXT_REGEX = /\bstart:(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/

/** Matches p:N (1-9) */
const PRIORITY_TEXT_REGEX = /\bp:([1-9])\b/

/** Matches recur:VALUE (non-whitespace) */
const RECURRENCE_TEXT_REGEX = /\brecur:(\S+)/

// =============================================================================
// Shared extraction regexes — emoji format (input-only, backward compat)
// =============================================================================

/** Matches 📅 YYYY-MM-DD or 📅 YYYY-MM-DDTHH:MM */
const DUE_EMOJI_REGEX = /📅\s*(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/

/** Matches ⏳ YYYY-MM-DD or ⏳ YYYY-MM-DDTHH:MM */
const START_EMOJI_REGEX = /⏳\s*(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/

/** Matches recurrence emoji: 🔁 text (until next emoji or end) */
const RECURRENCE_EMOJI_REGEX = /🔁\s*(.+?)(?:\s*[📅⏳⏫🔼🔽]|$)/

// =============================================================================
// Detection regexes — check if metadata is already present (text OR emoji)
// =============================================================================

/** Matches due date in either text or emoji form */
const HAS_DUE = /\bdue:\d{4}-\d{2}-\d{2}\b|📅/

/** Matches start/scheduled date in either text or emoji form */
const HAS_START = /\bstart:\d{4}-\d{2}-\d{2}\b|⏳/

/** Matches priority in either text or emoji form */
const HAS_PRIORITY = /\bp:[1-9]\b|[⏫🔼🔽]/

/** Matches recurrence in either text or emoji form */
const HAS_RECURRENCE = /\brecur:\S|🔁/

// =============================================================================
// extractTaskMetadata — shared extraction used by parser and editor
// =============================================================================

/** Result of extracting task metadata from text */
export interface ExtractedTaskMetadata {
  dueDate?: string
  dueTime?: string
  startDate?: string
  startTime?: string
  priority?: number
  recurrence?: string
}

/**
 * Extract task metadata from text content. Handles both text-based (key:value)
 * and emoji formats. Text format takes precedence over emoji format.
 *
 * Used by:
 * - km-markdown parser (parseTaskMetadata wrapper)
 * - km-core parseTaskMetadataFromText (for stripping)
 *
 * @param text - Raw text content that may contain metadata
 * @returns Extracted metadata fields (empty object if none found)
 */
export function extractTaskMetadata(text: string): ExtractedTaskMetadata {
  const result: ExtractedTaskMetadata = {}

  // Due date: text format first, then emoji fallback
  const dueTextMatch = text.match(DUE_TEXT_REGEX)
  if (dueTextMatch) {
    result.dueDate = dueTextMatch[1]
    if (dueTextMatch[2]) result.dueTime = dueTextMatch[2]
  } else {
    const dueEmojiMatch = text.match(DUE_EMOJI_REGEX)
    if (dueEmojiMatch) {
      result.dueDate = dueEmojiMatch[1]
      if (dueEmojiMatch[2]) result.dueTime = dueEmojiMatch[2]
    }
  }

  // Start/scheduled date: text format first, then emoji fallback
  const startTextMatch = text.match(START_TEXT_REGEX)
  if (startTextMatch) {
    result.startDate = startTextMatch[1]
    if (startTextMatch[2]) result.startTime = startTextMatch[2]
  } else {
    const startEmojiMatch = text.match(START_EMOJI_REGEX)
    if (startEmojiMatch) {
      result.startDate = startEmojiMatch[1]
      if (startEmojiMatch[2]) result.startTime = startEmojiMatch[2]
    }
  }

  // Priority: text format first, then emoji fallback
  const prioTextMatch = text.match(PRIORITY_TEXT_REGEX)
  if (prioTextMatch?.[1]) {
    result.priority = parseInt(prioTextMatch[1], 10)
  } else if (text.includes("⏫")) {
    result.priority = 1
  } else if (text.includes("🔼")) {
    result.priority = 2
  } else if (text.includes("🔽")) {
    result.priority = 3
  }

  // Recurrence: text format first, then emoji fallback
  const recurTextMatch = text.match(RECURRENCE_TEXT_REGEX)
  if (recurTextMatch?.[1]) {
    result.recurrence = recurTextMatch[1]
  } else {
    const recurEmojiMatch = text.match(RECURRENCE_EMOJI_REGEX)
    if (recurEmojiMatch?.[1]) {
      result.recurrence = recurEmojiMatch[1].trim()
    }
  }

  return result
}

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

// =============================================================================
// Stripping regexes — for parseTaskMetadataFromText (include leading whitespace)
// =============================================================================

const STRIP_DUE = /\s*\bdue:(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?\b/
const STRIP_START = /\s*\bstart:(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?\b/
const STRIP_PRIORITY = /\s*\bp:([1-9])\b/
const STRIP_RECURRENCE = /\s*\brecur:(\S+)/

// =============================================================================
// parseTaskMetadataFromText — inverse of stringify, for save handlers
// =============================================================================

/**
 * Parse metadata tags from edited text and return clean content + field values.
 * Inverse of stringifyTaskMetadata: strips due:, start:, p:, recur: from text.
 *
 * Used by TUI save handlers to restore structured fields from inline-edited text.
 */
export function parseTaskMetadataFromText(text: string): {
  cleanContent: string
  due_at?: string
  start_at?: string
  priority?: number
  recurrence?: string
} {
  let clean = text
  let due_at: string | undefined
  let start_at: string | undefined
  let priority: number | undefined
  let recurrence: string | undefined

  const dueMatch = clean.match(STRIP_DUE)
  if (dueMatch) {
    due_at = dueMatch[2] ? `${dueMatch[1]}T${dueMatch[2]}` : dueMatch[1]
    clean = clean.replace(STRIP_DUE, "")
  }

  const startMatch = clean.match(STRIP_START)
  if (startMatch) {
    start_at = startMatch[2] ? `${startMatch[1]}T${startMatch[2]}` : startMatch[1]
    clean = clean.replace(STRIP_START, "")
  }

  const prioMatch = clean.match(STRIP_PRIORITY)
  if (prioMatch) {
    priority = parseInt(prioMatch[1]!, 10)
    clean = clean.replace(STRIP_PRIORITY, "")
  }

  const recurMatch = clean.match(STRIP_RECURRENCE)
  if (recurMatch) {
    recurrence = recurMatch[1]
    clean = clean.replace(STRIP_RECURRENCE, "")
  }

  // Normalize whitespace after stripping
  clean = clean.replace(/\s{2,}/g, " ").trim()

  return {
    cleanContent: clean,
    ...(due_at !== undefined && { due_at }),
    ...(start_at !== undefined && { start_at }),
    ...(priority !== undefined && { priority }),
    ...(recurrence !== undefined && { recurrence }),
  }
}
