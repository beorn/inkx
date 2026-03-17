/**
 * Ignore Patterns
 *
 * Centralized ignore pattern handling for sync and watch operations.
 * Supports default patterns, .gitignore, .obsidianignore, and custom .kmignore files.
 *
 * Performance: Uses PatternMatcher class to pre-compile regex patterns once.
 * This avoids O(n*m) regex compilation where n=files and m=patterns.
 */

import { existsSync, readFileSync } from "fs"
import { join, relative, basename } from "path"

/**
 * Default ignore patterns - common directories and files that should never be synced
 */
export const DEFAULT_IGNORE_PATTERNS = [
  // Version control
  "**/.git/**",
  "**/.svn/**",
  "**/.hg/**",

  // Package managers / dependencies
  "**/node_modules/**",
  "**/bower_components/**",
  "**/.pnpm/**",
  "**/vendor/**",

  // Build outputs
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/.output/**",
  "**/target/**",

  // IDE and editor
  "**/.idea/**",
  "**/.vscode/**",
  "**/*.swp",
  "**/*.swo",
  "**/*~",

  // Obsidian internals (config, not content)
  "**/.obsidian/**",
  "**/.trash/**",

  // km internals
  "**/.km/**",

  // beads issue tracker (contains sockets)
  "**/.beads/**",

  // OS files
  "**/.DS_Store",
  "**/Thumbs.db",
  "**/desktop.ini",

  // Logs and temp files
  "**/*.log",
  "**/*.tmp",
  "**/*.temp",
  "**/*.bak",
  "**/npm-debug.log*",
  "**/yarn-error.log*",

  // Socket files (can't be watched)
  "**/*.sock",

  // Cache directories
  "**/.cache/**",
  "**/__pycache__/**",
  "**/.pytest_cache/**",
  "**/.mypy_cache/**",

  // Environment and secrets (shouldn't be in repo anyway)
  "**/.env",
  "**/.env.*",
  "**/credentials.json",
  "**/*.pem",
  "**/*.key",
]

/**
 * Patterns that match hidden files/directories (starting with .)
 * These are handled separately for fine-grained control
 */
export const HIDDEN_FILE_PATTERN = "**/.*"

/**
 * Convert a gitignore pattern to a glob pattern
 * This is a simplified conversion - gitignore has some nuances
 */
function gitignoreToGlob(pattern: string, _basePath: string): string {
  let glob = pattern.trim()

  // Skip empty lines and comments
  if (!glob || glob.startsWith("#")) {
    return ""
  }

  // Handle negation (we don't support it yet, skip)
  if (glob.startsWith("!")) {
    return ""
  }

  // Remove leading slash (makes it relative to repo root)
  if (glob.startsWith("/")) {
    glob = glob.slice(1)
  }

  // If pattern ends with /, it's a directory
  if (glob.endsWith("/")) {
    glob = glob.slice(0, -1) + "/**"
  }

  // If pattern doesn't contain /, it matches anywhere
  if (!glob.includes("/")) {
    glob = "**/" + glob
  }

  // If pattern doesn't start with ** or /, make it match from root
  if (!glob.startsWith("**/") && !glob.startsWith("/")) {
    // Pattern like "foo/bar" should match from root
    // But "*.log" should match anywhere (already handled above)
  }

  return glob
}

/**
 * Read and parse a .gitignore file
 */
export function readGitignore(repoPath: string): string[] {
  const gitignorePath = join(repoPath, ".gitignore")

  if (!existsSync(gitignorePath)) {
    return []
  }

  try {
    const content = readFileSync(gitignorePath, "utf-8")
    const patterns: string[] = []

    for (const line of content.split("\n")) {
      const glob = gitignoreToGlob(line, repoPath)
      if (glob) {
        patterns.push(glob)
      }
    }

    return patterns
  } catch {
    return []
  }
}

/**
 * Read and parse a .kmignore file (km-specific ignore patterns)
 */
export function readKmignore(repoPath: string): string[] {
  const kmignorePath = join(repoPath, ".kmignore")

  if (!existsSync(kmignorePath)) {
    return []
  }

  try {
    const content = readFileSync(kmignorePath, "utf-8")
    const patterns: string[] = []

    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        continue
      }
      // .kmignore uses glob patterns directly
      patterns.push(trimmed)
    }

    return patterns
  } catch {
    return []
  }
}

/**
 * Read and parse Obsidian's .obsidianignore file
 * This file uses gitignore-style patterns
 */
export function readObsidianIgnore(repoPath: string): string[] {
  const obsidianIgnorePath = join(repoPath, ".obsidianignore")

  if (!existsSync(obsidianIgnorePath)) {
    return []
  }

  try {
    const content = readFileSync(obsidianIgnorePath, "utf-8")
    const patterns: string[] = []

    for (const line of content.split("\n")) {
      const glob = gitignoreToGlob(line, repoPath)
      if (glob) {
        patterns.push(glob)
      }
    }

    return patterns
  } catch {
    return []
  }
}

/**
 * Get all ignore patterns for a repo
 * Combines default patterns with .gitignore, .obsidianignore, and .kmignore
 */
export function getIgnorePatterns(repoPath: string): string[] {
  const patterns = [...DEFAULT_IGNORE_PATTERNS]

  // Add .gitignore patterns
  patterns.push(...readGitignore(repoPath))

  // Add .obsidianignore patterns (Obsidian's native ignore file)
  patterns.push(...readObsidianIgnore(repoPath))

  // Add .kmignore patterns (km-specific)
  patterns.push(...readKmignore(repoPath))

  return patterns
}

/**
 * Convert a glob pattern to a compiled RegExp.
 * Used internally by PatternMatcher for one-time compilation.
 */
function patternToRegex(pattern: string): RegExp | null {
  // Use placeholders to avoid double-replacement issues
  const DOUBLE_STAR_SLASH = "\x00DSS\x00" // **/ at start
  const SLASH_DOUBLE_STAR_SLASH = "\x00SDSS\x00" // /**/
  const SLASH_DOUBLE_STAR = "\x00SDS\x00" // /**
  const DOUBLE_STAR = "\x00DS\x00" // ** alone
  const SINGLE_STAR = "\x00SS\x00"
  const QUESTION = "\x00Q\x00"

  let regex = pattern
    // Handle specific ** patterns first (order matters!)
    // **/ at start: match start of string or .*/
    .replace(/^\*\*\//g, DOUBLE_STAR_SLASH)
    // /**/ in middle: match / followed by anything then /
    .replace(/\/\*\*\//g, SLASH_DOUBLE_STAR_SLASH)
    // /** at end: match / then anything
    .replace(/\/\*\*$/g, SLASH_DOUBLE_STAR)
    // Remaining ** (standalone): match anything
    .replace(/\*\*/g, DOUBLE_STAR)
    // Single * and ?
    .replace(/\*/g, SINGLE_STAR)
    .replace(/\?/g, QUESTION)
    // Escape special regex chars
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    // Replace placeholders with regex equivalents
    .replace(new RegExp(DOUBLE_STAR_SLASH.replace(/\x00/g, "\\x00"), "g"), "(?:.*\\/)?")
    .replace(new RegExp(SLASH_DOUBLE_STAR_SLASH.replace(/\x00/g, "\\x00"), "g"), "(?:\\/.*)?/")
    .replace(new RegExp(SLASH_DOUBLE_STAR.replace(/\x00/g, "\\x00"), "g"), "(?:\\/.*)?")
    .replace(new RegExp(DOUBLE_STAR.replace(/\x00/g, "\\x00"), "g"), ".*")
    .replace(new RegExp(SINGLE_STAR.replace(/\x00/g, "\\x00"), "g"), "[^/]*")
    .replace(new RegExp(QUESTION.replace(/\x00/g, "\\x00"), "g"), ".")

  // Anchor the pattern
  regex = "^" + regex + "$"

  try {
    return new RegExp(regex)
  } catch {
    return null
  }
}

export interface PatternMatcherOptions {
  /** Glob patterns to match against */
  patterns: string[]
}

/**
 * PatternMatcher interface - pre-compiled pattern matcher for efficient ignore checking.
 */
export interface PatternMatcher {
  /** Check if a path matches any pattern. Tests both full path and basename. */
  matches(path: string, repoPath?: string): boolean
  /** Number of compiled patterns */
  readonly size: number
}

/**
 * Create a pre-compiled pattern matcher for efficient ignore checking.
 *
 * Compiles all glob patterns to RegExp once at construction time,
 * avoiding O(n*m) regex compilation during file scanning.
 *
 * Usage:
 *   const matcher = createPatternMatcher({ patterns: getIgnorePatterns(repoPath) })
 *   if (matcher.matches(filePath)) { skip this file }
 */
function createPatternMatcher(options: PatternMatcherOptions): PatternMatcher {
  const compiledPatterns: Array<{ regex: RegExp; original: string }> = []

  for (const pattern of options.patterns) {
    const regex = patternToRegex(pattern)
    if (regex) {
      compiledPatterns.push({ regex, original: pattern })
    }
  }

  return {
    matches(path, repoPath) {
      const normalizedPath = repoPath ? relative(repoPath, path) : path
      const name = basename(path)

      for (const { regex } of compiledPatterns) {
        if (regex.test(normalizedPath) || regex.test(name)) {
          return true
        }
      }
      return false
    },

    get size() {
      return compiledPatterns.length
    },
  }
}

/**
 * Create a PatternMatcher for a repository.
 * Combines default patterns with .gitignore, .obsidianignore, and .kmignore.
 */
export function createIgnoreMatcher(repoPath: string): PatternMatcher {
  const patterns = getIgnorePatterns(repoPath)
  return createPatternMatcher({ patterns })
}

/**
 * Simple glob pattern matcher (non-cached version)
 * Supports *, **, and ? wildcards
 *
 * **  - matches any path segment(s), including none
 * *   - matches any characters except /
 * ?   - matches single character
 *
 * NOTE: For hot paths, use PatternMatcher instead to avoid repeated regex compilation.
 */
export function matchesPattern(path: string, pattern: string): boolean {
  const regex = patternToRegex(pattern)
  if (!regex) return false
  return regex.test(path)
}

/**
 * Check if a path should be ignored.
 *
 * Accepts either a string[] of patterns (legacy, recompiles each call)
 * or a PatternMatcher (preferred, pre-compiled).
 */
export function shouldIgnore(path: string, patternsOrMatcher: string[] | PatternMatcher, repoPath?: string): boolean {
  // Use PatternMatcher if provided (fast path) - check for matches method
  if (!Array.isArray(patternsOrMatcher)) {
    return patternsOrMatcher.matches(path, repoPath)
  }

  // Legacy: array of patterns (recompiles each call)
  const patterns = patternsOrMatcher
  const normalizedPath = repoPath ? relative(repoPath, path) : path

  for (const pattern of patterns) {
    if (matchesPattern(normalizedPath, pattern)) {
      return true
    }
    // Also try matching against basename for patterns like "*.log"
    if (matchesPattern(basename(path), pattern)) {
      return true
    }
  }

  return false
}

/**
 * Check if a filename is a hidden file (starts with .)
 */
export function isHiddenFile(path: string): boolean {
  const name = basename(path)
  // .md is a valid index file naming convention (dot-md), not a hidden file
  return name.startsWith(".") && name !== "." && name !== ".." && name !== ".md"
}
