/**
 * Helper functions for the Detail Pane component.
 */

import type { KNode } from "@km/core"
import type { Repo } from "../repo-context.tsx"
import { getNodeDisplayName } from "../state.ts"

// =============================================================================
// Date formatting
// =============================================================================

// Due date urgency levels
export type DueUrgency = "overdue" | "urgent" | "soon" | "normal"

// Format date for display (e.g., "Jan 10" or "2026-01-10") with urgency info
export function formatDate(dateStr: string | undefined): {
  text: string
  urgency: DueUrgency
} {
  if (!dateStr) return { text: "", urgency: "normal" }
  try {
    // Parse date string as local date to avoid timezone issues
    // YYYY-MM-DD should be treated as local midnight, not UTC midnight
    const parts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    const date = parts ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])) : new Date(dateStr)

    const now = new Date()
    now.setHours(0, 0, 0, 0)

    const dateLocal = new Date(date)
    dateLocal.setHours(0, 0, 0, 0)

    // Calculate days until due
    const daysUntilDue = Math.floor((dateLocal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    // Determine urgency
    let urgency: DueUrgency = "normal"
    if (daysUntilDue < 0) {
      urgency = "overdue"
    } else if (daysUntilDue <= 1) {
      urgency = "urgent" // Due today or tomorrow
    } else if (daysUntilDue <= 3) {
      urgency = "soon" // Due within 3 days
    }

    // Format display text
    const sameYear = date.getFullYear() === now.getFullYear()
    const text = sameYear
      ? date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : dateStr

    return { text, urgency }
  } catch {
    return { text: dateStr, urgency: "normal" }
  }
}

// =============================================================================
// Status display
// =============================================================================

// Status display with color
const STATUS_DISPLAY: Record<string, { text: string; color: string }> = {
  done: { text: "done", color: "green" },
  wip: { text: "wip", color: "yellow" },
  blocked: { text: "blocked", color: "red" },
  dropped: { text: "dropped", color: "gray" },
}

export function getStatusDisplay(status?: string): { text: string; color: string } {
  return STATUS_DISPLAY[status ?? ""] ?? { text: "todo", color: "blue" }
}

// =============================================================================
// Reference extraction
// =============================================================================

export interface References {
  mentions: string[]
  tags: string[]
  projects: string[]
  wikilinks: string[]
}

// Extract unique matches from content using a regex pattern
export function extractMatches(content: string, pattern: RegExp): string[] {
  const matches = new Set<string>()
  let match
  while ((match = pattern.exec(content)) !== null) {
    if (match[1]) matches.add(match[1])
  }
  return [...matches]
}

export function extractReferences(content: string | undefined): References {
  if (!content) {
    return { mentions: [], tags: [], projects: [], wikilinks: [] }
  }
  return {
    mentions: extractMatches(content, /@(\w+)/g),
    tags: extractMatches(content, /#(\w+)/g),
    projects: extractMatches(content, /\+(\w+)/g),
    wikilinks: extractMatches(content, /\[\[([^\]]+)\]\]/g),
  }
}

// =============================================================================
// Project path
// =============================================================================

// Build project path (ancestors to root)
export function getProjectPath(repo: Repo, node: KNode): string[] {
  const path: string[] = []
  let currentId = node.parent_id

  while (currentId) {
    const parent = repo.getNode(currentId)
    if (!parent) break

    // Only include folders and files (not sections or the board root)
    if (
      parent.type === "oi" &&
      (parent.fstype === "folder" || parent.fstype === "file" || parent.fstype === "mdfile")
    ) {
      path.unshift(getNodeDisplayName(repo, parent))
    }
    currentId = parent.parent_id
  }

  return path
}

// =============================================================================
// Text utilities
// =============================================================================

/** Strip @mentions, #tags, +projects from text (they're shown separately in props) */
export function stripInlineRefs(text: string): string {
  return text
    .replace(/\s*@\w[\w-]*/g, "")
    .replace(/\s*#\w[\w-]*/g, "")
    .replace(/\s*\+\w[\w/.-]*/g, "")
    .trim()
}

/** Capitalize the first character of a string */
export function capitalize(s: string): string {
  return (s[0] ?? "").toUpperCase() + s.slice(1)
}
