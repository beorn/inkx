/**
 * Shared shell-related constants and utilities for the `shell:` handler and
 * the cache layer. Lives outside `previews.ts` to break what would otherwise
 * be a circular import (handlers depend on previews, previews depends on
 * handlers via the registry).
 */

/** Wall-clock timeout for `shell` previews. Process is killed if it overruns. */
export const SHELL_PREVIEW_TIMEOUT_MS = 5_000

/** Hard cap on captured stdout from a `shell` preview, in bytes. Anything past this is truncated with a "[truncated]" marker. Prevents a runaway command (e.g. `find /`) from filling the popover with megabytes of text. */
export const SHELL_PREVIEW_OUTPUT_CAP_BYTES = 4_096

/**
 * Strip ANSI escape sequences and C0 control characters from shell output.
 *
 * We render this output in a TUI buffer where ANSI/OSC/DCS sequences would
 * be interpreted by the host terminal (color, cursor moves, OSC 52 paste,
 * window-title set, etc). That's terminal-injection — a real class of bug
 * — so we strip the escape surface even though TERM=dumb is also set.
 *
 * What we strip:
 *   - CSI sequences:    ESC [ ... <final-byte 0x40-0x7E>
 *   - OSC sequences:    ESC ] ... (ST | BEL)
 *   - DCS sequences:    ESC P ... ST
 *   - PM / APC / SOS:   ESC ^ | ESC _ | ESC X ... ST
 *   - 7-bit single-char escapes:  ESC <char>
 *   - C0 controls except TAB (0x09), LF (0x0A), CR (0x0D)
 *   - DEL (0x7F)
 *
 * UTF-8 graphemes pass through unchanged.
 */
export function sanitizeShellOutput(raw: string): string {
  // Strip multi-char escape sequences first (ESC followed by ...).
  // Order matters: OSC/DCS/PM/APC/SOS use String Terminator (ESC \) or BEL
  // and may contain CSI-like bytes inside.
  let s = raw
    // OSC: ESC ] ... (ST = ESC \  | BEL = 0x07)
    .replace(/\x1b\][\s\S]*?(?:\x1b\\|\x07)/g, "")
    // DCS / PM / APC / SOS: ESC P|^|_|X ... ST
    .replace(/\x1b[P^_X][\s\S]*?\x1b\\/g, "")
    // CSI: ESC [ <params> <final>  (final byte 0x40-0x7E)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    // Two-byte 7-bit escapes (ESC <intermediate-or-final>) — anything not
    // already consumed above. Strip the escape and the byte that follows.
    .replace(/\x1b./g, "")
    // Lone ESC at the very end of buffer (incomplete sequence).
    .replace(/\x1b/g, "")

  // C0 controls: 0x00-0x1F except TAB / LF / CR. Plus DEL (0x7F).
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")

  return s
}
