/**
 * Text Constraining (Layer 2 - TUI Layout)
 *
 * Constrain text to width and height limits.
 */

import { displayLength } from "../text/index.ts";
import { wrapText } from "./wrap.ts";
import { truncateText, padText } from "./truncate.ts";

/**
 * Constrain text to width and height limits.
 *
 * @param text - Text to constrain (may contain ANSI codes)
 * @param width - Maximum display width per line
 * @param maxLines - Maximum number of lines
 * @param pad - If true, pad lines to full width (helps clear old terminal content)
 * @returns Object with wrapped lines and truncation indicator
 */
export function constrainText(
  text: string,
  width: number,
  maxLines: number,
  pad = false,
): { lines: string[]; truncated: boolean } {
  const allLines = wrapText(text, width);
  const truncated = allLines.length > maxLines;
  let lines = allLines.slice(0, maxLines);

  // Add ellipsis to last line if truncated
  if (truncated && lines.length > 0) {
    const lastIdx = lines.length - 1;
    const lastLine = lines[lastIdx];
    if (lastLine && displayLength(lastLine) >= width - 1) {
      lines[lastIdx] = truncateText(lastLine, width);
    }
  }

  // Pad lines to full width if requested
  if (pad) {
    lines = lines.map((line) => padText(line, width));
  }

  return { lines, truncated };
}
