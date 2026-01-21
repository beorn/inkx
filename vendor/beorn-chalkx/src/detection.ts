/**
 * Terminal capability detection for extended ANSI features.
 *
 * Detects support for:
 * - Extended underline styles (curly, dotted, dashed, double)
 * - Underline color (SGR 58)
 * - Hyperlinks (OSC 8)
 */

import createDebug from "debug";

const debug = createDebug("chalkx:detect");

// =============================================================================
// Terminal Detection
// =============================================================================

/**
 * Known terminals with extended underline support.
 */
const SUPPORTED_TERMS = [
  "xterm-ghostty",
  "xterm-kitty",
  "wezterm",
  "xterm-256color", // Often iTerm2 or modern terminals
];

/**
 * Known terminal programs with extended underline support.
 */
const SUPPORTED_PROGRAMS = [
  "Ghostty",
  "iTerm.app",
  "WezTerm",
];

/**
 * Detect if the terminal supports extended underline styles.
 * Uses TERM and TERM_PROGRAM environment variables.
 */
function detectExtendedUnderlineSupport(): boolean {
  const term = process.env.TERM ?? "";
  const termProgram = process.env.TERM_PROGRAM ?? "";

  debug("detecting: TERM=%s, TERM_PROGRAM=%s", term, termProgram);

  // Check TERM variable for known modern terminals
  if (SUPPORTED_TERMS.some((t) => term.includes(t))) {
    debug("extended underline: true (TERM match)");
    return true;
  }

  // Check TERM_PROGRAM for known terminal applications
  if (SUPPORTED_PROGRAMS.some((p) => termProgram.includes(p))) {
    // Apple Terminal doesn't actually support extended underlines
    if (termProgram === "Apple_Terminal") {
      debug("extended underline: false (Apple_Terminal)");
      return false;
    }
    debug("extended underline: true (TERM_PROGRAM match)");
    return true;
  }

  // Kitty sets KITTY_WINDOW_ID
  if (process.env.KITTY_WINDOW_ID) {
    debug("extended underline: true (KITTY_WINDOW_ID)");
    return true;
  }

  // Default to false for unknown terminals
  debug("extended underline: false (unknown terminal)");
  return false;
}

// =============================================================================
// Cached Detection Results
// =============================================================================

/**
 * Cached result of terminal capability detection.
 * null = not yet detected, boolean = detection result or override
 */
let _supportsExtendedUnderline: boolean | null = null;

/**
 * Check if the terminal supports extended underline styles.
 * Result is cached after first call.
 */
export function supportsExtendedUnderline(): boolean {
  if (_supportsExtendedUnderline === null) {
    _supportsExtendedUnderline = detectExtendedUnderlineSupport();
  }
  return _supportsExtendedUnderline;
}

/**
 * Override extended underline support detection.
 * Useful for testing or forcing behavior in specific environments.
 *
 * @param supported - true/false to force, null to re-detect on next call
 */
export function setExtendedUnderlineSupport(supported: boolean | null): void {
  _supportsExtendedUnderline = supported;
}

/**
 * Reset detection cache, forcing re-detection on next call.
 */
export function resetDetectionCache(): void {
  _supportsExtendedUnderline = null;
}
