/**
 * ANSI String Utilities (Layer 1 - Shared)
 *
 * Utilities for working with ANSI-styled terminal strings.
 *
 * ## Functions
 * - `displayLength(text)` - character count excluding ANSI codes
 * - `stripAnsi(text)` - remove all ANSI escape codes
 *
 * Why inline stripAnsi here instead of re-exporting from `@silvery/ag-term`?
 * Because @km/text-render is consumed by both km-tui and silvercode — pulling
 * in a silvery dep here can produce a duplicated module instance through
 * bun's hoisting, which breaks React context in downstream rendering tests
 * (`useStdout must be used within an Silvery application`). Keeping this
 * package free of silvery deps keeps the dependency graph flat.
 */

import stringWidth from "string-width"

/** Regex matching ANSI escape sequences (CSI, OSC, ESC). */
const ANSI_PATTERN =
  // eslint-disable-next-line no-control-regex
  /[][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g

/** Strip all ANSI escape codes from a string. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "")
}

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
