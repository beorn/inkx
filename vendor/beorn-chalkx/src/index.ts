/**
 * chalk-x: Extended Chalk with Modern Terminal Features
 *
 * Extends chalk with features not natively supported:
 * - Extended underline styles (curly, dotted, dashed, double)
 * - Independent underline color
 * - Hyperlinks (OSC 8)
 *
 * Features graceful fallback for unsupported terminals.
 *
 * ## Terminal Support
 *
 * | Feature           | Ghostty | Kitty | WezTerm | iTerm2 | Terminal.app |
 * |-------------------|---------|-------|---------|--------|--------------|
 * | Curly underline   | ✓       | ✓     | ✓       | ✓      | ✗ (fallback) |
 * | Dotted underline  | ✓       | ✓     | ✓       | ✓      | ✗ (fallback) |
 * | Dashed underline  | ✓       | ✓     | ✓       | ✓      | ✗ (fallback) |
 * | Double underline  | ✓       | ✓     | ✓       | ✓      | ✗ (fallback) |
 * | Underline color   | ✓       | ✓     | ✓       | ✓      | ✗ (ignored)  |
 * | Hyperlinks        | ✓       | ✓     | ✓       | ✓      | ✓            |
 *
 * @see https://sw.kovidgoyal.net/kitty/underlines/
 * @see https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda
 */

import chalk from "chalk";

// =============================================================================
// ANSI String Utilities
// =============================================================================

/**
 * ANSI escape code pattern for stripping.
 * Matches:
 * - SGR escape sequences like \x1b[31m (red), \x1b[0m (reset)
 * - Extended SGR codes like \x1b[4:3m (curly underline) or \x1b[58:2::r:g:bm (underline color)
 * - OSC 8 hyperlink sequences: \x1b]8;;<url>\x1b\\ (opening) and \x1b]8;;\x1b\\ (closing)
 */
export const ANSI_REGEX = /\x1b\[[0-9;:]*m|\x1b\]8;;[^\x1b]*\x1b\\/g;

/**
 * Get the display length of a string, excluding ANSI escape codes.
 * Use this instead of string.length when measuring styled text.
 */
export function displayLength(text: string): number {
  return text.replace(ANSI_REGEX, "").length;
}

/**
 * Strip all ANSI escape codes from a string.
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "");
}

// =============================================================================
// Terminal Capability Detection
// =============================================================================

/**
 * Detect if the terminal supports extended underline styles.
 * Uses TERM and TERM_PROGRAM environment variables.
 */
function detectExtendedUnderlineSupport(): boolean {
  const term = process.env.TERM ?? "";
  const termProgram = process.env.TERM_PROGRAM ?? "";

  // Known terminals with extended underline support
  const supportedTerms = [
    "xterm-ghostty",
    "xterm-kitty",
    "wezterm",
    "xterm-256color", // Often iTerm2 or modern terminals
  ];

  const supportedPrograms = [
    "Ghostty",
    "iTerm.app",
    "WezTerm",
    "Apple_Terminal", // Actually doesn't support, but we check TERM first
  ];

  // Check if running in a known modern terminal
  if (supportedTerms.some((t) => term.includes(t))) {
    return true;
  }

  if (supportedPrograms.some((p) => termProgram.includes(p))) {
    // Apple Terminal doesn't actually support extended underlines
    if (termProgram === "Apple_Terminal") {
      return false;
    }
    return true;
  }

  // Kitty sets KITTY_WINDOW_ID
  if (process.env.KITTY_WINDOW_ID) {
    return true;
  }

  // Default to false for unknown terminals
  return false;
}

/**
 * Cached result of terminal capability detection.
 * Can be overridden for testing.
 */
let _supportsExtendedUnderline: boolean | null = null;

export function supportsExtendedUnderline(): boolean {
  if (_supportsExtendedUnderline === null) {
    _supportsExtendedUnderline = detectExtendedUnderlineSupport();
  }
  return _supportsExtendedUnderline;
}

/**
 * Override extended underline support detection (for testing).
 */
export function setExtendedUnderlineSupport(supported: boolean | null): void {
  _supportsExtendedUnderline = supported;
}

// =============================================================================
// ANSI Escape Codes
// =============================================================================

// Extended underline styles use colon-separated parameters
const UNDERLINE_CODES = {
  single: "\x1b[4:1m",
  double: "\x1b[4:2m",
  curly: "\x1b[4:3m",
  dotted: "\x1b[4:4m",
  dashed: "\x1b[4:5m",
  reset: "\x1b[4:0m",
} as const;

// Standard underline (fallback)
const UNDERLINE_STANDARD = "\x1b[4m";
const UNDERLINE_RESET_STANDARD = "\x1b[24m";

// Underline color (SGR 58/59)
const UNDERLINE_COLOR_RESET = "\x1b[59m";

// Hyperlink (OSC 8)
const HYPERLINK_START = "\x1b]8;;";
const HYPERLINK_END = "\x1b\\";

// =============================================================================
// Extended Underline Functions
// =============================================================================

export type UnderlineStyle =
  | "single"
  | "double"
  | "curly"
  | "dotted"
  | "dashed";

/**
 * Apply an extended underline style to text.
 * Falls back to regular underline on unsupported terminals.
 */
export function underline(
  text: string,
  style: UnderlineStyle = "single",
): string {
  if (!supportsExtendedUnderline() || style === "single") {
    return chalk.underline(text);
  }

  return `${UNDERLINE_CODES[style]}${text}${UNDERLINE_CODES.reset}`;
}

/**
 * Apply curly/wavy underline. Falls back to regular underline.
 */
export function curlyUnderline(text: string): string {
  return underline(text, "curly");
}

/**
 * Apply dotted underline. Falls back to regular underline.
 */
export function dottedUnderline(text: string): string {
  return underline(text, "dotted");
}

/**
 * Apply dashed underline. Falls back to regular underline.
 */
export function dashedUnderline(text: string): string {
  return underline(text, "dashed");
}

/**
 * Apply double underline. Falls back to regular underline.
 */
export function doubleUnderline(text: string): string {
  return underline(text, "double");
}

// =============================================================================
// Underline Color
// =============================================================================

/**
 * Set underline color independently of text color.
 * On unsupported terminals, the color is ignored but underline still applies.
 *
 * @param r - Red component (0-255)
 * @param g - Green component (0-255)
 * @param b - Blue component (0-255)
 * @param text - Text to style
 */
export function underlineColor(
  r: number,
  g: number,
  b: number,
  text: string,
): string {
  if (!supportsExtendedUnderline()) {
    // Fallback: just apply regular underline, ignore color
    return chalk.underline(text);
  }

  const colorCode = `\x1b[58:2::${r}:${g}:${b}m`;
  return `${UNDERLINE_STANDARD}${colorCode}${text}${UNDERLINE_COLOR_RESET}${UNDERLINE_RESET_STANDARD}`;
}

/**
 * Combine underline style with underline color.
 *
 * @param style - Underline style
 * @param rgb - Color as [r, g, b] tuple (0-255 each)
 * @param text - Text to style
 */
export function styledUnderline(
  style: UnderlineStyle,
  rgb: [number, number, number],
  text: string,
): string {
  if (!supportsExtendedUnderline()) {
    return chalk.underline(text);
  }

  const [r, g, b] = rgb;
  const styleCode = UNDERLINE_CODES[style];
  const colorCode = `\x1b[58:2::${r}:${g}:${b}m`;

  return `${styleCode}${colorCode}${text}${UNDERLINE_CODES.reset}${UNDERLINE_COLOR_RESET}`;
}

// =============================================================================
// Hyperlinks (OSC 8)
// =============================================================================

/**
 * Create a clickable hyperlink in supporting terminals.
 * Falls back to showing just the text (no URL) on unsupported terminals.
 *
 * @param text - Display text
 * @param url - Target URL
 */
export function hyperlink(text: string, url: string): string {
  // Most modern terminals support OSC 8, so we emit it
  // Unsupported terminals will just show the text
  return `${HYPERLINK_START}${url}${HYPERLINK_END}${text}${HYPERLINK_START}${HYPERLINK_END}`;
}

// =============================================================================
// Re-export chalk for convenience
// =============================================================================

export { chalk };

/**
 * Extended chalk instance with all standard chalk methods plus extensions.
 * Use chalkX.curlyUnderline(), chalkX.hyperlink(), etc.
 */
export const chalkX = {
  // All chalk methods
  ...chalk,

  // Extended underlines
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  underlineColor,
  styledUnderline,

  // Hyperlinks
  hyperlink,

  // Capability detection
  supportsExtendedUnderline,
};

export default chalkX;
