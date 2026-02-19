/**
 * Unified Text Processing Pipeline
 *
 * Single entry point for all text → display conversions.
 * Handles stripping, formatting, and rendering in one composable pipeline.
 *
 * Canonical Unicode-aware patterns for sigils (@mentions, #tags, +projects)
 * live here — all consumers import from this module.
 */

import { createTerm, stripAnsi, type StyleChain } from "inkx"
import { dashedUnderline } from "chalkx"
import { PROP_REGEX } from "@km/markdown"
import { getTermColor } from "./colors.ts"

// =============================================================================
// Canonical Patterns (Unicode-aware)
// =============================================================================

/** Match @mentions: @person-name (Unicode letters/digits/underscore/hyphen) */
export const MENTION_PATTERN = /@([\p{L}\p{N}_-]+)/gu

/** Match #tags: #tag-name */
export const TAG_PATTERN = /#([\p{L}\p{N}_-]+)/gu

/** Match +projects: +project-name (also allows / and . for nested projects) */
export const PROJECT_PATTERN = /\+([\p{L}\p{N}_/.-]+)/gu

/** Combined sigil pattern: captures prefix and name separately */
export const SIGIL_PATTERN = /([@#\+])([\p{L}\p{N}_-]+)/gu

/** Inline field attributes: [due:: 2024-01-15], [priority:: 1] */
const INLINE_FIELD_BRACKET_REGEX = /\[(\w+)::\s*([^\]]*)\]/g

/** Wiki links: [[note]], [[path/to/note|alias]], ![[embed]] */
const WIKI_LINK_REGEX = /!?\[\[([^\]]+)\]\]/g

/** Markdown links: [text](url) */
const MD_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g

/** Markdown formatting */
const BOLD_REGEX = /\*\*([^*]+)\*\*/g
const ITALIC_ASTERISK_REGEX = /(?<!\*)\*([^*]+)\*(?!\*)/g
const ITALIC_UNDERSCORE_REGEX = /(?<![_\w])_([^_]+)_(?![_\w])/g
const CODE_REGEX = /`([^`]+)`/g
const STRIKETHROUGH_REGEX = /~~([^~]+)~~/g

/** HTML tags */
const HTML_TAG_REGEX = /<[^>]+>/g

/** Draft/tentative content patterns */
const DRAFT_PREFIX_REGEX = /^(Draft|WIP|TODO|FIXME):\s*/i

// =============================================================================
// Types
// =============================================================================

export interface TextPipelineOptions {
  /** Output mode */
  mode: "rich" | "plain" | "stripped"

  /** Sigils to exclude entirely from output (e.g., ["@issue"] on the @issue board) */
  excludeSigils?: string[]

  /** Map of sigil to color for rich mode */
  sigilColors?: Map<string, string>

  /** Dynamic color resolver for rich mode */
  resolveSigilColor?: (sigil: string) => string | undefined

  /** Replace person @mentions with short names (e.g., @bjorn-stabell -> @BS) */
  shortenMentions?: boolean

  /** Person name -> short name map (used with shortenMentions) */
  personShortNames?: Record<string, string>

  /** Strip @mentions, #tags, +projects from output */
  stripRefs?: boolean

  /** Strip only #tags and +projects, keep @mentions (used with shortenMentions) */
  stripTagsAndProjects?: boolean
}

// =============================================================================
// Extraction Helpers
// =============================================================================

/**
 * Extract display text and target from a wiki link content.
 * For [[path|alias]], returns { display: "alias", target: "path" }.
 * For [[text]], returns { display: "text", target: "text" }.
 */
export function extractLinkParts(linkContent: string): {
  display: string
  target: string
} {
  if (linkContent.includes("|")) {
    const parts = linkContent.split("|")
    return {
      target: parts[0] ?? linkContent,
      display: parts[1] ?? linkContent,
    }
  }
  return { display: linkContent, target: linkContent }
}

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
// Pipeline Core
// =============================================================================

/**
 * Create a term instance with truecolor support.
 * Called per-invocation to avoid module-level mutable state.
 */
function createTermStyle(): StyleChain {
  return createTerm({ color: "truecolor" })
}

/**
 * Process text through the unified pipeline.
 *
 * This is the single entry point for all text -> display conversions.
 * The pipeline handles stripping metadata, formatting markdown, and
 * applying ANSI styling in the correct order.
 *
 * @example
 * // Rich mode (ANSI styled for TUI display)
 * processText("Task [[project|My Project]] @issue", { mode: "rich" })
 *
 * @example
 * // Plain mode (no ANSI, markdown stripped)
 * processText("**bold** and *italic*", { mode: "plain" })
 *
 * @example
 * // Stripped mode (no sigils, no metadata)
 * processText("Task @person #tag +project due:: 2024-01-15", {
 *   mode: "stripped",
 *   stripRefs: true,
 * })
 *
 * @example
 * // Shorten mentions, strip tags/projects
 * processText("Task @bjorn-stabell #tag +project", {
 *   mode: "plain",
 *   shortenMentions: true,
 *   stripTagsAndProjects: true,
 *   personShortNames: { "bjorn-stabell": "BS" },
 * })
 */
export function processText(text: string, options: TextPipelineOptions): string {
  const { mode } = options
  const isRich = mode === "rich"

  // Check draft prefix before processing (applied at the end for rich mode)
  const isDraft = isRich && DRAFT_PREFIX_REGEX.test(text)

  // Style instance (only needed for rich mode)
  const style = isRich ? createTermStyle() : null

  let result = text

  // ── Step 1: Strip bracketed inline fields [key:: value] ──
  if (isRich && style) {
    // Rich mode: style inline properties
    result = result.replace(INLINE_FIELD_BRACKET_REGEX, (_m, key: string, value: string) =>
      styleInlineProp(style, key, value),
    )
  } else {
    result = result.replace(INLINE_FIELD_BRACKET_REGEX, "")
  }

  // ── Step 2: Strip key:: value props ──
  if (isRich && style) {
    PROP_REGEX.lastIndex = 0
    result = result.replace(PROP_REGEX, (match, key: string, value: string) => {
      if (key.startsWith("km.")) return "" // strip system props
      return styleInlineProp(style, key, value)
    })
  } else {
    PROP_REGEX.lastIndex = 0
    result = result.replace(PROP_REGEX, "")
  }

  // ── Step 3: Strip HTML tags ──
  result = result.replace(HTML_TAG_REGEX, "")

  // ── Step 4: Handle markdown links [text](url) ──
  if (isRich && style) {
    result = result.replace(MD_LINK_REGEX, (_match, linkText: string) => style.underline(linkText))
  } else {
    result = result.replace(MD_LINK_REGEX, (_match, linkText: string) => linkText)
  }

  // ── Step 5: Handle wiki links [[target|alias]] ──
  if (isRich && style) {
    result = result.replace(WIKI_LINK_REGEX, (_match, content: string) => {
      const { display } = extractLinkParts(content)
      return style.underline(display)
    })
  } else {
    result = result.replace(WIKI_LINK_REGEX, (_match, content: string) => {
      return extractLinkParts(content).display
    })
  }

  // ── Step 6: Handle sigils (@mention, #tag, +project) ──
  result = processSigils(result, options, style)

  // ── Step 7: Strip residual key:: value metadata ──
  if (options.stripRefs) {
    result = result.replace(/\s*\b\w[\w-]*:: (?:"(?:[^"\\]|\\.)*"|[^\s]+)/g, "")
  }

  // ── Step 8: Handle markdown formatting ──
  if (isRich && style) {
    result = result.replace(BOLD_REGEX, (_m, c: string) => style.bold(c))
    result = result.replace(ITALIC_ASTERISK_REGEX, (_m, c: string) => style.italic(c))
    result = result.replace(ITALIC_UNDERSCORE_REGEX, (_m, c: string) => style.italic(c))
    result = result.replace(CODE_REGEX, (_m, c: string) => style.cyan(c))
    result = result.replace(STRIKETHROUGH_REGEX, (_m, c: string) => style.dim.strikethrough(c))
  } else {
    result = result.replace(BOLD_REGEX, (_m, c: string) => c)
    result = result.replace(ITALIC_ASTERISK_REGEX, (_m, c: string) => c)
    result = result.replace(ITALIC_UNDERSCORE_REGEX, (_m, c: string) => c)
    result = result.replace(CODE_REGEX, (_m, c: string) => c)
    result = result.replace(STRIKETHROUGH_REGEX, (_m, c: string) => c)
  }

  // ── Step 9: Clean whitespace ──
  result = result
    .replace(/\n{2,}/g, "\n")
    .replace(/  +/g, " ")
    .trim()

  // ── Step 10: Draft styling ──
  if (isDraft) {
    result = dashedUnderline(result)
  }

  return result
}

// =============================================================================
// Internal Helpers
// =============================================================================

/** Style an inline property for rich mode: key in dim cyan, :: in dim, value colored by type */
function styleInlineProp(style: StyleChain, key: string, value: string): string {
  const trimVal = value.trim()
  const styledVal = WIKI_LINK_REGEX.test(trimVal)
    ? trimVal // Links get styled in the wiki link pass
    : /^\d{4}-\d{2}-\d{2}/.test(trimVal)
      ? style.green(trimVal)
      : /^\d+(\.\d+)?$/.test(trimVal)
        ? style.yellow(trimVal)
        : style.white(trimVal)
  return style.dim.cyan(key) + style.dim(":: ") + styledVal
}

/** Process sigils based on pipeline options */
function processSigils(text: string, options: TextPipelineOptions, style: StyleChain | null): string {
  const {
    excludeSigils: excludeSigilsArr,
    sigilColors,
    resolveSigilColor,
    shortenMentions,
    personShortNames,
    stripRefs,
    stripTagsAndProjects,
  } = options
  const isRich = options.mode === "rich"
  const excludeSigils = new Set(excludeSigilsArr ?? [])

  SIGIL_PATTERN.lastIndex = 0
  return text.replace(SIGIL_PATTERN, (_match, prefix: string, name: string) => {
    const sigil = `${prefix}${name}`
    const isMention = prefix === "@"

    // Excluded sigils are removed entirely
    if (excludeSigils.has(sigil)) return ""

    // Strip all refs
    if (stripRefs) return ""

    // Strip tags and projects (keep mentions, possibly shortened)
    if (stripTagsAndProjects && !isMention) return ""

    // Shorten person mentions
    if (shortenMentions && isMention) {
      const shortName = personShortNames?.[name.toLowerCase()]
      if (shortName) return `@${shortName}`
      // Not a known person — keep original
    }

    // Rich mode: apply sigil colors
    if (isRich && style) {
      const color = sigilColors?.get(sigil) ?? resolveSigilColor?.(sigil)
      if (color) {
        return getTermColor(color, style)(sigil)
      }
      // Unresolved sigil: plain text
    }

    return sigil
  })
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Render text with rich ANSI styling (convenience wrapper).
 * Equivalent to processText(text, { mode: "rich", ...options }).
 */
export function renderRichText(text: string, options?: Omit<TextPipelineOptions, "mode">): string {
  return processText(text, { ...options, mode: "rich" })
}

/**
 * Render text as plain text (convenience wrapper).
 * Strips markdown formatting, wiki links, inline fields.
 */
export function renderPlainText(text: string): string {
  return processText(text, { mode: "plain" })
}

/**
 * Strip inline refs (@mentions, #tags, +projects) and metadata from text.
 * Used for display titles where refs are shown separately in the metadata table.
 *
 * Replaces the old `stripInlineRefs()` from detail-pane-helpers.ts.
 */
export function stripInlineRefsFromText(text: string): string {
  return processText(text, { mode: "plain", stripRefs: true })
}

/**
 * Shorten person mentions and strip tags/projects from text.
 * Unknown @mentions are kept as-is. Used for card titles where
 * the info suffix shows assignee separately.
 *
 * Replaces the old `shortenInlineRefs()` from detail-pane-helpers.ts.
 */
export function shortenInlineRefsInText(text: string, personShortNames?: Record<string, string>): string {
  return processText(text, {
    mode: "plain",
    shortenMentions: true,
    stripTagsAndProjects: true,
    personShortNames,
  })
}

// Re-export ANSI utilities from inkx (canonical location)
export { stripAnsi }
