/**
 * ANSI String Utilities (Layer 1 - Shared)
 *
 * Utilities for working with ANSI-styled terminal strings.
 *
 * ## Functions
 * - `displayLength(text)` - character count excluding ANSI codes
 * - `stripAnsi(text)` - remove all ANSI escape codes
 */

import { stripAnsi } from "@silvery/ag-react"
import stringWidth from "string-width"

// Re-export ANSI utilities from silvery (canonical implementation)
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
