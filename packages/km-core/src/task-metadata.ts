/**
 * Task Metadata — Shared stringify/parse/extract helpers
 *
 * Single source of truth for task metadata parsing and formatting.
 * Used by the markdown parser, serializer, and TUI editor.
 *
 * Canonical output format (key:: value — Dataview-compatible):
 *   due:: 2024-01-15  start:: 2024-01-10  p:: 1  recur:: FREQ=WEEKLY
 *
 * Reads three formats (backward compat):
 * 1. New: key:: value (canonical, always written)
 * 2. Legacy: key:value (todo.txt-style, read-only)
 * 3. Emoji: 📅 ⏳ ⏫🔼🔽 🔁 (Obsidian Tasks, read-only)
 *
 * On save, old formats are migrated to key:: value automatically.
 */

import type { KNode } from "./types.ts"
import { decomposeDatetime } from "./date-utils.ts"
import { extractMetadata, stringifyMetadata, type MetadataEntries } from "./metadata.ts"

// =============================================================================
// Legacy extraction regexes — key:value format (read-only backward compat)
// =============================================================================

/** Matches due:YYYY-MM-DD or due:YYYY-MM-DDTHH:MM */
const DUE_LEGACY_REGEX = /\bdue:(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/

/** Matches start:YYYY-MM-DD or start:YYYY-MM-DDTHH:MM */
const START_LEGACY_REGEX = /\bstart:(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/

/** Matches p:N (1-9) */
const PRIORITY_LEGACY_REGEX = /\bp:([1-9])\b/

/** Matches recur:VALUE (non-whitespace) */
const RECURRENCE_LEGACY_REGEX = /\brecur:(\S+)/

// =============================================================================
// Emoji extraction regexes (read-only backward compat)
// =============================================================================

const DUE_EMOJI_REGEX = /📅\s*(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/
const START_EMOJI_REGEX = /⏳\s*(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/
const RECURRENCE_EMOJI_REGEX = /🔁\s*(.+?)(?:\s*[📅⏳⏫🔼🔽]|$)/u

// =============================================================================
// Stripping regexes — remove metadata from text (all formats)
// =============================================================================

/** Strip new key:: value format (handled by extractMetadata) */
// extractMetadata handles this

/** Strip legacy key:value format */
const STRIP_LEGACY_DUE = /\s*\bdue:(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?\b/
const STRIP_LEGACY_START = /\s*\bstart:(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?\b/
const STRIP_LEGACY_PRIORITY = /\s*\bp:([1-9])\b/
const STRIP_LEGACY_RECURRENCE = /\s*\brecur:(\S+)/

/** Strip emoji format */
const STRIP_EMOJI_DUE = /\s*📅\s*\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/
const STRIP_EMOJI_START = /\s*⏳\s*\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/
const STRIP_EMOJI_PRIORITY = /\s*[⏫🔼🔽]/u
const STRIP_EMOJI_RECURRENCE = /\s*🔁\s*.+?(?=\s*[📅⏳⏫🔼🔽]|$)/u

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
  rrule?: string
}

/**
 * Extract task metadata from text content.
 * Tries formats in priority order: new (key:: value) > legacy (key:value) > emoji.
 *
 * Used by:
 * - km-markdown parser (parseTaskMetadata wrapper)
 * - km-core parseTaskMetadataFromText (for stripping)
 */
export function extractTaskMetadata(text: string): ExtractedTaskMetadata {
  const result: ExtractedTaskMetadata = {}

  // Pass 1: Extract new key:: value format
  const { entries } = extractMetadata(text)

  // Map new-format entries to typed fields
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
  if (entries.p) {
    const n = parseInt(entries.p, 10)
    if (n >= 0 && n <= 9) result.priority = n
  }
  if (entries.recur) {
    result.rrule = entries.recur
  }

  // Pass 2: Fall back to legacy key:value format for missing fields
  if (!result.dueDate) {
    const match = text.match(DUE_LEGACY_REGEX)
    if (match) {
      result.dueDate = match[1]
      if (match[2]) result.dueTime = match[2]
    }
  }
  if (!result.startDate) {
    const match = text.match(START_LEGACY_REGEX)
    if (match) {
      result.startDate = match[1]
      if (match[2]) result.startTime = match[2]
    }
  }
  if (result.priority === undefined) {
    const match = text.match(PRIORITY_LEGACY_REGEX)
    if (match?.[1]) result.priority = parseInt(match[1], 10)
  }
  if (!result.rrule) {
    const match = text.match(RECURRENCE_LEGACY_REGEX)
    if (match?.[1]) result.rrule = match[1]
  }

  // Pass 3: Fall back to emoji format for any still-missing fields
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
  if (result.priority === undefined) {
    if (text.includes("⏫")) result.priority = 1
    else if (text.includes("🔼")) result.priority = 2
    else if (text.includes("🔽")) result.priority = 3
  }
  if (!result.rrule) {
    const match = text.match(RECURRENCE_EMOJI_REGEX)
    if (match?.[1]) result.rrule = match[1].trim()
  }

  return result
}

// =============================================================================
// stringifyTaskMetadata — append metadata in new key:: value format
// =============================================================================

/**
 * Append task metadata from node fields to content string.
 *
 * Behavior:
 * - If node fields match what's already in content (any format), preserve original format
 * - If any field changed/added/removed, strip task metadata and rewrite in key:: value
 * - Non-task properties (blocks::, author::, etc.) are always preserved
 *
 * Used by:
 * - nodes2md.ts serializer (appendTaskMetadata) — roundtrip preserves format
 * - TreeNode.tsx TUI editor (composeRawEditContent) — edits trigger key:: value rewrite
 */
export function stringifyTaskMetadata(content: string, node: KNode, options?: { includeAssignedTo?: boolean }): string {
  // Extract current node field values
  const dueParts = decomposeDatetime(node.due_at)
  const startParts = decomposeDatetime(node.start_at)
  const recurrence = node.rrule ?? (node.data?.rrule as string | undefined)

  // Extract what's already in the content (any format)
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
  let cleanContent = stripTaskMetadataFormats(content)

  const entries: MetadataEntries = {}
  if (dueParts?.date) {
    entries.due = dueParts.time ? `${dueParts.date}T${dueParts.time}` : dueParts.date
  }
  if (startParts?.date) {
    entries.start = startParts.time ? `${startParts.date}T${startParts.time}` : startParts.date
  }
  if (node.priority != null) {
    entries.p = String(node.priority)
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
 * Handles all three formats (key:: value, key:value, emoji).
 *
 * Used by TUI save handlers to restore structured fields from inline-edited text.
 */
export function parseTaskMetadataFromText(text: string): {
  cleanContent: string
  due_at?: string
  start_at?: string
  priority?: number
  rrule?: string
} {
  // Extract metadata from all formats
  const extracted = extractTaskMetadata(text)

  // Strip task-specific metadata from text to get clean content (preserves non-task properties)
  let clean = stripTaskMetadataFormats(text)

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

/** Task-specific keys that stringifyTaskMetadata manages */
const TASK_METADATA_KEYS = ["due", "start", "p", "recur"]

/** Strip task-specific metadata from all formats (new key:: value + legacy + emoji) */
function stripTaskMetadataFormats(text: string): string {
  let clean = text
  // Strip only task-specific key:: value pairs (preserve other properties like blocks::, author::)
  for (const key of TASK_METADATA_KEYS) {
    clean = clean.replace(new RegExp(`\\s*\\b${key}:: (?:"(?:[^"\\\\]|\\\\.)*"|\\S+)`, "g"), "")
  }
  return stripLegacyAndEmojiMetadata(clean)
}

/** Strip legacy key:value and emoji metadata from text */
function stripLegacyAndEmojiMetadata(text: string): string {
  let clean = text
  // Legacy key:value
  clean = clean.replace(STRIP_LEGACY_DUE, "")
  clean = clean.replace(STRIP_LEGACY_START, "")
  clean = clean.replace(STRIP_LEGACY_PRIORITY, "")
  clean = clean.replace(STRIP_LEGACY_RECURRENCE, "")
  // Emoji
  clean = clean.replace(STRIP_EMOJI_DUE, "")
  clean = clean.replace(STRIP_EMOJI_START, "")
  clean = clean.replace(STRIP_EMOJI_PRIORITY, "")
  clean = clean.replace(STRIP_EMOJI_RECURRENCE, "")
  // Normalize whitespace
  clean = clean.replace(/\s{2,}/g, " ").trim()
  return clean
}
