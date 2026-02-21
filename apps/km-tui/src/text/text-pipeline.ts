/**
 * Text Pipeline Utilities
 *
 * Canonical Unicode-aware patterns for sigils (@mentions, #tags, +projects)
 * and extraction helpers. All consumers import from this module.
 *
 * Rich text rendering has moved to the inline AST system:
 * - Parsing: inline-parser.ts (parseInlineText)
 * - Rendering: InlineComponents.tsx (InlineText)
 * - Plain text: inline-parser.ts (parseToPlainText)
 */

// =============================================================================
// Canonical Patterns (Unicode-aware)
// =============================================================================

/** Combined sigil pattern: captures prefix and name separately (includes / and . for nested projects) */
export const SIGIL_PATTERN = /([@#\+])([\p{L}\p{N}_\/.-]+)/gu

// =============================================================================
// Extraction Helpers
// =============================================================================

/**
 * Extract all references from text in a single pass (Unicode-aware).
 * Returns deduplicated arrays of mentions, tags, projects, and wikilinks.
 */
export function extractRefs(content: string): {
  mentions: string[]
  tags: string[]
  projects: string[]
  wikilinks: string[]
} {
  const mentions = new Set<string>()
  const tags = new Set<string>()
  const projects = new Set<string>()
  const wikilinks = new Set<string>()

  // Extract sigils in one pass
  SIGIL_PATTERN.lastIndex = 0
  let match
  while ((match = SIGIL_PATTERN.exec(content)) !== null) {
    const prefix = match[1]
    const name = match[2]
    if (!name) continue
    if (prefix === "@") mentions.add(name)
    else if (prefix === "#") tags.add(name)
    else if (prefix === "+") projects.add(name)
  }

  // Extract wikilinks separately (different syntax)
  const wlRegex = /\[\[([^\]]+)\]\]/g
  while ((match = wlRegex.exec(content)) !== null) {
    if (match[1]) wikilinks.add(match[1])
  }

  return {
    mentions: [...mentions],
    tags: [...tags],
    projects: [...projects],
    wikilinks: [...wikilinks],
  }
}

// =============================================================================
// URL Helpers
// =============================================================================

/**
 * Strip protocol and www prefix from a URL for display.
 * "https://www.example.com/path" → "example.com/path"
 * "http://example.com" → "example.com"
 * Trailing slash on bare domains is also stripped: "example.com/" → "example.com"
 */
export function prettifyUrl(url: string): string {
  let display = url.replace(/^https?:\/\//, "").replace(/^www\./, "")
  // Strip trailing slash on bare domain (no path)
  if (display.endsWith("/") && !display.slice(0, -1).includes("/")) {
    display = display.slice(0, -1)
  }
  return display
}
