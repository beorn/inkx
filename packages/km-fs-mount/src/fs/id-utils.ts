/**
 * ID Utilities - Consistent node ID generation
 *
 * Node IDs for filesystem-backed nodes (files, folders) must be deterministic
 * and based on the relative path from repo root. This ensures:
 * - Same file/folder always gets the same ID
 * - No duplicates when discovery and watch handler both run
 * - IDs are human-readable for debugging
 */

import { relative } from "path"

/**
 * Generate a deterministic node ID from a filesystem path.
 *
 * For files and folders, ID = relative path from repo root.
 * For markdown sections/tasks, ID = "relative/path.md:lineNumber"
 *
 * @param repoRoot - Absolute path to repo root
 * @param fsPath - Absolute path to file or folder
 * @param lineNum - Optional line number for markdown elements
 * @returns Deterministic ID based on path
 */
export function generatePathBasedId(repoRoot: string, fsPath: string, lineNum?: number): string {
  const relPath = relative(repoRoot, fsPath)
  return lineNum !== undefined ? `${relPath}:${lineNum}` : relPath
}
