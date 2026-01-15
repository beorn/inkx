/**
 * Text Truncation (Layer 2 - TUI Layout)
 *
 * Truncate and pad styled ANSI strings.
 */

import chalk from "chalk";
import { displayLength } from "../../text/index.ts";

/**
 * Truncate text to fit within a given width, adding ellipsis if needed.
 * Works correctly with ANSI-styled strings.
 *
 * @param text - Text to truncate (may contain ANSI codes)
 * @param width - Maximum display width
 * @returns Truncated text with "…" suffix if truncated
 */
export function truncateText(text: string, width: number): string {
  if (displayLength(text) <= width) {
    return text;
  }

  // Need to truncate - find position for width-1 chars (leave room for …)
  const targetWidth = width - 1;
  let styledPos = 0;
  let displayCount = 0;
  let inEscape = false;

  for (let i = 0; i < text.length && displayCount < targetWidth; i++) {
    if (text[i] === "\x1b") {
      inEscape = true;
    } else if (inEscape && text[i] === "m") {
      inEscape = false;
    } else if (!inEscape) {
      displayCount++;
    }
    styledPos = i + 1;
  }

  return text.slice(0, styledPos) + chalk.reset("") + "…";
}

/**
 * Pad a styled string to a specific display width.
 * Adds spaces at the end to ensure the line clears any old content.
 *
 * @param text - Text to pad (may contain ANSI codes)
 * @param width - Target display width
 * @returns Padded text
 */
export function padText(text: string, width: number): string {
  const currentLen = displayLength(text);
  if (currentLen >= width) {
    return text;
  }
  return text + " ".repeat(width - currentLen);
}
