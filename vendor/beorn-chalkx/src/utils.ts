/**
 * ANSI string utilities - chalk-free, zero dependencies.
 *
 * This module can be imported separately via `@beorn/chalkx/utils`
 * for projects that only need ANSI stripping without chalk.
 */

// =============================================================================
// ANSI Regex Pattern
// =============================================================================

/**
 * ANSI escape code pattern for stripping.
 *
 * Matches:
 * - SGR escape sequences: \x1b[31m (red), \x1b[0m (reset)
 * - Extended SGR codes: \x1b[4:3m (curly underline), \x1b[58:2::r:g:bm (underline color)
 * - OSC 8 hyperlink sequences: \x1b]8;;<url>\x1b\\ (opening and closing)
 */
export const ANSI_REGEX = /\x1b\[[0-9;:]*m|\x1b\]8;;[^\x1b]*\x1b\\/g;

// =============================================================================
// String Utilities
// =============================================================================

/**
 * Strip all ANSI escape codes from a string.
 *
 * @param text - String potentially containing ANSI codes
 * @returns Clean string with all ANSI codes removed
 *
 * @example
 * ```ts
 * stripAnsi('\x1b[31mred\x1b[0m') // 'red'
 * stripAnsi('\x1b[4:3mwavy\x1b[4:0m') // 'wavy'
 * ```
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "");
}

/**
 * Get the display length of a string, excluding ANSI escape codes.
 * Use this instead of string.length when measuring styled text.
 *
 * @param text - String potentially containing ANSI codes
 * @returns Number of visible characters
 *
 * @example
 * ```ts
 * displayLength('\x1b[31mhello\x1b[0m') // 5
 * displayLength('hello') // 5
 * ```
 *
 * @note This is a simple implementation that counts characters.
 * For accurate width with CJK/emoji, consider using a library like `string-width`.
 */
export function displayLength(text: string): number {
  return stripAnsi(text).length;
}
