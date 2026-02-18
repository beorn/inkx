import type { AsanaClient } from "./asana-client.ts"
import type { ImportComment } from "../types.ts"

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
  /^marked today/i,
  /^unmarked today/i,
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
const CONSOLIDATED_HEADER = /^.+ on (?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) \w+ \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M:$/

/** Cutoff: only apply pattern filtering to comments before 2020 */
const SYSTEM_COMMENT_CUTOFF = "2020-01-01T00:00:00Z"

export function isSystemAction(actionText: string): boolean {
  return SYSTEM_ACTION_PATTERNS.some((p) => p.test(actionText))
}

/**
 * Filter system actions from a comment. Returns cleaned text or empty string if all system.
 * Handles both standalone and consolidated (dash-separated) formats.
 */
export function filterSystemComment(text: string, createdAt: string): string {
  if (createdAt >= SYSTEM_COMMENT_CUTOFF) return text

  // Check if this is a consolidated comment (has dash separators)
  if (text.includes("----------------------")) {
    const blocks = text.split(/\s*-{20,}\s*/)
    const kept: string[] = []
    for (const block of blocks) {
      const trimmed = block.trim()
      if (!trimmed) continue
      // Consolidated block: "Name on Day Month DD, YYYY HH:MM AM/PM:\n action"
      const lines = trimmed.split("\n")
      const firstLine = lines[0]!.trim()
      if (CONSOLIDATED_HEADER.test(firstLine)) {
        // Check the action text (lines after the header)
        const actionText = lines.slice(1).join("\n").trim()
        if (!actionText || isSystemAction(actionText)) continue
      }
      kept.push(trimmed)
    }
    return kept.join("\n\n")
  }

  // Standalone comment: check against patterns
  if (isSystemAction(text)) return ""
  return text
}

/** Fetch comments (stories) for a task */
export async function fetchComments(
  client: AsanaClient,
  taskGid: string,
  opts?: { includeLogs?: boolean },
): Promise<ImportComment[]> {
  const stories = await client.get<
    Array<{
      gid: string
      type: string
      text?: string
      created_at: string
      created_by?: { name?: string }
    }>
  >(`/tasks/${taskGid}/stories`, { opt_fields: "type,text,created_at,created_by.name" })

  const comments: ImportComment[] = []
  for (const s of stories) {
    if (s.type !== "comment" || !s.text?.trim()) continue
    const text = opts?.includeLogs ? s.text!.trim() : filterSystemComment(s.text!.trim(), s.created_at)
    if (!text) continue
    comments.push({
      author: s.created_by?.name?.replace(/\s+/g, "-").toLowerCase(),
      createdAt: s.created_at,
      text,
    })
  }
  return comments
}
