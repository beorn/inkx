/**
 * Inline Metadata — Unified key:: value extraction and stringification
 *
 * Canonical format: `key:: value` (exactly one space after ::)
 * - Unquoted value: `key:: simple_value` (no spaces in value)
 * - Quoted value: `key:: "value with spaces"`
 * - Multi-value: `key:: val1,val2` or `key:: "val 1","val 2"`
 *
 * This is the ONLY metadata format. No backward compatibility with
 * key:value, key=value, or emoji formats.
 */

// =============================================================================
// Types
// =============================================================================

/** Raw key-value entries extracted from text */
export interface MetadataEntries {
  [key: string]: string
}

/** Result of extracting metadata from text */
export interface ExtractedMetadata {
  /** Text with all key:: value pairs removed and whitespace normalized */
  clean: string
  /** Raw key-value entries (key → value string, may contain commas for multi-value) */
  entries: MetadataEntries
}

// =============================================================================
// Extraction regex
// =============================================================================

/**
 * Matches key:: value patterns (exactly one space after ::).
 *
 * Captures:
 * - Group 1: key name (word chars + hyphens)
 * - Group 2: quoted value (with escaped quotes support) OR unquoted value (non-whitespace)
 *
 * Examples:
 *   due:: 2026-02-15       → key="due", value="2026-02-15"
 *   color:: yellow          → key="color", value="yellow"
 *   add:: "due:past"        → key="add", value="due:past"
 *   add:: due:past,blocked  → key="add", value="due:past,blocked"
 */
const METADATA_REGEX = /\b(\w[\w-]*):: ("(?:[^"\\]|\\.)*"|[^\s]+)/g

/**
 * Detection regex: check if a specific key is already present in text.
 * Used by stringify to avoid duplicating metadata that's already inline.
 */
function hasMetadataKey(text: string, key: string): boolean {
  const re = new RegExp(`\\b${escapeRegex(key)}:: `)
  return re.test(text)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// =============================================================================
// extractMetadata — unified extraction
// =============================================================================

/**
 * Extract all key:: value pairs from text.
 *
 * Returns clean text (metadata stripped) and a map of entries.
 * Multi-value entries are returned as raw comma-separated strings;
 * use `splitMultiValue()` to parse them.
 *
 * @param text - Raw text that may contain inline metadata
 * @returns { clean, entries }
 */
export function extractMetadata(text: string): ExtractedMetadata {
  const entries: MetadataEntries = {}

  // Track matched ranges for clean text extraction
  const matchedRanges: Array<{ start: number; end: number }> = []

  METADATA_REGEX.lastIndex = 0
  let match
  while ((match = METADATA_REGEX.exec(text)) !== null) {
    const key = match[1] ?? ""
    let value = match[2] ?? ""

    // Strip quotes from quoted values
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"')
    }

    entries[key] = value
    matchedRanges.push({ start: match.index, end: match.index + match[0].length })
  }

  // Build clean text by removing matched ranges
  let clean = ""
  let lastEnd = 0
  for (const range of matchedRanges) {
    clean += text.slice(lastEnd, range.start)
    lastEnd = range.end
  }
  clean += text.slice(lastEnd)

  // Normalize whitespace
  clean = clean.replace(/\s{2,}/g, " ").trim()

  return { clean, entries }
}

// =============================================================================
// stringifyMetadata — unified stringification
// =============================================================================

/**
 * Append metadata entries to content text in canonical key:: value format.
 * Only appends entries whose key is not already present in the content.
 *
 * @param content - The base text content
 * @param entries - Key-value pairs to append
 * @returns Content with metadata appended
 */
export function stringifyMetadata(content: string, entries: MetadataEntries): string {
  if (!content) return content

  const parts: string[] = []
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === "") continue
    if (hasMetadataKey(content, key)) continue

    // Quote values that contain spaces
    const formatted = value.includes(" ") ? `"${value}"` : value
    parts.push(`${key}:: ${formatted}`)
  }

  if (parts.length > 0) {
    content += " " + parts.join(" ")
  }
  return content
}

// =============================================================================
// splitMultiValue — parse comma-separated values
// =============================================================================

/**
 * Split a metadata value on commas, handling quoted segments.
 *
 * Examples:
 *   "val1,val2"           → ["val1", "val2"]
 *   '"val 1","val 2"'     → ["val 1", "val 2"]
 *   "simple"              → ["simple"]
 *   ""                    → []
 */
export function splitMultiValue(value: string): string[] {
  if (!value) return []

  const results: string[] = []
  let current = ""
  let inQuote = false

  for (let i = 0; i < value.length; i++) {
    const ch = value[i] ?? ""
    if (ch === '"') {
      inQuote = !inQuote
    } else if (ch === "," && !inQuote) {
      results.push(current.trim())
      current = ""
    } else {
      current += ch
    }
  }

  if (current.trim()) {
    results.push(current.trim())
  }

  return results
}
