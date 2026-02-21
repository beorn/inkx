/**
 * ANSI String Utilities (Layer 1 - Shared)
 *
 * Utilities for working with ANSI-styled terminal strings.
 *
 * ## Functions
 * - `stripFgColor(text)` - remove foreground colors, keep formatting
 * - `displayLength(text)` - character count excluding ANSI codes
 * - `stripAnsi(text)` - remove all ANSI escape codes
 */

import { stripAnsi } from "inkx"
import stringWidth from "string-width"

// ============================================================================
// ANSI String Utilities
// ============================================================================

// Re-export ANSI utilities from inkx (canonical implementation)
export { stripAnsi }

/**
 * Strip only foreground color codes from an ANSI string, preserving formatting
 * attributes (underline, bold, italic, strikethrough). Use this instead of
 * stripAnsi when applying a background color override (e.g., selection highlight).
 *
 * Strips: fg colors (30-37, 90-97, 38;5;N, 38;2;R;G;B, 39), dim (2)
 * Replaces: reset (0) with reset-intensity+reset-fg (22;39) to preserve formatting
 * Preserves: underline (4), bold (1), italic (3), strikethrough (9), and their resets
 */
export function stripFgColor(text: string): string {
  return text.replace(/\x1b\[([0-9;]*)m/g, (_match, params: string) => {
    // Full reset → partial reset (keep formatting, clear fg + intensity)
    if (params === "0" || params === "") return "\x1b[22;39m"

    // Split compound sequences and filter out fg-color codes
    const codes = params.split(";").map(Number)
    const kept: number[] = []

    for (let i = 0; i < codes.length; i++) {
      const code = codes[i]
      if (code === undefined) continue
      // Skip basic fg colors (30-37, 90-97)
      if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) continue
      // Skip default fg (39)
      if (code === 39) continue
      // Skip dim (2) — it's a color-appearance modifier
      if (code === 2) continue
      // Skip 256-color fg: 38;5;N
      if (code === 38 && codes[i + 1] === 5) {
        i += 2
        continue
      }
      // Skip truecolor fg: 38;2;R;G;B
      if (code === 38 && codes[i + 1] === 2) {
        i += 4
        continue
      }
      kept.push(code)
    }

    if (kept.length === 0) return ""
    return `\x1b[${kept.join(";")}m`
  })
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
