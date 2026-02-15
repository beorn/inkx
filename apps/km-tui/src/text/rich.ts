/**
 * Rich Text Rendering (Layer 1 - Shared)
 *
 * Transform raw markdown content to styled ANSI strings.
 * Used by both CLI commands and TUI components.
 *
 * ## Functions
 * - `renderRich(raw)` - strips markup, applies term styling
 * - `renderPlain(raw)` - strips markup, returns plain text
 * - `displayLength(styled)` - character count excluding ANSI codes
 * - `stripAnsi(styled)` - remove all ANSI escape codes
 */

import { createTerm, stripAnsi, type StyleChain } from "inkx"
import { dashedUnderline } from "chalkx"
import stringWidth from "string-width"
import { getTermColor } from "./colors.ts"

/**
 * Create a term instance with truecolor support.
 * Called per-invocation to avoid module-level mutable state.
 */
function createTermStyle(): StyleChain {
  return createTerm({ color: "truecolor" })
}

// ============================================================================
// ANSI String Utilities
// ============================================================================

// Re-export ANSI utilities from inkx (canonical implementation)
export { stripAnsi }

/**
 * Get the display length of a string, excluding ANSI escape codes.
 * Use this instead of string.length when measuring styled text.
 *
 * Uses string-width package for proper Unicode/emoji handling:
 * - CJK characters count as 2 cells
 * - Emoji count as 2 cells
 * - ANSI escape codes are stripped
 */
export function displayLength(text: string): number {
  return stringWidth(text)
}

// ============================================================================
// Rich Text Rendering
// ============================================================================

/**
 * Regex to match inline field attributes like [due:: 2024-01-15], [priority:: 1]
 * These are Dataview/Obsidian Tasks style inline fields.
 */
const INLINE_FIELD_REGEX = /\[(\w+)::\s*([^\]]*)\]/g

/**
 * Regex to match wiki links: [[note]] or [[path/to/note|alias]]
 * Also matches embed syntax: ![[note]] (the ! prefix is stripped)
 */
const WIKI_LINK_REGEX = /!?\[\[([^\]]+)\]\]/g

/**
 * Extract display text and target from a wiki link content.
 * For [[path|alias]], returns { display: "alias", target: "path" }.
 * For [[text]], returns { display: "text", target: "text" }.
 */
function extractLinkParts(linkContent: string): {
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

// Markdown formatting patterns
const BOLD_REGEX = /\*\*([^*]+)\*\*/g // **bold**
const ITALIC_ASTERISK_REGEX = /(?<!\*)\*([^*]+)\*(?!\*)/g // *italic* (not part of **)
const ITALIC_UNDERSCORE_REGEX = /(?<![_\w])_([^_]+)_(?![_\w])/g // _italic_ (word boundary)
const CODE_REGEX = /`([^`]+)`/g // `code`
const STRIKETHROUGH_REGEX = /~~([^~]+)~~/g // ~~strikethrough~~

// Markdown link patterns - capture both text and URL
const MD_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g // [text](url)

// HTML tag stripping - remove tags entirely, keep inner text
const HTML_TAG_REGEX = /<[^>]+>/g

// Draft/tentative content patterns - styled with dashed underline
const DRAFT_PREFIX_REGEX = /^(Draft|WIP|TODO|FIXME):\s*/i

// Sigil patterns for @ mentions, # tags, and + projects
const SIGIL_REGEX = /([@#\+])([a-zA-Z0-9_-]+)/g

/**
 * Options for rich text rendering
 */
export interface RenderRichOptions {
  /**
   * Sigils to exclude from display (e.g., ["@issue"] when viewing the @issue board).
   * Include the full sigil with prefix (e.g., "@issue", "#feature", "+project").
   */
  excludeSigils?: string[]
  /**
   * Map of sigil to color (e.g., { "@next": "cyan", "#urgent": "red" }).
   * Resolved sigils are displayed in their color; unresolved render as plain text.
   */
  sigilColors?: Map<string, string>
  /**
   * Dynamic resolver for sigil colors. Called for sigils not found in sigilColors map.
   * Return a color name for resolved sigils, or undefined for unresolved ones.
   */
  resolveSigilColor?: (sigil: string) => string | undefined
}

/**
 * Render raw markdown text to a styled ANSI string.
 *
 * Transformations:
 * - Strips inline fields: [due:: 2024-01-15] → ""
 * - Styles wiki links: [[note]] → underlined "note"
 * - Styles sigils: resolved → colored by node, unresolved → plain text
 * - Filters out excluded sigils (e.g., @issue when viewing @issue board)
 * - Styles **bold** → bold
 * - Styles *italic* → italic
 * - Styles `code` → cyan
 * - Styles ~~strikethrough~~ → dim
 * - Cleans up whitespace
 *
 * The result can be safely wrapped/truncated using displayLength().
 *
 * @example
 * renderRich("Task [[project|My Project]] [due:: 2024-01-15]")
 * // Returns: "Task \x1b[2m\x1b[4mMy Project\x1b[0m"
 *
 * @example
 * renderRich("Fix bug @issue #P1", { excludeSigils: ["@issue"] })
 * // Returns: "Fix bug \x1b[36m\x1b[4m#P1\x1b[0m" (without @issue)
 */
export function renderRich(text: string, options?: RenderRichOptions): string {
  const excludeSigils = new Set(options?.excludeSigils ?? [])
  const sigilColors = options?.sigilColors ?? new Map<string, string>()
  // Check if content starts with a draft prefix (Draft:, WIP:, TODO:, FIXME:)
  const isDraft = DRAFT_PREFIX_REGEX.test(text)

  // Create style once per call to avoid module-level state
  const style = createTermStyle()

  // Strip inline fields and HTML tags first
  let result = text.replace(INLINE_FIELD_REGEX, "")
  result = result.replace(HTML_TAG_REGEX, "")

  // Style markdown links [text](url) → underlined text
  // NOTE: OSC 8 hyperlinks disabled due to wrap-ansi incompatibility
  // Links are still visually indicated with underline
  result = result.replace(MD_LINK_REGEX, (_match, linkText: string, _url: string) => {
    return style.underline(linkText)
  })

  // Style wiki links: underlined text
  // NOTE: OSC 8 hyperlinks disabled due to wrap-ansi incompatibility
  // The km:// protocol would be intercepted for navigation, but wrapping breaks it
  result = result.replace(WIKI_LINK_REGEX, (_match, content: string) => {
    const { display } = extractLinkParts(content)
    return style.underline(display)
  })

  // Style sigils (@mention, #tag, +project) - resolved sigils get node color, unresolved are plain
  // Filter out excluded sigils (e.g., @issue when viewing the @issue board)
  const resolveSigilColor = options?.resolveSigilColor
  result = result.replace(SIGIL_REGEX, (_match, prefix: string, name: string) => {
    const sigil = `${prefix}${name}`
    // If this sigil should be excluded, remove it entirely (including surrounding space)
    if (excludeSigils.has(sigil)) {
      return ""
    }
    // Check static map first, then dynamic resolver
    const color = sigilColors.get(sigil) ?? resolveSigilColor?.(sigil)
    if (color) {
      // Resolved sigil: render in the target node's color
      return getTermColor(color, style)(sigil)
    }
    // Unresolved sigil: render as plain text (no special styling)
    return sigil
  })

  // Style bold text (must be before italic to avoid conflicts)
  result = result.replace(BOLD_REGEX, (_match, content: string) => {
    return style.bold(content)
  })

  // Style italic text (*italic* or _italic_)
  result = result.replace(ITALIC_ASTERISK_REGEX, (_match, content: string) => {
    return style.italic(content)
  })
  result = result.replace(ITALIC_UNDERSCORE_REGEX, (_match, content: string) => {
    return style.italic(content)
  })

  // Style inline code
  result = result.replace(CODE_REGEX, (_match, content: string) => {
    return style.cyan(content)
  })

  // Style strikethrough (render as dim since terminals often don't support true strikethrough)
  result = result.replace(STRIKETHROUGH_REGEX, (_match, content: string) => {
    return style.dim.strikethrough(content)
  })

  // Clean up whitespace: collapse multiple spaces and newlines
  result = result
    .replace(/\n{2,}/g, "\n") // Collapse multiple newlines to single
    .replace(/  +/g, " ") // Collapse multiple spaces
    .trim()

  // Apply dashed underline to draft/tentative content
  if (isDraft) {
    result = dashedUnderline(result)
  }

  return result
}

/**
 * Render raw markdown text to plain text (no styling).
 *
 * Transformations:
 * - Strips inline fields: [due:: 2024-01-15] → ""
 * - Strips markdown formatting: **bold** → "bold", *italic* → "italic"
 * - Strips wiki link syntax: [[note]] → "note", [[path|alias]] → "alias"
 * - Cleans up whitespace
 *
 * Use this when you need plain text without ANSI codes.
 *
 * @example
 * renderPlain("Task [[project|My Project]] [due:: 2024-01-15]")
 * // Returns: "Task My Project"
 *
 * @example
 * renderPlain("**bold** and *italic* text")
 * // Returns: "bold and italic text"
 */
export function renderPlain(text: string): string {
  // Strip inline fields and HTML tags
  let result = text.replace(INLINE_FIELD_REGEX, "")
  result = result.replace(HTML_TAG_REGEX, "")

  // Strip markdown links [text](url) → text
  result = result.replace(MD_LINK_REGEX, (_match, linkText: string) => {
    return linkText
  })

  // Strip wiki links (keep display text only)
  result = result.replace(WIKI_LINK_REGEX, (_match, content: string) => {
    return extractLinkParts(content).display
  })

  // Strip markdown formatting markers (keep content only)
  result = result.replace(BOLD_REGEX, (_match, content: string) => {
    return content
  })
  result = result.replace(ITALIC_ASTERISK_REGEX, (_match, content: string) => {
    return content
  })
  result = result.replace(ITALIC_UNDERSCORE_REGEX, (_match, content: string) => {
    return content
  })
  result = result.replace(CODE_REGEX, (_match, content: string) => {
    return content
  })
  result = result.replace(STRIKETHROUGH_REGEX, (_match, content: string) => {
    return content
  })

  // Clean up whitespace
  return result.replace(/  +/g, " ").trim()
}
