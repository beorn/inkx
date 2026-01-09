/**
 * Ignore Patterns
 *
 * Centralized ignore pattern handling for sync and watch operations.
 * Supports default patterns, .gitignore, .obsidianignore, and custom .kmignore files.
 */

import { existsSync, readFileSync } from "fs";
import { join, relative, basename } from "path";

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

  // Kimmi internals
  "**/.km/**",

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

  // Cache directories
  "**/.cache/**",
  "**/__pycache__/**",
  "**/.pytest_cache/**",
  "**/.mypy_cache/**",

  // Environment and secrets (shouldn't be in vault anyway)
  "**/.env",
  "**/.env.*",
  "**/credentials.json",
  "**/*.pem",
  "**/*.key",
];

/**
 * Patterns that match hidden files/directories (starting with .)
 * These are handled separately for fine-grained control
 */
export const HIDDEN_FILE_PATTERN = "**/.*";

/**
 * Convert a gitignore pattern to a glob pattern
 * This is a simplified conversion - gitignore has some nuances
 */
function gitignoreToGlob(pattern: string, basePath: string): string {
  let glob = pattern.trim();

  // Skip empty lines and comments
  if (!glob || glob.startsWith("#")) {
    return "";
  }

  // Handle negation (we don't support it yet, skip)
  if (glob.startsWith("!")) {
    return "";
  }

  // Remove leading slash (makes it relative to repo root)
  if (glob.startsWith("/")) {
    glob = glob.slice(1);
  }

  // If pattern ends with /, it's a directory
  if (glob.endsWith("/")) {
    glob = glob.slice(0, -1) + "/**";
  }

  // If pattern doesn't contain /, it matches anywhere
  if (!glob.includes("/")) {
    glob = "**/" + glob;
  }

  // If pattern doesn't start with ** or /, make it match from root
  if (!glob.startsWith("**/") && !glob.startsWith("/")) {
    // Pattern like "foo/bar" should match from root
    // But "*.log" should match anywhere (already handled above)
  }

  return glob;
}

/**
 * Read and parse a .gitignore file
 */
export function readGitignore(vaultPath: string): string[] {
  const gitignorePath = join(vaultPath, ".gitignore");

  if (!existsSync(gitignorePath)) {
    return [];
  }

  try {
    const content = readFileSync(gitignorePath, "utf-8");
    const patterns: string[] = [];

    for (const line of content.split("\n")) {
      const glob = gitignoreToGlob(line, vaultPath);
      if (glob) {
        patterns.push(glob);
      }
    }

    return patterns;
  } catch {
    return [];
  }
}

/**
 * Read and parse a .kmignore file (Kimmi-specific ignore patterns)
 */
export function readKmignore(vaultPath: string): string[] {
  const kmignorePath = join(vaultPath, ".kmignore");

  if (!existsSync(kmignorePath)) {
    return [];
  }

  try {
    const content = readFileSync(kmignorePath, "utf-8");
    const patterns: string[] = [];

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      // .kmignore uses glob patterns directly
      patterns.push(trimmed);
    }

    return patterns;
  } catch {
    return [];
  }
}

/**
 * Read and parse Obsidian's .obsidianignore file
 * This file uses gitignore-style patterns
 */
export function readObsidianIgnore(vaultPath: string): string[] {
  const obsidianIgnorePath = join(vaultPath, ".obsidianignore");

  if (!existsSync(obsidianIgnorePath)) {
    return [];
  }

  try {
    const content = readFileSync(obsidianIgnorePath, "utf-8");
    const patterns: string[] = [];

    for (const line of content.split("\n")) {
      const glob = gitignoreToGlob(line, vaultPath);
      if (glob) {
        patterns.push(glob);
      }
    }

    return patterns;
  } catch {
    return [];
  }
}

/**
 * Get all ignore patterns for a vault
 * Combines default patterns with .gitignore, .obsidianignore, and .kmignore
 */
export function getIgnorePatterns(vaultPath: string): string[] {
  const patterns = [...DEFAULT_IGNORE_PATTERNS];

  // Add .gitignore patterns
  patterns.push(...readGitignore(vaultPath));

  // Add .obsidianignore patterns (Obsidian's native ignore file)
  patterns.push(...readObsidianIgnore(vaultPath));

  // Add .kmignore patterns (Kimmi-specific)
  patterns.push(...readKmignore(vaultPath));

  return patterns;
}

/**
 * Simple glob pattern matcher
 * Supports *, **, and ? wildcards
 */
export function matchesPattern(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  let regex = pattern
    // Escape special regex chars (except our wildcards)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    // Convert ** to match any path
    .replace(/\*\*/g, ".*")
    // Convert * to match anything except /
    .replace(/\*/g, "[^/]*")
    // Convert ? to match single char
    .replace(/\?/g, ".");

  // Anchor the pattern
  regex = "^" + regex + "$";

  try {
    return new RegExp(regex).test(path);
  } catch {
    return false;
  }
}

/**
 * Check if a path should be ignored
 */
export function shouldIgnore(
  path: string,
  patterns: string[],
  vaultPath?: string
): boolean {
  // Normalize path for matching
  const normalizedPath = vaultPath ? relative(vaultPath, path) : path;

  for (const pattern of patterns) {
    if (matchesPattern(normalizedPath, pattern)) {
      return true;
    }
    // Also try matching against basename for patterns like "*.log"
    if (matchesPattern(basename(path), pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a filename is a hidden file (starts with .)
 */
export function isHiddenFile(path: string): boolean {
  const name = basename(path);
  return name.startsWith(".") && name !== "." && name !== "..";
}
