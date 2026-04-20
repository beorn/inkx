/**
 * Helper functions for the Detail Pane component.
 */

import type { KNode } from "@km/core"
import type { Repo } from "../repo-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { extractRefs } from "../text/text-pipeline.ts"
import { parseInlineText, inlineNodesToPlainText } from "../text/inline-parser.ts"
import type { InlineNode } from "../text/inline-ast-types.ts"

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
  done: { text: "done", color: "$fg-success" },
  wip: { text: "wip", color: "$fg-warning" },
  blocked: { text: "blocked", color: "$fg-error" },
  dropped: { text: "dropped", color: "$fg-muted" },
}

export function getStatusDisplay(status?: string): { text: string; color: string } {
  return STATUS_DISPLAY[status ?? ""] ?? { text: "todo", color: "$border-focus" }
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

/**
 * Extract all references from content. Delegates to the canonical
 * extractRefs() from the text pipeline (Unicode-aware patterns).
 */
export function extractReferences(content: string | undefined): References {
  if (!content) {
    return { mentions: [], tags: [], projects: [], wikilinks: [] }
  }
  return extractRefs(content)
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
    path.unshift(getNodeDisplayName(repo, parent))
    currentId = parent.parent_id
  }

  return path
}

// =============================================================================
// Project slug resolution
// =============================================================================

/** Slugify a string (same algorithm as import pipeline) */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Resolve project slugs to display names by searching the repo for matching nodes.
 * A slug like "family-sprint" matches a node whose content slugifies to "family-sprint"
 * (e.g., a node with content "FAMILY SPRINT").
 *
 * Returns a new array with resolved names, preserving order. Falls back to the raw
 * slug when no matching node is found.
 */
export function resolveProjectDisplayNames(repo: Repo, slugs: string[]): string[] {
  if (slugs.length === 0) return slugs

  return slugs.map((slug) => {
    // Search by the first word of the slug to find candidates, then verify
    // by full slugification. The search function does substring matching,
    // so "family" will find "FAMILY SPRINT".
    const firstWord = slug.split("-")[0]
    if (!firstWord) return slug

    const candidates = repo.search(firstWord)
    for (const node of candidates) {
      if (node.content && slugify(node.content) === slug) {
        return getNodeDisplayName(repo, node)
      }
    }
    // Fallback: return the raw slug
    return slug
  })
}

// =============================================================================
// Text utilities
// =============================================================================

/** Hardcoded person name -> short name mapping. P4: replace with contact type system. */
export const PERSON_SHORT_NAMES: Record<string, string> = {
  "bjørn-stabell": "BS",
  "bjorn-stabell": "BS",
  bjørn: "BS",
  bjorn: "BS",
  "michael-welch": "MW",
  michael: "MW",
  "shi-delei": "SD",
  shi: "SD",
}

/** Strip ONLY known person @mentions; preserve everything else verbatim.
 *
 * Bug history (km-tui.strip-known-mentions-overreach): the previous version
 * stripped #tags, +projects, and inline formatting markers (bold/italic/code/
 * link/url) from card titles. The "info suffix already shows @BS" rationale
 * doesn't apply to anything except the @mention itself, so the function now
 * preserves all other inline content byte-for-byte.
 *
 * Unknown @mentions (sigils like @next, @urgent) are also preserved. */
export function stripKnownMentions(text: string): string {
  const nodes = parseInlineText(text)
  return stripKnownFromNodes(nodes).trim().replace(/  +/g, " ")
}

function stripKnownFromNodes(nodes: InlineNode[]): string {
  let result = ""
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (!node) continue
    switch (node.type) {
      case "mention": {
        const isKnown = PERSON_SHORT_NAMES[node.name.toLowerCase()] !== undefined
        if (isKnown) {
          // Skip trailing surname in next plain text node (e.g., " Stabell" after "@Bjørn")
          const next = nodes[i + 1]
          if (next?.type === "plain") {
            const stripped = next.text.replace(/^ [A-Z\p{Lu}][\p{L}'-]*/u, "")
            if (stripped !== next.text) {
              // We consumed part of the next node
              if (stripped.length > 0) {
                result += stripped
              }
              i++ // skip the next node since we processed it
            }
          }
        } else {
          result += `@${node.name}`
        }
        break
      }
      // Tags and projects: preserve verbatim with sigil. Previously stripped.
      case "tag":
        result += `#${node.name}`
        break
      case "project":
        result += `+${node.name}`
        break
      // Inline formatting: preserve markers so the user sees the actual style.
      // Previously emitted only the inner children, losing bold/italic/strike.
      case "bold":
        result += `**${stripKnownFromNodes(node.children)}**`
        break
      case "italic":
        result += `*${stripKnownFromNodes(node.children)}*`
        break
      case "strikethrough":
        result += `~~${stripKnownFromNodes(node.children)}~~`
        break
      case "wikilink":
        result += node.alias ? `[[${node.target}|${node.alias}]]` : `[[${node.target}]]`
        break
      // For code, link, bareurl, field, and plain, fall through to
      // inlineNodesToPlainText, which already does the right thing:
      //   • code/link → just the text content (URL hidden)
      //   • bareurl → prettifyUrl (protocol stripped, www removed, params cleaned)
      //   • field → "" (metadata, not displayed in titles)
      default:
        result += inlineNodesToPlainText([node])
        break
    }
  }
  return result
}

/** Capitalize the first character of a string */
export function capitalize(s: string): string {
  return (s[0] ?? "").toUpperCase() + s.slice(1)
}
