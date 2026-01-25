/**
 * Path formatting utilities for CLI output
 */

import { homedir } from "os"
import { relative } from "path"

/**
 * Format a path for display - uses shorter of:
 * - Relative to CWD (e.g., "../foo" or "./bar")
 * - Home-relative (e.g., "~/Code/project")
 * - Absolute (fallback)
 */
export function formatPath(absPath: string): string {
  const home = homedir()
  const cwd = process.cwd()

  // Try relative to CWD
  const relPath = relative(cwd, absPath)
  // Add ./ prefix for paths that don't start with ..
  const relDisplay = relPath.startsWith("..") ? relPath : `./${relPath}`

  // Try home-relative
  const homeDisplay = absPath.startsWith(home)
    ? "~" + absPath.slice(home.length)
    : absPath

  // Return shorter one
  return relDisplay.length <= homeDisplay.length ? relDisplay : homeDisplay
}
