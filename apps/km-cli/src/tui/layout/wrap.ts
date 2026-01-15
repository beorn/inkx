/**
 * Text Wrapping (Layer 2 - TUI Layout)
 *
 * Word-wrap styled ANSI strings while preserving escape codes.
 */

import { displayLength, stripAnsi } from "../../text/index.ts";

// Minimum characters on a continuation line to avoid orphan fragments
const MIN_CONTINUATION_LEN = 6;

/**
 * Find position in styled text corresponding to a plain text position.
 */
function findStyledPosition(styled: string, plainPos: number): number {
  let styledPos = 0;
  let displayCount = 0;
  let inEscape = false;

  for (let i = 0; i < styled.length && displayCount < plainPos; i++) {
    if (styled[i] === "\x1b") {
      inEscape = true;
    } else if (inEscape && styled[i] === "m") {
      inEscape = false;
    } else if (!inEscape) {
      displayCount++;
    }
    styledPos = i + 1;
  }

  return styledPos;
}

/**
 * Word-wrap text to fit within a given width.
 * Works correctly with ANSI-styled strings by measuring display length.
 * Avoids creating very short orphan fragments at the start of continuation lines.
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

      // Check if this break would create an orphan fragment
      // An orphan is when the remaining text after the break is very short
      const remainingAfterBreak = plainRemaining.slice(breakPoint).trimStart();
      if (
        remainingAfterBreak.length > 0 &&
        remainingAfterBreak.length < MIN_CONTINUATION_LEN &&
        breakPoint > MIN_CONTINUATION_LEN
      ) {
        // Find an earlier break point to give the next line more content
        const earlierBreak = plainRemaining.lastIndexOf(" ", breakPoint - 1);
        if (earlierBreak > MIN_CONTINUATION_LEN) {
          breakPoint = earlierBreak;
        }
      }

      // Find corresponding position in styled text
      const styledBreak = findStyledPosition(remaining, breakPoint);

      lines.push(remaining.slice(0, styledBreak));
      remaining = remaining.slice(styledBreak).trimStart();
      plainRemaining = stripAnsi(remaining);
    }
  }

  return lines;
}
