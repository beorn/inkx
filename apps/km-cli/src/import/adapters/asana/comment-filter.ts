import type { AsanaClient } from "./asana-client.ts"
import type { ImportComment } from "../../types.ts"
import { htmlToMarkdown } from "./html-to-md.ts"

/** Patterns that match system/audit-log style actions from old Asana (pre-2020).
 * Asana switched to proper `type: "system"` around 2019, so older action-log
 * entries were stored as `type: "comment"`. These can appear:
 * 1. As standalone comments (one action per comment)
 * 2. As consolidated comments with multiple actions separated by "----------------------"
 *    Format: "Name on Weekday Month DD, YYYY HH:MM AM/PM:\n action text"
 */
const SYSTEM_ACTION_PATTERNS = [
  /^moved this (?:task|issue)/i,
  /^completed this task/i,
  /^marked this task/i,
  /^marked (?:today|incomplete|complete)/i,
  /^unmarked /i,
  /^changed the (?:name|due date|assignee|description)/i,
  /^added to /i,
  /^removed from /i,
  /^assigned to /i,
  /^unassigned /i,
  /^added the /i,
  /^removed the /i,
  /^created (?:this )?task/i,
  /^duplicated from /i,
  /^merged with /i,
  /^liked this task/i,
  /^moved from /i,
  /^moved into /i,
  /^moved out of /i,
  /^added subtask to /i,
  /^have a task due /i,
  /^changed the name to /i,
]

/** Matches consolidated comment block headers: "Name on Weekday Month DD, YYYY HH:MM AM/PM:" */
const CONSOLIDATED_HEADER =
  /^.+ on (?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) \w+ \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M:$/

/** Cutoff: only apply pattern filtering to comments before 2020 */
const SYSTEM_COMMENT_CUTOFF = "2020-01-01T00:00:00Z"

export function isSystemAction(actionText: string): boolean {
  return SYSTEM_ACTION_PATTERNS.some((p) => p.test(actionText))
}

/** Strip invisible chars (soft hyphen, zero-width, etc.) for content checks */
function stripInvisible(text: string): string {
  return text.replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, "")
}

/**
 * Check if a text block is a single consolidated system log entry.
 * Format: "Name on Weekday Month DD, YYYY HH:MM AM/PM:\n action text"
 */
function isConsolidatedSystemBlock(text: string): boolean {
  const lines = text.split("\n")
  // Find the header line (may be preceded by empty/invisible-only lines)
  let headerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (CONSOLIDATED_HEADER.test((lines[i] ?? "").trim())) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) return false
  // Everything before the header must be empty/invisible
  for (let i = 0; i < headerIdx; i++) {
    if (stripInvisible(lines[i] ?? "").trim()) return false
  }
  const actionText = lines
    .slice(headerIdx + 1)
    .join("\n")
    .trim()
  return !actionText || isSystemAction(actionText)
}

/**
 * Split a comment into blocks. Blocks can be separated by:
 * 1. Dash separators (----------------------)
 * 2. Soft hyphen (\u00AD) or other invisible chars on their own line
 */
function splitIntoBlocks(text: string): string[] {
  // First try dash separators
  if (text.includes("----------------------")) {
    return text.split(/\s*-{20,}\s*/)
  }
  // Split on lines that are only invisible chars (soft hyphen, etc.)
  // Actual Asana format: "\n\n\u00AD\n" (blank line, soft hyphen line, newline)
  return text.split(/\n\s*[\u00AD\u200B\u200C\u200D\uFEFF]+\s*\n/)
}

/**
 * Filter system actions from a comment. Returns cleaned text or empty string if all system.
 * Handles both standalone and consolidated (dash-separated or invisible-char-separated) formats.
 */
export function filterSystemComment(text: string, createdAt: string): string {
  if (createdAt >= SYSTEM_COMMENT_CUTOFF) return text

  const blocks = splitIntoBlocks(text)
  if (blocks.length > 1) {
    const kept: string[] = []
    for (const block of blocks) {
      const trimmed = block.trim()
      if (!trimmed || !stripInvisible(trimmed)) continue
      if (isConsolidatedSystemBlock(trimmed)) continue
      kept.push(trimmed)
    }
    return kept.join("\n\n")
  }

  // Single block: check consolidated format, then standalone
  if (isConsolidatedSystemBlock(text)) return ""
  if (isSystemAction(stripInvisible(text).trim())) return ""
  return text
}

/** Months for parsing consolidated header dates */
const MONTHS: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
}

/** Parse date from consolidated header: "Name on Weekday Month DD, YYYY HH:MM AM/PM:" → YYYY-MM-DD */
function parseConsolidatedDate(headerLine: string): string | undefined {
  const m = headerLine.match(/on (?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\w* (\w+) (\d{1,2}), (\d{4}) /)
  if (!m) return undefined
  const month = MONTHS[m[1] ?? ""]
  if (!month) return undefined
  return `${m[3] ?? ""}-${month}-${(m[2] ?? "").padStart(2, "0")}`
}

/** Strip the consolidated "Name on Day Mon DD, YYYY HH:MM AM/PM:" header from a block's content */
function stripConsolidatedHeader(text: string): { content: string; date?: string } {
  const lines = text.split("\n")
  let headerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (CONSOLIDATED_HEADER.test((lines[i] ?? "").trim())) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) return { content: text }

  const headerLine = lines[headerIdx]
  if (!headerLine) return { content: text }
  const date = parseConsolidatedDate(headerLine.trim())
  const content = lines
    .slice(headerIdx + 1)
    .join("\n")
    .trim()
  return { content, date }
}

export interface SplitComment {
  text: string
  /** Extracted date (YYYY-MM-DD) from consolidated header, if present */
  date?: string
}

/**
 * Split a consolidated comment into separate user comment entries.
 * Each entry gets the date extracted from its consolidated header.
 * System action blocks are filtered out (for pre-2020 comments).
 * Non-consolidated comments return as a single entry.
 */
export function splitConsolidatedComment(text: string, createdAt: string): SplitComment[] {
  const blocks = splitIntoBlocks(text)

  if (blocks.length <= 1) {
    // Single block — check if it has a consolidated header to strip
    const stripped = stripConsolidatedHeader(text)
    if (stripped.content !== text && stripped.date) {
      // Has consolidated header — check for system action
      if (createdAt < SYSTEM_COMMENT_CUTOFF && isConsolidatedSystemBlock(text)) return []
      if (!stripped.content.trim()) return []
      return [{ text: stripped.content, date: stripped.date }]
    }
    // Plain text, no header
    const plain = filterSystemComment(text, createdAt)
    if (!plain.trim()) return []
    return [{ text: plain }]
  }

  // Multi-block: process each block independently
  const results: SplitComment[] = []
  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed || !stripInvisible(trimmed)) continue

    // Check for system action (pre-2020 only)
    if (createdAt < SYSTEM_COMMENT_CUTOFF && isConsolidatedSystemBlock(trimmed)) continue

    const stripped = stripConsolidatedHeader(trimmed)
    const content = stripped.content || trimmed
    if (!content.trim()) continue
    results.push({ text: content, date: stripped.date })
  }
  return results
}

/** Result from fetchComments: user comments + system activity log */
export interface FetchCommentsResult {
  comments: ImportComment[]
  activityLog: ImportComment[]
}

/** Fetch comments (stories) for a task, separating user comments from system activity */
export async function fetchComments(
  client: AsanaClient,
  taskGid: string,
  opts?: { includeLogs?: boolean },
): Promise<ImportComment[]>
export async function fetchComments(
  client: AsanaClient,
  taskGid: string,
  opts: { includeLogs?: boolean; includeActivity: true },
): Promise<FetchCommentsResult>
export async function fetchComments(
  client: AsanaClient,
  taskGid: string,
  opts?: { includeLogs?: boolean; includeActivity?: boolean },
): Promise<ImportComment[] | FetchCommentsResult> {
  const stories = await client.get<
    Array<{
      gid: string
      type: string
      text?: string
      html_text?: string
      created_at: string
      created_by?: { name?: string }
    }>
  >(`/tasks/${taskGid}/stories`, {
    opt_fields: "type,text,html_text,created_at,created_by.name",
  })

  const comments: ImportComment[] = []
  const activityLog: ImportComment[] = []

  for (const s of stories) {
    if (!s.text?.trim() && !s.html_text?.trim()) continue
    const author = s.created_by?.name?.replace(/\s+/g, "-").toLowerCase()

    // Prefer html_text (preserves bold, italic, links) over plain text
    const richText = s.html_text ? htmlToMarkdown(s.html_text)?.trim() : null
    const plainText = s.text?.trim() ?? ""

    // System stories → activity log (always captured)
    if (s.type === "system") {
      // Strip author's full name from text start — we already show @username
      const authorName = s.created_by?.name
      const text =
        authorName && plainText.startsWith(authorName) ? plainText.slice(authorName.length).trimStart() : plainText
      activityLog.push({
        author,
        createdAt: s.created_at,
        text,
      })
      continue
    }

    if (s.type !== "comment") continue
    const rawText = richText || plainText
    if (!rawText) continue
    const text = opts?.includeLogs ? rawText : filterSystemComment(rawText, s.created_at)
    if (!text) continue
    comments.push({ author, createdAt: s.created_at, text })
  }

  if (opts?.includeActivity) {
    return { comments, activityLog }
  }
  return comments
}
