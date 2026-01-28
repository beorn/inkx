/**
 * Terminal capability detection.
 *
 * Detects:
 * - Cursor control (can reposition cursor)
 * - Input capability (can read raw keystrokes)
 * - Color level (basic, 256, truecolor)
 * - Unicode support (can render unicode symbols)
 * - Extended underline support (curly, dotted, etc)
 */

import type { ColorLevel } from "./types.js"

// =============================================================================
// Cursor Detection
// =============================================================================

/**
 * Detect if terminal supports cursor control (repositioning).
 * Returns false for dumb terminals and piped output.
 */
export function detectCursor(stdout: NodeJS.WriteStream): boolean {
  // Not a TTY - no cursor control
  if (!stdout.isTTY) return false

  // Dumb terminal - no cursor control
  if (process.env.TERM === "dumb") return false

  return true
}

// =============================================================================
// Input Detection
// =============================================================================

/**
 * Detect if terminal can read raw keystrokes.
 * Requires stdin to be a TTY with raw mode support.
 */
export function detectInput(stdin: NodeJS.ReadStream): boolean {
  // Not a TTY - no raw input
  if (!stdin.isTTY) return false

  // Check if setRawMode is available
  return typeof stdin.setRawMode === "function"
}

// =============================================================================
// Color Detection
// =============================================================================

/**
 * Known CI environments that may not support colors well.
 */
const CI_ENVS = [
  "CI",
  "GITHUB_ACTIONS",
  "GITLAB_CI",
  "JENKINS_URL",
  "BUILDKITE",
  "CIRCLECI",
  "TRAVIS",
]

/**
 * Detect color level supported by terminal.
 * Returns null if no color support.
 *
 * Checks (in order):
 * 1. NO_COLOR env var - forces no color
 * 2. FORCE_COLOR env var - forces color level
 * 3. COLORTERM=truecolor - truecolor support
 * 4. TERM patterns - detect from terminal type
 * 5. CI detection - basic colors in CI
 */
export function detectColor(stdout: NodeJS.WriteStream): ColorLevel | null {
  // NO_COLOR takes precedence (see https://no-color.org/)
  if (process.env.NO_COLOR !== undefined) {
    return null
  }

  // FORCE_COLOR overrides detection
  const forceColor = process.env.FORCE_COLOR
  if (forceColor !== undefined) {
    if (forceColor === "0" || forceColor === "false") return null
    if (forceColor === "1") return "basic"
    if (forceColor === "2") return "256"
    if (forceColor === "3") return "truecolor"
    // Any other truthy value defaults to basic
    return "basic"
  }

  // Non-TTY without FORCE_COLOR - no colors
  if (!stdout.isTTY) {
    return null
  }

  // Dumb terminal
  if (process.env.TERM === "dumb") {
    return null
  }

  // COLORTERM=truecolor indicates 24-bit support
  const colorTerm = process.env.COLORTERM
  if (colorTerm === "truecolor" || colorTerm === "24bit") {
    return "truecolor"
  }

  // Check TERM for color hints
  const term = process.env.TERM ?? ""

  // Known truecolor terminals
  if (
    term.includes("truecolor") ||
    term.includes("24bit") ||
    term.includes("xterm-ghostty") ||
    term.includes("xterm-kitty") ||
    term.includes("wezterm")
  ) {
    return "truecolor"
  }

  // 256-color terminals
  if (term.includes("256color") || term.includes("256")) {
    return "256"
  }

  // Modern macOS terminals typically support truecolor
  const termProgram = process.env.TERM_PROGRAM
  if (termProgram === "iTerm.app" || termProgram === "Apple_Terminal") {
    return termProgram === "iTerm.app" ? "truecolor" : "256"
  }

  // Ghostty, WezTerm, Kitty via TERM_PROGRAM
  if (termProgram === "Ghostty" || termProgram === "WezTerm") {
    return "truecolor"
  }

  // Kitty via env var
  if (process.env.KITTY_WINDOW_ID) {
    return "truecolor"
  }

  // xterm-color variants get basic colors
  if (term.includes("xterm") || term.includes("color") || term.includes("ansi")) {
    return "basic"
  }

  // CI environments usually support basic colors
  if (CI_ENVS.some((env) => process.env[env] !== undefined)) {
    return "basic"
  }

  // Windows Terminal (modern)
  if (process.env.WT_SESSION) {
    return "truecolor"
  }

  // Default: basic colors if TTY
  return "basic"
}

// =============================================================================
// Unicode Detection
// =============================================================================

/**
 * Detect if terminal can render unicode symbols.
 * Based on TERM, locale, and known terminal apps.
 */
export function detectUnicode(): boolean {
  // CI environments - often UTF-8 capable but be conservative
  if (process.env.CI) {
    // GitHub Actions is UTF-8
    if (process.env.GITHUB_ACTIONS) return true
    // Other CI - check LANG
  }

  // Check locale for UTF-8
  const lang = process.env.LANG ?? process.env.LC_ALL ?? process.env.LC_CTYPE ?? ""
  if (lang.toLowerCase().includes("utf-8") || lang.toLowerCase().includes("utf8")) {
    return true
  }

  // Windows Terminal
  if (process.env.WT_SESSION) {
    return true
  }

  // Modern terminal programs
  const termProgram = process.env.TERM_PROGRAM ?? ""
  if (["iTerm.app", "Ghostty", "WezTerm", "Apple_Terminal"].includes(termProgram)) {
    return true
  }

  // Kitty
  if (process.env.KITTY_WINDOW_ID) {
    return true
  }

  // Check TERM for modern terminals
  const term = process.env.TERM ?? ""
  if (
    term.includes("xterm") ||
    term.includes("rxvt") ||
    term.includes("screen") ||
    term.includes("tmux")
  ) {
    return true
  }

  // Default: assume no unicode for safety
  return false
}

// =============================================================================
// Extended Underline Detection
// =============================================================================

/**
 * Known terminals with extended underline support.
 */
const EXTENDED_UNDERLINE_TERMS = ["xterm-ghostty", "xterm-kitty", "wezterm", "xterm-256color"]

/**
 * Known terminal programs with extended underline support.
 */
const EXTENDED_UNDERLINE_PROGRAMS = ["Ghostty", "iTerm.app", "WezTerm"]

/**
 * Detect if terminal supports extended underline styles.
 * (curly, dotted, dashed, double)
 */
export function detectExtendedUnderline(): boolean {
  const term = process.env.TERM ?? ""
  const termProgram = process.env.TERM_PROGRAM ?? ""

  // Check TERM variable for known modern terminals
  if (EXTENDED_UNDERLINE_TERMS.some((t) => term.includes(t))) {
    return true
  }

  // Check TERM_PROGRAM for known terminal applications
  if (EXTENDED_UNDERLINE_PROGRAMS.some((p) => termProgram.includes(p))) {
    // Apple Terminal doesn't actually support extended underlines
    if (termProgram === "Apple_Terminal") {
      return false
    }
    return true
  }

  // Kitty sets KITTY_WINDOW_ID
  if (process.env.KITTY_WINDOW_ID) {
    return true
  }

  // Default to false for unknown terminals
  return false
}
