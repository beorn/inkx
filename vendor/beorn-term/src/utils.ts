/**
 * ANSI string utilities and extended underline functions.
 *
 * Provides ANSI stripping, display width calculation, extended underline
 * styles (curly, dotted, dashed, double), underline coloring, and hyperlinks.
 */

import stringWidth from "string-width"
import chalk from "chalk"
import type { UnderlineStyle, RGB } from "./types.js"
import { detectExtendedUnderline } from "./detection.js"

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
export const ANSI_REGEX = /\x1b\[[0-9;:]*m|\x1b\]8;;[^\x1b]*\x1b\\/g

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
  return text.replace(ANSI_REGEX, "")
}

/**
 * Get the display width of a string, excluding ANSI escape codes.
 * Correctly handles CJK characters, emoji, and other wide characters.
 *
 * @param text - String potentially containing ANSI codes
 * @returns Number of terminal columns the text will occupy
 *
 * @example
 * ```ts
 * displayLength('\x1b[31mhello\x1b[0m') // 5
 * displayLength('hello') // 5
 * displayLength('\u97d3\u6587') // 4 (2 chars x 2 cells each)
 * ```
 */
export function displayLength(text: string): number {
  return stringWidth(stripAnsi(text))
}

// =============================================================================
// Extended Underline Constants
// =============================================================================

/** Extended underline style codes using colon-separated parameters (ISO 8613-6) */
const UNDERLINE_CODES = {
  none: "\x1b[4:0m",
  single: "\x1b[4:1m",
  double: "\x1b[4:2m",
  curly: "\x1b[4:3m",
  dotted: "\x1b[4:4m",
  dashed: "\x1b[4:5m",
  reset: "\x1b[4:0m",
} as const

/** Standard underline on (SGR 4) */
const UNDERLINE_STANDARD = "\x1b[4m"

/** Standard underline off (SGR 24) */
const UNDERLINE_RESET_STANDARD = "\x1b[24m"

/** Reset underline color to default (SGR 59) */
const UNDERLINE_COLOR_RESET = "\x1b[59m"

/** Build underline color escape code for RGB values */
function buildUnderlineColorCode(r: number, g: number, b: number): string {
  return `\x1b[58:2::${r}:${g}:${b}m`
}

// =============================================================================
// Extended Underline Detection Cache
// =============================================================================

let cachedExtendedUnderlineSupport: boolean | undefined

function supportsExtendedUnderline(): boolean {
  if (cachedExtendedUnderlineSupport === undefined) {
    cachedExtendedUnderlineSupport = detectExtendedUnderline()
  }
  return cachedExtendedUnderlineSupport
}

// =============================================================================
// Extended Underline Functions
// =============================================================================

/**
 * Apply an extended underline style to text.
 * Falls back to regular underline on unsupported terminals.
 */
function underline(text: string, style: UnderlineStyle = "single"): string {
  if (!supportsExtendedUnderline() || style === "single") {
    return chalk.underline(text)
  }

  return `${UNDERLINE_CODES[style]}${text}${UNDERLINE_CODES.reset}`
}

/**
 * Apply curly/wavy underline to text.
 * Commonly used for spell check errors in IDEs.
 * Falls back to regular underline on unsupported terminals.
 *
 * @param text - Text to underline
 * @returns Styled text with curly underline
 *
 * @example
 * ```ts
 * curlyUnderline('misspelled')
 * chalk.red(curlyUnderline('error'))
 * ```
 */
export function curlyUnderline(text: string): string {
  return underline(text, "curly")
}

/**
 * Apply dotted underline to text.
 * Falls back to regular underline on unsupported terminals.
 *
 * @param text - Text to underline
 * @returns Styled text with dotted underline
 */
export function dottedUnderline(text: string): string {
  return underline(text, "dotted")
}

/**
 * Apply dashed underline to text.
 * Falls back to regular underline on unsupported terminals.
 *
 * @param text - Text to underline
 * @returns Styled text with dashed underline
 */
export function dashedUnderline(text: string): string {
  return underline(text, "dashed")
}

/**
 * Apply double underline to text.
 * Falls back to regular underline on unsupported terminals.
 *
 * @param text - Text to underline
 * @returns Styled text with double underline
 */
export function doubleUnderline(text: string): string {
  return underline(text, "double")
}

// =============================================================================
// Underline Color Functions
// =============================================================================

/**
 * Set underline color independently of text color.
 * On unsupported terminals, the color is ignored but underline still applies.
 *
 * @param r - Red component (0-255)
 * @param g - Green component (0-255)
 * @param b - Blue component (0-255)
 * @param text - Text to style
 * @returns Styled text with colored underline
 *
 * @example
 * ```ts
 * // Red underline (text color unchanged)
 * underlineColor(255, 0, 0, 'warning')
 *
 * // Red underline with blue text
 * chalk.blue(underlineColor(255, 0, 0, 'blue text, red underline'))
 * ```
 */
export function underlineColor(
  r: number,
  g: number,
  b: number,
  text: string,
): string {
  if (!supportsExtendedUnderline()) {
    // Fallback: just apply regular underline, ignore color
    return chalk.underline(text)
  }

  const colorCode = buildUnderlineColorCode(r, g, b)
  return `${UNDERLINE_STANDARD}${colorCode}${text}${UNDERLINE_COLOR_RESET}${UNDERLINE_RESET_STANDARD}`
}

/**
 * Combine underline style with underline color.
 *
 * @param style - Underline style ('curly', 'dotted', 'dashed', 'double', 'single')
 * @param rgb - Color as [r, g, b] tuple (0-255 each), or null for default color
 * @param text - Text to style
 * @returns Styled text with colored underline in specified style
 *
 * @example
 * ```ts
 * // Red curly underline (spell-check style)
 * styledUnderline('curly', [255, 0, 0], 'misspelled')
 *
 * // Orange dashed underline with yellow text
 * chalk.yellow(styledUnderline('dashed', [255, 165, 0], 'warning'))
 *
 * // Curly underline with default color
 * styledUnderline('curly', null, 'text')
 * ```
 */
export function styledUnderline(
  style: UnderlineStyle,
  rgb: RGB | null,
  text: string,
): string {
  if (!supportsExtendedUnderline()) {
    return chalk.underline(text)
  }

  // If no color, just apply style
  if (rgb === null) {
    return underline(text, style)
  }

  const [r, g, b] = rgb
  const styleCode = UNDERLINE_CODES[style]
  const colorCode = buildUnderlineColorCode(r, g, b)

  return `${styleCode}${colorCode}${text}${UNDERLINE_CODES.reset}${UNDERLINE_COLOR_RESET}`
}

// =============================================================================
// Hyperlinks (OSC 8)
// =============================================================================

/** OSC 8 hyperlink start sequence */
const HYPERLINK_START = "\x1b]8;;"

/** OSC 8 hyperlink end sequence (ST - String Terminator) */
const HYPERLINK_END = "\x1b\\"

/**
 * Create a clickable hyperlink using OSC 8 escape sequences.
 * Works in most modern terminals (iTerm2, Ghostty, Kitty, WezTerm, etc).
 *
 * @param text - Display text for the link
 * @param url - URL to link to
 * @returns Text with OSC 8 hyperlink sequences
 *
 * @example
 * ```ts
 * hyperlink('Click here', 'https://example.com')
 * // Renders as clickable "Click here" in supporting terminals
 * ```
 */
export function hyperlink(text: string, url: string): string {
  return `${HYPERLINK_START}${url}${HYPERLINK_END}${text}${HYPERLINK_START}${HYPERLINK_END}`
}
