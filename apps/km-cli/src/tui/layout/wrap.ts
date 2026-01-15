/**
 * Text Wrapping (Layer 2 - TUI Layout)
 *
 * Word-wrap styled ANSI strings while preserving escape codes.
 */

import { displayLength, stripAnsi } from "../../text/index.ts";

/**
 * Word-wrap text to fit within a given width.
 * Works correctly with ANSI-styled strings by measuring display length.
 *
 * @param text - Text to wrap (may contain ANSI codes)
 * @param width - Maximum display width per line
 * @returns Array of lines
 */
export function wrapText(text: string, width: number): string[] {
  if (!text) return [];
  const lines: string[] = [];

  for (const inputLine of text.split("\n")) {
    if (displayLength(inputLine) <= width) {
      lines.push(inputLine);
      continue;
    }

    // Need to wrap this line - work with plain text for break points
    const plain = stripAnsi(inputLine);
    let remaining = inputLine;
    let plainRemaining = plain;

    while (displayLength(remaining) > 0) {
      if (displayLength(remaining) <= width) {
        lines.push(remaining);
        break;
      }

      // Find break point in plain text
      let breakPoint = plainRemaining.lastIndexOf(" ", width);
      if (breakPoint <= 0) breakPoint = width;

      // Find corresponding position in styled text
      // Count display chars to find where to cut
      let styledBreak = 0;
      let displayCount = 0;
      let inEscape = false;

      for (let i = 0; i < remaining.length && displayCount < breakPoint; i++) {
        if (remaining[i] === "\x1b") {
          inEscape = true;
        } else if (inEscape && remaining[i] === "m") {
          inEscape = false;
        } else if (!inEscape) {
          displayCount++;
        }
        styledBreak = i + 1;
      }

      lines.push(remaining.slice(0, styledBreak));
      remaining = remaining.slice(styledBreak).trimStart();
      plainRemaining = stripAnsi(remaining);
    }
  }

  return lines;
}
