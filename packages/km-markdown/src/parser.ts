/**
 * Markdown Parser - Pure Parsing Utilities
 *
 * This module contains pure text/AST parsing functions that:
 * - Have NO dependency on @km/core types (except extractTitleTaskMarker, extractTaskMetadata)
 * - Work with raw text, mdast nodes, or regex patterns
 * - Can be used independently of the km storage layer
 *
 * For converting parsed markdown into KNodes, see ast2nodes.ts.
 *
 * Exports:
 * - parseMarkdown: string → mdast Root
 * - extractFrontmatter: string → { frontmatter, body }
 * - extractTitleTaskMarker: text → task marker
 * - parseWikiLinks: text → WikiLink[]
 * - extractTags/Mentions/Projects: text → string[]
 * - parseTaskMetadata: text → { dueDate, priority, ... }
 * - parseHeadingRules: text → { title, rules }
 * - parseInlineProperties: text → { props, cleanText }
 * - nodeToText/listItemToText: mdast → text
 * - slugify: text → url-safe slug
 */

import { fromMarkdown } from "mdast-util-from-markdown"
import type { Root, RootContent, ListItem, Heading, Paragraph, List } from "mdast"
import { km, kmFromMarkdown } from "./extensions/index.ts"
import { extractTitleTaskMarker, extractTaskMetadata, composeDatetime } from "@km/core"

// Re-export types
export type { Root, RootContent, ListItem, Heading, Paragraph, List }

// =============================================================================
// km-fast-md.1: Module-level compiled regexes (compile once, use many times)
// =============================================================================

// TITLE_TASK_MARK_REGEX moved to @km/core (extractTitleTaskMarker)

/** Wikilinks: [[target]], [[target|alias]], ![[embed]], [[target#^blockid]], [[#^blockid]], [[^blockid]] */
const WIKILINK_REGEX = /(!?)\[\[([^\]|#^]*)(?:#([^\]|^]+))?(?:#?\^([^\]|]+))?(?:\|([^\]]+))?\]\]/g

/** Combined refs: #tag, @mention, +project in single pass */
const COMBINED_REFS_REGEX = /#([\p{L}\p{N}_-]+)|@([\p{L}\p{N}_-]+)|\+([\p{L}\p{N}_-]+)/gu

/** Fast wikilink presence check (avoid full regex if no wikilinks) */
const HAS_WIKILINK = /\[\[/

// km-fast-md.3: Task metadata regexes moved to @km/core (extractTaskMetadata)

/**
 * Unified property regex — matches both km-prefixed and bare key:: value syntax.
 * Captures: (1) full key including optional "km." prefix, (2) raw value.
 * Value runs until next property or end of string.
 *
 * Examples:
 *   "Title km.add:: query km.collapse:: true" → [km.add, query], [km.collapse, true]
 *   "Task rating:: 5 blocked-by:: [[other]]"  → [rating, 5], [blocked-by, [[other]]]
 *   "Mixed km.sync:: status:done priority:: 1" → [km.sync, status:done], [priority, 1]
 */
export const PROP_REGEX = /((?:km\.)?[a-z][a-z0-9_-]*)::\s*(.+?)(?=\s+(?:km\.)?[a-z][a-z0-9_-]*::|$)/gi

/**
 * Extracted property from text
 */
export interface ExtractedProp {
  key: string // full key including "km." prefix if present
  value: string // raw value string (trimmed)
  start: number // match start index in original text
  end: number // match end index in original text
}

/**
 * Extract all key:: value properties from text (both km-prefixed and bare).
 * Returns entries and clean text with all properties removed.
 */
export function extractKVProperties(text: string): { entries: ExtractedProp[]; cleanText: string } {
  PROP_REGEX.lastIndex = 0
  const entries: ExtractedProp[] = []
  let match
  while ((match = PROP_REGEX.exec(text)) !== null) {
    entries.push({
      key: match[1] ?? "",
      value: (match[2] ?? "").trim(),
      start: match.index,
      end: match.index + match[0].length,
    })
  }

  // Build clean text by removing all matched ranges
  let cleanText = ""
  let lastEnd = 0
  for (const entry of entries) {
    cleanText += text.slice(lastEnd, entry.start)
    lastEnd = entry.end
  }
  cleanText += text.slice(lastEnd)
  cleanText = cleanText.replace(/\s+/g, " ").trim()

  return { entries, cleanText }
}

/**
 * Extended ListItem with task mark
 */
export interface TaskListItem extends ListItem {
  taskMark?: string // Single char mark extracted from markdown, convert to TaskMarker with markToMarker()
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
  /** True for ./target relative references (structural child slots) */
  relative?: boolean
}

/**
 * Parse markdown content into AST
 */
export function parseMarkdown(content: string): Root {
  return fromMarkdown(content, {
    extensions: [km()],
    mdastExtensions: kmFromMarkdown(),
  })
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

// Re-export from @km/core
export { extractTitleTaskMarker }

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
    const rawTarget = match[2] ?? ""
    const isRelative = rawTarget.startsWith("./")
    links.push({
      type: "wikiLink",
      target: isRelative ? rawTarget.slice(2) : rawTarget,
      section: match[3],
      blockId: match[4],
      alias: match[5],
      embedded: isEmbedded || undefined, // Only set if true
      relative: isRelative || undefined, // Only set if true
    })
  }

  return links
}

/**
 * Generic helper to extract regex matches from text
 * Returns the first capture group from all matches
 */
function extractMatches(text: string, regex: RegExp): string[] {
  return [...text.matchAll(regex)].map((m) => m[1]).filter((m): m is string => !!m)
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
 * - todo.txt compat: due:2024-01-15
 */
export function parseTaskMetadata(text: string): {
  dueAt?: string
  startAt?: string
  priority?: string
  rrule?: string
} {
  // Delegate to shared extraction in @km/core (DRY: same regexes for parser and editor)
  const extracted = extractTaskMetadata(text)
  const dueAt = composeDatetime(extracted.dueDate, extracted.dueTime)
  const startAt = composeDatetime(extracted.startDate, extracted.startTime)
  return {
    ...(dueAt && { dueAt }),
    ...(startAt && { startAt }),
    ...(extracted.priority !== undefined && { priority: extracted.priority }),
    ...(extracted.rrule && { rrule: extracted.rrule }),
  }
}

/**
 * Section/column rules parsed from inline attributes
 */
export interface SectionRules {
  add?: string | string[] // Query to auto-pull matching tasks (multiple allowed)
  sync?: string // Bidirectional field sync (e.g., "status:blocked")
  collapse?: boolean // Start collapsed
  hidden?: boolean // Hide section from view entirely
  limit?: number // WIP limit
  default?: boolean // Default column for new items
  removed?: boolean // Items dismissed from the board (km add skips these)
  color?: string // Board/section color (cyan, yellow, magenta, etc.)
}

/**
 * Result of parsing heading text
 */
export interface ParsedHeading {
  title: string // Clean title without rules
  rules: SectionRules // Extracted rules
  warnings?: string[] // Duplicate singleton keys, unknown keys, etc.
}

/**
 * Parse heading text to extract title and inline rules
 * km-fast-md.4: Single-pass extraction using combined regex
 *
 * Format: "Column Name km.add:: query km.sync:: field:value km.collapse:: true km.limit:: 3"
 * Returns: { title: "Column Name", rules: { add: "query", sync: "field:value", ... } }
 */
export function parseHeadingRules(text: string): ParsedHeading {
  const { entries, cleanText } = extractKVProperties(text)
  const rules: SectionRules = {}
  const addValues: string[] = []
  const warnings: string[] = []

  const seenKeys = new Set<string>()
  const multiKeys = new Set(["add"])

  for (const { key: fullKey, value } of entries) {
    // Only process km.* prefixed properties for heading rules
    if (!fullKey.startsWith("km.")) continue
    const key = fullKey.slice(3)

    if (!multiKeys.has(key) && seenKeys.has(key)) {
      warnings.push(`duplicate key "${key}" — last value wins`)
    }
    seenKeys.add(key)

    switch (key) {
      case "add":
        addValues.push(value)
        break
      case "sync":
        rules.sync = value
        break
      case "collapse":
        if (value === "true") rules.collapse = true
        break
      case "hidden":
        if (value === "true") rules.hidden = true
        break
      case "limit":
        rules.limit = parseInt(value, 10)
        break
      case "default":
        if (value === "true") rules.default = true
        break
      case "removed":
        if (value === "true") rules.removed = true
        break
      case "color":
        rules.color = value
        break
      // Unknown keys: stripped from title but otherwise ignored
    }
  }

  if (addValues.length === 1) {
    rules.add = addValues[0]
  } else if (addValues.length > 1) {
    rules.add = addValues
  }

  return { title: cleanText, rules, ...(warnings.length > 0 ? { warnings } : {}) }
}

/**
 * Serialize SectionRules back to km.key:: value format for heading reconstruction.
 * Returns the space-separated string (empty string if no rules).
 */
export function serializeRules(rules: SectionRules): string {
  const parts: string[] = []
  if (rules.add) {
    const adds = Array.isArray(rules.add) ? rules.add : [rules.add]
    for (const a of adds) parts.push(`km.add:: ${a}`)
  }
  if (rules.sync) parts.push(`km.sync:: ${rules.sync}`)
  if (rules.collapse) parts.push(`km.collapse:: true`)
  if (rules.hidden) parts.push(`km.hidden:: true`)
  if (rules.limit !== undefined) parts.push(`km.limit:: ${rules.limit}`)
  if (rules.default) parts.push(`km.default:: true`)
  if (rules.removed) parts.push(`km.removed:: true`)
  if (rules.color) parts.push(`km.color:: ${rules.color}`)
  return parts.join(" ")
}

/**
 * Convert mdast table node to markdown table string with column alignment.
 * Pads cells so columns line up: | Key      | Value |
 * Respects column alignment (left/center/right) and escapes | in cell text.
 */
export function tableToMarkdown(node: RootContent): string {
  if (node.type !== "table" || !("children" in node)) return nodeToText(node)

  const tableNode = node as { children: RootContent[]; align?: (string | null)[] }
  const rows = tableNode.children
  const align = tableNode.align ?? []

  // First pass: extract all cell text (with pipe escaping) and compute column widths
  const allCells: string[][] = []
  for (const row of rows) {
    const r = row as { children?: RootContent[] }
    if (!r?.children) continue
    allCells.push(r.children.map((cell) => escapeTableCell(nodeToText(cell as RootContent))))
  }
  if (allCells.length === 0) return nodeToText(node)

  // Max width per column (minimum 3 for separator "---")
  const colCount = Math.max(...allCells.map((r) => r.length))
  const colWidths: number[] = Array.from({ length: colCount }, () => 3)
  for (const cells of allCells) {
    for (let c = 0; c < cells.length; c++) {
      colWidths[c] = Math.max(colWidths[c] ?? 3, (cells[c] ?? "").length)
    }
  }

  // Second pass: render with padding
  const lines: string[] = []
  for (let i = 0; i < allCells.length; i++) {
    const cells = allCells[i] ?? []
    const padded = colWidths.map((w, c) => (cells[c] ?? "").padEnd(w))
    lines.push("| " + padded.join(" | ") + " |")

    // Separator after header row — respects column alignment
    if (i === 0) {
      lines.push(
        "| " +
          colWidths
            .map((w, c) => {
              const colAlign = align[c] ?? null
              if (colAlign === "center") return ":" + "-".repeat(Math.max(1, w - 2)) + ":"
              if (colAlign === "right") return "-".repeat(Math.max(1, w - 1)) + ":"
              if (colAlign === "left") return ":" + "-".repeat(Math.max(1, w - 1))
              return "-".repeat(w) // no alignment
            })
            .join(" | ") +
          " |",
      )
    }
  }

  return lines.join("\n")
}

/** Escape pipe characters in table cell text to prevent breaking table structure */
function escapeTableCell(text: string): string {
  return text.replace(/\|/g, "\\|")
}

/**
 * Convert mdast node to plain text
 */
export function nodeToText(node: RootContent | Root): string {
  // Hard line break (markdown `  \n` or `<br>`) → preserve as newline
  if (node.type === "break") {
    return "\n"
  }

  // KmWikilink nodes → reconstruct wikilink text
  if (node.type === "kmWikilink") {
    const wl = node as {
      target: string
      section?: string
      blockRef?: string
      alias?: string
      embedded: boolean
      relative?: boolean
    }
    let text = wl.embedded ? "![[" : "[["
    if (wl.relative) text += "./"
    text += wl.target
    if (wl.section) text += `#${wl.section}`
    if (wl.blockRef) text += `#^${wl.blockRef}`
    if (wl.alias) text += `|${wl.alias}`
    text += "]]"
    return text
  }

  if ("value" in node && typeof node.value === "string") {
    return node.value
  }

  // Image nodes have no children or value — use alt text
  if (node.type === "image") {
    return (node as { alt?: string }).alt || ""
  }

  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map((child) => nodeToText(child as RootContent)).join("")
  }

  return ""
}

/**
 * Convert a blockquote mdast node to text, preserving paragraph breaks and list structure.
 * Block-level children (paragraphs, lists) are separated by blank lines.
 */
export function blockquoteToText(node: RootContent): string {
  if (!("children" in node) || !Array.isArray(node.children)) {
    return nodeToText(node)
  }

  return node.children
    .map((child: RootContent) => {
      if (child.type === "list") {
        return listToText(child as RootContent & { children: RootContent[] })
      }
      return nodeToText(child)
    })
    .join("\n\n")
}

/** Convert an mdast list to text with bullet markers */
function listToText(list: RootContent & { children: RootContent[] }): string {
  return list.children
    .map((item: RootContent) => {
      const text = listItemToText(item)
      return "* " + text
    })
    .join("\n")
}

/**
 * Extract text content from a list item, excluding nested lists.
 * Only extracts text from direct paragraph/text content, not from child lists.
 */
export function listItemToText(item: RootContent): string {
  if (!("children" in item) || !Array.isArray(item.children)) {
    return nodeToText(item)
  }

  // Only process direct content (paragraphs, text), not nested lists or block content (blockquotes, code)
  return item.children
    .filter((child: RootContent) => child.type !== "list" && child.type !== "blockquote" && child.type !== "code")
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
  const { entries, cleanText } = extractKVProperties(text)
  const props: Record<string, PropertyValue> = {}
  const propsRaw: Record<string, string> = {}

  for (const { key, value } of entries) {
    // Skip km.* system properties (those are heading rules)
    if (key.startsWith("km.")) continue

    const propName = key.toLowerCase()
    propsRaw[propName] = value
    props[propName] = parsePropertyValue(value)
  }

  return { props, propsRaw, cleanText }
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
