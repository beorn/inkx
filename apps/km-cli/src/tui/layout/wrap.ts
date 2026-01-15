/**
 * Text Wrapping (Layer 2 - TUI Layout)
 *
 * Word-wrap styled ANSI strings while preserving escape codes.
 * Uses wrap-ansi for robust handling of ANSI escape sequences.
 */

import wrapAnsi from "wrap-ansi";

/**
 * Word-wrap text to fit within a given width.
 * Works correctly with ANSI-styled strings.
 *
 * @param text - Text to wrap (may contain ANSI codes)
 * @param width - Maximum display width per line
 * @returns Array of lines
 */
export function wrapText(text: string, width: number): string[] {
  if (!text) return [];

  // wrap-ansi handles all the complexity of ANSI codes, word boundaries, etc.
  const wrapped = wrapAnsi(text, width, { hard: true, trim: true });
  return wrapped.split("\n");
}
