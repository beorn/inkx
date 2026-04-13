/**
 * Heading Rules — parse/serialize km.* inline directives from heading text.
 *
 * Format: "Column Name km.add:: query km.sync:: field:value km.collapse:: true km.limit:: 3"
 * Returns: { title: "Column Name", rules: { add: "query", sync: "field:value", ... } }
 *
 * Moved from @km/markdown to @km/core to eliminate the layer violation where
 * @km/board (and @km/tree) reached down to the parser layer for these pure
 * text-processing utilities.
 */

import type { NodeRules } from "./types.ts"

// =============================================================================
// Property Extraction — generic key:: value parsing
// =============================================================================

/**
 * Regex for key:: value properties.
 * Matches both km-prefixed (km.add:: query) and bare (rating:: 5) properties.
 *
 * Examples:
 *   "Title km.add:: query km.collapse:: true" -> [km.add, query], [km.collapse, true]
 *   "Task rating:: 5 blocked-by:: [[other]]"  -> [rating, 5], [blocked-by, [[other]]]
 *   "Mixed km.sync:: status:done priority:: 1" -> [km.sync, status:done], [priority, 1]
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

// =============================================================================
// Heading Rules — parse km.* directives from heading text
// =============================================================================

/**
 * Result of parsing heading text
 */
export interface ParsedHeading {
  title: string // Clean title without rules
  rules: NodeRules // Extracted rules
  warnings?: string[] // Duplicate singleton keys, unknown keys, etc.
}

/**
 * Parse heading text to extract title and inline rules.
 * km-fast-md.4: Single-pass extraction using combined regex.
 *
 * Format: "Column Name km.add:: query km.sync:: field:value km.collapse:: true km.limit:: 3"
 * Returns: { title: "Column Name", rules: { add: "query", sync: "field:value", ... } }
 */
export function parseHeadingRules(text: string): ParsedHeading {
  const { entries, cleanText } = extractKVProperties(text)
  const rules: NodeRules = {}
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
