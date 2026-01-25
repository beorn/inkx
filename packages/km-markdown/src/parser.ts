/**
 * Markdown Parser - Pure Parsing Utilities
 *
 * This module contains pure text/AST parsing functions that:
 * - Have NO dependency on @km/core types (except TASK_MARK_REGEX_CLASS)
 * - Work with raw text, mdast nodes, or regex patterns
 * - Can be used independently of the km storage layer
 *
 * For converting parsed markdown into KNodes, see ast2nodes.ts.
 *
 * Exports:
 * - parseMarkdown: string → mdast Root
 * - extractFrontmatter: string → { frontmatter, body }
 * - extractTaskMark/extractTitleTaskMark: text → task mark
 * - parseWikiLinks: text → WikiLink[]
 * - extractTags/Mentions/Projects: text → string[]
 * - parseTaskMetadata: text → { dueDate, priority, ... }
 * - parseHeadingRules: text → { title, rules }
 * - parseInlineProperties: text → { props, cleanText }
 * - nodeToText/listItemToText: mdast → text
 * - slugify: text → url-safe slug
 */

import { fromMarkdown } from "mdast-util-from-markdown"
import { gfmFromMarkdown } from "mdast-util-gfm"
import { gfm } from "micromark-extension-gfm"
import type {
  Root,
  RootContent,
  ListItem,
  Heading,
  Paragraph,
  List,
} from "mdast"
import { TASK_MARK_REGEX_CLASS } from "@km/core"

// Re-export types
export type { Root, RootContent, ListItem, Heading, Paragraph, List }

// =============================================================================
// km-fast-md.1: Module-level compiled regexes (compile once, use many times)
// =============================================================================

/** Task mark from list item (e.g., "- [x]") */
const TASK_MARK_REGEX = new RegExp(
  `^\\s*[-*+]\\s*\\[(${TASK_MARK_REGEX_CLASS})\\]`,
)

/** Task mark from title (e.g., "[x] Title") */
const TITLE_TASK_MARK_REGEX = new RegExp(
  `^\\[(${TASK_MARK_REGEX_CLASS})\\]\\s*`,
)

/** Wikilinks: [[target]], [[target|alias]], ![[embed]] */
const WIKILINK_REGEX =
  /(!?)\[\[([^\]|#^]+)(?:#([^\]|^]+))?(?:\^([^\]|]+))?(?:\|([^\]]+))?\]\]/g

/** Combined refs: #tag, @mention, +project in single pass */
const COMBINED_REFS_REGEX =
  /#([a-zA-Z0-9_-]+)|@([a-zA-Z0-9_-]+)|\+([a-zA-Z0-9_-]+)/g

/** Fast wikilink presence check (avoid full regex if no wikilinks) */
const HAS_WIKILINK = /\[\[/

// km-fast-md.3: Individual task metadata regexes compiled at module level
// (Combined regex was consuming whitespace between patterns, causing misses)
const DUE_EMOJI_REGEX = /📅\s*(\d{4}-\d{2}-\d{2})/
const DUE_INLINE_REGEX = /\bdue:(\d{4}-\d{2}-\d{2})\b/
const SCHED_EMOJI_REGEX = /⏳\s*(\d{4}-\d{2}-\d{2})/
const SCHED_INLINE_REGEX = /\bstart:(\d{4}-\d{2}-\d{2})\b/
const RECURRENCE_REGEX = /🔁\s*(.+?)(?:\s*[📅⏳⏫🔼🔽]|$)/
const PRIORITY_INLINE_REGEX = /\bp:([1-9])\b/

// km-fast-md.4: Single-pass heading rules regex
// Matches: add="query", sync=value, collapse=true, limit=N, default=true, color=value
// Also handles backtick-wrapped versions: `add="query"`
const HEADING_RULE_REGEX =
  /`?(?:add=["']([^"']+)["']|sync=["']?([^\s"'`]+)["']?|collapse=(true)|limit=(\d+)|default=(true)|color=["']?([^\s"'`]+)["']?)`?/gi

/**
 * Extended ListItem with task mark
 */
export interface TaskListItem extends ListItem {
  taskMark?: string // See TaskMark type in @km/core
}

/**
 * WikiLink node (Obsidian style)
 */
export interface WikiLink {
  type: "wikiLink"
  target: string
  section?: string
  blockId?: string
  alias?: string
  /** True for embeddings (![[...]]) which should transclude content */
  embedded?: boolean
}

/**
 * Parse markdown content into AST
 */
export function parseMarkdown(content: string): Root {
  const tree = fromMarkdown(content, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  })

  return tree
}

/**
 * Extract frontmatter from markdown content
 * Returns { frontmatter, content } where content has frontmatter removed
 */
export function extractFrontmatter(content: string): {
  frontmatter: string | null
  body: string
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)

  if (match) {
    return {
      frontmatter: match[1] ?? null,
      body: match[2] ?? "",
    }
  }

  return {
    frontmatter: null,
    body: content,
  }
}

/**
 * Extract the task mark from a list item's source text
 * km-fast-md.1: Uses module-level compiled regex
 */
export function extractTaskMark(
  content: string,
  position?: { start: { offset: number } },
): string | undefined {
  if (!position) return undefined

  const slice = content.slice(position.start.offset, position.start.offset + 20)
  const match = slice.match(TASK_MARK_REGEX)

  return match?.[1]
}

/**
 * Extract task mark from node title text (works for headings, list items, etc.)
 * Supports: [x], [ ], [/], [!], [-] at the start of text
 * km-fast-md.1: Uses module-level compiled regex
 *
 * Examples:
 *   "[ ] Todo task" → { mark: " ", cleanText: "Todo task" }
 *   "[x] Done task" → { mark: "x", cleanText: "Done task" }
 *   "Regular text" → { mark: undefined, cleanText: "Regular text" }
 */
export function extractTitleTaskMark(text: string): {
  mark: string | undefined
  cleanText: string
} {
  const match = text.match(TITLE_TASK_MARK_REGEX)

  if (match) {
    return {
      mark: match[1],
      cleanText: text.slice(match[0].length),
    }
  }

  return {
    mark: undefined,
    cleanText: text,
  }
}

/**
 * Parse wikilinks from text
 * Detects both regular links [[...]] and embeddings ![[...]]
 * km-fast-md.1 & km-fast-md.2: Uses module-level regex with fast-path check
 */
export function parseWikiLinks(text: string): WikiLink[] {
  // km-fast-md.2: Fast-path check - skip full regex if no wikilinks present
  if (!HAS_WIKILINK.test(text)) {
    return []
  }

  const links: WikiLink[] = []
  // Reset regex lastIndex since it's global
  WIKILINK_REGEX.lastIndex = 0

  let match
  while ((match = WIKILINK_REGEX.exec(text)) !== null) {
    const isEmbedded = match[1] === "!"
    links.push({
      type: "wikiLink",
      target: match[2] ?? "",
      section: match[3],
      blockId: match[4],
      alias: match[5],
      embedded: isEmbedded || undefined, // Only set if true
    })
  }

  return links
}

/**
 * Generic helper to extract regex matches from text
 * Returns the first capture group from all matches
 */
function extractMatches(text: string, regex: RegExp): string[] {
  return [...text.matchAll(regex)]
    .map((m) => m[1])
    .filter((m): m is string => !!m)
}

/**
 * Extract tags from text (#tag-name)
 */
export function extractTags(text: string): string[] {
  return extractMatches(text, /#([a-zA-Z0-9_-]+)/g)
}

/**
 * Extract mentions from text (@person)
 */
export function extractMentions(text: string): string[] {
  return extractMatches(text, /@([a-zA-Z0-9_-]+)/g)
}

/**
 * Extract projects from text (+project-name)
 */
export function extractProjects(text: string): string[] {
  return extractMatches(text, /\+([a-zA-Z0-9_-]+)/g)
}

/**
 * Combined refs extraction - single-pass for performance (km-load-perf.1)
 * Extracts tags, mentions, and projects in one regex pass instead of three.
 * km-fast-md.1: Uses module-level compiled regex
 *
 * @returns Object with tags, mentions, and projects arrays
 */
export function extractAllRefs(text: string): {
  tags: string[]
  mentions: string[]
  projects: string[]
} {
  const tags: string[] = []
  const mentions: string[] = []
  const projects: string[] = []

  // Reset regex lastIndex since it's global
  COMBINED_REFS_REGEX.lastIndex = 0

  let match
  while ((match = COMBINED_REFS_REGEX.exec(text)) !== null) {
    if (match[1]) {
      tags.push(match[1])
    } else if (match[2]) {
      mentions.push(match[2])
    } else if (match[3]) {
      projects.push(match[3])
    }
  }

  return { tags, mentions, projects }
}

/**
 * Parse task metadata (supports multiple formats)
 * Extracts: due date, scheduled date, priority, recurrence
 * km-fast-md.3: Module-level compiled regexes (avoiding per-call compilation)
 *
 * Supported formats:
 * - Obsidian Tasks: 📅 2024-01-15, ⏳ 2024-01-10, ⏫/🔼/🔽, 🔁 every week
 * - Inline fields: due:2024-01-15, start:2024-01-10, p:1
 */
export function parseTaskMetadata(text: string): {
  dueDate?: string
  scheduledDate?: string
  priority?: number
  recurrence?: string
} {
  const result: {
    dueDate?: string
    scheduledDate?: string
    priority?: number
    recurrence?: string
  } = {}

  // km-fast-md.3: Use module-level compiled regexes
  // Due date: 📅 2024-01-15 OR due:2024-01-15
  const dueMatch = text.match(DUE_EMOJI_REGEX)
  if (dueMatch) {
    result.dueDate = dueMatch[1]
  }
  const dueInlineMatch = text.match(DUE_INLINE_REGEX)
  if (dueInlineMatch && !result.dueDate) {
    result.dueDate = dueInlineMatch[1]
  }

  // Scheduled date: ⏳ 2024-01-10 OR start:2024-01-10
  const scheduledMatch = text.match(SCHED_EMOJI_REGEX)
  if (scheduledMatch) {
    result.scheduledDate = scheduledMatch[1]
  }
  const startInlineMatch = text.match(SCHED_INLINE_REGEX)
  if (startInlineMatch && !result.scheduledDate) {
    result.scheduledDate = startInlineMatch[1]
  }

  // Priority: ⏫ (high=1), 🔼 (medium=2), 🔽 (low=3) OR p:1, p:2, p:3
  if (text.includes("⏫")) {
    result.priority = 1
  } else if (text.includes("🔼")) {
    result.priority = 2
  } else if (text.includes("🔽")) {
    result.priority = 3
  }
  const priorityInlineMatch = text.match(PRIORITY_INLINE_REGEX)
  if (priorityInlineMatch && priorityInlineMatch[1] && !result.priority) {
    result.priority = parseInt(priorityInlineMatch[1], 10)
  }

  // Recurrence: 🔁 every week
  const recurrenceMatch = text.match(RECURRENCE_REGEX)
  if (recurrenceMatch && recurrenceMatch[1]) {
    result.recurrence = recurrenceMatch[1].trim()
  }

  return result
}

/**
 * Section/column rules parsed from inline attributes
 */
export interface SectionRules {
  add?: string // Query to auto-pull matching tasks
  sync?: string // Bidirectional field sync (e.g., "status:blocked")
  collapse?: boolean // Start collapsed
  limit?: number // WIP limit
  default?: boolean // Default column for new items
  color?: string // Board/section color (cyan, yellow, magenta, etc.)
}

/**
 * Result of parsing heading text
 */
export interface ParsedHeading {
  title: string // Clean title without rules
  rules: SectionRules // Extracted rules
}

/**
 * Parse heading text to extract title and inline rules
 * km-fast-md.4: Single-pass extraction using combined regex
 *
 * Format: "Column Name add=\"query\" sync=field:value collapse=true limit=3"
 * Returns: { title: "Column Name", rules: { add: "query", sync: "field:value", ... } }
 */
export function parseHeadingRules(text: string): ParsedHeading {
  const rules: SectionRules = {}

  // km-fast-md.4: Single-pass extraction of all rules
  // Reset lastIndex since it's global
  HEADING_RULE_REGEX.lastIndex = 0

  // Track matched ranges for title extraction
  const matchedRanges: Array<{ start: number; end: number }> = []

  let match
  while ((match = HEADING_RULE_REGEX.exec(text)) !== null) {
    // Track where this match is for title cleanup
    matchedRanges.push({
      start: match.index,
      end: match.index + match[0].length,
    })

    // add="query"
    if (match[1]) {
      rules.add = match[1]
    }
    // sync=value
    if (match[2]) {
      rules.sync = match[2]
    }
    // collapse=true
    if (match[3]) {
      rules.collapse = true
    }
    // limit=N
    if (match[4]) {
      rules.limit = parseInt(match[4], 10)
    }
    // default=true
    if (match[5]) {
      rules.default = true
    }
    // color=value
    if (match[6]) {
      rules.color = match[6]
    }
  }

  // Extract title by removing matched rules
  // Build title from non-matched portions
  let title = ""
  let lastEnd = 0
  for (const range of matchedRanges) {
    title += text.slice(lastEnd, range.start)
    lastEnd = range.end
  }
  title += text.slice(lastEnd)
  title = title.replace(/\s+/g, " ").trim()

  return { title, rules }
}

/**
 * Convert mdast node to plain text
 */
export function nodeToText(node: RootContent | Root): string {
  if ("value" in node && typeof node.value === "string") {
    return node.value
  }

  if ("children" in node && Array.isArray(node.children)) {
    return node.children
      .map((child) => nodeToText(child as RootContent))
      .join("")
  }

  return ""
}

/**
 * Extract text content from a list item, excluding nested lists.
 * Only extracts text from direct paragraph/text content, not from child lists.
 */
export function listItemToText(item: RootContent): string {
  if (!("children" in item) || !Array.isArray(item.children)) {
    return nodeToText(item)
  }

  // Only process direct content (paragraphs, text), not nested lists
  return item.children
    .filter((child: RootContent) => child.type !== "list")
    .map((child: RootContent) => nodeToText(child))
    .join("")
}

/**
 * Generate a URL-safe slug from heading text
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove non-word chars
    .replace(/\s+/g, "-") // Replace spaces with dashes
    .replace(/-+/g, "-") // Collapse multiple dashes
    .replace(/^-|-$/g, "") // Remove leading/trailing dashes
}

// =============================================================================
// Inline Properties (Logseq-style property:: value syntax)
// =============================================================================

/**
 * Parsed property value with type information
 */
export type PropertyValue =
  | { type: "link"; target: string; alias?: string }
  | { type: "number"; value: number }
  | { type: "date"; value: string } // ISO date string YYYY-MM-DD
  | { type: "text"; value: string }
  | { type: "list"; values: PropertyValue[] }

/**
 * Result of parsing inline properties from text
 */
export interface ParsedProperties {
  /** Parsed property values keyed by property name */
  props: Record<string, PropertyValue>
  /** Original raw strings for each property (for round-trip preservation) */
  propsRaw: Record<string, string>
  /** Text with properties removed */
  cleanText: string
}

/**
 * Parse inline properties from text (Logseq-style property:: value syntax)
 *
 * Supports:
 * - Links: property:: [[target]] or property:: [[target|alias]]
 * - Numbers: property:: 42 or property:: 3.14
 * - Dates: property:: 2024-01-15
 * - Text: property:: any text value
 * - Lists: property:: [[a]], [[b]], [[c]] (comma-separated)
 *
 * @example
 * parseInlineProperties("Task blocked-by:: [[other]] rating:: 5")
 * // Returns:
 * // {
 * //   props: {
 * //     "blocked-by": { type: "link", target: "other" },
 * //     "rating": { type: "number", value: 5 }
 * //   },
 * //   propsRaw: {
 * //     "blocked-by": "[[other]]",
 * //     "rating": "5"
 * //   },
 * //   cleanText: "Task"
 * // }
 */
export function parseInlineProperties(text: string): ParsedProperties {
  const props: Record<string, PropertyValue> = {}
  const propsRaw: Record<string, string> = {}

  // Match property:: value patterns
  // Property name: lowercase letter followed by alphanumeric, underscore, or hyphen
  // Value: everything until next property or end of string
  const propPattern =
    /([a-z][a-z0-9_-]*)::[ ]*(.+?)(?=\s+[a-z][a-z0-9_-]*::|$)/gi

  let cleanText = text
  let match

  while ((match = propPattern.exec(text)) !== null) {
    const [fullMatch, name, rawValue] = match
    if (!name || rawValue === undefined) continue

    const propName = name.toLowerCase()
    const trimmedValue = rawValue.trim()

    propsRaw[propName] = trimmedValue
    props[propName] = parsePropertyValue(trimmedValue)

    // Remove the property from clean text
    cleanText = cleanText.replace(fullMatch, "")
  }

  return {
    props,
    propsRaw,
    cleanText: cleanText.trim(),
  }
}

/**
 * Parse a property value string into a typed PropertyValue
 */
function parsePropertyValue(value: string): PropertyValue {
  // Check for comma-separated list of links: [[a]], [[b]], [[c]]
  const listLinks = value.match(/\[\[[^\]]+\]\]/g)
  if (listLinks && listLinks.length > 1) {
    return {
      type: "list",
      values: listLinks.map((link) => parseSingleValue(link)),
    }
  }

  return parseSingleValue(value)
}

/**
 * Parse a single (non-list) property value
 */
function parseSingleValue(value: string): PropertyValue {
  // Check for wikilink: [[target]] or [[target|alias]]
  const linkMatch = value.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/)
  if (linkMatch) {
    return {
      type: "link",
      target: linkMatch[1] ?? "",
      alias: linkMatch[2],
    }
  }

  // Check for date: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { type: "date", value }
  }

  // Check for number (integer or decimal)
  const num = parseFloat(value)
  if (!isNaN(num) && /^-?\d+(\.\d+)?$/.test(value)) {
    return { type: "number", value: num }
  }

  // Default to text
  return { type: "text", value }
}
