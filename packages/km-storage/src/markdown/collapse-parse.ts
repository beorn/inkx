/**
 * Collapse-Parse Matcher
 *
 * Folder-level rule that stores files under designated paths (e.g. `raw/chats/`,
 * `archive/`) as opaque `mdfile`/`txtfile` stubs — title + content, no descendant
 * parse — unless the user explicitly navigates into them.
 *
 * Why: vaults with large imported archives (chat transcripts, Asana exports)
 * can balloon to 500K+ nodes, 70-90% of which come from two folders. The user
 * rarely edits these files inside km's outline; they're read-only archives,
 * occasionally grepped. Collapsing them cuts the working set by ~89% while
 * keeping FTS search over file titles and preserving on-demand expansion.
 *
 * Configuration (`.km/config.yaml`):
 *   collapseParse:
 *     patterns:
 *       - "raw/chats/**"
 *       - "archive/**"
 *
 * Backward compat: off by default. Empty `patterns` list (or missing config)
 * means every file is fully parsed exactly as before.
 *
 * Promotion: collapsed stubs live in the DB with `data.{ _stub: true,
 * _collapsed: true }` and `parsed=0`. When the user targets one via
 * `km view <path>`, the existing `parseStubFile` path promotes it
 * (parses content, creates children, sets `parsed=1`).
 */

import { createLogger } from "loggily"
import { matchesPattern } from "@km/fs-mount"

const log = createLogger("km:storage:collapse-parse")

// ============================================================================
// TYPES
// ============================================================================

/**
 * Matches relative fs paths against a list of collapse-parse glob patterns.
 * Created once per repo load and reused across discovery + reconciliation.
 */
export interface CollapseParseMatcher {
  /**
   * Check whether a relative fs path should be stored as an opaque stub.
   * Paths must be relative to the repo root (e.g. `raw/chats/foo.md`).
   */
  matches(relPath: string): boolean

  /** Number of active patterns (0 = effectively disabled). */
  readonly size: number
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a collapse-parse matcher from a list of glob patterns.
 *
 * Patterns use the same glob syntax as `.kmignore` / `.gitignore` entries:
 *   - `raw/chats/**` — everything under raw/chats/
 *   - `archive/**` — everything under archive/
 *   - `**\/transcripts\/**` — any transcripts directory
 *
 * Empty list returns a matcher whose `matches()` always returns false
 * (i.e. collapse-parse disabled).
 */
export function createCollapseParseMatcher(patterns: readonly string[]): CollapseParseMatcher {
  // Filter blanks + comments (same policy as .kmignore reader).
  const cleaned = patterns.map((p) => p.trim()).filter((p) => p.length > 0 && !p.startsWith("#"))

  if (cleaned.length === 0) {
    return {
      matches: () => false,
      size: 0,
    }
  }

  log.debug?.(`createCollapseParseMatcher: ${cleaned.length} patterns (${cleaned.join(", ")})`)

  return {
    matches(relPath: string): boolean {
      // Normalize Windows separators so authors can write either form.
      const normalized = relPath.replace(/\\/g, "/")
      for (const pattern of cleaned) {
        if (matchesPattern(normalized, pattern)) return true
      }
      return false
    },
    get size() {
      return cleaned.length
    },
  }
}

/**
 * Convenience: create a disabled matcher (matches nothing).
 * Used as a default when no config is present.
 */
export function createNullCollapseParseMatcher(): CollapseParseMatcher {
  return {
    matches: () => false,
    size: 0,
  }
}
