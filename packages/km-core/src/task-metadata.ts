/**
 * Task Metadata — Shared stringify/parse/extract helpers
 *
 * Single source of truth for task metadata parsing and formatting.
 * Used by the markdown parser, serializer, and TUI editor.
 *
 * Canonical format (key:: value — Dataview-compatible):
 *   due:: 2024-01-15  start:: 2024-01-10  priority:: P2  recur:: FREQ=WEEKLY
 *
 * Also reads external formats (compat with other systems):
 * - due:YYYY-MM-DD (todo.txt compat, read-only)
 * - 📅 ⏳ 🔁 (Obsidian Tasks compat, read-only)
 *
 * Priority uses ONLY the key:: value format (priority:: VALUE).
 */

import type { KNode } from "./types.ts"
import { extractTaskDates } from "./date-utils.ts"
import { extractMetadata, stringifyMetadata, type MetadataEntries } from "./metadata.ts"

// =============================================================================
// External format regexes — todo.txt compat (read-only)
// =============================================================================

/** Matches due:YYYY-MM-DD or due:YYYY-MM-DDTHH:MM (todo.txt compat) */
const DUE_LEGACY_REGEX = /\bdue:(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/

// =============================================================================
// External format regexes — Obsidian Tasks compat (read-only)
// =============================================================================

const DUE_EMOJI_REGEX = /📅\s*(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/
const START_EMOJI_REGEX = /⏳\s*(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/
const RECURRENCE_EMOJI_REGEX = /🔁\s*(.+?)(?:\s*[📅⏳]|$)/u

// =============================================================================
// Stripping regexes — remove metadata from text (all formats)
// =============================================================================

/** Strip todo.txt format */
const STRIP_LEGACY_DUE = /\s*\bdue:(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?\b/

/** Strip emoji format */
const STRIP_EMOJI_DUE = /\s*📅\s*\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/
const STRIP_EMOJI_START = /\s*⏳\s*\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/
const STRIP_EMOJI_RECURRENCE = /\s*🔁\s*.+?(?=\s*[📅⏳]|$)/u

// =============================================================================
// extractTaskMetadata — shared extraction used by parser and editor
// =============================================================================

/** Result of extracting task metadata from text */
export interface ExtractedTaskMetadata {
  dueDate?: string
  dueTime?: string
  startDate?: string
  startTime?: string
  priority?: string
  rrule?: string
}

/**
 * Extract task metadata from text content.
 * Priority: only `priority::` key.
 * Due: `due::` > `due:` (todo.txt) > `📅` (Obsidian Tasks).
 * Start: `start::` > `⏳` (Obsidian Tasks).
 * Recurrence: `recur::` > `🔁` (Obsidian Tasks).
 *
 * Used by:
 * - km-markdown parser (parseTaskMetadata wrapper)
 * - km-core parseTaskMetadataFromText (for stripping)
 */
export function extractTaskMetadata(text: string): ExtractedTaskMetadata {
  const result: ExtractedTaskMetadata = {}

  // Pass 1: Extract key:: value format
  const { entries } = extractMetadata(text)

  // Map entries to typed fields
  if (entries.due) {
    const parsed = parseDatetimeValue(entries.due)
    if (parsed) {
      result.dueDate = parsed.date
      if (parsed.time) result.dueTime = parsed.time
    }
  }
  if (entries.start) {
    const parsed = parseDatetimeValue(entries.start)
    if (parsed) {
      result.startDate = parsed.date
      if (parsed.time) result.startTime = parsed.time
    }
  }
  if (entries.priority) {
    result.priority = entries.priority
  }
  if (entries.recur) {
    result.rrule = entries.recur
  }

  // Pass 2: Fall back to todo.txt due:DATE format
  if (!result.dueDate) {
    const match = text.match(DUE_LEGACY_REGEX)
    if (match) {
      result.dueDate = match[1]
      if (match[2]) result.dueTime = match[2]
    }
  }

  // Pass 3: Fall back to Obsidian Tasks emoji format
  if (!result.dueDate) {
    const match = text.match(DUE_EMOJI_REGEX)
    if (match) {
      result.dueDate = match[1]
      if (match[2]) result.dueTime = match[2]
    }
  }
  if (!result.startDate) {
    const match = text.match(START_EMOJI_REGEX)
    if (match) {
      result.startDate = match[1]
      if (match[2]) result.startTime = match[2]
    }
  }
  if (!result.rrule) {
    const match = text.match(RECURRENCE_EMOJI_REGEX)
    if (match?.[1]) result.rrule = match[1].trim()
  }

  return result
}

// =============================================================================
// stringifyTaskMetadata — append metadata in key:: value format
// =============================================================================

/**
 * Append task metadata from node fields to content string.
 *
 * Behavior:
 * - If node fields match what's already in content, preserve original format
 * - If any field changed/added/removed, strip task metadata and rewrite in key:: value
 * - Non-task properties (blocks::, author::, etc.) are always preserved
 *
 * Used by:
 * - nodes2md.ts serializer (appendTaskMetadata) — roundtrip preserves format
 * - TreeNode.tsx TUI editor (composeRawEditContent) — edits trigger key:: value rewrite
 */
export function stringifyTaskMetadata(content: string, node: KNode, options?: { includeAssignedTo?: boolean }): string {
  // Extract current node field values
  const { due: dueParts, start: startParts } = extractTaskDates(node)
  const recurrence = node.rrule ?? (node.data?.rrule as string | undefined)

  // Extract what's already in the content
  const existing = extractTaskMetadata(content)

  // Compare node fields to content — if they match, preserve original format
  const dueVal = dueParts?.date ? (dueParts.time ? `${dueParts.date}T${dueParts.time}` : dueParts.date) : undefined
  const existingDueVal = existing.dueDate
    ? existing.dueTime
      ? `${existing.dueDate}T${existing.dueTime}`
      : existing.dueDate
    : undefined
  const startVal = startParts?.date
    ? startParts.time
      ? `${startParts.date}T${startParts.time}`
      : startParts.date
    : undefined
  const existingStartVal = existing.startDate
    ? existing.startTime
      ? `${existing.startDate}T${existing.startTime}`
      : existing.startDate
    : undefined

  const fieldsMatch =
    dueVal === existingDueVal &&
    startVal === existingStartVal &&
    (node.priority ?? undefined) === existing.priority &&
    (recurrence ?? undefined) === existing.rrule

  if (fieldsMatch) {
    // Preserve original format — just handle assigned_to
    let result = content
    if (options?.includeAssignedTo && node.assigned_to && !result.includes(`@${node.assigned_to}`)) {
      result += ` @${node.assigned_to}`
    }
    return result
  }

  // Fields changed — strip task metadata and rewrite in key:: value
  const cleanContent = stripTaskMetadataFormats(content)

  const entries: MetadataEntries = {}
  if (dueParts?.date) {
    entries.due = dueParts.time ? `${dueParts.date}T${dueParts.time}` : dueParts.date
  }
  if (startParts?.date) {
    entries.start = startParts.time ? `${startParts.date}T${startParts.time}` : startParts.date
  }
  if (node.priority) {
    entries.priority = node.priority
  }
  if (recurrence) {
    entries.recur = recurrence
  }

  let result = stringifyMetadata(cleanContent, entries)

  if (options?.includeAssignedTo && node.assigned_to && !result.includes(`@${node.assigned_to}`)) {
    result += ` @${node.assigned_to}`
  }

  return result
}

// =============================================================================
// parseTaskMetadataFromText — inverse of stringify, for save handlers
// =============================================================================

/**
 * Parse metadata from edited text and return clean content + field values.
 * Reads canonical key:: value, plus external formats (todo.txt due:, Obsidian emoji).
 *
 * Used by TUI save handlers to restore structured fields from inline-edited text.
 */
export function parseTaskMetadataFromText(text: string): {
  cleanContent: string
  due_at?: string
  start_at?: string
  priority?: string
  rrule?: string
} {
  // Extract metadata from all formats
  const extracted = extractTaskMetadata(text)

  // Strip task-specific metadata from text to get clean content (preserves non-task properties)
  const clean = stripTaskMetadataFormats(text)

  // Map extracted fields to node-field format
  let due_at: string | undefined
  if (extracted.dueDate) {
    due_at = extracted.dueTime ? `${extracted.dueDate}T${extracted.dueTime}` : extracted.dueDate
  }

  let start_at: string | undefined
  if (extracted.startDate) {
    start_at = extracted.startTime ? `${extracted.startDate}T${extracted.startTime}` : extracted.startDate
  }

  return {
    cleanContent: clean,
    ...(due_at !== undefined && { due_at }),
    ...(start_at !== undefined && { start_at }),
    ...(extracted.priority !== undefined && { priority: extracted.priority }),
    ...(extracted.rrule !== undefined && { rrule: extracted.rrule }),
  }
}

// =============================================================================
// Helpers
// =============================================================================

/** Parse a datetime string like "2026-02-15" or "2026-02-15T14:30" */
function parseDatetimeValue(value: string): { date: string; time?: string } | null {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/)
  if (!match?.[1]) return null
  return { date: match[1], time: match[2] }
}

/** Task-specific keys that stringifyTaskMetadata manages (stripped on rewrite) */
const TASK_METADATA_KEYS = ["due", "start", "priority", "recur"]

/** Strip task-specific metadata from all formats (key:: value + legacy + emoji) */
function stripTaskMetadataFormats(text: string): string {
  let clean = text
  // Strip task-specific key:: value pairs (preserve other properties like blocks::, author::)
  for (const key of TASK_METADATA_KEYS) {
    clean = clean.replace(new RegExp(`\\s*\\b${key}:: (?:"(?:[^"\\\\]|\\\\.)*"|\\S+)`, "g"), "")
  }
  return stripLegacyAndEmojiMetadata(clean)
}

/** Strip external format metadata from text (todo.txt due: + Obsidian Tasks emoji) */
function stripLegacyAndEmojiMetadata(text: string): string {
  let clean = text
  // todo.txt
  clean = clean.replace(STRIP_LEGACY_DUE, "")
  // Obsidian Tasks emoji
  clean = clean.replace(STRIP_EMOJI_DUE, "")
  clean = clean.replace(STRIP_EMOJI_START, "")
  clean = clean.replace(STRIP_EMOJI_RECURRENCE, "")
  // Normalize whitespace
  clean = clean.replace(/\s{2,}/g, " ").trim()
  return clean
}
